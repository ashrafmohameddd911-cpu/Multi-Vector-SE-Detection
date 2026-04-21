import { query } from '@/lib/mysql'
import { writeTxBatch } from '@/lib/neo4j'

/**
 * MySQL -> Neo4j projection.
 *
 * Node labels:
 *   :Attacker  { id: sender, kind: 'email_domain'|'phone'|'sender', value, threat_score, hit_count }
 *   :Victim    { id: recipient, kind: 'email'|'phone' }
 *   :Message   { id, vector, sender, recipient, subject, content, received_at, status }
 *   :CorrelationGroup { id, entity_key, c_score, s1..s4, severity, campaign_type, created_at }
 *   :Alert     { id, severity, c_score, status, campaign_type, created_at, victims }
 *   :Rule      { name }
 *   :Campaign  { type }   -- one node per campaign_type for grouping
 *
 * Relationship types:
 *   (:Attacker)-[:SENT]->(:Message)
 *   (:Message)-[:RECEIVED]->(:Victim)
 *   (:Message)-[:PART_OF]->(:CorrelationGroup)
 *   (:CorrelationGroup)-[:TRIGGERED]->(:Alert)
 *   (:CorrelationGroup)-[:FIRED_RULE { score, vector_types }]->(:Rule)
 *   (:CorrelationGroup)-[:BELONGS_TO]->(:Campaign)
 *   (:Attacker)-[:KNOWN_BAD { source, threat_score }]->(:Attacker)   self-flag (or skip)
 */

export interface SyncStats {
  attackers: number
  victims: number
  messages: number
  groups: number
  alerts: number
  rules: number
  campaigns: number
}

function attackerKind(vector: string, sender: string): string {
  if (vector === 'email') return 'email_domain'
  if (vector === 'sms' || vector === 'call') return 'phone'
  return 'sender'
}

function attackerValue(vector: string, sender: string, sender_domain: string | null): string {
  if (vector === 'email' && sender_domain) return sender_domain
  return sender
}

