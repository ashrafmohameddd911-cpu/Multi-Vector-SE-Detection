'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { VectorIcon } from '@/components/dashboard/vector-icon'
import { useLiveFeed, type FeedItem, type FeedMessage } from '@/hooks/use-live-feed'
import { cn } from '@/lib/utils'

export function LiveFeed() {
  const [filter, setFilter] = useState<'all' | 'email' | 'sms' | 'call'>('all')
  const { items, loading, error } = useLiveFeed({
    vector: filter === 'all' ? undefined : filter,
    limit: 30,
    pollMs: 5000,
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
            {!loading && items.length > 0 && (
              <span className="text-xs font-normal text-slate-500">
                {items.length} group{items.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-1 text-xs">
            {(['all', 'email', 'sms', 'call'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  'rounded px-2 py-0.5 capitalize',
                  filter === v
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[380px] overflow-y-auto pr-1 space-y-2">
          {loading && items.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">Loading feed…</p>
          )}
          {error && (
            <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{error}</p>
          )}
          {!loading && items.length === 0 && !error && (
            <p className="py-6 text-center text-xs text-slate-500">
              No correlation groups yet. Submit messages from the &quot;Add Messages&quot; tab.
            </p>
          )}
          {items.map((item) => (
            <GroupRow key={item.group.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function GroupRow({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false)
  const { group, messages } = item

  const severity = (group.severity ?? '').toUpperCase()
  const borderColor =
    severity === 'CRITICAL'
      ? 'border-l-red-500'
      : severity === 'HIGH'
      ? 'border-l-orange-500'
      : severity === 'MEDIUM'
      ? 'border-l-yellow-500'
      : severity === 'LOW'
      ? 'border-l-blue-500'
      : 'border-l-slate-600'

  const uniqueVectors = Array.from(new Set(messages.map((m) => m.vector)))

  return (
    <div
      className={cn(
        'rounded-md border border-slate-700 border-l-4 bg-slate-900/40',
        borderColor
      )}
    >
      {/* Row header — click to expand */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-2.5 text-left hover:bg-slate-800/50"
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex gap-0.5">
            {uniqueVectors.map((v) => (
              <VectorIcon key={v} vector={v as any} className="h-4 w-4 text-slate-400" />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-white font-mono">
                {group.entity_key}
              </span>
              <SeverityBadge severity={severity as any} />
              {group.alert && (
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                  Alert · {group.alert.status}
                </span>
              )}
              <span className="ml-auto text-xs font-semibold text-slate-300">
                C={group.c_score.toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {formatTime(group.created_at)}
              {group.campaign_type ? ` · ${group.campaign_type}` : ''}
              {` · ${group.message_count} msg${group.message_count !== 1 ? 's' : ''}`}
              {group.rules.length > 0 ? ` · ${group.rules.length} rule${group.rules.length !== 1 ? 's' : ''} fired` : ''}
            </p>
          </div>
          <span className="mt-0.5 text-slate-600 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div className="border-t border-slate-800 px-3 py-3 space-y-3 text-xs">

          {/* Why correlated */}
          <div className="rounded bg-slate-800/60 px-3 py-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Why correlated
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
              <span>
                <span className="text-slate-500">Entity: </span>
                <span className="font-mono text-slate-200">{group.entity_key}</span>
              </span>
              <span>
                <span className="text-slate-500">Vectors: </span>
                <span className="text-slate-200">{group.vector_types.join(', ') || '—'}</span>
              </span>
              <span>
                <span className="text-slate-500">Campaign: </span>
                <span className="text-slate-200">{group.campaign_type ?? '—'}</span>
              </span>
              <span>
                <span className="text-slate-500">Window start: </span>
                <span className="text-slate-200">{formatTime(group.created_at)}</span>
              </span>
            </div>
          </div>

          {/* Scores */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Detection scores
            </p>
            <div className="grid grid-cols-4 gap-2">
              <ScoreTile label="S2 Domain/Auth" value={group.s2} />
              <ScoreTile label="S3 Content" value={group.s3} />
              <ScoreTile label="S4 Behavioral" value={group.s4} />
              <ScoreTile label="C(G) Combined" value={group.c_score} highlight />
            </div>
          </div>

          {/* Rules fired */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Rules fired ({group.rules.length})
            </p>
            {group.rules.length === 0 ? (
              <p className="text-slate-600">No rules fired.</p>
            ) : (
              <ul className="space-y-0.5">
                {group.rules.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded bg-slate-800/40 px-2 py-1"
                  >
                    <span className="text-slate-300">{r.name}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        r.severity === 'critical'
                          ? 'bg-red-500/20 text-red-300'
                          : r.severity === 'high'
                          ? 'bg-orange-500/20 text-orange-300'
                          : r.severity === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : 'bg-blue-500/20 text-blue-300'
                      )}
                    >
                      {r.severity ?? 'low'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Messages in group */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Messages in this group ({messages.length})
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {messages.map((msg) => (
                <MessageRow key={msg.id} msg={msg} />
              ))}
            </div>
          </div>

          {/* Footer: IDs + investigate link */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <div className="space-y-0.5 text-[10px] text-slate-600">
              <div>group: <span className="text-slate-400">{group.id}</span></div>
              {group.alert && (
                <div>alert: <span className="text-slate-400">{group.alert.id}</span></div>
              )}
            </div>
            <Link
              href={`/investigation?group=${group.id}`}
              className="rounded bg-blue-600/20 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-600/40"
            >
              Full Investigation →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageRow({ msg }: { msg: FeedMessage }) {
  return (
    <div className="rounded bg-slate-800/50 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <VectorIcon vector={msg.vector} className="h-3 w-3 text-slate-500" />
        <span className="text-slate-400">{msg.sender}</span>
        <span>→</span>
        <span>{msg.recipient}</span>
        <span className="ml-auto">{formatTime(msg.received_at)}</span>
      </div>
      {msg.subject && (
        <p className="mt-0.5 text-[10px] text-slate-400 truncate">
          <span className="text-slate-600">Subject: </span>{msg.subject}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
        {msg.content}
      </p>
    </div>
  )
}

function ScoreTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded px-2 py-1.5',
        highlight ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/40'
      )}
    >
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div
        className={cn(
          'text-sm font-semibold',
          highlight ? 'text-blue-200' : 'text-slate-100'
        )}
      >
        {value.toFixed(2)}
      </div>
    </div>
  )
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
