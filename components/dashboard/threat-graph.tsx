'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveGraph, type GraphNode, type GraphEdge } from '@/hooks/use-live-graph'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'


// Define types
type FilterKey = (typeof ALL_FILTERS)[number]['key']

interface NodeInfo {
  id: string
  label: string
  caption: string
  color: string
  size: number
  props: any
  labels: string[]
}

const ALL_FILTERS = [
  { key: 'CorrelationGroup', label: 'Group', color: '#eab308' },
] as const


function nodeMatchesFilter(n: GraphNode, fk: FilterKey): boolean {
  return n.label === fk
}

function countForFilter(nodes: GraphNode[], fk: FilterKey): number {
  return nodes.filter(n => n.label === 'CorrelationGroup').length
}

export function ThreatGraph() {
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const prevNodesRef = useRef<Set<string>>(new Set())
  const prevEdgesRef = useRef<Set<string>>(new Set())
  const layoutRunningRef = useRef(false)

  const [selected, setSelected] = useState<NodeInfo | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [hidden, setHidden] = useState<Set<FilterKey>>(new Set())
  const [layoutMode, setLayoutMode] = useState<'fcose' | 'cose'>('cose')

  const { data, loading, error, refresh } = useLiveGraph({
    limit: 1400,
    pollMs: 10000,
  })

  // Initialise Cytoscape once
  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!ref.current) return;
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
        import('cytoscape'),
        import('cytoscape-fcose'),
      ]);

      if (disposed || !ref.current) return;

      if (!cytoscape.prototype.fcose) cytoscape.use(fcose);

      const cy = cytoscape({
        container: ref.current,
        elements: [],
        style: CY_STYLE,
        layout: { name: 'cose' } as any,
        minZoom: 0.05,
        maxZoom: 4,
        wheelSensitivity: 0.3,
        selectionType: 'single',
        autounselectify: false,
        boxSelectionEnabled: false,
      });

      cy.ready(() => {
        cy.resize();
        cy.fit();
      });

      cyRef.current = cy;

      cy.on('tap', 'node', (evt: any) => {
        const raw = evt.target.data('raw') as GraphNode | undefined
        if (raw) {
          const nodeInfo: NodeInfo = {
            id: raw.id,
            label: raw.label,
            caption: raw.caption,
            color: raw.color,
            size: raw.size,
            props: raw.props,
            labels: raw.labels,
          }
          setSelected(nodeInfo)
        }
      })

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) setSelected(null)
      })
    })()

    return () => {
      disposed = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [])

  // OPTIMIZED: Incremental updates with better layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || layoutRunningRef.current) return;

    const correlationGroups = data.nodes.filter(n => n.label === 'CorrelationGroup');
    const currentNodeIds = new Set(correlationGroups.map(n => n.id))
    const currentEdgeIds = new Set(data.edges.map(e => e.id))

    const toRemove = [...prevNodesRef.current].filter(id => !currentNodeIds.has(id))
    const newNodes = correlationGroups.filter(n => !prevNodesRef.current.has(n.id))
    const toRemoveEdges = [...prevEdgesRef.current].filter(id => !currentEdgeIds.has(id))
    const newEdges = data.edges.filter(e => !prevEdgesRef.current.has(e.id))

    cy.batch(() => {
      if (toRemove.length > 0) {
        cy.elements(`[id = "${toRemove.join('"], [id = "')}" ]`).remove()
      }

      if (toRemoveEdges.length > 0) {
        cy.elements(`[id = "${toRemoveEdges.join('"], [id = "')}" ]`).remove()
      }

      if (newNodes.length > 0) {
        const nodeElements = newNodes.map(n => ({
          group: 'nodes',
          data: {
            id: n.id,
            caption: n.caption,
            color: nodeColors[n.label],
            size: n.size,
            label: n.label,
            raw: n,
          },
        }))
        cy.add(nodeElements)
      }

      if (newEdges.length > 0) {
        const edgeElements = newEdges.map(e => ({
          group: 'edges',
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            caption: e.caption,
            type: e.type,
          },
        }))
        cy.add(edgeElements)
      }
    })

    prevNodesRef.current = currentNodeIds
    prevEdgesRef.current = currentEdgeIds

    // ONLY relayout on first load or significant changes
    const shouldRelayout = toRemove.length > 100 || newNodes.length > 100 || correlationGroups.length < 50

    if (shouldRelayout && !layoutRunningRef.current) {
      layoutRunningRef.current = true
      cy.resize()

      const layout = cy.layout({
          name: layoutMode === 'fcose' ? 'fcose' : 'cose',
          fit: layoutMode === 'cose', 
          padding: 100,
          nodeDimensionsIncludeLabels: true,
          nodeSeparation: 200,
          idealEdgeLength: () => 200,
          nodeRepulsion: () => 15000,
          randomize: true,
          numIter: 250,
      })

      layout.one('layoutstop', () => {
        layoutRunningRef.current = false
      })

      layout.run()
    }
  }, [data, layoutMode])

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
            <select 
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value as 'fcose' | 'cose')}
              title="Switch layout algorithm"
              className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
            >
              <option value="cose">COSE (Spread)</option>
              <option value="fcose">FCOSE (Fast)</option>
            </select>
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
        <div className="relative h-[600px] w-full rounded-lg bg-slate-900 overflow-hidden">
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

          {selected && (
            <div className="absolute right-2 top-2 w-64 rounded-lg bg-slate-950/95 p-3 ring-1 ring-slate-600 backdrop-blur overflow-y-auto max-h-[380px]">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {selected.label}
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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALL_FILTERS.map(({ key, label, color }) => {
            const count = countForFilter(data.nodes, key)
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                title={`Toggle ${label} nodes`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all',
                  'bg-slate-800 text-slate-200 hover:bg-slate-700'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                {label}
                <span className="text-[10px] text-slate-500">
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

function renderVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return v.toFixed(v % 1 === 0 ? 0 : 4)
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

const CY_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(caption)',
      'color': '#e2e8f0',
      'font-size': 8,
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'width': '16',
      'height': '16',
      'border-width': 1,
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
      'border-width': 2,
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
      'width': 0.8,
      'opacity': 0.4,
      'label': 'data(caption)',
      'font-size': 6,
      'color': '#64748b',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.85,
      'text-background-padding': '1px',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#fbbf24',
      'target-arrow-color': '#fbbf24',
      'opacity': 1,
      'width': 2,
    },
  },
]


const nodeColors = {
  CorrelationGroup: '#eab308',
  Attacker: '#ef4444',
  Victim: '#22c55e',
  Message: '#60a5fa',
  // Add more mappings here...
}