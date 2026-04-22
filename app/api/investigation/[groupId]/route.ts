import { NextResponse } from 'next/server'
import { query } from '@/lib/mysql'

/**
 * GET /api/investigation/:groupId
 *
 * Full investigation payload for a correlation group:
 *   - The group row (scores, severity, entity_key, campaign_type)
 *   - Every message in the group
 *   - Every rule that fired for the group
 *   - The alert (if one was raised)
 *   - A "rationale" array explaining *why* this group became an alert
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  if (!groupId) {
    return NextResponse.json({ error: 'missing groupId' }, { status: 400 })
  }

  try {
    const groups = await query<any>(
      `SELECT id, entity_key, message_ids, vector_types,
              s2_score, s3_score, s4_score, c_score,
              max_severity AS severity, campaign_type, created_at
         FROM correlation_groups
        WHERE id = ?`,
      [groupId]
    )
    if (groups.length === 0) {
      return NextResponse.json({ error: 'group not found' }, { status: 404 })
    }
    const g = groups[0]

    const messageIds = parseJsonArray(g.message_ids)
    let messages: any[] = []
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',')
      messages = await query<any>(
        `SELECT id, vector_type, sender, sender_domain, recipient,
                raw_content, subject, received_at, status
           FROM messages
          WHERE id IN (${placeholders})
          ORDER BY received_at ASC`,
        messageIds
      )
    }

    const rules = await query<any>(
      `SELECT id, rule_name, severity, matched_at
         FROM rule_hits
        WHERE group_id = ?
        ORDER BY matched_at ASC`,
      [groupId]
    )

    const alerts = await query<any>(
      `SELECT id, group_id, c_score, severity, victims,
              status, created_at
         FROM alerts
        WHERE group_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [groupId]
    )
    const alert = alerts[0] ?? null

    const s1 = 0
    const s2 = Number(g.s2_score) || 0
    const s3 = Number(g.s3_score) || 0
    const s4 = Number(g.s4_score) || 0
    const cScore = Number(g.c_score) || 0

    const vectorTypes = parseJsonArray(g.vector_types)
    const uniqueVectors = Array.from(new Set(vectorTypes))
    const totalRuleScore = rules.length

    // --- Rationale: human-readable reasons this group became an alert ---
    const rationale: {
      code: string
      severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
      title: string
      detail: string
    }[] = []

    if (cScore >= 0.75) {
      rationale.push({
        code: 'C_SCORE_HIGH',
        severity: 'critical',
        title: `C(G) score is ${cScore.toFixed(2)} — above critical threshold`,
        detail:
          'The combined weighted score across all 4 detection layers exceeded the alerting threshold.',
      })
    } else if (cScore >= 0.5) {
      rationale.push({
        code: 'C_SCORE_MEDIUM',
        severity: 'high',
        title: `C(G) score is ${cScore.toFixed(2)} — above alerting threshold`,
        detail:
          'The combined weighted score crossed the alerting threshold, so this group was promoted from a watched correlation to an alert.',
      })
    }

    if (s1 >= 0.6) {
      rationale.push({
        code: 'S1_LEXICAL',
        severity: s1 >= 0.8 ? 'high' : 'medium',
        title: `S1 lexical/urgency score is ${s1.toFixed(2)}`,
        detail:
          'Message content uses urgent language, time pressure, or known phishing phrasing patterns.',
      })
    }
    if (s2 >= 0.6) {
      rationale.push({
        code: 'S2_DOMAIN',
        severity: s2 >= 0.8 ? 'high' : 'medium',
        title: `S2 domain/auth score is ${s2.toFixed(2)}`,
        detail:
          'Sender domain or authentication checks (SPF/DKIM/DMARC, domain age, look-alike detection) flagged this traffic.',
      })
    }
    if (s3 >= 0.6) {
      rationale.push({
        code: 'S3_CONTENT',
        severity: s3 >= 0.8 ? 'high' : 'medium',
        title: `S3 content/brand score is ${s3.toFixed(2)}`,
        detail:
          'Content impersonates a brand, requests credentials, or contains suspicious links / spoofed display names.',
      })
    }
    if (s4 >= 0.6) {
      rationale.push({
        code: 'S4_BEHAVIORAL',
        severity: s4 >= 0.8 ? 'high' : 'medium',
        title: `S4 behavioural/multi-vector score is ${s4.toFixed(2)}`,
        detail:
          'Sender shows attack-like behaviour: burst volume, many recipients, or coordination across multiple vectors.',
      })
    }

    if (uniqueVectors.length >= 2) {
      rationale.push({
        code: 'MULTI_VECTOR',
        severity: uniqueVectors.length >= 3 ? 'critical' : 'high',
        title: `Multi-vector campaign (${uniqueVectors.join(' + ')})`,
        detail: `The same attacker reached this victim across ${uniqueVectors.length} different channels, which strongly indicates a coordinated social-engineering campaign.`,
      })
    }

    if (rules.length > 0) {
      const top = rules.slice(0, 3).map((r: any) => r.rule_name).join(', ')
      rationale.push({
        code: 'RULES_FIRED',
        severity: rules.length >= 4 ? 'high' : 'medium',
        title: `${rules.length} rule${rules.length === 1 ? '' : 's'} fired (total rule score ${totalRuleScore.toFixed(2)})`,
        detail: `Top rules: ${top}${rules.length > 3 ? ', …' : ''}`,
      })
    }

    if (messages.length >= 3) {
      rationale.push({
        code: 'BURST_VOLUME',
        severity: messages.length >= 10 ? 'high' : 'medium',
        title: `${messages.length} related messages grouped together`,
        detail:
          'Multiple correlated messages targeting the same entity within the correlation window.',
      })
    }

    if (rationale.length === 0) {
      rationale.push({
        code: 'BASELINE',
        severity: 'info',
        title: 'Grouped for monitoring',
        detail:
          'No single layer crossed its individual threshold, but the weighted combination was enough to open a watched correlation.',
      })
    }

    return NextResponse.json({
      group: {
        id: g.id,
        entityKey: g.entity_key,
        severity: g.severity,
        campaignType: g.campaign_type,
        cScore,
        s1,
        s2,
        s3,
        s4,
        vectors: uniqueVectors,
        createdAt: toIso(g.created_at),
        updatedAt: toIso(g.created_at),
        messageCount: messages.length,
      },
      messages: messages.map((m: any) => ({
        id: m.id,
        vector: m.vector_type,
        sender: m.sender,
        senderDomain: m.sender_domain,
        recipient: m.recipient,
        subject: m.subject,
        content: m.raw_content,
        receivedAt: toIso(m.received_at),
        status: m.status,
      })),
      rules: rules.map((r: any) => ({
        id: r.id,
        name: r.rule_name,
        score: 0,
        vectorTypes: [],
        createdAt: toIso(r.matched_at),
      })),
      alert: alert
        ? {
            id: alert.id,
            status: alert.status,
            severity: alert.severity,
            createdAt: toIso(alert.created_at),
            resolvedAt: null,
            victims: parseJsonArray(alert.victims),
          }
        : null,
      rationale,
      weights: { s1: 0.2, s2: 0.3, s3: 0.3, s4: 0.2 },
    })
  } catch (err: any) {
    console.error('[investigation] failed', err)
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
