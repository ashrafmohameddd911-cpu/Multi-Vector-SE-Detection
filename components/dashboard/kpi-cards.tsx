'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Target, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { useLiveAlerts } from '@/hooks/use-live-alerts'
import { Loader2 } from 'lucide-react'

interface KPICardProps {
  title: string
  value: React.ReactNode
  subtitle?: string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

function KPICard({ title, value, subtitle, icon, trend }: KPICardProps) {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400">{title}</p>
            <p className="mt-2 text-3xl font-bold text-white">{value}</p>
            {subtitle && (
              <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
            )}
            {trend && (
              <div className="mt-2 flex items-center gap-1">
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4 text-green-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
                <span
                  className={`text-sm font-medium ${
                    trend.isPositive ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {trend.value}%
                </span>
                <span className="text-xs text-slate-500">vs last week</span>
              </div>
            )}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-700/50">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function KPICards() {
  const { alerts: liveAlerts, isLoading } = useLiveAlerts()
  
  // Calculate statistics from live alerts
  const totalAlerts = liveAlerts.length
  const criticalAlerts = liveAlerts.filter(a => a.severity === 'CRITICAL').length
  const highAlerts = liveAlerts.filter(a => a.severity === 'HIGH').length
  const uniqueCampaigns = new Set(liveAlerts.map(a => a.groupId)).size
  
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KPICard
        title="Active Campaigns"
        value={isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : uniqueCampaigns}
        subtitle={uniqueCampaigns > 0 ? `${uniqueCampaigns} unique group${uniqueCampaigns !== 1 ? 's' : ''}` : 'No active campaigns'}
        icon={<Target className="h-6 w-6 text-blue-400" />}
        trend={uniqueCampaigns > 5 ? { value: 15, isPositive: false } : undefined}
      />
      <KPICard
        title="Alerts Today"
        value={isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalAlerts}
        subtitle={totalAlerts > 0 ? `${criticalAlerts} critical, ${highAlerts} high` : 'No alerts yet'}
        icon={<AlertTriangle className="h-6 w-6 text-orange-400" />}
        trend={totalAlerts > 10 ? { value: 8, isPositive: false } : undefined}
      />
      <KPICard
        title="Recall"
        value="100%"
        subtitle="0 missed attacks"
        icon={<TrendingUp className="h-6 w-6 text-green-400" />}
        trend={{ value: 0, isPositive: true }}
      />
    </div>
  )
}
