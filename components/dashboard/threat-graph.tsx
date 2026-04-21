'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveGraph, type GraphNode, type GraphEdge } from '@/hooks/use-live-graph'
import { cn } from '@/lib/utils'

/**
 * Live Threat Map — Neo4j-backed Cytoscape view.
 *
 * Attackers = red, victims = green, messages coloured by vector,
 * correlation groups / alerts coloured by severity.
 *
 * Polls /api/neo4j/graph every 5s. Pauses when the tab is hidden.
 */
export function ThreatGraph() {
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set())

  const { data, loading, error, refresh } = useLiveGraph({ limit: 400, pollMs: 5000 })

  const elements = useMemo(() => buildElements(data.nodes, data.edges), [data])

  // Initialise Cytoscape once
  useEffect(() => {
    let disposed = false

    ;(async () => {
      if (!ref.current) return
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
        import('cytoscape'),
        import('cytoscape-fcose'),
      ])
      if (disposed) return

      try {
        cytoscape.use(fcose as any)
      } catch {
        /* already registered */
      }

      const cy = cytoscape({
        container: ref.current,
        elements,
        style: CY_STYLE,
        layout: { name: 'fcose', animate: false, quality: 'default' } as any,
        minZoom: 0.2,
        maxZoom: 3,
        wheelSensitivity: 0.2,
      })

      cy.on('tap', 'node', (evt) => {
        const raw = evt.target.data('raw') as GraphNode | undefined
        if (raw) setSelected(raw)
      })
      cy.on('tap', (evt) => {
        if (evt.target === cy) setSelected(null)
      })

      cyRef.current = cy
    })()

    return () => {
      disposed = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push updates into the existing instance without nuking layout each poll
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const nextIds = new Set(elements.map((e: any) => e.data.id))
    // Remove elements that no longer exist
    cy.elements().forEach((el: any) => {
      if (!nextIds.has(el.id())) el.remove()
    })
    // Add or update
    let structuralChange = false
    for (const el of elements) {
      const existing = cy.getElementById(el.data.id)
      if (existing && existing.length > 0) {
        existing.data(el.data)
      } else {
        cy.add(el)
        structuralChange = true
      }
    }
    if (structuralChange) {
      cy.layout({ name: 'fcose', animate: false, quality: 'default' } as any).run()
    }

    // Apply label visibility
    cy.nodes().forEach((n: any) => {
      const label = n.data('label') as string
      n.style('display', hiddenLabels.has(label) ? 'none' : 'element')
    })
    cy.edges().forEach((e: any) => {
      const s = cy.getElementById(e.data('source'))
      const t = cy.getElementById(e.data('target'))
      const sHidden = s.length && s.style('display') === 'none'
      const tHidden = t.length && t.style('display') === 'none'
      e.style('display', sHidden || tHidden ? 'none' : 'element')
    })
  }, [elements, hiddenLabels])

  const runSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/neo4j/sync', { method: 'POST' })
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  const toggleLabel = (label: string) => {
    setHiddenLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const legend: { label: string; color: string }[] = [
    { label: 'Attacker', color: '#ef4444' },
    { label: 'Victim', color: '#22c55e' },
    { label: 'Message', color: '#60a5fa' },
    { label: 'CorrelationGroup', color: '#eab308' },
    { label: 'Alert', color: '#dc2626' },
    { label: 'Rule', color: '#a78bfa' },
    { label: 'Campaign', color: '#38bdf8' },
  ]

  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-white flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Live Threat Map
          </span>
          <button
            onClick={runSync}
            disabled={syncing}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            title="Re-project MySQL state into Neo4j"
          >
            {syncing ? 'Syncing…' : 'Sync Neo4j'}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[340px] w-full rounded-lg bg-slate-900 overflow-hidden">
          <div ref={ref} className="absolute inset-0" />

          {loading && data.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">
              Loading graph…
            </div>
          )}
          {error && (
            <div className="absolute inset-x-2 top-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
              {error}
            </div>
          )}
          {!loading && data.nodes.length === 0 && !error && (
            <div className="absolute inset-0 grid place-items-center text-xs text-slate-500">
              Empty graph — click &quot;Sync Neo4j&quot; to project MySQL state.
            </div>
          )}

          {/* Selected node panel */}
          {selected && (
            <div className="absolute right-2 top-2 w-60 rounded-lg bg-slate-950/90 p-3 ring-1 ring-slate-700 backdrop-blur">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
                <span className="text-xs font-semibold uppercase text-slate-300">
                  {selected.label}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="mb-2 text-sm font-medium text-white break-words">
                {selected.caption}
              </p>
              <dl className="space-y-0.5 text-[11px]">
                {Object.entries(selected.props).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="min-w-[80px] text-slate-500">{k}</dt>
                    <dd className="truncate text-slate-300">{renderVal(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* Legend / filter */}
        <div className="mt-3 flex flex-wrap gap-2">
          {legend.map(({ label, color }) => {
            const hidden = hiddenLabels.has(label)
            const count = data.stats?.labels?.[label] ?? 0
            return (
              <button
                key={label}
                onClick={() => toggleLabel(label)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition',
                  hidden
                    ? 'bg-slate-800 text-slate-500 line-through'
                    : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
                <span className="text-slate-500">{count}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function renderVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60)
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[]): any[] {
  const out: any[] = []
  for (const n of nodes) {
    out.push({
      group: 'nodes',
      data: {
        id: n.id,
        caption: n.caption,
        color: n.color,
        size: n.size,
        label: n.label,
        raw: n,
      },
    })
  }
  const nodeSet = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) continue
    out.push({
      group: 'edges',
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        caption: e.caption,
        type: e.type,
      },
    })
  }
  return out
}

const CY_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(caption)',
      'color': '#e2e8f0',
      'font-size': 9,
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 1,
      'border-color': '#0f172a',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#fbbf24',
      'border-width': 3,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#334155',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'width': 1.2,
      'opacity': 0.7,
      'label': 'data(caption)',
      'font-size': 7,
      'color': '#64748b',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.8,
      'text-background-padding': 2,
    },
  },
]
