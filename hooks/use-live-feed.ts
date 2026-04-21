'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface FeedRule {
  name: string
  score: number
  vector_types: string[]
  created_at: string | null
}

export interface FeedItem {
  message: {
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
  group: {
    id: string
    entity_key: string
    s1: number
    s2: number
    s3: number
    s4: number
    c_score: number
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DISMISSED'
    campaign_type: string | null
    vector_types: string[]
    message_count: number
    rules: FeedRule[]
  } | null
  alert: {
    id: string
    status: string
    created_at: string | null
    victims: any[]
  } | null
}

interface Options {
  vector?: 'email' | 'sms' | 'call'
  limit?: number
  pollMs?: number
  enabled?: boolean
}

export function useLiveFeed(opts: Options = {}) {
  const { vector, limit = 50, pollMs = 5_000, enabled = true } = opts
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const qs = new URLSearchParams()
      if (vector) qs.set('vector', vector)
      if (limit) qs.set('limit', String(limit))
      const res = await fetch(`/api/feed/live?${qs.toString()}`, {
        signal: ac.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`feed ${res.status}`)
      const json: { items: FeedItem[] } = await res.json()
      setItems(json.items ?? [])
      setError(null)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(err?.message ?? 'failed')
    } finally {
      setLoading(false)
    }
  }, [vector, limit])

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

    const onVis = () => {
      if (!document.hidden) fetchOnce()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, pollMs, fetchOnce])

  return { items, loading, error, refresh: fetchOnce }
}
