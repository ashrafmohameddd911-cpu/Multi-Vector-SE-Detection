import { useEffect, useRef, useState } from 'react'
import type { Alert, Vector, Severity } from '@/lib/mock-data'

const POLL_INTERVAL_MS = 5000

interface UseLiveAlertsOptions {
  intervalMs?: number
}

export function useLiveAlerts(options: UseLiveAlertsOptions = {}) {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true;

    const fetchAlerts = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/alerts', {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = (await res.json()) as any[];
        
        if (!mountedRef.current) return;
        setAlerts(data.map(toAlert));
        setError(null);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (mountedRef.current) setError(err as Error);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    }; // <-- FIXED: Added this closing brace for fetchAlerts

    const schedule = () => {
      if (document.visibilityState === 'hidden' || !mountedRef.current) return;
      
      timerRef.current = setTimeout(async () => {
        try {
          await fetchAlerts();
        } catch (e) {
          // Ignore background loop errors
        } finally {
          if (mountedRef.current) schedule();
        }
      }, intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAlerts().catch(() => {});
        schedule();
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };

    fetchAlerts().catch(() => {}); 
    schedule();

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [intervalMs]);

  return { alerts, isLoading, error }; // <-- FIXED: Added the return for the hook
} // <-- FIXED: Added this closing brace for the useLiveAlerts function

/** Convert the /api/alerts JSON row into the client-side Alert shape. */
function toAlert(row: any): Alert {
  const vectors: Vector[] = Array.isArray(row.vectors)
    ? (row.vectors.filter(Boolean) as Vector[])
    : []
  return {
    id: row.id,
    groupId: row.groupId,
    severity: String(row.severity ?? 'LOW').toUpperCase() as Severity,
    campaignType: row.campaignType ?? 'Unknown',
    vectors: vectors.length > 0 ? vectors : ['email'],
    entity: row.entity ?? '',
    victim: row.victim ?? '',
    cgScore: Number(row.cgScore ?? 0),
    s1Score: Number(row.s1Score ?? 0),
    s2Score: Number(row.s2Score ?? 0),
    s3Score: Number(row.s3Score ?? 0),
    s4Score: Number(row.s4Score ?? 0),
    timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
    messages: Array.isArray(row.messages)
      ? row.messages.map((m: any) => ({
          id: m.id,
          vector: m.vector as Vector,
          sender: m.sender ?? '',
          recipient: m.recipient ?? '',
          content: m.content ?? '',
          snippet: m.snippet ?? '',
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          spf: m.spf ?? 'pass',
          dkim: m.dkim ?? 'pass',
          dmarc: m.dmarc ?? 'pass',
          domainAge: Number(m.domainAge ?? 0),
          vtScore: Number(m.vtScore ?? 0),
          urgencyScore: Number(m.urgencyScore ?? 0),
          rulesHit: Array.isArray(m.rulesHit) ? m.rulesHit : [],
        }))
      : [],
  }
}