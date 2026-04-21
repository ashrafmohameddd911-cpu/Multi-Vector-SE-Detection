'use client'

import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Tooltip,
  Legend
} from 'recharts'
import {
  layerContributions,
  severityDistribution,
  campaignsDetected,
  scoreDistribution
} from '@/lib/mock-data'
import { TrendingUp, Target, Shield } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  color: string
}

function MetricCard({ title, value, subtitle, icon, color }: MetricCardProps) {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className={`mt-1 text-4xl font-bold ${color}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${color.replace('text-', 'bg-').replace('-400', '-500/20')}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MetricsPage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">System Metrics</h1>
          <p className="text-sm text-slate-400">
            Performance analytics and detection statistics
          </p>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="F1 Score"
            value="96.0%"
            subtitle="Harmonic mean of precision & recall"
            icon={<TrendingUp className="h-7 w-7 text-green-400" />}
            color="text-green-400"
          />
          <MetricCard
            title="Precision"
            value="92.4%"
            subtitle="True positives / predicted positives"
            icon={<Target className="h-7 w-7 text-blue-400" />}
            color="text-blue-400"
          />
          <MetricCard
            title="Recall"
            value="100%"
            subtitle="True positives / actual positives"
            icon={<Shield className="h-7 w-7 text-purple-400" />}
            color="text-purple-400"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Layer Contribution Chart */}
          <Card className="bg-[#1E293B] border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white">
                Layer Contributions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={layerContributions} layout="vertical">
                    <XAxis
                      type="number"
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <YAxis
                      type="category"
                      dataKey="layer"
                      tick={{ fill: '#94A3B8', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#E2E8F0'
                      }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)}${name === 'weight' ? '' : '%'}`,
                        name === 'avgScore' ? 'Avg Score' : 'Weight'
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ color: '#94A3B8' }}
                      formatter={(value) =>
                        value === 'avgScore' ? 'Average Score' : 'Weight (×100)'
                      }
                    />
                    <Bar dataKey="avgScore" fill="#3B82F6" radius={[0, 4, 4, 0]} name="avgScore" />
                    <Bar
                      dataKey="weight"
                      fill="#22C55E"
                      radius={[0, 4, 4, 0]}
                      name="weight"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Severity Distribution */}
          <Card className="bg-[#1E293B] border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white">
                Severity Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center">
                <div className="w-1/2">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={severityDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={{ stroke: '#64748B' }}
                      >
                        {severityDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#E2E8F0'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-3">
                  {severityDistribution.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-slate-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-medium text-white">
                        {item.value} alerts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Campaigns Detected vs Missed */}
          <Card className="bg-[#1E293B] border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white">
                Campaigns Detected vs Missed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignsDetected}>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#E2E8F0'
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#94A3B8' }} />
                    <Bar
                      dataKey="detected"
                      fill="#22C55E"
                      radius={[4, 4, 0, 0]}
                      name="Detected"
                    />
                    <Bar
                      dataKey="missed"
                      fill="#EF4444"
                      radius={[4, 4, 0, 0]}
                      name="Missed"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Score Distribution Histogram */}
          <Card className="bg-[#1E293B] border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white">
                C(G) Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scoreDistribution}>
                    <XAxis
                      dataKey="score"
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                      label={{
                        value: 'C(G) Score',
                        position: 'bottom',
                        fill: '#64748B',
                        fontSize: 12
                      }}
                    />
                    <YAxis
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                      label={{
                        value: 'Count',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#64748B',
                        fontSize: 12
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#E2E8F0'
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#94A3B8' }} />
                    <Area
                      type="monotone"
                      dataKey="attack"
                      stackId="1"
                      stroke="#EF4444"
                      fill="#EF4444"
                      fillOpacity={0.6}
                      name="Attack Messages"
                    />
                    <Area
                      type="monotone"
                      dataKey="legit"
                      stackId="2"
                      stroke="#22C55E"
                      fill="#22C55E"
                      fillOpacity={0.6}
                      name="Legitimate Messages"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainContent>
    </div>
  )
}
