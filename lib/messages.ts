import { randomUUID } from 'crypto'
import type { PoolConnection } from 'mysql2/promise'
import { pool, withTransaction } from '@/lib/mysql'
import { processMessage } from '@/lib/detection-pipeline'
import type { Vector } from '@/lib/mock-data'

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
 * 4. Insert rule contributions into `rules_hits`.
 * 5. Insert a row into `alerts` pointing at the group.
 * 6. Flip the message status to 'processed'.
 *
 * All five DB writes run in a single transaction.
 */
export async function ingestAndProcessMessage(input: RawMessageInput) {
  const detection = processMessage({
    vector: input.vector,
    sender: input.sender,
    recipient: input.recipient,
    content: input.content,
  })

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
                s1_score = ?,
                s2_score = ?,
                s3_score = ?,
                s4_score = ?,
                c_score  = ?,
                severity = ?,
                campaign_type = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [
          JSON.stringify(messageIds),
          JSON.stringify(vectorTypes),
          detection.s1Score,
          detection.s2Score,
          detection.s3Score,
          detection.s4Score,
          detection.cgScore,
          severity,
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
            s1_score, s2_score, s3_score, s4_score, c_score,
            severity, campaign_type, actor_id, campaign_id,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
        [
          groupId,
          JSON.stringify([messageId]),
          entityKey,
          JSON.stringify([input.vector]),
          detection.s1Score,
          detection.s2Score,
          detection.s3Score,
          detection.s4Score,
          detection.cgScore,
          severity,
          campaignType,
        ]
      )
    }

    // Record matched rules
    for (const ruleName of detection.rulesHit) {
      await conn.query(
        `INSERT INTO rules_hits (group_id, rule_name, rule_score, vector_types, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          groupId,
          ruleName,
          detection.cgScore / Math.max(detection.rulesHit.length, 1),
          JSON.stringify([input.vector]),
        ]
      )
    }

    // Fire an alert only for LOW/MEDIUM/HIGH/CRITICAL, skip DISMISSED
    let alertId: string | null = null
    if (severity !== 'dismissed') {
      alertId = randomUUID()
      await conn.query(
        `INSERT INTO alerts
           (id, group_id, c_score, severity, campaign_type, victims, status, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), NULL)`,
        [
          alertId,
          groupId,
          detection.cgScore,
          severity,
          campaignType,
          JSON.stringify([input.recipient]),
        ]
      )
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
