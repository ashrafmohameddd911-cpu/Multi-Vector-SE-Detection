'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { VectorIcon } from '@/components/dashboard/vector-icon'
import { useLiveFeed, type FeedItem } from '@/hooks/use-live-feed'
import { cn } from '@/lib/utils'

/**
 * Live Alert Feed — shows every processed message with its scores,
 * correlation group, rules that fired, and (if raised) its alert.
 * Backed by /api/feed/live (pure MySQL read).
 */
export function LiveFeed() {
  const [filter, setFilter] = useState<'all' | 'email' | 'sms' | 'call'>('all')
  const { items, loading, error } = useLiveFeed({
    vector: filter === 'all' ? undefined : filter,
    limit: 40,
    pollMs: 4000,
  })

  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
            </span>
            Live Alert Feed
          </div>
          <div className="flex gap-1 text-xs">
            {(['all', 'email', 'sms', 'call'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  'rounded px-2 py-0.5 capitalize',
                  filter === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[340px] overflow-y-auto pr-1 space-y-2">
          {loading && items.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">Loading feed…</p>
          )}
          {error && (
            <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{error}</p>
          )}
          {!loading && items.length === 0 && !error && (
            <p className="py-6 text-center text-xs text-slate-500">
              No messages yet. Add some from the &quot;Add Messages&quot; tab.
            </p>
          )}
          {items.map((item) => (
            <FeedRow key={item.message.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false)
  const { message, group, alert } = item

  const borderColor =
    group?.severity === 'CRITICAL'
      ? 'border-l-red-500'
      : group?.severity === 'HIGH'
      ? 'border-l-orange-500'
      : group?.severity === 'MEDIUM'
      ? 'border-l-yellow-500'
      : group?.severity === 'LOW'
      ? 'border-l-blue-500'
      : 'border-l-slate-600'

  return (
    <div
      className={cn(
        'rounded-md border border-slate-700 border-l-4 bg-slate-900/40',
        borderColor
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-2.5 text-left hover:bg-slate-800/50"
      >
        <div className="flex items-start gap-2">
          <VectorIcon vector={message.vector} className="mt-0.5 h-4 w-4 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-white">
                {message.sender}
              </span>
              <span className="text-xs text-slate-500">→</span>
              <span className="truncate text-xs text-slate-400">{message.recipient}</span>
              {group && <SeverityBadge severity={group.severity} />}
              {alert && (
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                  Alert · {alert.status}
                </span>
              )}
              {group && (
                <span className="ml-auto text-xs font-semibold text-slate-300">
                  C={group.c_score.toFixed(2)}
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
              {message.subject ? `${message.subject} — ` : ''}
              {truncate(message.content, 120)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {formatTime(message.received_at)}
              {group?.campaign_type ? ` · ${group.campaign_type}` : ''}
              {group?.message_count ? ` · ${group.message_count} msgs in group` : ''}
            </p>
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 px-3 py-2 text-xs">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="S1 lexical" value={group?.s1} />
            <Stat label="S2 domain" value={group?.s2} />
            <Stat label="S3 content" value={group?.s3} />
            <Stat label="S4 behavioral" value={group?.s4} />
          </div>
          {group?.rules.length ? (
            <div className="mt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                Rules fired ({group.rules.length})
              </p>
              <ul className="space-y-0.5">
                {group.rules.map((r, i) => (
                  <li key={i} className="flex justify-between rounded bg-slate-800/40 px-2 py-1">
                    <span className="text-slate-300">{r.name}</span>
                    <span className="text-slate-400">+{r.score.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">No rules fired.</p>
          )}
          <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
            <div>msg id: <span className="text-slate-300">{message.id}</span></div>
            {group && <div>group id: <span className="text-slate-300">{group.id}</span></div>}
            {alert && <div>alert id: <span className="text-slate-300">{alert.id}</span></div>}
            {group && <div>entity key: <span className="text-slate-300">{group.entity_key}</span></div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded bg-slate-800/40 px-2 py-1">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-100">
        {value == null ? '—' : value.toFixed(2)}
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}
