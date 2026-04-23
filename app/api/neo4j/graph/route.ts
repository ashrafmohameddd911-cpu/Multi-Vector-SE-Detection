import { NextResponse } from 'next/server'
import { readTx } from '@/lib/neo4j'
import neo4j from 'neo4j-driver'

/**
 * GET /api/neo4j/graph
 *
 * Returns the live Neo4j graph as Cytoscape-shaped { nodes, edges, stats }.
 *
 * Query params:
 *   labels  = comma-separated node labels to include (default: all)
 *   limit   = max nodes (default 1000, hard cap 1000)
 *   since   = ISO datetime — filter Message/Group/Alert nodes by creation time
 *
 * Node IDs use Neo4j elementId (always unique, works for all label types).
 */
const ALL_LABELS = [
  'Attacker',
  'Victim',
  'Message',
  'CorrelationGroup',
  'Alert',
  'Rule',
  'Campaign',
] as const
type NodeLabel = (typeof ALL_LABELS)[number]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const labelsParam = url.searchParams.get('labels')
  const limitParam = url.searchParams.get('limit')
  const sinceParam = url.searchParams.get('since')

  const requestedLabels: NodeLabel[] = labelsParam
    ? labelsParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is NodeLabel => (ALL_LABELS as readonly string[]).includes(s))
    : [...ALL_LABELS]

  const rawLimit = parseInt(limitParam ?? '1000', 10) || 1000
  // Apply hard cap at 1000
  const limit = Math.min(rawLimit, 1000)

  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? sinceParam : null

  try {
    // ---- 1. Fetch nodes matching the requested labels --------------------
    //
    // We use elementId(n) as the stable node identity — it always exists
    // regardless of whether the node has an `id` property (Rule/Campaign don't).
    //
    // The `since` filter is applied only to time-stamped node types; other
    // node types (Attacker, Victim, Rule, Campaign) are always included when
    // their label is selected.
    const nodeRows = await readTx<any>(
      `
        MATCH (n)
        WHERE any(l IN labels(n) WHERE l IN $labels)
        AND (
          $since IS NULL
          OR NOT (n:Message OR n:CorrelationGroup OR n:Alert)
          OR (n:Message          AND n.received_at >= $since)
          OR (n:CorrelationGroup AND n.created_at  >= $since)
          OR (n:Alert            AND n.created_at  >= $since)
        )
        RETURN n, elementId(n) AS eid
        LIMIT $limit
      `,
      // Wrap limit in neo4j.int() here
      { labels: requestedLabels, since, limit: neo4j.int(limit) }
    )

    const nodes: GraphNode[] = []
    const eidSet = new Set<string>()
    for (const row of nodeRows) {
      const eid = String(row.eid)
      const n = row.n
      if (!n || !n.labels) continue
      const labels = n.labels as NodeLabel[]
      const props = n.properties ?? {}
      const primary = pickPrimaryLabel(labels)
      if (!primary) continue
      eidSet.add(eid)
      nodes.push({
        id: eid,
        label: primary,
        labels,
        caption: buildCaption(primary, props),
        color: colorFor(primary, props),
        size: sizeFor(primary, props),
        props,
      })
    }

    if (nodes.length === 0) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        stats: { nodes: 0, edges: 0, labels: Object.fromEntries(ALL_LABELS.map((l) => [l, 0])) },
      })
    }

    // ---- 2. Fetch edges between the returned nodes -----------------------
    //
    // Match relationships where BOTH endpoints are in our node set,
    // using elementId() for matching — avoids the `id` property problem
    // with Rule and Campaign nodes.
    const eids = [...eidSet]
    const edgeRows = await readTx<any>(
      `
        MATCH (a)-[r]->(b)
        WHERE elementId(a) IN $eids AND elementId(b) IN $eids
        RETURN elementId(a) AS source,
               elementId(b) AS target,
               type(r)      AS type,
               properties(r) AS props,
               elementId(r)  AS edgeId
        LIMIT $edgeLimit
      `,
      // Wrap edgeLimit in neo4j.int() here
      { eids, edgeLimit: neo4j.int(Math.floor(limit * 8)) }
    )

    const edges: GraphEdge[] = edgeRows
      .filter((e) => eidSet.has(String(e.source)) && eidSet.has(String(e.target)))
      .map((e) => ({
        id: String(e.edgeId),
        source: String(e.source),
        target: String(e.target),
        type: String(e.type),
        caption: prettyRelType(String(e.type)),
        props: e.props ?? {},
      }))

    const labelCounts = Object.fromEntries(
      ALL_LABELS.map((l) => [l, nodes.filter((n) => n.labels.includes(l)).length])
    )

    return NextResponse.json({
      nodes,
      edges,
      stats: { nodes: nodes.length, edges: edges.length, labels: labelCounts },
    })
  } catch (err: any) {
    console.error('[neo4j/graph] failed', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    })
    return NextResponse.json(
      {
        nodes: [],
        edges: [],
        error: err?.message ?? 'Neo4j query failed',
        code: err?.code,
      },
      { status: 500 }
    )
  }
}

