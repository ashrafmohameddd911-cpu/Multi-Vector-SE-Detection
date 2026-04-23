import { query } from '@/lib/mysql'
import { writeTxBatch } from '@/lib/neo4j'

/**
 * MySQL -> Neo4j projection.
 *
 * Node labels:
 *   :Attacker  { id, kind, value, threat_score, hit_count, is_known_bad }
 *   :Victim    { id, kind }
 *   :Message   { id, vector, sender, sender_domain, recipient, subject, content, received_at, status }
 *   :CorrelationGroup { id, entity_key, s2_score, s3_score, s4_score, c_score, severity, campaign_type, created_at }
 *   :Alert     { id, severity, c_score, status, created_at }
 *   :Rule      { name }
 *   :Campaign  { type }
 *
 * Relationships:
 *   (:Attacker)-[:SENT]->(:Message)
 *   (:Message)-[:RECEIVED]->(:Victim)
 *   (:Message)-[:PART_OF]->(:CorrelationGroup)
 *   (:CorrelationGroup)-[:TRIGGERED]->(:Alert)
 *   (:CorrelationGroup)-[:FIRED_RULE { severity, matched_at }]->(:Rule)
 *   (:CorrelationGroup)-[:BELONGS_TO]->(:Campaign)
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

function attackerValue(vector: string, sender: string, sender_domain: string | null): string {
  if (vector === 'email' && sender_domain) return sender_domain
  return sender
}

function attackerKind(vector: string): string {
  if (vector === 'email') return 'email_domain'
  if (vector === 'sms' || vector === 'call') return 'phone'
  return 'sender'
}

/** One-shot full sync. Idempotent (uses MERGE). */
export async function syncAll(): Promise<SyncStats> {
  // --- STEP 1: FETCH DATA FROM MYSQL ---
  const [messages, groups, alerts, rules, kbs] = await Promise.all([
  query<any>(
    `SELECT id, vector_type, sender, sender_domain, recipient,
            raw_content, subject, received_at, status
       FROM messages
      ORDER BY received_at DESC
      LIMIT 500`
  ),
  query<any>(
    `SELECT id, message_ids, entity_key, vector_types,
            s2_score, s3_score, s4_score, c_score,
            max_severity AS severity, campaign_type, created_at
       FROM correlation_groups
      ORDER BY created_at DESC
      LIMIT 500`
  ),
  query<any>(
    `SELECT id, group_id, c_score, severity, victims, status, created_at
       FROM alerts
      ORDER BY created_at DESC
      LIMIT 500`
  ),
  query<any>(
    `SELECT id, group_id, rule_name, severity, matched_at
       FROM rule_hits
      ORDER BY matched_at DESC
      LIMIT 10000`
  ),
  query<any>(
    `SELECT 
          id, 
          sender_type AS kind, 
          sender_value AS value, 
          NULL AS threat_score, 
          incident_count AS hit_count, 
          first_seen, 
          last_seen, 
          1 AS is_known_bad
       FROM known_bad_senders
       LIMIT 5000`
  ),
])

  // --- STEP 2: SCHEMA PHASE (Wait for these to finish before writing data) ---
  const indexStmts = [
    { cypher: `CREATE INDEX attacker_id IF NOT EXISTS FOR (a:Attacker) ON (a.id)`, params: {} },
    { cypher: `CREATE INDEX victim_id IF NOT EXISTS FOR (v:Victim) ON (v.id)`, params: {} },
    { cypher: `CREATE INDEX message_id IF NOT EXISTS FOR (m:Message) ON (m.id)`, params: {} },
    { cypher: `CREATE INDEX group_id IF NOT EXISTS FOR (g:CorrelationGroup) ON (g.id)`, params: {} },
    { cypher: `CREATE INDEX alert_id IF NOT EXISTS FOR (a:Alert) ON (a.id)`, params: {} },
    { cypher: `CREATE INDEX rule_name IF NOT EXISTS FOR (r:Rule) ON (r.name)`, params: {} },
    { cypher: `CREATE INDEX campaign_type IF NOT EXISTS FOR (c:Campaign) ON (c.type)`, params: {} },
  ]
  
  await writeTxBatch(indexStmts)

  // --- STEP 3: DATA PHASE ---
  const stmts: { cypher: string; params: Record<string, any> }[] = []

  // 3a. Attackers + Victims + Messages
  for (const m of messages.slice(0, 100)) { // limit to 100 messages
    const aId = attackerValue(m.vector_type, m.sender, m.sender_domain)
    const aKind = attackerKind(m.vector_type)

    stmts.push({
      cypher: `
        MERGE (a:Attacker { id: $aId })
          ON CREATE SET a.kind = $aKind, a.value = $aId, a.first_seen = $received_at
          ON MATCH  SET a.last_seen = $received_at
        MERGE (v:Victim { id: $recipient })
          ON CREATE SET v.kind = CASE WHEN $vector = 'email' THEN 'email' ELSE 'phone' END
        MERGE (msg:Message { id: $id })
          SET msg.vector        = $vector,
              msg.sender        = $sender,
              msg.sender_domain = $sender_domain,
              msg.recipient     = $recipient,
              msg.subject       = $subject,
              msg.content       = $content,
              msg.received_at   = $received_at,
              msg.status        = $status
        MERGE (a)-[:SENT]->(msg)
        MERGE (msg)-[:RECEIVED]->(v)
      `,
      params: {
        aId, aKind,
        id: m.id,
        vector: m.vector_type,
        sender: m.sender,
        sender_domain: m.sender_domain ?? null,
        recipient: m.recipient,
        subject: m.subject ?? null,
        content: m.raw_content ?? null,
        received_at: toIso(m.received_at),
        status: m.status,
      },
    })
  }

  // 3b. Correlation Groups + Campaigns
  const campaignsSeen = new Set<string>()
  for (const g of groups.slice(0, 500)) {

    const messageIds = parseJsonArray(g.message_ids)
    const vectorTypes = parseJsonArray(g.vector_types)
    const campaignType = g.campaign_type ?? 'unknown'

    if (!campaignsSeen.has(campaignType)) {
      stmts.push({ cypher: `MERGE (c:Campaign { type: $type })`, params: { type: campaignType } })
      campaignsSeen.add(campaignType)
    }

    stmts.push({
      cypher: `
        MERGE (g:CorrelationGroup { id: $id })
          SET g.entity_key    = $entity_key,
              g.vector_types  = $vector_types,
              g.s2_score      = $s2,
              g.s3_score      = $s3,
              g.s4_score      = $s4,
              g.c_score       = $c,
              g.severity      = $severity,
              g.campaign_type = $campaign_type,
              g.created_at    = $created_at
        WITH g
        MATCH (c:Campaign { type: $campaign_type })
        MERGE (g)-[:BELONGS_TO]->(c)
      `,
      params: {
        id: g.id,
        entity_key: g.entity_key,
        vector_types: vectorTypes,
        s2: numeric(g.s2_score),
        s3: numeric(g.s3_score),
        s4: numeric(g.s4_score),
        c: numeric(g.c_score),
        severity: g.severity ?? null,
        campaign_type: campaignType,
        created_at: toIso(g.created_at),
      },
    })

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

  // 3c. Alerts
  for (const a of alerts.slice(0, 500)) {
    stmts.push({
      cypher: `
        MERGE (al:Alert { id: $id })
          SET al.severity   = $severity,
              al.c_score    = $c,
              al.status     = $status,
              al.created_at = $created_at
        WITH al
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[:TRIGGERED]->(al)
      `,
      params: {
        id: a.id,
        severity: a.severity ?? null,
        c: numeric(a.c_score),
        status: a.status ?? null,
        created_at: toIso(a.created_at),
        gid: a.group_id,
      },
    })
  }

  // 3d. Rules
  for (const r of rules.slice(0, 10000)) {
    stmts.push({
      cypher: `
        MERGE (rule:Rule { name: $name })
        WITH rule
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[fr:FIRED_RULE]->(rule)
          SET fr.severity   = $severity,
              fr.matched_at = $matched_at
      `,
      params: {
        name: r.rule_name,
        gid: r.group_id,
        severity: r.severity ?? null,
        matched_at: toIso(r.matched_at),
      },
    })
  }

  // 3e. Known Bad Senders (Enrichment)
  for (const k of kbs) {
    stmts.push({
      cypher: `
        MERGE (a:Attacker { id: $id })
          SET a.kind         = coalesce(a.kind, $kind),
              a.value        = coalesce(a.value, $id),
              a.threat_score = $threat,
              a.hit_count    = $hit,
              a.is_known_bad = $is_known_bad,
              a.first_seen   = coalesce(a.first_seen, $first),
              a.last_seen    = $last
      `,
      params: {
        id: k.value,
        kind: k.kind ?? null,
        threat: numeric(k.threat_score),
        hit: toInteger(k.hit_count),
        is_known_bad: Boolean(k.is_known_bad),
        first: toIso(k.first_seen),
        last: toIso(k.last_seen),
      },
    })
  }

  // Execute the massive data batch
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
            s2_score, s3_score, s4_score, c_score,
            max_severity AS severity, campaign_type, created_at
       FROM correlation_groups WHERE id = ?`,
    [groupId]
  )
  if (groups.length === 0) return
  const g = groups[0]

  const rules = await query<any>(
    `SELECT id, group_id, rule_name, severity, matched_at
       FROM rule_hits WHERE group_id = ?`,
    [groupId]
  )

  let alert: any | null = null
  if (alertId) {
    const rows = await query<any>(
      `SELECT id, group_id, c_score, severity, victims, status, created_at
         FROM alerts WHERE id = ?`,
      [alertId]
    )
    alert = rows[0] ?? null
  }

  const aId = attackerValue(m.vector_type, m.sender, m.sender_domain)
  const aKind = attackerKind(m.vector_type)
  const campaignType = g.campaign_type ?? 'unknown'
  const stmts: { cypher: string; params: Record<string, any> }[] = []

  stmts.push({ cypher: `MERGE (c:Campaign { type: $type })`, params: { type: campaignType } })

  stmts.push({
    cypher: `
      MERGE (a:Attacker { id: $aId })
        ON CREATE SET a.kind = $aKind, a.value = $aId, a.first_seen = $received_at
        ON MATCH  SET a.last_seen = $received_at
      MERGE (v:Victim { id: $recipient })
        ON CREATE SET v.kind = CASE WHEN $vector = 'email' THEN 'email' ELSE 'phone' END
      MERGE (msg:Message { id: $id })
        SET msg.vector = $vector, msg.sender = $sender, msg.sender_domain = $sender_domain,
            msg.recipient = $recipient, msg.subject = $subject, msg.content = $content,
            msg.received_at = $received_at, msg.status = $status
      MERGE (a)-[:SENT]->(msg)
      MERGE (msg)-[:RECEIVED]->(v)
    `,
    params: {
      aId, aKind,
      id: m.id,
      vector: m.vector_type,
      sender: m.sender,
      sender_domain: m.sender_domain ?? null,
      recipient: m.recipient,
      subject: m.subject ?? null,
      content: m.raw_content ?? null,
      received_at: toIso(m.received_at),
      status: m.status,
    },
  })

  stmts.push({
    cypher: `
      MERGE (g:CorrelationGroup { id: $id })
        SET g.entity_key    = $entity_key,
            g.vector_types  = $vector_types,
            g.s2_score      = $s2,
            g.s3_score      = $s3,
            g.s4_score      = $s4,
            g.c_score       = $c,
            g.severity      = $severity,
            g.campaign_type = $campaign_type,
            g.created_at    = $created_at
      WITH g
      MATCH (c:Campaign { type: $campaign_type })
      MERGE (g)-[:BELONGS_TO]->(c)
      WITH g
      MATCH (msg:Message { id: $messageId })
      MERGE (msg)-[:PART_OF]->(g)
    `,
    params: {
      id: g.id,
      entity_key: g.entity_key,
      vector_types: parseJsonArray(g.vector_types),
      s2: numeric(g.s2_score),
      s3: numeric(g.s3_score),
      s4: numeric(g.s4_score),
      c: numeric(g.c_score),
      severity: g.severity ?? null,
      campaign_type: campaignType,
      created_at: toIso(g.created_at),
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
          SET fr.severity = $severity, fr.matched_at = $matched_at
      `,
      params: {
        name: r.rule_name,
        gid: r.group_id,
        severity: r.severity ?? null,
        matched_at: toIso(r.matched_at),
      },
    })
  }

  if (alert) {
    stmts.push({
      cypher: `
        MERGE (al:Alert { id: $id })
          SET al.severity = $severity, al.c_score = $c, al.status = $status,
              al.created_at = $created_at
        WITH al
        MATCH (g:CorrelationGroup { id: $gid })
        MERGE (g)-[:TRIGGERED]->(al)
      `,
      params: {
        id: alert.id,
        severity: alert.severity ?? null,
        c: numeric(alert.c_score),
        status: alert.status ?? null,
        created_at: toIso(alert.created_at),
        gid: alert.group_id,
      },
    })
  }

  await writeTxBatch(stmts)
}

// --- UTILITIES ---

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

function toInteger(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : null
}

function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  try {
    return new Date(v).toISOString()
  } catch {
    return null
  }
}