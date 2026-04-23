'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface FeedRule {
  name: string
  severity: string
  matched_at: string | null
}

export interface FeedMessage {
  id: string
  vector: 'email' | 'sms' | 'call'
  sender: string
  sender_domain: string | null
  recipient: string
  subject: string | null
  content: string
  received_at: string | null
  status: string
}

export interface FeedItem {
  group: {
    id: string
    entity_key: string
    s2: number
    s3: number
    s4: number
    c_score: number
    severity: string
    campaign_type: string | null
    vector_types: string[]
    message_count: number
    created_at: string | null
    rules: FeedRule[]
    alert: {
      id: string
      status: string
      severity: string
      c_score: number
      created_at: string | null
      victims: any[]
    } | null
  }
  messages: FeedMessage[]
}

interface Options {
  vector?: 'email' | 'sms' | 'call'
  limit?: number
  pollMs?: number
  enabled?: boolean
}

export function useLiveFeed(opts: Options = {}) {
  const { vector, limit = 30, pollMs = 5000, enabled = true } = opts
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const fetchOnce = useCallback(async () => {
    // Abort any existing request before starting a new one
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const qs = new URLSearchParams()
      if (vector) qs.set('vector', vector)
      qs.set('limit', String(limit))
      const res = await fetch(`/api/feed/live?${qs.toString()}`, {
        signal: ac.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Feed error: ${res.status}`)
      const json: { items: FeedItem[] } = await res.json()
      // Only update if the component is still mounted
      if (mountedRef.current) {
        setItems(json.items ?? [])
        setError(null)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      if (mountedRef.current) {
        console.error('Live Feed Fetch Error:', err)
        setError(err?.message ?? 'Failed to fetch feed')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [vector, limit])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    // Inside your useEffect -> tick() function
    const tick = async () => {
      if (!mountedRef.current) return
      if (document.hidden) {
        timer = setTimeout(tick, pollMs)
        return
      }
      try {
        await fetchOnce()
      } catch (err: any) {
        console.error('Live Feed Fetch Error:', err)
        if (mountedRef.current) {
          setError(err?.message ?? 'Failed to fetch feed')
        }
      }
      if (mountedRef.current) {
        timer = setTimeout(tick, pollMs)
      }
    }
    // Initial trigger
    tick()
    const onVisibilityChange = () => {
      if (!document.hidden && mountedRef.current) {
        // Fetch immediately when user returns to tab
        fetchOnce()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mountedRef.current = false
      if (timer) clearTimeout(timer)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, pollMs, fetchOnce])

  return { items, loading, error, refresh: fetchOnce }
}