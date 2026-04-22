import { randomUUID } from 'crypto'
import type { PoolConnection } from 'mysql2/promise'
import { pool, withTransaction } from '@/lib/mysql'
import { processMessage } from '@/lib/detection-pipeline'
import type { Vector } from '@/lib/mock-data'
import { checkDomainAuth } from '@/lib/domain-auth'

export interface RawMessageInput {
  vector: Vector
  sender: string
  recipient: string
  content: string
  subject?: string | null
}

export interface PersistedMessage {
  id: string
  vector_type: Vector
  sender: string
  sender_domain: string | null
  recipient: string
  raw_content: string
  subject: string | null
  received_at: Date
  status: 'pending' | 'processed' | 'failed'
}

export interface KnownBadResult {
  isKnownBad: boolean
  threatScore: number
  matchedKind: 'email' | 'domain' | null
}

const SEVERITY_RANK: Record<string, number> = {
  DISMISSED: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
}

export async function resolveActor(params: {
  entityKey: string
  kind: 'email_domain' | 'sender' | 'phone'
  groupSeverity: string
  messagesInGroup: number
  conn?: PoolConnection
}): Promise<{ actorId: string }> {
  const executor = params.conn ?? pool
  const severityRank = SEVERITY_RANK[params.groupSeverity] ?? 0

  const [existing] = await executor.query<any[]>(
    `SELECT id, severity_max FROM actors WHERE entity_key = ? AND kind = ? LIMIT 1`,
    [params.entityKey, params.kind]
  )

  if (existing.length === 0) {
    const actorId = randomUUID()
    await executor.query(
      `INSERT INTO actors (id, entity_key, kind, group_count, total_message_count, severity_max)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [actorId, params.entityKey, params.kind, params.messagesInGroup, params.groupSeverity]
    )
    return { actorId }
  }

  const currentActor = existing[0]
  const currentRank = SEVERITY_RANK[currentActor.severity_max] ?? 0
  const newSeverity = severityRank > currentRank ? params.groupSeverity : currentActor.severity_max

  await executor.query(
    `UPDATE actors
        SET group_count = group_count + 1,
            total_message_count = total_message_count + ?,
            severity_max = ?
      WHERE id = ?`,
    [params.messagesInGroup, newSeverity, currentActor.id]
  )

  return { actorId: currentActor.id }
}

function getWeekWindow(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

export async function resolveCampaign(params: {
  campaignType: string | null | undefined
  createdAt: Date
  groupSeverity: string
  messagesInGroup: number
  conn?: PoolConnection
}): Promise<{ campaignId: string } | null> {
  const type = params.campaignType?.trim()
  if (!type) {
    return null
  }

  const executor = params.conn ?? pool
  const { start: windowStart, end: windowEnd } = getWeekWindow(params.createdAt)
  const severityRank = SEVERITY_RANK[params.groupSeverity] ?? 0

  const [existing] = await executor.query<any[]>(
    `SELECT id, severity_max FROM campaigns WHERE campaign_type = ? AND window_start = ? LIMIT 1`,
    [type, windowStart]
  )

  if (existing.length === 0) {
    const campaignId = randomUUID()
    await executor.query(
      `INSERT INTO campaigns (id, campaign_type, window_start, window_end, group_count, total_message_count, severity_max)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [campaignId, type, windowStart, windowEnd, params.messagesInGroup, params.groupSeverity]
    )
    return { campaignId }
  }

  const currentCampaign = existing[0]
  const currentRank = SEVERITY_RANK[currentCampaign.severity_max] ?? 0
  const newSeverity = severityRank > currentRank ? params.groupSeverity : currentCampaign.severity_max

  await executor.query(
    `UPDATE campaigns
        SET group_count = group_count + 1,
            total_message_count = total_message_count + ?,
            severity_max = ?
      WHERE id = ?`,
    [params.messagesInGroup, newSeverity, currentCampaign.id]
  )

  return { campaignId: currentCampaign.id }
}