/** One-shot full sync. Idempotent (uses MERGE). */
export async function syncAll(): Promise<SyncStats> {
  const [messages, groups, alerts, rules, kbs] = await Promise.all([
    query<any>(`SELECT id, vector_type, sender, sender_domain, recipient,
                       raw_content, subject, received_at, status
                  FROM messages
                 ORDER BY received_at DESC
                 LIMIT 5000`),
    query<any>(`SELECT id, message_ids, entity_key, vector_types,
                       s1_score, s2_score, s3_score, s4_score, c_score,
                       severity, campaign_type, created_at, updated_at
                  FROM correlation_groups
                 ORDER BY created_at DESC
                 LIMIT 5000`),
    query<any>(`SELECT id, group_id, c_score, severity, campaign_type,
                       victims, status, created_at, resolved_at
                  FROM alerts
                 ORDER BY created_at DESC
                 LIMIT 5000`),
    query<any>(`SELECT id, group_id, rule_name, rule_score, vector_types, created_at
                  FROM rules_hits
                 ORDER BY created_at DESC
                 LIMIT 10000`),
    query<any>(`SELECT id, sender_value, sender_type, threat_score,
                       source, first_seen, last_seen, hit_count
                  FROM known_bad_senders
                 LIMIT 5000`),
  ])

  const stmts: { cypher: string; params: Record<string, any> }[] = []

  // --- Indexes (cheap to repeat; CREATE IF NOT EXISTS) ---
  stmts.push({ cypher: `CREATE INDEX attacker_id IF NOT EXISTS FOR (a:Attacker) ON (a.id)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX victim_id IF NOT EXISTS FOR (v:Victim) ON (v.id)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX message_id IF NOT EXISTS FOR (m:Message) ON (m.id)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX group_id IF NOT EXISTS FOR (g:CorrelationGroup) ON (g.id)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX alert_id IF NOT EXISTS FOR (a:Alert) ON (a.id)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX rule_name IF NOT EXISTS FOR (r:Rule) ON (r.name)`, params: {} })
  stmts.push({ cypher: `CREATE INDEX campaign_type IF NOT EXISTS FOR (c:Campaign) ON (c.type)`, params: {} })

  // --- Attackers + Victims + Messages ---
  for (const m of messages) {
    const aId = attackerValue(m.vector_type, m.sender, m.sender_domain)
    const aKind = attackerKind(m.vector_type, m.sender)

    stmts.push({
      cypher: `
        MERGE (a:Attacker { id: $aId })
          ON CREATE SET a.kind = $aKind, a.value = $sender, a.first_seen = datetime($received_at)
          ON MATCH  SET a.last_seen = datetime($received_at)
        MERGE (v:Victim   { id: $recipient })
          ON CREATE SET v.kind = CASE WHEN $vector = 'email' THEN 'email' ELSE 'phone' END
        MERGE (m:Message  { id: $id })
          SET m.vector       = $vector,
              m.sender       = $sender,
              m.sender_domain= $sender_domain,
              m.recipient    = $recipient,
              m.subject      = $subject,
              m.content      = $content,
              m.received_at  = datetime($received_at),
              m.status       = $status
        MERGE (a)-[:SENT]->(m)
        MERGE (m)-[:RECEIVED]->(v)
      `,
      params: {
        aId,
        aKind,
        id: m.id,
        vector: m.vector_type,
        sender: m.sender,
        sender_domain: m.sender_domain,
        recipient: m.recipient,
        subject: m.subject,
        content: m.raw_content,
        received_at: toIso(m.received_at),
        status: m.status,
      },
    })
  }

  // --- Correlation Groups + Campaign + Message links ---
  const campaignsSeen = new Set<string>()
  for (const g of groups) {
    const messageIds = parseJsonArray(g.message_ids)
    const vectorTypes = parseJsonArray(g.vector_types)
    const campaignType = g.campaign_type ?? 'unknown'

    if (!campaignsSeen.has(campaignType)) {
      stmts.push({
        cypher: `MERGE (c:Campaign { type: $type })`,
        params: { type: campaignType },
      })
      campaignsSeen.add(campaignType)
    }

    stmts.push({
      cypher: `
        MERGE (g:CorrelationGroup { id: $id })
          SET g.entity_key   = $entity_key,
              g.vector_types = $vector_types,
              g.s1_score     = $s1,
              g.s2_score     = $s2,
              g.s3_score     = $s3,
              g.s4_score     = $s4,
              g.c_score      = $c,
              g.severity     = $severity,
              g.campaign_type= $campaign_type,
              g.created_at   = datetime($created_at),
              g.updated_at   = datetime($updated_at)
        WITH g
        MATCH (c:Campaign { type: $campaign_type })
        MERGE (g)-[:BELONGS_TO]->(c)
      `,
      params: {
        id: g.id,
        entity_key: g.entity_key,
        vector_types: vectorTypes,
        s1: numeric(g.s1_score),
        s2: numeric(g.s2_score),
        s3: numeric(g.s3_score),
        s4: numeric(g.s4_score),
        c: numeric(g.c_score),
        severity: g.severity,
        campaign_type: campaignType,
        created_at: toIso(g.created_at),
        updated_at: toIso(g.updated_at),
      },
    })

    // PART_OF links from each message in this group
    for (const mid of messageIds) {
      stmts.push({
        cypher: `
          MATCH (m:Message { id: $mid })
          MATCH (g:CorrelationGroup { id: $gid })
          MERGE (m)-[:PART_OF]->(g)
        `,
        params: { mid, gid: g.id },
      })
    }
  }

  // --- Alerts ---
  for (const a of alerts) {
    const victims = parseJsonArray(a.victims)
    stmts.push({
      cypher: `
        MERGE (al:Alert { id: $id })
          SET al.severity      = $severity,
              al.c_score       = $c,
              al.status        = $status,
              al.campaign_type = $campaign_type,
              al.victims       = $victims,
              al.created_at    = datetime($created_at)
        WITH al
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[:TRIGGERED]->(al)
      `,
      params: {
        id: a.id,
        severity: a.severity,
        c: numeric(a.c_score),
        status: a.status,
        campaign_type: a.campaign_type,
        victims,
        created_at: toIso(a.created_at),
        gid: a.group_id,
      },
    })
  }

  // --- Rules + FIRED_RULE links ---
  for (const r of rules) {
    const vectorTypes = parseJsonArray(r.vector_types)
    stmts.push({
      cypher: `
        MERGE (rule:Rule { name: $name })
        WITH rule
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[fr:FIRED_RULE]->(rule)
          SET fr.score        = $score,
              fr.vector_types = $vectorTypes,
              fr.created_at   = datetime($created_at)
      `,
      params: {
        name: r.rule_name,
        gid: r.group_id,
        score: numeric(r.rule_score),
        vectorTypes,
        created_at: toIso(r.created_at),
      },
    })
  }

  // --- Known bad senders enrich existing Attacker nodes ---
  for (const k of kbs) {
    stmts.push({
      cypher: `
        MERGE (a:Attacker { id: $id })
          SET a.kind         = coalesce(a.kind, $kind),
              a.value        = coalesce(a.value, $id),
              a.threat_score = $threat,
              a.threat_source= $source,
              a.hit_count    = $hit,
              a.first_seen   = coalesce(a.first_seen, CASE WHEN $first IS NOT NULL THEN datetime($first) ELSE null END),
              a.last_seen    = CASE WHEN $last IS NOT NULL THEN datetime($last) ELSE a.last_seen END,
              a.is_known_bad = true
      `,
      params: {
        id: k.sender_value,
        kind: k.sender_type,
        threat: numeric(k.threat_score),
        source: k.source,
        hit: numeric(k.hit_count),
        first: toIso(k.first_seen),
        last: toIso(k.last_seen),
      },
    })
  }

  await writeTxBatch(stmts)

  return {
    attackers: new Set(messages.map((m: any) => attackerValue(m.vector_type, m.sender, m.sender_domain))).size,
    victims: new Set(messages.map((m: any) => m.recipient)).size,
    messages: messages.length,
    groups: groups.length,
    alerts: alerts.length,
    rules: rules.length,
    campaigns: campaignsSeen.size,
  }
}

