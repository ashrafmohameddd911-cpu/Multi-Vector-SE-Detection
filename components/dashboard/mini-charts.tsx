'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Tooltip
} from 'recharts'
import { attacksPerHour, vectorDistribution, topBrands } from '@/lib/mock-data'

export function AttacksPerHourChart() {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Attacks per Hour (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={attacksPerHour}>
              <XAxis
                dataKey="hour"
                tick={{ fill: '#64748B', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                interval={5}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#E2E8F0'
                }}
              />
              <Line
                type="monotone"
                dataKey="attacks"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function VectorDistributionChart() {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Vector Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[150px] flex items-center">
          <div className="w-1/2">
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie
                  data={vectorDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {vectorDistribution.map((entry, index) => (
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
          <div className="w-1/2 space-y-2">
            {vectorDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-slate-300">{item.name}</span>
                </div>
                <span className="text-xs font-medium text-white">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function TopBrandsChart() {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          Top Impersonated Brands
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topBrands} layout="vertical">
              <XAxis
                type="number"
                tick={{ fill: '#64748B', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#E2E8F0'
                }}
              />
              <Bar dataKey="count" fill="#F97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
