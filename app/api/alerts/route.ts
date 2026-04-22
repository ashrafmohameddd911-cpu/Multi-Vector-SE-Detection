import { NextResponse } from 'next/server'
import { query } from '@/lib/mysql'

/**
 * Return the most recent alerts joined with their correlation_group
 * (for scores + campaign_type + message_ids), the first message in the
 * group (for preview), and rule_hits (names).
 *
 * Response shape is kept close to the client-side `Alert` interface.
 */
export async function GET() {
  try {
    const alertRows = await query<any>(
      `SELECT a.id                 AS alert_id,
              a.group_id            AS group_id,
              a.c_score             AS a_c_score,
              a.severity            AS a_severity,
              a.victims             AS victims,
              a.status              AS status,
              a.created_at          AS created_at,
              g.s2_score            AS s2_score,
              g.s3_score            AS s3_score,
              g.s4_score            AS s4_score,
              g.c_score             AS c_score,
              g.campaign_type       AS a_campaign_type,
              g.entity_key          AS entity_key,
              g.vector_types        AS vector_types,
              g.message_ids         AS message_ids
         FROM alerts a
         JOIN correlation_groups g ON g.id = a.group_id
        ORDER BY a.created_at DESC
        LIMIT 100`
    )

    if (alertRows.length === 0) {
      return NextResponse.json([])
    }

    const groupIds = Array.from(new Set(alertRows.map((r) => r.group_id)))
    const placeholders = groupIds.map(() => '?').join(',')

    // Pull rule_hits for all groups in a single query
    const ruleRows = await query<any>(
      `SELECT group_id, rule_name
         FROM rule_hits
        WHERE group_id IN (${placeholders})
        ORDER BY matched_at ASC`,
      groupIds
    )
    const rulesByGroup = new Map<string, string[]>()
    for (const r of ruleRows) {
      const list = rulesByGroup.get(r.group_id) ?? []
      if (!list.includes(r.rule_name)) list.push(r.rule_name)
      rulesByGroup.set(r.group_id, list)
    }

    // Collect the first message id per alert for the preview
    const messageIdByAlert = new Map<string, string>()
    for (const r of alertRows) {
      const ids = safeParseJsonArray(r.message_ids)
      if (ids.length > 0) messageIdByAlert.set(r.alert_id, ids[0])
    }

    const allFirstMessageIds = Array.from(new Set([...messageIdByAlert.values()]))
    let messagesById = new Map<string, any>()
    if (allFirstMessageIds.length > 0) {
      const mPlaceholders = allFirstMessageIds.map(() => '?').join(',')
      const messageRows = await query<any>(
        `SELECT id, vector_type, sender, sender_domain, recipient, raw_content, subject, received_at
           FROM messages
          WHERE id IN (${mPlaceholders})`,
        allFirstMessageIds
      )
      messagesById = new Map(messageRows.map((m) => [m.id, m]))
    }

    const payload = alertRows.map((r) => {
      const vectors = safeParseJsonArray(r.vector_types)
      const victims = safeParseJsonArray(r.victims)
      const previewId = messageIdByAlert.get(r.alert_id)
      const previewMsg = previewId ? messagesById.get(previewId) : undefined
      const rulesHit = rulesByGroup.get(r.group_id) ?? []

      return {
        id: r.alert_id,
        groupId: r.group_id,
        severity: String(r.a_severity).toUpperCase(),
        campaignType: r.a_campaign_type,
        vectors,
        entity: r.entity_key,
        victim: victims[0] ?? previewMsg?.recipient ?? '',
        cgScore: Number(r.c_score ?? r.a_c_score ?? 0),
        s1Score: 0,
        s2Score: Number(r.s2_score ?? 0),
        s3Score: Number(r.s3_score ?? 0),
        s4Score: Number(r.s4_score ?? 0),
        timestamp: r.created_at,
        status: r.status,
        messages: previewMsg
          ? [
              {
                id: previewMsg.id,
                vector: previewMsg.vector_type,
                sender: previewMsg.sender,
                recipient: previewMsg.recipient,
                content: previewMsg.raw_content,
                snippet:
                  String(previewMsg.raw_content ?? '').slice(0, 80) +
                  (String(previewMsg.raw_content ?? '').length > 80 ? '...' : ''),
                timestamp: previewMsg.received_at,
                spf: 'pass',
                dkim: 'pass',
                dmarc: 'pass',
                domainAge: 365,
                vtScore: 0,
                urgencyScore: 0,
                rulesHit,
              },
            ]
          : [],
      }
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[alerts] Failed to fetch alerts:', error)
    return NextResponse.json([], { status: 200 })
  }
}

function safeParseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
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