export async function lookupKnownBadSender(
  sender: string,
  senderDomain: string | null
): Promise<KnownBadResult> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, kind, value, threat_score
       FROM known_bad_senders
      WHERE is_known_bad = 1
        AND (
          (kind = 'email' AND value = ?) OR
          (kind = 'domain' AND value = ?)
        )
      LIMIT 2`,
    [sender, senderDomain]
  )

  if (rows.length === 0) {
    return { isKnownBad: false, threatScore: 0, matchedKind: null }
  }

  const emailMatch = rows.find((r) => r.kind === 'email')
  const match = emailMatch ?? rows[0]

  await pool.query(
    `UPDATE known_bad_senders
        SET hit_count = hit_count + 1,
            last_seen = NOW()
      WHERE id = ?`,
    [match.id]
  )

  return {
    isKnownBad: true,
    threatScore: match.threat_score,
    matchedKind: match.kind,
  }
}

export function extractSenderDomain(sender: string, vector: Vector): string | null {
  if (vector !== 'email') return null
  const at = sender.lastIndexOf('@')
  if (at === -1) return null
  const domain = sender.slice(at + 1).trim().toLowerCase()
  return domain.length > 0 ? domain : null
}

/** Insert a row into `messages` and return the generated id. */
export async function insertMessage(
  input: RawMessageInput,
  conn?: PoolConnection
): Promise<string> {
  const id = randomUUID()
  const executor = conn ?? pool
  await executor.query(
    `INSERT INTO messages
      (id, vector_type, sender, sender_domain, recipient, raw_content, subject, received_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'pending')`,
    [
      id,
      input.vector,
      input.sender,
      extractSenderDomain(input.sender, input.vector),
      input.recipient,
      input.content,
      input.subject ?? null,
    ]
  )
  return id
}

/**
 * Map the pipeline's severity (CRITICAL/HIGH/...) to the lowercase values
 * used by correlation_groups.severity and alerts.severity.
 */
function normaliseSeverity(s: string): string {
  return s.toLowerCase()
}

function campaignTypeFromVector(vector: Vector): string {
  if (vector === 'email') return 'phishing_campaign'
  if (vector === 'sms') return 'smishing_campaign'
  return 'vishing_campaign'
}

function entityKeyFor(input: RawMessageInput): string {
  if (input.vector === 'email') {
    const domain = extractSenderDomain(input.sender, 'email')
    return domain ? `org:${domain}` : `sender:${input.sender}`
  }
  return `sender:${input.sender}`
}

/**
 * Full ingest + scoring pipeline.
 *
 * 1. Insert into `messages` (status=pending).
 * 2. Run the TS detection pipeline.
 * 3. Upsert a row in `correlation_groups` keyed on entity_key.
 * 4. Insert rule contributions into `rule_hits`.
 * 5. Insert a row into `alerts` pointing at the group.
 * 6. Flip the message status to 'processed'.
 *
 * All five DB writes run in a single transaction.
 */
export async function ingestAndProcessMessage(input: RawMessageInput) {
  const senderDomain = extractSenderDomain(input.sender, input.vector)
  const knownBad = await lookupKnownBadSender(input.sender, senderDomain)

  let domainAuth = undefined
  if (input.vector === 'email' && senderDomain) {
    try {
      domainAuth = await checkDomainAuth(senderDomain)
    } catch (err) {
      console.error('Domain auth check failed:', err)
    }
  }

  const detection = processMessage(
    {
      vector: input.vector,
      sender: input.sender,
      recipient: input.recipient,
      content: input.content,
    },
    undefined,
    knownBad,
    domainAuth
  )

  const severity = normaliseSeverity(detection.severity)
  const campaignType = campaignTypeFromVector(input.vector)
  const entityKey = entityKeyFor(input)

  return withTransaction(async (conn) => {
    const messageId = await insertMessage(input, conn)

    // Upsert correlation_groups: if an open (created within 24h) group for this
    // entity already exists, append this message_id and refresh scores/vectors.
    const [existingRows] = await conn.query<any[]>(
      `SELECT id, message_ids, vector_types
         FROM correlation_groups
        WHERE entity_key = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY created_at DESC
        LIMIT 1`,
      [entityKey]
    )

    let groupId: string
    if (existingRows.length > 0) {
      const row = existingRows[0]
      const messageIds: string[] = safeParseJsonArray(row.message_ids)
      const vectorTypes: string[] = safeParseJsonArray(row.vector_types)
      messageIds.push(messageId)
      if (!vectorTypes.includes(input.vector)) vectorTypes.push(input.vector)

      await conn.query(
        `UPDATE correlation_groups
            SET message_ids = ?,
                vector_types = ?,
                s2_score = ?,
                s3_score = ?,
                s4_score = ?,
                c_score  = ?,
                max_severity = ?,
                campaign_type = ?
          WHERE id = ?`,
        [
          JSON.stringify(messageIds),
          JSON.stringify(vectorTypes),
          detection.s2Score,
          detection.s3Score,
          detection.s4Score,
          detection.cgScore,
          severity.toUpperCase(),
          campaignType,
          row.id,
        ]
      )
      groupId = row.id
    } else {
      groupId = randomUUID()
      await conn.query(
        `INSERT INTO correlation_groups
           (id, message_ids, entity_key, vector_types,
            s2_score, s3_score, s4_score, c_score,
            max_severity, campaign_type, actor_id, campaign_id,
            created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NOW())`,
        [
          groupId,
          JSON.stringify([messageId]),
          entityKey,
          JSON.stringify([input.vector]),
          detection.s2Score,
          detection.s3Score,
          detection.s4Score,
          detection.cgScore,
          severity.toUpperCase(),
          campaignType,
        ]
      )
    }

    // Record matched rules — look up rule_id by name; skip rows that don't match
    for (const ruleName of detection.rulesHit) {
      try {
        const [ruleRows] = await conn.query<any[]>(
          `SELECT id FROM rules WHERE name = ? LIMIT 1`,
          [ruleName]
        )
        const ruleId = ruleRows[0]?.id ?? null
        if (ruleId === null) continue
        await conn.query(
          `INSERT INTO rule_hits (id, group_id, rule_id, rule_name, severity, matched_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [randomUUID(), groupId, ruleId, ruleName, severity.toUpperCase()]
        )
      } catch {
        // Skip rule_hits insert failures — non-critical
      }
    }

