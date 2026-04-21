'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SeverityBadge } from './severity-badge'
import { VectorChips } from './vector-icon'
import { ScoreDisplay } from './score-display'
import { useLiveAlerts } from '@/hooks/use-live-alerts'
import { formatDistanceToNow } from 'date-fns'
import { Loader2 } from 'lucide-react'

export function AlertTicker() {
  const { alerts: liveAlerts, isLoading } = useLiveAlerts()
  
  // Show the most recent 20 alerts
  const currentAlerts = liveAlerts.slice(0, 20)

  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live Alert Feed
          {isLoading && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-4 pb-4">
          <div className="space-y-2">
            {currentAlerts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <p>No alerts yet. Submit messages to see them appear here.</p>
              </div>
            ) : (
              currentAlerts.map((alert, index) => (
                <div
                  key={`${alert.id}-${index}`}
                  className="flex items-center gap-3 rounded-lg bg-slate-800/50 p-3 transition-all hover:bg-slate-800 animate-in fade-in slide-in-from-top-2"
                >
                  <div className="flex-shrink-0">
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">
                        {alert.groupId}
                      </span>
                      <span className="text-sm font-medium text-white truncate">
                        {alert.campaignType}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <VectorChips vectors={alert.vectors} />
                      <span className="text-xs text-slate-500 truncate">
                        {alert.entity}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <ScoreDisplay score={alert.cgScore} size="sm" />
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
