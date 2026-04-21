'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LargeScoreDisplay } from '@/components/dashboard/score-display'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { VectorIcon } from '@/components/dashboard/vector-icon'
import {
  Mail,
  MessageSquare,
  Phone,
  ArrowRight,
  Clock,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/mock-data'

interface Rationale {
  code: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string
  detail: string
}

interface InvestigationData {
  group: {
    id: string
    entityKey: string
    severity: Severity
    campaignType: string
    cScore: number
    s1: number
    s2: number
    s3: number
    s4: number
    vectors: string[]
    createdAt: string | null
    updatedAt: string | null
    messageCount: number
  }
  messages: {
    id: string
    vector: 'email' | 'sms' | 'call'
    sender: string
    senderDomain: string | null
    recipient: string
    subject: string | null
    content: string
    receivedAt: string | null
    status: string
  }[]
  rules: { id: string; name: string; score: number; vectorTypes: string[]; createdAt: string | null }[]
  alert: {
    id: string
    status: string
    severity: Severity
    createdAt: string | null
    resolvedAt: string | null
    victims: any[]
  } | null
  rationale: Rationale[]
  weights: { s1: number; s2: number; s3: number; s4: number }
}

const vectorIcons = { email: Mail, sms: MessageSquare, call: Phone } as const

function InvestigationContent() {
  const searchParams = useSearchParams()
  const groupId = searchParams.get('group') || ''
  const [data, setData] = useState<InvestigationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/investigation/${encodeURIComponent(groupId)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [groupId])

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Group Investigation</h1>
            {groupId && (
              <Badge variant="outline" className="border-blue-500 text-blue-400 font-mono">
                {groupId}
              </Badge>
            )}
            {data?.alert && (
              <Badge
                variant="outline"
                className="border-red-500 text-red-400"
              >
                Alert {data.alert.id} · {data.alert.status}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400">
            Why this correlation group became an alert
          </p>
        </div>

        {!groupId && (
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="py-10 text-center text-sm text-slate-400">
              No group selected. Open a row from the Alert Queue and click
              &quot;Investigate&quot;.
            </CardContent>
          </Card>
        )}

        {groupId && loading && (
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="py-10 text-center text-sm text-slate-400">
              Loading investigation…
            </CardContent>
          </Card>
        )}

        {groupId && !loading && error && (
          <Card className="bg-[#1E293B] border-red-500/50">
            <CardContent className="py-6 text-sm text-red-300">
              Failed to load: {error}
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* Why this alert? */}
            <Card className="bg-[#1E293B] border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  Why this alert?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rationale.map((r) => (
                    <RationaleRow key={r.code} r={r} />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Score Breakdown */}
            <Card className="mt-6 bg-[#1E293B] border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-shrink-0">
                    <LargeScoreDisplay score={data.group.cScore * 100} />
                    <div className="mt-2 text-center">
                      <SeverityBadge severity={data.group.severity} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="text-left py-2">Layer</th>
                          <th className="text-right py-2">Raw</th>
                          <th className="text-right py-2">Weight</th>
                          <th className="text-right py-2">Weighted</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        <ScoreRow label="S1 Lexical / urgency" raw={data.group.s1} weight={data.weights.s1} />
                        <ScoreRow label="S2 Domain / auth" raw={data.group.s2} weight={data.weights.s2} />
                        <ScoreRow label="S3 Content / brand" raw={data.group.s3} weight={data.weights.s3} />
                        <ScoreRow label="S4 Behavioural" raw={data.group.s4} weight={data.weights.s4} />
                        <tr className="border-t-2 border-slate-600 font-bold text-white">
                          <td className="py-2">C(G) total</td>
                          <td className="text-right" />
                          <td className="text-right" />
                          <td className="text-right">{data.group.cScore.toFixed(3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex-1 max-w-md text-xs text-slate-400 space-y-1">
                    <div><span className="text-slate-500">Entity key:</span> <span className="font-mono text-slate-300">{data.group.entityKey}</span></div>
                    <div><span className="text-slate-500">Campaign type:</span> <span className="text-slate-300">{data.group.campaignType ?? '—'}</span></div>
                    <div><span className="text-slate-500">Vectors:</span> <span className="text-slate-300">{data.group.vectors.join(', ') || '—'}</span></div>
                    <div><span className="text-slate-500">Messages:</span> <span className="text-slate-300">{data.group.messageCount}</span></div>
                    <div><span className="text-slate-500">Created:</span> <span className="text-slate-300">{formatTime(data.group.createdAt)}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rules fired */}
            <Card className="mt-6 bg-[#1E293B] border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">
                  Rules fired ({data.rules.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.rules.length === 0 ? (
                  <p className="text-sm text-slate-500">No rules fired for this group.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.rules.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-md bg-slate-800/50 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium text-slate-200">{r.name}</div>
                          <div className="text-xs text-slate-500">
                            {r.vectorTypes.length > 0 ? r.vectorTypes.join(', ') : 'any'} · {formatTime(r.createdAt)}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-violet-500/20 text-violet-300 font-mono">
                          +{r.score.toFixed(2)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            {data.messages.length > 0 && (
              <Card className="mt-6 bg-[#1E293B] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white">
                    Message Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative flex items-center overflow-x-auto pb-4">
                    <div className="flex items-center gap-2">
                      {data.messages.map((msg, index) => {
                        const Icon = vectorIcons[msg.vector] ?? Mail
                        const next = data.messages[index + 1]
                        let timeDiff = ''
                        if (next && msg.receivedAt && next.receivedAt) {
                          const diffMs =
                            new Date(next.receivedAt).getTime() -
                            new Date(msg.receivedAt).getTime()
                          const diffMins = Math.floor(diffMs / 60000)
                          timeDiff =
                            diffMins < 60 ? `${diffMins}min` : `${Math.floor(diffMins / 60)}h`
                        }
                        return (
                          <div key={msg.id} className="flex items-center">
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  'flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2',
                                  msg.vector === 'email' && 'border-blue-500 bg-blue-500/20',
                                  msg.vector === 'sms' && 'border-green-500 bg-green-500/20',
                                  msg.vector === 'call' && 'border-orange-500 bg-orange-500/20'
                                )}
                              >
                                <Icon
                                  className={cn(
                                    'h-6 w-6',
                                    msg.vector === 'email' && 'text-blue-400',
                                    msg.vector === 'sms' && 'text-green-400',
                                    msg.vector === 'call' && 'text-orange-400'
                                  )}
                                />
                                <span className="mt-1 text-[10px] text-slate-400 uppercase">
                                  {msg.vector}
                                </span>
                              </div>
                              <div className="mt-2 max-w-[140px] text-center">
                                <p className="text-xs font-medium text-white truncate">
                                  {msg.sender.slice(0, 18)}
                                </p>
                                <p className="text-[10px] text-slate-500 line-clamp-2">
                                  {(msg.subject || msg.content || '').slice(0, 48)}
                                </p>
                              </div>
                            </div>
                            {next && (
                              <div className="mx-3 flex flex-col items-center">
                                <ArrowRight className="h-5 w-5 text-slate-600" />
                                <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  <Clock className="h-3 w-3" />
                                  {timeDiff}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Message Details */}
            <Card className="mt-6 bg-[#1E293B] border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">
                  Messages in this group ({data.messages.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[560px] overflow-y-auto">
                {data.messages.map((msg) => (
                  <div key={msg.id} className="rounded-lg bg-slate-800/50 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <VectorIcon vector={msg.vector} showLabel />
                        <span className="text-xs text-slate-500">
                          {formatTime(msg.receivedAt)}
                        </span>
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                          {msg.status}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">{msg.id}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">From:</span>
                        <p className="text-slate-300 truncate">{msg.sender}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">To:</span>
                        <p className="text-slate-300 truncate">{msg.recipient}</p>
                      </div>
                    </div>
                    {msg.subject && (
                      <div className="text-xs">
                        <span className="text-slate-500">Subject:</span>
                        <p className="text-slate-300">{msg.subject}</p>
                      </div>
                    )}
                    <div className="text-xs">
                      <span className="text-slate-500">Content:</span>
                      <p className="text-slate-300 whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </MainContent>
    </div>
  )
}

function ScoreRow({ label, raw, weight }: { label: string; raw: number; weight: number }) {
  const weighted = raw * weight
  return (
    <tr className="border-t border-slate-700">
      <td className="py-2">{label}</td>
      <td className="text-right font-mono">{raw.toFixed(3)}</td>
      <td className="text-right text-slate-500">× {weight.toFixed(2)}</td>
      <td className="text-right font-medium font-mono">{weighted.toFixed(3)}</td>
    </tr>
  )
}

const rationaleStyles: Record<Rationale['severity'], string> = {
  info: 'border-slate-600 bg-slate-800/40 text-slate-300',
  low: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  medium: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  critical: 'border-red-500/50 bg-red-500/15 text-red-200',
}

function RationaleRow({ r }: { r: Rationale }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', rationaleStyles[r.severity])}>
      <div className="flex items-start gap-2">
        {r.severity === 'critical' || r.severity === 'high' ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{r.title}</p>
          <p className="mt-0.5 text-xs opacity-80">{r.detail}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {r.severity}
        </span>
      </div>
    </div>
  )
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function InvestigationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-white">
          Loading…
        </div>
      }
    >
      <InvestigationContent />
    </Suspense>
  )
}
