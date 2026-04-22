import { NextResponse } from 'next/server'
import { query } from '@/lib/mysql'

/**
 * GET /api/feed/live
 *
 * Returns the most recent correlation groups, each with their embedded
 * messages, rules that fired, and alert (if raised).
 *
 * Query params:
 *   vector = 'email' | 'sms' | 'call'   (filter groups that contain this vector)
 *   limit  = max groups                  (default 30, hard cap 200)
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const vector = url.searchParams.get('vector')
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '30', 10)
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 30, 1, 200)

  try {
    // ---- 1. Fetch recent correlation groups ---------------------------------
    const groups = await query<any>(
      `SELECT id, entity_key, message_ids, vector_types,
              s2_score, s3_score, s4_score, c_score,
              max_severity AS severity, campaign_type, created_at
         FROM correlation_groups
        ORDER BY created_at DESC
        LIMIT ${limit}`
    )

    if (groups.length === 0) return NextResponse.json({ items: [], count: 0 })

    const groupIds = groups.map((g: any) => String(g.id))

    // ---- 2. Collect all message IDs across every group ----------------------
    const groupMsgIds = new Map<string, string[]>()
    const allMsgIdsSet = new Set<string>()
    for (const g of groups) {
      const ids = parseJsonArray(g.message_ids).map(String)
      groupMsgIds.set(String(g.id), ids)
      for (const id of ids) allMsgIdsSet.add(id)
    }
    const allMsgIds = [...allMsgIdsSet]

    // ---- 3. Fetch all messages in one query ---------------------------------
    const messagesById = new Map<string, any>()
    if (allMsgIds.length > 0) {
      const placeholders = allMsgIds.map(() => '?').join(',')
      const msgRows = await query<any>(
        `SELECT id, vector_type, sender, sender_domain, recipient, subject,
                raw_content, received_at, status
           FROM messages
          WHERE id IN (${placeholders})`,
        allMsgIds
      )
      for (const m of msgRows) messagesById.set(String(m.id), m)
    }

    // ---- 4. Fetch rules for all groups --------------------------------------
    const rulesByGroup = new Map<string, any[]>()
    {
      const placeholders = groupIds.map(() => '?').join(',')
      const ruleRows = await query<any>(
        `SELECT group_id, rule_name, severity, matched_at
           FROM rule_hits
          WHERE group_id IN (${placeholders})
          ORDER BY matched_at DESC`,
        groupIds
      )
      for (const r of ruleRows) {
        const gid = String(r.group_id)
        const list = rulesByGroup.get(gid) ?? []
        list.push({ name: r.rule_name, severity: r.severity, matched_at: toIso(r.matched_at) })
        rulesByGroup.set(gid, list)
      }
    }

    // ---- 5. Fetch alerts for all groups -------------------------------------
    const alertsByGroup = new Map<string, any>()
    {
      const placeholders = groupIds.map(() => '?').join(',')
      const alertRows = await query<any>(
        `SELECT id, group_id, status, severity, c_score, created_at, victims
           FROM alerts
          WHERE group_id IN (${placeholders})
          ORDER BY created_at DESC`,
        groupIds
      )
      for (const a of alertRows) {
        const gid = String(a.group_id)
        if (!alertsByGroup.has(gid)) {
          alertsByGroup.set(gid, {
            id: a.id,
            status: a.status,
            severity: a.severity,
            c_score: Number(a.c_score) || 0,
            created_at: toIso(a.created_at),
            victims: parseJsonArray(a.victims),
          })
        }
      }
    }

    // ---- 6. Shape response — one item per group -----------------------------
    const items = groups
      .map((g: any) => {
        const gid = String(g.id)
        const msgIds = groupMsgIds.get(gid) ?? []
        const messages = msgIds
          .map((id) => messagesById.get(id))
          .filter(Boolean)
          .map((m: any) => ({
            id: m.id,
            vector: m.vector_type as 'email' | 'sms' | 'call',
            sender: m.sender,
            sender_domain: m.sender_domain,
            recipient: m.recipient,
            subject: m.subject,
            content: m.raw_content,
            received_at: toIso(m.received_at),
            status: m.status,
          }))

        // Apply vector filter in JS (avoids JSON_CONTAINS on every row)
        if (vector && !messages.some((m) => m.vector === vector)) return null

        const vectorTypes = parseJsonArray(g.vector_types)

        return {
          group: {
            id: gid,
            entity_key: g.entity_key,
            s2: Number(g.s2_score) || 0,
            s3: Number(g.s3_score) || 0,
            s4: Number(g.s4_score) || 0,
            c_score: Number(g.c_score) || 0,
            severity: (g.severity ?? 'LOW') as string,
            campaign_type: g.campaign_type ?? null,
            vector_types: vectorTypes,
            message_count: msgIds.length,
            created_at: toIso(g.created_at),
            rules: rulesByGroup.get(gid) ?? [],
            alert: alertsByGroup.get(gid) ?? null,
          },
          messages,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ items, count: items.length })
  } catch (err: any) {
    console.error('[feed/live] failed', {
      message: err?.message,
      code: err?.code,
      sqlState: err?.sqlState,
      errno: err?.errno,
      stack: err?.stack,
    })
    return NextResponse.json(
      { items: [], count: 0, error: err?.message ?? 'query failed', code: err?.code },
      { status: 500 }
    )
  }
}

function parseJsonArray(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function toIso(v: any): string | null {
  if (!v) return null
  try {
    return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
  } catch {
    return null
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
