'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLiveGraph, type GraphNode, type GraphEdge } from '@/hooks/use-live-graph'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  X,
} from 'lucide-react'

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

const LABEL_COLORS: Record<NodeLabel, string> = {
  Attacker: '#ef4444',
  Victim: '#22c55e',
  Message: '#60a5fa',
  CorrelationGroup: '#eab308',
  Alert: '#dc2626',
  Rule: '#a78bfa',
  Campaign: '#38bdf8',
}

interface NodeDetail {
  node: {
    id: string
    labels: string[]
    properties: Record<string, any>
    elementId: string
  }
  neighbours: {
    node: { id: string; labels: string[]; properties: Record<string, any> }
    relationship: { id: string; type: string; direction: 'incoming' | 'outgoing'; properties: Record<string, any> }
  }[]
}

export default function CampaignGraphPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const cxtmenuRef = useRef<any>(null)

  const [hiddenLabels, setHiddenLabels] = useState<Set<NodeLabel>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [onlyLabel, setOnlyLabel] = useState<NodeLabel | null>(null)

  const { data, loading, error, refresh } = useLiveGraph({ limit: 1500, pollMs: 6000 })

  // Apply "only show X" filter or per-label hide
  const effectiveHidden = useMemo(() => {
    if (onlyLabel) {
      return new Set(ALL_LABELS.filter((l) => l !== onlyLabel)) as Set<NodeLabel>
    }
    return hiddenLabels
  }, [onlyLabel, hiddenLabels])

  const elements = useMemo(() => buildElements(data.nodes, data.edges), [data])

  // Initialise Cytoscape with cxtmenu once
  useEffect(() => {
    let disposed = false
    ;(async () => {
      if (!containerRef.current) return
      const [
        { default: cytoscape },
        { default: fcose },
        { default: cxtmenu },
      ] = await Promise.all([
        import('cytoscape'),
        import('cytoscape-fcose'),
        import('cytoscape-cxtmenu'),
      ])
      if (disposed) return

      try { cytoscape.use(fcose as any) } catch {}
      try { cytoscape.use(cxtmenu as any) } catch {}

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: CY_STYLE,
        layout: { name: 'fcose', animate: false, quality: 'default' } as any,
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.2,
      })
      cyRef.current = cy

      cy.on('tap', 'node', (evt) => {
        const raw = evt.target.data('raw') as GraphNode | undefined
        if (!raw) return
        setSelectedId(raw.id)
        fetchDetail(raw.id)
      })
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelectedId(null)
          setDetail(null)
        }
      })

      // Right-click context menu
      cxtmenuRef.current = (cy as any).cxtmenu({
        selector: 'node',
        menuRadius: 90,
        fillColor: 'rgba(15,23,42,0.92)',
        activeFillColor: 'rgba(59,130,246,0.6)',
        outsideMenuCancel: 10,
        commands: [
          {
            content: 'Details',
            select: (ele: any) => {
              const id = ele.data('raw')?.id
              if (id) {
                setSelectedId(id)
                fetchDetail(id)
              }
            },
          },
          {
            content: 'Expand neighbours',
            select: (ele: any) => {
              const id = ele.data('raw')?.id
              if (id) expandNode(id)
            },
          },
          {
            content: 'Show only this type',
            select: (ele: any) => {
              const label = ele.data('label') as NodeLabel
              if (label) setOnlyLabel(label)
            },
          },
          {
            content: 'Hide this node',
            select: (ele: any) => ele.style('display', 'none'),
          },
          {
            content: 'Isolate',
            select: (ele: any) => {
              const id = ele.data('id')
              cy.nodes().forEach((n: any) => {
                if (n.id() === id) {
                  n.style('display', 'element')
                } else if (n.edgesWith(cy.getElementById(id)).length === 0) {
                  n.style('display', 'none')
                }
              })
            },
          },
        ],
      })
    })()
    return () => {
      disposed = true
      try {
        cxtmenuRef.current?.destroy?.()
      } catch {}
      cyRef.current?.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push updates into existing cy instance
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const nextIds = new Set(elements.map((e: any) => e.data.id))
    cy.elements().forEach((el: any) => {
      if (!nextIds.has(el.id())) el.remove()
    })

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

    // Apply label visibility from effectiveHidden
    cy.nodes().forEach((n: any) => {
      const label = n.data('label') as NodeLabel
      n.style('display', effectiveHidden.has(label) ? 'none' : 'element')
    })
    cy.edges().forEach((e: any) => {
      const s = cy.getElementById(e.data('source'))
      const t = cy.getElementById(e.data('target'))
      const sHidden = s.length > 0 && s.style('display') === 'none'
      const tHidden = t.length > 0 && t.style('display') === 'none'
      e.style('display', sHidden || tHidden ? 'none' : 'element')
    })
  }, [elements, effectiveHidden])

  const fetchDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/neo4j/node/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: NodeDetail = await res.json()
      setDetail(json)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const expandNode = async (id: string) => {
    try {
      const res = await fetch(`/api/neo4j/node/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json: NodeDetail = await res.json()
      const cy = cyRef.current
      if (!cy) return
      for (const nb of json.neighbours) {
        if (cy.getElementById(nb.node.id).length === 0) {
          const primary = (nb.node.labels[0] ?? 'Message') as NodeLabel
          cy.add({
            group: 'nodes',
            data: {
              id: nb.node.id,
              caption: nb.node.properties?.value ?? nb.node.properties?.id ?? nb.node.id,
              color: LABEL_COLORS[primary] ?? '#94a3b8',
              size: 26,
              label: primary,
              raw: {
                id: nb.node.id,
                label: primary,
                labels: nb.node.labels,
                caption: String(nb.node.properties?.value ?? nb.node.properties?.id ?? ''),
                color: LABEL_COLORS[primary] ?? '#94a3b8',
                size: 26,
                props: nb.node.properties,
              },
            },
          })
        }
        if (cy.getElementById(nb.relationship.id).length === 0) {
          cy.add({
            group: 'edges',
            data: {
              id: nb.relationship.id,
              source: nb.relationship.direction === 'outgoing' ? id : nb.node.id,
              target: nb.relationship.direction === 'outgoing' ? nb.node.id : id,
              type: nb.relationship.type,
              caption: nb.relationship.type.toLowerCase().replace(/_/g, ' '),
            },
          })
        }
      }
      cy.layout({ name: 'fcose', animate: false, quality: 'default' } as any).run()
    } catch {}
  }

  const runSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/neo4j/sync', { method: 'POST' })
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  const toggleLabel = (l: NodeLabel) => {
    setOnlyLabel(null)
    setHiddenLabels((prev) => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent className="h-screen flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Campaign Graph</h1>
            <p className="text-sm text-slate-400">
              Live Neo4j projection · right-click a node for filters, expand, and details
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={runSync}
              disabled={syncing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync Neo4j'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="border-slate-600 text-slate-400 hover:text-white"
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="border-slate-600 text-slate-400 hover:text-white"
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="border-slate-600 text-slate-400 hover:text-white"
              onClick={() => cyRef.current?.fit(undefined, 30)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Label filter chips */}
        <div className="mb-3 flex flex-wrap gap-2">
          {ALL_LABELS.map((l) => {
            const count = data.stats?.labels?.[l] ?? 0
            const hidden = effectiveHidden.has(l)
            return (
              <button
                key={l}
                onClick={() => toggleLabel(l)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition',
                  hidden
                    ? 'bg-slate-800 text-slate-600 line-through'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LABEL_COLORS[l] }} />
                {l}
                <span className="text-slate-500">{count}</span>
              </button>
            )
          })}
          {onlyLabel && (
            <button
              onClick={() => setOnlyLabel(null)}
              className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/30"
            >
              <X className="h-3 w-3" />
              Clear &quot;only {onlyLabel}&quot;
            </button>
          )}
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Graph */}
          <Card className="flex-1 bg-[#1E293B] border-slate-700 overflow-hidden">
            <CardContent className="p-0 h-full relative">
              <div ref={containerRef} className="absolute inset-0 bg-slate-900/30" />
              {loading && data.nodes.length === 0 && (
                <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">
                  Loading graph…
                </div>
              )}
              {error && (
                <div className="absolute top-2 left-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
                  {error}
                </div>
              )}
              {!loading && data.nodes.length === 0 && !error && (
                <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
                  Empty graph — click &quot;Sync Neo4j&quot; to project MySQL state.
                </div>
              )}

              <div className="absolute bottom-3 left-3 rounded-md bg-slate-900/85 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
                Right-click any node for: Details · Expand neighbours · Show only this type · Hide · Isolate
              </div>
            </CardContent>
          </Card>

          {/* Side panel */}
          <Card className="w-96 bg-[#1E293B] border-slate-700 flex-shrink-0 overflow-hidden flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-white flex items-center justify-between">
                Node Details
                {selectedId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400 hover:text-white"
                    onClick={() => {
                      setSelectedId(null)
                      setDetail(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {!selectedId && (
                <p className="py-12 text-center text-sm text-slate-500">
                  Click a node to view its full properties + neighbours.
                </p>
              )}
              {selectedId && detailLoading && !detail && (
                <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
              )}
              {detail && (
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {detail.node.labels.map((l) => (
                        <span
                          key={l}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
                          style={{ backgroundColor: LABEL_COLORS[l as NodeLabel] ?? '#64748b' }}
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm font-medium text-white break-words">
                      {detail.node.properties?.value ??
                        detail.node.properties?.id ??
                        detail.node.properties?.name ??
                        detail.node.properties?.type ??
                        detail.node.id}
                    </p>
                    <p className="font-mono text-[10px] text-slate-500 break-all">
                      {detail.node.id}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Properties</p>
                    <dl className="space-y-0.5 text-xs">
                      {Object.entries(detail.node.properties).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="min-w-[90px] text-slate-500">{k}</dt>
                          <dd className="text-slate-300 break-all">{renderVal(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                      Neighbours ({detail.neighbours.length})
                    </p>
                    <ul className="space-y-1">
                      {detail.neighbours.map((nb, i) => {
                        const primary = (nb.node.labels[0] ?? 'Message') as NodeLabel
                        return (
                          <li
                            key={i}
                            className="cursor-pointer rounded-md bg-slate-800/50 px-2 py-1.5 hover:bg-slate-800"
                            onClick={() => {
                              setSelectedId(nb.node.id)
                              fetchDetail(nb.node.id)
                              const cy = cyRef.current
                              cy?.getElementById(nb.node.id)?.select()
                            }}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-200 truncate">
                                {nb.node.properties?.value ?? nb.node.properties?.id ?? nb.node.id}
                              </span>
                              <span
                                className="rounded px-1 text-[9px] font-semibold uppercase text-white"
                                style={{ backgroundColor: LABEL_COLORS[primary] ?? '#64748b' }}
                              >
                                {primary}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {nb.relationship.direction === 'outgoing' ? '→' : '←'}{' '}
                              {nb.relationship.type.toLowerCase().replace(/_/g, ' ')}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MainContent>
    </div>
  )
}

function renderVal(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
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
      label: 'data(caption)',
      color: '#e2e8f0',
      'font-size': 10,
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      width: 'data(size)',
      height: 'data(size)',
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
      width: 1.2,
      opacity: 0.7,
      label: 'data(caption)',
      'font-size': 8,
      color: '#64748b',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.85,
      'text-background-padding': 2,
    },
  },
]
