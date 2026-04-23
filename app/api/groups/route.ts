import { NextResponse } from 'next/server'
import { query } from '@/lib/mysql'

/**
 * GET /api/groups?search=<term>&limit=20
 *
 * Search correlation groups by entity_key or group id.
 * Returns a lightweight list for the investigation search UI.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim() ?? ''
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const limit = Math.max(1, Math.min(rawLimit, 100))

  try {
    let rows: any[]

    if (search.length === 0) {
      // No search term — return most recent groups
      // Use GROUP_CONCAT to aggregate alert data per group
      rows = await query<any>(
        `SELECT g.id, g.entity_key, g.vector_types, g.message_ids,
                g.s2_score, g.s3_score, g.s4_score, g.c_score,
                g.max_severity AS severity, g.campaign_type, g.created_at,
                GROUP_CONCAT(DISTINCT a.id SEPARATOR ',') AS alert_ids,
                GROUP_CONCAT(DISTINCT a.status SEPARATOR ',') AS alert_statuses
           FROM correlation_groups g
           LEFT JOIN alerts a ON a.group_id = g.id
          GROUP BY g.id
          ORDER BY g.created_at DESC
          LIMIT ${limit}`
      )
    } else {
      rows = await query<any>(
        `SELECT g.id, g.entity_key, g.vector_types, g.message_ids,
                g.s2_score, g.s3_score, g.s4_score, g.c_score,
                g.max_severity AS severity, g.campaign_type, g.created_at,
                GROUP_CONCAT(DISTINCT a.id SEPARATOR ',') AS alert_ids,
                GROUP_CONCAT(DISTINCT a.status SEPARATOR ',') AS alert_statuses
           FROM correlation_groups g
           LEFT JOIN alerts a ON a.group_id = g.id
          WHERE g.entity_key LIKE ? OR g.id = ?
          GROUP BY g.id
          ORDER BY g.created_at DESC
          LIMIT ${limit}`,
        [`%${search}%`, search]
      )
    }

    const results = rows.map((r) => {
      // Extract first alert if multiple exist
      const alertIds = r.alert_ids ? r.alert_ids.split(',') : []
      const alertStatuses = r.alert_statuses ? r.alert_statuses.split(',') : []
      
      return {
        id: r.id,
        entity_key: r.entity_key,
        severity: r.severity ?? 'LOW',
        campaign_type: r.campaign_type ?? null,
        c_score: Number(r.c_score) || 0,
        vector_types: parseJsonArray(r.vector_types),
        message_count: parseJsonArray(r.message_ids).length,
        created_at: toIso(r.created_at),
        alert: alertIds.length > 0
          ? { id: alertIds[0], status: alertStatuses[0] || 'UNKNOWN' }
          : null,
      }
    })

    return NextResponse.json(results)
  } catch (err: any) {
    console.error('[groups] failed', { message: err?.message, code: err?.code })
    return NextResponse.json(
      { error: err?.message ?? 'query failed' },
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