// Fire an alert only for LOW/MEDIUM/HIGH/CRITICAL, skip DISMISSED
    let alertId: string | null = null
    if (severity !== 'dismissed') {
      alertId = randomUUID()
      await conn.query(
        `INSERT INTO alerts
           (id, group_id, c_score, severity, victims, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
        [
          alertId,
          groupId,
          detection.cgScore,
          severity.toUpperCase(),
          JSON.stringify([input.recipient]),
        ]
      )
    }

    // Resolve actor and link to group
    const actorKind = input.vector === 'email' ? 'email_domain' : input.vector === 'sms' ? 'sender' : 'phone'
    let messageCount = 1
    if (existingRows.length > 0) {
      const [updatedGroup] = await conn.query<any[]>(`SELECT message_ids FROM correlation_groups WHERE id = ?`, [groupId])
      messageCount = safeParseJsonArray(updatedGroup[0]?.message_ids).length
    }
    const { actorId } = await resolveActor({
      entityKey,
      kind: actorKind,
      groupSeverity: detection.severity,
      messagesInGroup: messageCount,
      conn,
    })
    await conn.query(`UPDATE correlation_groups SET actor_id = ? WHERE id = ?`, [actorId, groupId])

    // Resolve campaign and link to group
    const [groupRow] = await conn.query<any[]>(`SELECT created_at FROM correlation_groups WHERE id = ?`, [groupId])
    const campaignResult = await resolveCampaign({
      campaignType,
      createdAt: groupRow[0]?.created_at ?? new Date(),
      groupSeverity: detection.severity,
      messagesInGroup: messageCount,
      conn,
    })
    if (campaignResult) {
      await conn.query(`UPDATE correlation_groups SET campaign_id = ? WHERE id = ?`, [campaignResult.campaignId, groupId])
    }

    await conn.query(
      `UPDATE messages SET status = 'processed' WHERE id = ?`,
      [messageId]
    )

    return {
      messageId,
      groupId,
      alertId,
      detection,
    }
  })
}

function safeParseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