/**
 * Incremental sync for a single newly-processed message.
 * Called from /api/process-message right after the MySQL writes commit.
 */
export async function syncOneMessage(args: {
  messageId: string
  groupId: string
  alertId: string | null
}): Promise<void> {
  const { messageId, groupId, alertId } = args

  const messages = await query<any>(
    `SELECT id, vector_type, sender, sender_domain, recipient,
            raw_content, subject, received_at, status
       FROM messages WHERE id = ?`,
    [messageId]
  )
  if (messages.length === 0) return
  const m = messages[0]

  const groups = await query<any>(
    `SELECT id, message_ids, entity_key, vector_types,
            s1_score, s2_score, s3_score, s4_score, c_score,
            severity, campaign_type, created_at, updated_at
       FROM correlation_groups WHERE id = ?`,
    [groupId]
  )
  if (groups.length === 0) return
  const g = groups[0]

  const rules = await query<any>(
    `SELECT id, group_id, rule_name, rule_score, vector_types, created_at
       FROM rules_hits WHERE group_id = ?`,
    [groupId]
  )

  let alert: any | null = null
  if (alertId) {
    const r = await query<any>(
      `SELECT id, group_id, c_score, severity, campaign_type, victims, status, created_at, resolved_at
         FROM alerts WHERE id = ?`,
      [alertId]
    )
    alert = r[0] ?? null
  }

  const aId = attackerValue(m.vector_type, m.sender, m.sender_domain)
  const aKind = attackerKind(m.vector_type, m.sender)
  const campaignType = g.campaign_type ?? 'unknown'
  const stmts: { cypher: string; params: Record<string, any> }[] = []

  stmts.push({
    cypher: `MERGE (c:Campaign { type: $type })`,
    params: { type: campaignType },
  })

  stmts.push({
    cypher: `
      MERGE (a:Attacker { id: $aId })
        ON CREATE SET a.kind = $aKind, a.value = $sender, a.first_seen = datetime($received_at)
        ON MATCH  SET a.last_seen = datetime($received_at)
      MERGE (v:Victim { id: $recipient })
        ON CREATE SET v.kind = CASE WHEN $vector = 'email' THEN 'email' ELSE 'phone' END
      MERGE (msg:Message { id: $id })
        SET msg.vector = $vector, msg.sender = $sender, msg.sender_domain = $sender_domain,
            msg.recipient = $recipient, msg.subject = $subject, msg.content = $content,
            msg.received_at = datetime($received_at), msg.status = $status
      MERGE (a)-[:SENT]->(msg)
      MERGE (msg)-[:RECEIVED]->(v)
    `,
    params: {
      aId,
      aKind,
      id: m.id,
      vector: m.vector_type,
      sender: m.sender,
      sender_domain: m.sender_domain,
      recipient: m.recipient,
      subject: m.subject,
      content: m.raw_content,
      received_at: toIso(m.received_at),
      status: m.status,
    },
  })

  stmts.push({
    cypher: `
      MERGE (g:CorrelationGroup { id: $id })
        SET g.entity_key   = $entity_key,
            g.vector_types = $vector_types,
            g.s1_score     = $s1,
            g.s2_score     = $s2,
            g.s3_score     = $s3,
            g.s4_score     = $s4,
            g.c_score      = $c,
            g.severity     = $severity,
            g.campaign_type= $campaign_type,
            g.created_at   = datetime($created_at),
            g.updated_at   = datetime($updated_at)
      WITH g
      MATCH (c:Campaign { type: $campaign_type })
      MERGE (g)-[:BELONGS_TO]->(c)
      WITH g
      MATCH (m:Message { id: $messageId })
      MERGE (m)-[:PART_OF]->(g)
    `,
    params: {
      id: g.id,
      entity_key: g.entity_key,
      vector_types: parseJsonArray(g.vector_types),
      s1: numeric(g.s1_score),
      s2: numeric(g.s2_score),
      s3: numeric(g.s3_score),
      s4: numeric(g.s4_score),
      c: numeric(g.c_score),
      severity: g.severity,
      campaign_type: campaignType,
      created_at: toIso(g.created_at),
      updated_at: toIso(g.updated_at),
      messageId,
    },
  })

  for (const r of rules) {
    stmts.push({
      cypher: `
        MERGE (rule:Rule { name: $name })
        WITH rule
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[fr:FIRED_RULE]->(rule)
          SET fr.score = $score,
              fr.vector_types = $vectorTypes,
              fr.created_at = datetime($created_at)
      `,
      params: {
        name: r.rule_name,
        gid: r.group_id,
        score: numeric(r.rule_score),
        vectorTypes: parseJsonArray(r.vector_types),
        created_at: toIso(r.created_at),
      },
    })
  }

  if (alert) {
    stmts.push({
      cypher: `
        MERGE (al:Alert { id: $id })
          SET al.severity = $severity, al.c_score = $c, al.status = $status,
              al.campaign_type = $campaign_type, al.victims = $victims,
              al.created_at = datetime($created_at)
        WITH al
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[:TRIGGERED]->(al)
      `,
      params: {
        id: alert.id,
        severity: alert.severity,
        c: numeric(alert.c_score),
        status: alert.status,
        campaign_type: alert.campaign_type,
        victims: parseJsonArray(alert.victims),
        created_at: toIso(alert.created_at),
        gid: alert.group_id,
      },
    })
  }

  await writeTxBatch(stmts)
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const v = JSON.parse(value)
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  return []
}

function numeric(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  // mysql2 returns Date when dateStrings is false
  try {
    return new Date(v).toISOString()
  } catch {
    return null
  }
}
