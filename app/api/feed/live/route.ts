import { NextResponse } from 'next/server'
import { query } from '@/lib/mysql'

/**
 * GET /api/feed/live
 *
 * Returns the live feed of every processed message, joined to its
 * correlation group (if any), the rules that fired for that group,
 * and the alert that was raised (if any).
 *
 * Query params:
 *   vector = 'email' | 'sms' | 'call'   (optional filter)
 *   limit  = max rows                    (default 50, hard cap 500)
 *   since  = ISO datetime                (optional — only newer rows)
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const vector = url.searchParams.get('vector')
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 50, 1, 500)
  const since = url.searchParams.get('since')

  try {
    // ---- 1. Messages ---------------------------------------------------
    const whereParts: string[] = []
    const msgParams: any[] = []
    if (vector && ['email', 'sms', 'call'].includes(vector)) {
      whereParts.push('vector_type = ?')
      msgParams.push(vector)
    }
    if (since) {
      const sinceDate = new Date(since)
      if (!Number.isNaN(sinceDate.getTime())) {
        whereParts.push('received_at >= ?')
        msgParams.push(sinceDate)
      }
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

    // LIMIT inlined (clamped int — safe) to avoid mysql2 prepared-stmt LIMIT quirks.
    const messages = await query<any>(
      `SELECT id, vector_type, sender, sender_domain, recipient, subject,
              raw_content, received_at, status
         FROM messages
         ${whereSql}
         ORDER BY received_at DESC
         LIMIT ${limit}`,
      msgParams
    )

    if (messages.length === 0) {
      return NextResponse.json({ items: [], count: 0 })
    }

    // ---- 2. Correlation groups that might own these messages ----------
    //
    // We fetch the most recent groups and then match messages to groups in JS
    // by scanning each group's `message_ids` JSON array. This avoids the
    // JSON_CONTAINS-in-a-JOIN pattern which is slow and version-sensitive.
    const groupRows = await query<any>(
      `SELECT id, entity_key, message_ids, vector_types,
              s1_score, s2_score, s3_score, s4_score, c_score,
              severity, campaign_type, created_at, updated_at
         FROM correlation_groups
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 2000`
    )

    const groupByMsgId = new Map<string, any>()
    const groupById = new Map<string, any>()
    for (const g of groupRows) {
      groupById.set(String(g.id), g)
      const ids = parseJsonArray(g.message_ids)
      for (const mid of ids) {
        const key = String(mid)
        // Only set if not already mapped (keep most-recent-first ordering)
        if (!groupByMsgId.has(key)) groupByMsgId.set(key, g)
      }
    }

    // ---- 3. Rules fired per group, for the groups we actually used ----
    const usedGroupIds = new Set<string>()
    for (const m of messages) {
      const g = groupByMsgId.get(String(m.id))
      if (g) usedGroupIds.add(String(g.id))
    }

    const rulesByGroup = new Map<string, any[]>()
    if (usedGroupIds.size > 0) {
      const ids = [...usedGroupIds]
      const placeholders = ids.map(() => '?').join(',')
      const ruleRows = await query<any>(
        `SELECT group_id, rule_name, rule_score, vector_types, created_at
           FROM rules_hits
          WHERE group_id IN (${placeholders})
          ORDER BY created_at DESC`,
        ids
      )
      for (const r of ruleRows) {
        const gid = String(r.group_id)
        const list = rulesByGroup.get(gid) ?? []
        list.push({
          name: r.rule_name,
          score: Number(r.rule_score) || 0,
          vector_types: parseJsonArray(r.vector_types),
          created_at: toIso(r.created_at),
        })
        rulesByGroup.set(gid, list)
      }
    }

    // ---- 4. Alerts for those groups ----------------------------------
    const alertsByGroup = new Map<string, any>()
    if (usedGroupIds.size > 0) {
      const ids = [...usedGroupIds]
      const placeholders = ids.map(() => '?').join(',')
      const alertRows = await query<any>(
        `SELECT id, group_id, status, created_at, victims
           FROM alerts
          WHERE group_id IN (${placeholders})
          ORDER BY created_at DESC`,
        ids
      )
      for (const a of alertRows) {
        const gid = String(a.group_id)
        if (!alertsByGroup.has(gid)) alertsByGroup.set(gid, a)
      }
    }

    // ---- 5. Shape response -------------------------------------------
    const items = messages.map((m: any) => {
      const g = groupByMsgId.get(String(m.id))
      const a = g ? alertsByGroup.get(String(g.id)) : null
      return {
        message: {
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
        group: g
          ? {
              id: g.id,
              entity_key: g.entity_key,
              s1: Number(g.s1_score) || 0,
              s2: Number(g.s2_score) || 0,
              s3: Number(g.s3_score) || 0,
              s4: Number(g.s4_score) || 0,
              c_score: Number(g.c_score) || 0,
              severity: g.severity,
              campaign_type: g.campaign_type,
              vector_types: parseJsonArray(g.vector_types),
              message_count: parseJsonArray(g.message_ids).length,
              rules: rulesByGroup.get(String(g.id)) ?? [],
            }
          : null,
        alert: a
          ? {
              id: a.id,
              status: a.status,
              created_at: toIso(a.created_at),
              victims: parseJsonArray(a.victims),
            }
          : null,
      }
    })

    return NextResponse.json({ items, count: items.length })
  } catch (err: any) {
    // Surface the actual DB error in dev so we can fix it.
    console.error('[feed/live] failed', {
      message: err?.message,
      code: err?.code,
      sqlState: err?.sqlState,
      errno: err?.errno,
      stack: err?.stack,
    })
    return NextResponse.json(
      {
        items: [],
        count: 0,
        error: err?.message ?? 'query failed',
        code: err?.code,
      },
      { status: 500 }
    )
  }
}

function parseJsonArray(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
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