/* ---------- types ---------- */
interface GraphNode {
  id: string
  label: NodeLabel
  labels: NodeLabel[]
  caption: string
  color: string
  size: number
  props: Record<string, any>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  caption: string
  props: Record<string, any>
}

/* ---------- helpers ---------- */
function pickPrimaryLabel(labels: NodeLabel[]): NodeLabel | null {
  const priority: NodeLabel[] = ['Alert', 'CorrelationGroup', 'Attacker', 'Victim', 'Message', 'Rule', 'Campaign']
  for (const p of priority) if (labels.includes(p)) return p
  return labels[0] ?? null
}

function buildCaption(label: NodeLabel, props: Record<string, any>): string {
  switch (label) {
    case 'Attacker':
      return truncate(String(props.value ?? props.id ?? 'attacker'), 30)
    case 'Victim':
      return truncate(String(props.id ?? 'victim'), 30)
    case 'Message': {
      const prefix = props.vector ? `[${props.vector}] ` : ''
      return prefix + truncate(String(props.subject || props.content || props.id || ''), 35)
    }
    case 'CorrelationGroup':
      return `${truncate(String(props.entity_key ?? props.id ?? ''), 20)} · ${props.severity ?? '—'}`
    case 'Alert':
      return `Alert · ${props.severity ?? '—'} · ${typeof props.c_score === 'number' ? props.c_score.toFixed(2) : '—'}`
    case 'Rule':
      return truncate(String(props.name ?? 'rule'), 30)
    case 'Campaign':
      return truncate(String(props.type ?? 'campaign'), 30)
    default:
      return String(props.id ?? '')
  }
}

function colorFor(label: NodeLabel, props: Record<string, any>): string {
  switch (label) {
    case 'Attacker':
      return props.is_known_bad ? '#991b1b' : '#ef4444' // darker red if known bad
    case 'Victim':
      return '#22c55e'
    case 'Message':
      if (props.vector === 'email') return '#60a5fa'
      if (props.vector === 'sms') return '#fbbf24'
      if (props.vector === 'call') return '#f472b6'
      return '#94a3b8'
    case 'CorrelationGroup':
      return severityColor(props.severity)
    case 'Alert':
      return severityColor(props.severity)
    case 'Rule':
      return '#a78bfa'
    case 'Campaign':
      return '#38bdf8'
    default:
      return '#94a3b8'
  }
}

function severityColor(sev: any): string {
  switch (String(sev ?? '').toUpperCase()) {
    case 'CRITICAL': return '#dc2626'
    case 'HIGH': return '#f97316'
    case 'MEDIUM': return '#eab308'
    case 'LOW': return '#22c55e'
    default: return '#64748b'
  }
}

function sizeFor(label: NodeLabel, props: Record<string, any>): number {
  switch (label) {
    case 'Alert': return 50
    case 'CorrelationGroup': return 40
    case 'Attacker': return props.is_known_bad ? 44 : 36
    case 'Victim': return 30
    case 'Campaign': return 44
    case 'Rule': return 26
    case 'Message': return 22
    default: return 28
  }
}

function prettyRelType(t: string): string {
  return t.replace(/_/g, ' ').toLowerCase()
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}