'use client'

import { useState, useMemo } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { VectorIcon } from '@/components/dashboard/vector-icon'
import { ScoreDisplay, LargeScoreDisplay } from '@/components/dashboard/score-display'
import { alerts, reputationSignals, type Verdict } from '@/lib/mock-data'
import { Search, Check, X, FileText, Shield, Users, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

const verdictStyles: Record<Verdict, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  ATTACK: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    icon: AlertTriangle
  },
  LEGIT: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    icon: CheckCircle
  },
  UNCLASSIFIED: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-400',
    icon: HelpCircle
  }
}

export default function MessageInspectorPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchedMessage, setSearchedMessage] = useState<typeof alerts[0]['messages'][0] | null>(null)
  const [relatedAlert, setRelatedAlert] = useState<typeof alerts[0] | null>(null)

  const handleSearch = () => {
    if (!searchTerm.trim()) return

    // Search through all messages
    for (const alert of alerts) {
      const foundMsg = alert.messages.find(
        (msg) =>
          msg.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          msg.sender.toLowerCase().includes(searchTerm.toLowerCase())
      )
      if (foundMsg) {
        setSearchedMessage(foundMsg)
        setRelatedAlert(alert)
        return
      }
    }

    // If no match, show first message as demo
    setSearchedMessage(alerts[0].messages[0])
    setRelatedAlert(alerts[0])
  }

  // Compute verdict based on score
  const verdict: Verdict = useMemo(() => {
    if (!relatedAlert) return 'UNCLASSIFIED'
    if (relatedAlert.cgScore >= 50) return 'ATTACK'
    if (relatedAlert.cgScore < 30) return 'LEGIT'
    return 'UNCLASSIFIED'
  }, [relatedAlert])

  const VerdictIcon = verdictStyles[verdict].icon

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Message Inspector</h1>
          <p className="text-sm text-slate-400">
            Deep dive into individual message analysis
          </p>
        </div>

        {/* Search Bar */}
        <Card className="bg-[#1E293B] border-slate-700 mb-6">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Enter Message ID (e.g., MSG-0-0) or sender address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-base"
                />
              </div>
              <Button
                onClick={handleSearch}
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700"
              >
                <Search className="h-5 w-5 mr-2" />
                Inspect
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Try searching for: MSG-0-0, MSG-1-0, or any sender address
            </p>
          </CardContent>
        </Card>

        {searchedMessage && relatedAlert ? (
          <div className="space-y-6">
            {/* Verdict Banner */}
            <Card className={`border-slate-700 ${verdictStyles[verdict].bg}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-full ${verdictStyles[verdict].bg}`}
                    >
                      <VerdictIcon className={`h-8 w-8 ${verdictStyles[verdict].text}`} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Final Verdict</p>
                      <p className={`text-3xl font-bold ${verdictStyles[verdict].text}`}>
                        {verdict}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <LargeScoreDisplay score={relatedAlert.cgScore} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Raw Content */}
              <Card className="bg-[#1E293B] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Raw Content
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <VectorIcon vector={searchedMessage.vector} showLabel />
                      <span className="text-xs text-slate-500">
                        {format(searchedMessage.timestamp, 'PPpp')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">From:</span>
                        <p className="text-white font-mono text-xs break-all">
                          {searchedMessage.sender}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">To:</span>
                        <p className="text-white font-mono text-xs break-all">
                          {searchedMessage.recipient}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/50 p-4">
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {searchedMessage.content}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={
                          searchedMessage.spf === 'pass'
                            ? 'border-green-500 text-green-400'
                            : 'border-red-500 text-red-400'
                        }
                      >
                        SPF: {searchedMessage.spf}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          searchedMessage.dkim === 'pass'
                            ? 'border-green-500 text-green-400'
                            : 'border-red-500 text-red-400'
                        }
                      >
                        DKIM: {searchedMessage.dkim}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          searchedMessage.dmarc === 'pass'
                            ? 'border-green-500 text-green-400'
                            : 'border-red-500 text-red-400'
                        }
                      >
                        DMARC: {searchedMessage.dmarc}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Extracted Features */}
              <Card className="bg-[#1E293B] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Extracted Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">Urgency Score</span>
                        <span className="text-sm font-medium text-white">
                          {searchedMessage.urgencyScore}%
                        </span>
                      </div>
                      <Progress
                        value={searchedMessage.urgencyScore}
                        className="h-2 bg-slate-700"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">
                          Impersonation Score
                        </span>
                        <span className="text-sm font-medium text-white">
                          {Math.floor(Math.random() * 40 + 60)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.floor(Math.random() * 40 + 60)}
                        className="h-2 bg-slate-700"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">Authority Score</span>
                        <span className="text-sm font-medium text-white">
                          {Math.floor(Math.random() * 30 + 50)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.floor(Math.random() * 30 + 50)}
                        className="h-2 bg-slate-700"
                      />
                    </div>

                    <div className="pt-3 border-t border-slate-700">
                      <p className="text-sm text-slate-400 mb-3">Additional Metrics</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded bg-slate-800/50 p-3">
                          <span className="text-xs text-slate-500">Domain Age</span>
                          <p className="text-lg font-bold text-white">
                            {searchedMessage.domainAge}
                            <span className="text-xs text-slate-500 ml-1">days</span>
                          </p>
                        </div>
                        <div className="rounded bg-slate-800/50 p-3">
                          <span className="text-xs text-slate-500">VT Score</span>
                          <p className="text-lg font-bold text-orange-400">
                            {searchedMessage.vtScore}
                            <span className="text-xs text-slate-500 ml-1">/70</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reputation Signals */}
              <Card className="bg-[#1E293B] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Reputation Signals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {reputationSignals.map((signal) => (
                      <div
                        key={signal.name}
                        className="flex items-center gap-3 rounded-lg bg-slate-800/50 p-3"
                      >
                        <div
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                            signal.status ? 'bg-green-500/20' : 'bg-red-500/20'
                          }`}
                        >
                          {signal.status ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              signal.status ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {signal.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Group Membership */}
              <Card className="bg-[#1E293B] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Group Membership
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Link
                      href={`/investigation?group=${relatedAlert.groupId}`}
                      className="flex items-center justify-between rounded-lg bg-slate-800/50 p-4 hover:bg-slate-800 transition-colors"
                    >
                      <div>
                        <p className="text-sm text-slate-400">Primary Group</p>
                        <p className="text-lg font-bold text-white font-mono">
                          {relatedAlert.groupId}
                        </p>
                      </div>
                      <div className="text-right">
                        <SeverityBadge severity={relatedAlert.severity} />
                        <p className="mt-1 text-xs text-slate-500">
                          {relatedAlert.campaignType}
                        </p>
                      </div>
                    </Link>

                    <div className="pt-3 border-t border-slate-700">
                      <p className="text-sm text-slate-400 mb-2">Related Scores</p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="rounded bg-slate-800/50 p-2 text-center">
                          <p className="text-xs text-slate-500">S1</p>
                          <ScoreDisplay score={relatedAlert.s1Score} size="sm" />
                        </div>
                        <div className="rounded bg-slate-800/50 p-2 text-center">
                          <p className="text-xs text-slate-500">S2</p>
                          <ScoreDisplay score={relatedAlert.s2Score} size="sm" />
                        </div>
                        <div className="rounded bg-slate-800/50 p-2 text-center">
                          <p className="text-xs text-slate-500">S3</p>
                          <ScoreDisplay score={relatedAlert.s3Score} size="sm" />
                        </div>
                        <div className="rounded bg-slate-800/50 p-2 text-center">
                          <p className="text-xs text-slate-500">S4</p>
                          <ScoreDisplay score={relatedAlert.s4Score} size="sm" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-700">
                      <p className="text-sm text-slate-400 mb-2">Rules Hit</p>
                      <div className="flex flex-wrap gap-1">
                        {searchedMessage.rulesHit.map((rule) => (
                          <Badge
                            key={rule}
                            variant="secondary"
                            className="bg-red-500/20 text-red-400 text-xs"
                          >
                            {rule}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-20 w-20 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <Search className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                No Message Selected
              </h3>
              <p className="text-sm text-slate-400 text-center max-w-md">
                Enter a message ID or sender address in the search bar above to
                inspect a specific message and view its full analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </MainContent>
    </div>
  )
}
