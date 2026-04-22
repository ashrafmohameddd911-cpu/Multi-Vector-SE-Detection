'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveGraph, type GraphNode, type GraphEdge } from '@/hooks/use-live-graph'
import { cn } from '@/lib/utils'

/**
 * Live Threat Map — Neo4j-backed Cytoscape graph.
 *
 * Node types: Attacker (red), Victim (green), Message (blue=email / amber=sms / pink=call),
 * CorrelationGroup (severity colour), Alert (severity colour), Rule (violet), Campaign (sky).
 *
 * Features:
 *  - Toggle individual node type visibility (including email/sms/call sub-filters)
 *  - Click any node to see ALL its Neo4j properties
 *  - Zoom in / out / fit-to-screen controls
 *  - Live polling every 5s; "Sync Neo4j" button to push MySQL state
 *  - Node counts per type in the legend
 */

const ALL_FILTERS = [
  { key: 'Attacker',         label: 'Attacker',       color: '#ef4444' },
  { key: 'Victim',           label: 'Victim',         color: '#22c55e' },
  { key: 'Message:email',    label: 'Email',          color: '#60a5fa' },
  { key: 'Message:sms',      label: 'SMS',            color: '#fbbf24' },
  { key: 'Message:call',     label: 'Call',           color: '#f472b6' },
  { key: 'CorrelationGroup', label: 'Group',          color: '#eab308' },
  { key: 'Alert',            label: 'Alert',          color: '#dc2626' },
  { key: 'Rule',             label: 'Rule',           color: '#a78bfa' },
  { key: 'Campaign',         label: 'Campaign',       color: '#38bdf8' },
] as const

type FilterKey = (typeof ALL_FILTERS)[number]['key']

function nodeMatchesFilter(n: GraphNode, fk: FilterKey): boolean {
  if (fk === 'Message:email') return n.label === 'Message' && n.props?.vector === 'email'
  if (fk === 'Message:sms')   return n.label === 'Message' && n.props?.vector === 'sms'
  if (fk === 'Message:call')  return n.label === 'Message' && n.props?.vector === 'call'
  return n.label === fk
}

function isNodeHidden(n: GraphNode, hidden: Set<FilterKey>): boolean {
  for (const fk of hidden) {
    if (nodeMatchesFilter(n, fk)) return true
  }
  return false
}

function countForFilter(nodes: GraphNode[], fk: FilterKey): number {
  return nodes.filter((n) => nodeMatchesFilter(n, fk)).length
}

