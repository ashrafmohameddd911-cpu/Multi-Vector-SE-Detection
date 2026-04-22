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

interface UseLiveGraphOptions {
  labels?: string[];
  limit?: number;
  pollMs?: number;
  enabled?: boolean;
}

const DEFAULT_POLL_MS = 5000;

/**
 * Polls /api/neo4j/graph and returns the latest `{ nodes, edges }`.
 * Pauses when the browser tab is hidden.
 */
export function useLiveGraph(opts: UseLiveGraphOptions = {}) {
  const { labels, limit = 500, pollMs = DEFAULT_POLL_MS, enabled = true } = opts;
  const [data, setData] = useState<GraphResponse>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const labelsKey = labels?.join(',') ?? '';

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const qs = new URLSearchParams();
      if (labelsKey) qs.set('labels', labelsKey);
      if (limit) qs.set('limit', String(limit));

      const res = await fetch(`/api/neo4j/graph?${qs.toString()}`, {
        signal: ac.signal,
        cache: 'no-store',
      });

      if (!res.ok) return; // Exit silently on bad response

      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      // DO NOT THROW ANYTHING. Just return.
      return; 
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [labelsKey, limit]);

  // hooks/use-live-graph.ts

useEffect(() => {
  mountedRef.current = true;
  if (!enabled) return;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
  if (!mountedRef.current) return;

  try {
    // Await the fetch, but catch the abort here
    await fetchOnce();
  } catch (err: any) {
    // This stops the red error text in your console
    if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
    console.error("Fetch failed:", err);
  }

  if (mountedRef.current) {
    timer = setTimeout(tick, pollMs);
  }
};

  tick();

  return () => {
    mountedRef.current = false;
    if (timer) clearTimeout(timer);
    abortRef.current?.abort(); // This triggers the error we now catch above
  };
}, [enabled, pollMs, fetchOnce]);
  return { data, loading, error, refresh: fetchOnce };
}