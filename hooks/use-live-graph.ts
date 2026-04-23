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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelsKey = labels?.join(',') ?? '';

  const fetchOnce = useCallback(async () => {
    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }

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

      if (!res.ok) {
        if (mountedRef.current) {
          setError('Failed to fetch graph data');
        }
        return;
      }

      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      // Only log if it's not an abort error
      if (err.name !== 'AbortError') {
        console.error('Fetch error:', err);
        if (mountedRef.current) {
          setError(err.message || 'Failed to fetch graph');
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [labelsKey, limit]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const tick = async () => {
      if (!mountedRef.current) return;

      try {
        await fetchOnce();
      } catch (err: any) {
        // Silently ignore abort errors
        if (err.name !== 'AbortError') {
          console.error('Polling error:', err);
        }
      }

      // Schedule next tick only if still mounted
      if (mountedRef.current) {
        timerRef.current = setTimeout(tick, pollMs);
      }
    };

    // Start polling
    tick();

    return () => {
      mountedRef.current = false;
      
      // Clear timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // Abort fetch
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [enabled, pollMs, fetchOnce]);

  return { data, loading, error, refresh: fetchOnce };
}