export function ThreatGraph() {
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)

  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [hidden, setHidden] = useState<Set<FilterKey>>(new Set())

  const { data, loading, error, refresh } = useLiveGraph({ limit: 600, pollMs: 5000 })

  const elements = useMemo(() => buildElements(data.nodes, data.edges, hidden), [data, hidden])

  // Initialise Cytoscape once
  useEffect(() => {
    let disposed = false;
    (async () => {
    if (!ref.current) return;
    const [{ default: cytoscape }, { default: fcose }, { default: cxtmenu }] = await Promise.all([
      import('cytoscape'),
      import('cytoscape-fcose'),
      import('cytoscape-cxtmenu'),
    ]);

    if (disposed || !ref.current) return;

    // FIX: Registration checks
    if (!cytoscape.prototype.fcose) cytoscape.use(fcose);
    if (!cytoscape.prototype.cxtmenu) cytoscape.use(cxtmenu);

    const cy = cytoscape({
      container: ref.current,
      elements: [],
      style: CY_STYLE,
      // Change 'grid' to 'cose' or 'fcose' here too
      layout: { name: 'cose' } as any, 
      minZoom: 0.05,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });
      // Force a resize calculation immediately
      cy.ready(() => {
        cy.resize();
        cy.fit();
      });

      cyRef.current = cy;
      // 3. (Optional) Initialize cxtmenu if you want to use it
      // cy.cxtmenu({ ... your config ... });

      cy.on('tap', 'node', (evt: any) => {
        const raw = evt.target.data('raw') as GraphNode | undefined
        if (raw) setSelected(raw)
      })
      
      cy.on('tap', (evt: any) => {
        if (evt.target === cy) setSelected(null)
      })

      cyRef.current = cy
    })()
    console.log("DEBUG - Nodes from Hook:", data.nodes.length);
    console.log("DEBUG - Final Elements to Cy:", elements.length);
    console.log("DEBUG - Cy Instance exists:", !!cyRef.current);
    return () => {
      disposed = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [])

  // Push updated elements into Cytoscape without destroying layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || elements.length === 0) return;

    // 1. Efficiently update data
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    // 2. Force the container to recognize its 600px height
    cy.resize();

    // 3. Run the "Neo4j-style" spread layout
    const layout = cy.layout({
      name: 'fcose', // Ensure this matches the registered name
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      nodeDimensionsIncludeLabels: true,
      // THE SPREAD SETTINGS:
      nodeSeparation: 150,      // More space between nodes
      idealEdgeLength: () => 150, // Longer edges
      nodeRepulsion: () => 6500,  // Stronger push away from each other
      randomize: true,            // Helps break that diagonal line
    } as any);

    layout.run();
  }, [elements]);

  const runSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/neo4j/sync', { method: 'POST' })
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  const toggleFilter = (fk: FilterKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(fk)) next.delete(fk)
      else next.add(fk)
      return next
    })
  }

  const fitGraph = () => cyRef.current?.fit(undefined, 40)
  const zoomIn  = () => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) * 1.3 })
  const zoomOut = () => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) / 1.3 })
  const center  = () => cyRef.current?.center()

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
            {!loading && data.nodes.length > 0 && (
              <span className="text-xs font-normal text-slate-500">
                {data.nodes.length} nodes · {data.edges.length} edges
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={zoomOut} title="Zoom out" className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600">−</button>
            <button onClick={zoomIn}  title="Zoom in"  className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600">+</button>
            <button onClick={fitGraph} title="Fit to screen" className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600">⊞</button>
            <button onClick={center}  title="Center"  className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600">◎</button>
            <button
              onClick={runSync}
              disabled={syncing}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              title="Push MySQL data into Neo4j"
            >
              {syncing ? 'Syncing…' : 'Sync Neo4j'}
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Graph canvas */}
        {/* Update this div to have a fixed height */}
        <div className="relative h-[600px] w-full rounded-lg bg-slate-900 overflow-hidden">
          {/* Update the ref div to force 100% height and width */}
          <div 
            ref={ref} 
            className="absolute inset-0" 
            style={{ height: '600px', width: '100%' }} 
          />

          {loading && data.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">
              Connecting to Neo4j…
            </div>
          )}
          {error && (
            <div className="absolute inset-x-2 top-2 rounded bg-red-500/15 border border-red-500/40 px-3 py-2 text-xs text-red-300 max-w-full">
              <span className="font-semibold">Neo4j error: </span>{error}
              <p className="mt-0.5 text-red-400/70">Check Neo4j is running and credentials are correct. Click &quot;Sync Neo4j&quot; to rebuild the graph from MySQL.</p>
            </div>
          )}
          {!loading && data.nodes.length === 0 && !error && (
            <div className="absolute inset-0 grid place-items-center text-center text-xs text-slate-500 px-6">
              <div>
                <p>Graph is empty.</p>
                <p className="mt-1">Click <span className="text-blue-400">&quot;Sync Neo4j&quot;</span> to project your MySQL data into the graph.</p>
              </div>
            </div>
          )}

          {/* Selected node detail panel */}
          {selected && (
            <div className="absolute right-2 top-2 w-64 rounded-lg bg-slate-950/95 p-3 ring-1 ring-slate-600 backdrop-blur overflow-y-auto max-h-[380px]">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {selected.label}
                  {selected.label === 'Message' && selected.props?.vector
                    ? ` · ${selected.props.vector}`
                    : ''}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto text-xs text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="mb-2 text-sm font-medium text-white break-words leading-tight">
                {selected.caption}
              </p>
              <dl className="space-y-1">
                {Object.entries(selected.props).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11px]">
                    <dt className="min-w-[90px] text-slate-500 flex-shrink-0">{k}</dt>
                    <dd className="text-slate-300 break-all">{renderVal(v)}</dd>
                  </div>
                ))}
              </dl>
              {selected.labels.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selected.labels.map((l) => (
                    <span key={l} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Node type filter chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALL_FILTERS.map(({ key, label, color }) => {
            const isHidden = hidden.has(key)
            const count = countForFilter(data.nodes, key)
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                title={isHidden ? `Show ${label} nodes` : `Hide ${label} nodes`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
                  isHidden
                    ? 'bg-slate-800/50 text-slate-600 opacity-60'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isHidden ? '#475569' : color }}
                />
                {label}
                <span className={cn('text-[10px]', isHidden ? 'text-slate-700' : 'text-slate-500')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- helpers ---------- */

function renderVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return v.toFixed(v % 1 === 0 ? 0 : 4)
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[], hidden: Set<FilterKey>): any[] {
  const out: any[] = []
  const visibleIds = new Set<string>()
  
  for (const n of nodes) {
    //const hide = isNodeHidden(n, hidden)
    visibleIds.add(n.id)
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

  for (const e of edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue
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
      'display': 'element',
      'visibility': 'visible',
      'opacity': 1,
      'background-color': 'data(color)',
      'label': 'data(caption)',
      'color': '#e2e8f0',
      'font-size': 9,
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'width': '20',
      'height': '20',
      'border-width': 1.5,
      'border-color': '#0f172a',
    },
  },
  {
    selector: 'node[label = "CorrelationGroup"]',
    style: {
      shape: 'round-rectangle',
      'width': 'data(size)',
      'height': 'data(size)',
    },
  },
  {
    selector: 'node[label = "Alert"]',
    style: { shape: 'diamond' },
  },
  {
    selector: 'node[label = "Campaign"]',
    style: { shape: 'hexagon' },
  },
  {
    selector: 'node[label = "Rule"]',
    style: { shape: 'round-pentagon' },
  },
  {
    selector: 'node[label = "Attacker"]',
    style: { shape: 'triangle' },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#fbbf24',
      'border-width': 3,
      'border-opacity': 1,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#334155',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'width': 1.5,
      'opacity': 0.65,
      'label': 'data(caption)',
      'font-size': 7,
      'color': '#64748b',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#fbbf24',
      'target-arrow-color': '#fbbf24',
      'opacity': 1,
    },
  },
]
