'use client'

import { useState, useMemo } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { VectorChips } from '@/components/dashboard/vector-icon'
import { ScoreDisplay } from '@/components/dashboard/score-display'
import { type Alert, type Severity, type Vector } from '@/lib/mock-data'
import { useLiveAlerts } from '@/hooks/use-live-alerts'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronUp, Search, ExternalLink, Filter, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function AlertQueuePage() {
  const { alerts: liveAlerts, isLoading } = useLiveAlerts()
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [vectorFilter, setVectorFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<keyof Alert>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filteredAlerts = useMemo(() => {
    let result = [...liveAlerts]

    // Apply filters
    if (severityFilter !== 'all') {
      result = result.filter((a) => a.severity === severityFilter)
    }
    if (vectorFilter !== 'all') {
      result = result.filter((a) => a.vectors.includes(vectorFilter as Vector))
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (a) =>
          a.entity.toLowerCase().includes(term) ||
          a.victim.toLowerCase().includes(term) ||
          a.campaignType.toLowerCase().includes(term) ||
          a.groupId.toLowerCase().includes(term)
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0
      if (sortField === 'timestamp') {
        comparison = a.timestamp.getTime() - b.timestamp.getTime()
      } else if (sortField === 'cgScore') {
        comparison = a.cgScore - b.cgScore
      } else if (sortField === 'severity') {
        const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, DISMISSED: 0 }
        comparison = order[a.severity] - order[b.severity]
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [severityFilter, vectorFilter, searchTerm, sortField, sortDirection])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSort = (field: keyof Alert) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Alert Queue</h1>
          <p className="text-sm text-slate-400">
            Review and investigate pending security alerts
          </p>
        </div>

        <Card className="bg-[#1E293B] border-slate-700">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search alerts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64 pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-36 bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={vectorFilter} onValueChange={setVectorFilter}>
                  <SelectTrigger className="w-32 bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Vector" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="all">All Vectors</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="w-10 text-slate-400" />
                    <TableHead
                      className="text-slate-400 cursor-pointer hover:text-white"
                      onClick={() => handleSort('severity')}
                    >
                      Severity
                    </TableHead>
                    <TableHead className="text-slate-400">Campaign</TableHead>
                    <TableHead className="text-slate-400">Vectors</TableHead>
                    <TableHead className="text-slate-400">Entity</TableHead>
                    <TableHead className="text-slate-400">Victim</TableHead>
                    <TableHead
                      className="text-slate-400 cursor-pointer hover:text-white"
                      onClick={() => handleSort('cgScore')}
                    >
                      C(G)
                    </TableHead>
                    <TableHead className="text-slate-400">S1</TableHead>
                    <TableHead className="text-slate-400">S2</TableHead>
                    <TableHead className="text-slate-400">S3</TableHead>
                    <TableHead className="text-slate-400">S4</TableHead>
                    <TableHead className="text-slate-400">Rules</TableHead>
                    <TableHead
                      className="text-slate-400 cursor-pointer hover:text-white"
                      onClick={() => handleSort('timestamp')}
                    >
                      Time
                    </TableHead>
                    <TableHead className="text-slate-400">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlerts.map((alert) => (
                    <Collapsible
                      key={alert.id}
                      open={expandedRows.has(alert.id)}
                      onOpenChange={() => toggleRow(alert.id)}
                      asChild
                    >
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="border-slate-700 cursor-pointer hover:bg-slate-800/50">
                            <TableCell>
                              {expandedRows.has(alert.id) ? (
                                <ChevronUp className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              )}
                            </TableCell>
                            <TableCell>
                              <SeverityBadge severity={alert.severity} />
                            </TableCell>
                            <TableCell className="text-white font-medium">
                              {alert.campaignType}
                            </TableCell>
                            <TableCell>
                              <VectorChips vectors={alert.vectors} />
                            </TableCell>
                            <TableCell className="text-slate-300 max-w-[150px] truncate">
                              {alert.entity}
                            </TableCell>
                            <TableCell className="text-slate-300 max-w-[150px] truncate font-mono text-xs">
                              {alert.victim}
                            </TableCell>
                            <TableCell>
                              <ScoreDisplay score={alert.cgScore} size="sm" />
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm">
                              {alert.s1Score.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm">
                              {alert.s2Score.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm">
                              {alert.s3Score.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-slate-400 text-sm">
                              {alert.s4Score.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-slate-400 text-xs">
                              {(() => {
                                const rules = alert.messages[0]?.rulesHit ?? []
                                if (rules.length === 0) return <span className="text-slate-600">—</span>
                                return (
                                  <span
                                    className="inline-flex items-center rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300"
                                    title={rules.join(', ')}
                                  >
                                    {rules.length} rule{rules.length === 1 ? '' : 's'}
                                  </span>
                                )
                              })()}
                            </TableCell>
                            <TableCell className="text-slate-400 text-xs whitespace-nowrap">
                              {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              <Link href={`/investigation?group=${alert.groupId}`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-blue-500 text-blue-400 hover:bg-blue-500/20"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Investigate
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow className="border-slate-700 bg-slate-800/30">
                            <TableCell colSpan={14} className="p-4">
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-slate-300">
                                  Message Previews
                                </h4>
                                <div className="grid gap-2">
                                  {alert.messages.map((msg) => (
                                    <div
                                      key={msg.id}
                                      className="rounded-lg bg-slate-900/50 p-3"
                                    >
                                      <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <span className="capitalize">{msg.vector}</span>
                                        <span>•</span>
                                        <span>{msg.sender}</span>
                                        <span>→</span>
                                        <span>{msg.recipient}</span>
                                      </div>
                                      <p className="mt-1 text-sm text-slate-300 line-clamp-2">
                                        {msg.content}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t border-slate-700 px-4 py-3">
              <p className="text-sm text-slate-400">
                Showing {filteredAlerts.length} of {liveAlerts.length} alerts
              </p>
            </div>
          </CardContent>
        </Card>
      </MainContent>
    </div>
  )
}
