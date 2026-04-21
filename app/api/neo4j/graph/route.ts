import { NextResponse } from 'next/server'
import { readTx } from '@/lib/neo4j'

/**
 * GET /api/neo4j/graph
 *
 * Returns the full live graph projection as Cytoscape-shaped `{ nodes, edges }`.
 *
 * Query params:
 *   labels   = comma-separated list of labels to include (e.g. "Attacker,Message,Victim").
 *              Default is all labels. Hidden labels never appear as endpoints of returned edges.
 *   limit    = max nodes to return (default 500, hard cap 5000)
 *   since    = ISO datetime — only include messages/groups/alerts created at/after this time
 *
 * Each node:
 *   { id, label, labels, caption, color, size, props }
 *
 * Each edge:
 *   { id, source, target, type, caption, props }
 */

const KNOWN_LABELS = [
  'Attacker',
  'Victim',
  'Message',
  'CorrelationGroup',
  'Alert',
  'Rule',
  'Campaign',
] as const

type NodeLabel = (typeof KNOWN_LABELS)[number]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const labelsParam = url.searchParams.get('labels')
  const limitParam = url.searchParams.get('limit')
  const sinceParam = url.searchParams.get('since')

  const labels: NodeLabel[] = labelsParam
    ? (labelsParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is NodeLabel =>
          (KNOWN_LABELS as readonly string[]).includes(s)
        ))
    : [...KNOWN_LABELS]

  const limit = clamp(parseInt(limitParam ?? '500', 10) || 500, 1, 5000)
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? sinceParam : null

  try {
    // Collect nodes that match the requested labels, respecting `since` where it makes sense.
    const nodeRows = await readTx<any>(
      `
      MATCH (n)
      WHERE any(l IN labels(n) WHERE l IN $labels)
        AND (
          $since IS NULL
          OR (n:Message            AND n.received_at >= datetime($since))
          OR (n:CorrelationGroup   AND n.created_at  >= datetime($since))
          OR (n:Alert              AND n.created_at  >= datetime($since))
          OR NOT (n:Message OR n:CorrelationGroup OR n:Alert)
        )
      RETURN n
      LIMIT $limit
      `,
      { labels, since, limit }
    )

    const nodes = nodeRows.map((row) => serializeNode(row.n)).filter(Boolean) as GraphNode[]
    const idSet = new Set(nodes.map((n) => n.id))

    // Pull edges only where both endpoints are already in the returned node set.
    // We do this in a second query so the graph is guaranteed to be connected.
    const edgeRows = await readTx<any>(
      `
      MATCH (a)-[r]->(b)
      WHERE a.id IN $ids AND b.id IN $ids
      RETURN a.id AS source, b.id AS target, type(r) AS type, properties(r) AS props,
             elementId(r) AS edgeId
      LIMIT $edgeLimit
      `,
      { ids: [...idSet], edgeLimit: limit * 6 }
    )

    const edges: GraphEdge[] = edgeRows.map((e) => ({
      id: String(e.edgeId),
      source: String(e.source),
      target: String(e.target),
      type: e.type,
      caption: prettyRelType(e.type),
      props: e.props ?? {},
    }))

    return NextResponse.json({
      nodes,
      edges,
      stats: {
        nodes: nodes.length,
        edges: edges.length,
        labels: Object.fromEntries(
          KNOWN_LABELS.map((l) => [l, nodes.filter((n) => n.labels.includes(l)).length])
        ),
      },
    })
  } catch (err: any) {
    console.error('[neo4j/graph] failed', err)
    return NextResponse.json(
      { nodes: [], edges: [], error: err?.message ?? 'query failed' },
      { status: 500 }
    )
  }
}

/* ---------- helpers ---------- */

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

function serializeNode(n: any): GraphNode | null {
  if (!n || !n.labels || !n.properties) return null
  const labels = n.labels as NodeLabel[]
  const primary = pickPrimaryLabel(labels)
  if (!primary) return null

  const props = n.properties ?? {}
  const id = String(props.id ?? props.name ?? props.type ?? n.elementId ?? '')
  if (!id) return null

  return {
    id,
    label: primary,
    labels,
    caption: buildCaption(primary, props),
    color: colorFor(primary, props),
    size: sizeFor(primary, props),
    props,
  }
}

function pickPrimaryLabel(labels: NodeLabel[]): NodeLabel | null {
  // Prefer the most specific label for styling
  const priority: NodeLabel[] = [
    'Alert',
    'CorrelationGroup',
    'Attacker',
    'Victim',
    'Message',
    'Rule',
    'Campaign',
  ]
  for (const p of priority) if (labels.includes(p)) return p
  return labels[0] ?? null
}

function buildCaption(label: NodeLabel, props: Record<string, any>): string {
  switch (label) {
    case 'Attacker':
      return props.value ?? props.id ?? 'attacker'
    case 'Victim':
      return props.id ?? 'victim'
    case 'Message':
      return `${props.vector ?? 'msg'}: ${truncate(props.subject || props.content || '', 40)}`
    case 'CorrelationGroup':
      return `Group ${shortId(props.id)} · ${props.severity ?? '—'}`
    case 'Alert':
      return `Alert ${shortId(props.id)} · ${props.severity ?? '—'}`
    case 'Rule':
      return props.name ?? 'rule'
    case 'Campaign':
      return props.type ?? 'campaign'
    default:
      return String(props.id ?? '')
  }
}

function colorFor(label: NodeLabel, props: Record<string, any>): string {
  switch (label) {
    case 'Attacker':
      return '#ef4444' // red-500
    case 'Victim':
      return '#22c55e' // green-500
    case 'Message':
      // Color by vector
      if (props.vector === 'email') return '#60a5fa' // blue-400
      if (props.vector === 'sms') return '#fbbf24' // amber-400
      if (props.vector === 'call') return '#f472b6' // pink-400
      return '#94a3b8'
    case 'CorrelationGroup':
      return severityColor(props.severity)
    case 'Alert':
      return severityColor(props.severity) // same hue, larger size
    case 'Rule':
      return '#a78bfa' // violet-400
    case 'Campaign':
      return '#38bdf8' // sky-400
    default:
      return '#94a3b8'
  }
}

function severityColor(sev: any): string {
  switch (String(sev).toUpperCase()) {
    case 'CRITICAL':
      return '#dc2626'
    case 'HIGH':
      return '#f97316'
    case 'MEDIUM':
      return '#eab308'
    case 'LOW':
      return '#22c55e'
    default:
      return '#64748b'
  }
}

function sizeFor(label: NodeLabel, props: Record<string, any>): number {
  switch (label) {
    case 'Alert':
      return 48
    case 'CorrelationGroup':
      return 38
    case 'Attacker':
      return 36
    case 'Victim':
      return 30
    case 'Campaign':
      return 42
    case 'Rule':
      return 26
    case 'Message':
      return 22
    default:
      return 28
  }
}

function prettyRelType(t: string): string {
  return t.replace(/_/g, ' ').toLowerCase()
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function shortId(id: any): string {
  if (!id) return ''
  const s = String(id)
  return s.length > 8 ? s.slice(0, 8) : s
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
