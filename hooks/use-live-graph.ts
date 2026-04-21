'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GraphNode {
  id: string
  label: string
  labels: string[]
  caption: string
  color: string
  size: number
  props: Record<string, any>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  caption: string
  props: Record<string, any>
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats?: {
    nodes: number
    edges: number
    labels: Record<string, number>
  }
}

interface Options {
  labels?: string[]
  limit?: number
  pollMs?: number
  enabled?: boolean
}

const DEFAULT_POLL_MS = 5_000

/**
 * Polls /api/neo4j/graph and returns the latest `{ nodes, edges }`.
 * Pauses when the browser tab is hidden.
 */
export function useLiveGraph(opts: Options = {}) {
  const { labels, limit = 500, pollMs = DEFAULT_POLL_MS, enabled = true } = opts
  const [data, setData] = useState<GraphResponse>({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const labelsKey = labels?.join(',') ?? ''

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const qs = new URLSearchParams()
      if (labelsKey) qs.set('labels', labelsKey)
      if (limit) qs.set('limit', String(limit))
      const res = await fetch(`/api/neo4j/graph?${qs.toString()}`, {
        signal: ac.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`graph ${res.status}`)
      const json: GraphResponse = await res.json()
      setData(json)
      setError(null)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(err?.message ?? 'failed')
    } finally {
      setLoading(false)
    }
  }, [labelsKey, limit])

  useEffect(() => {
    if (!enabled) return

    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (!active) return
      if (document.hidden) {
        timer = setTimeout(tick, pollMs)
        return
      }
      await fetchOnce()
      if (!active) return
      timer = setTimeout(tick, pollMs)
    }

    tick()

    const onVisible = () => {
      if (!document.hidden) fetchOnce()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, pollMs, fetchOnce])

  return { data, loading, error, refresh: fetchOnce }
}
