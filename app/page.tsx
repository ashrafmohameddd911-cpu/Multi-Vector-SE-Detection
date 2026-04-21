import Image from 'next/image'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { KPICards } from '@/components/dashboard/kpi-cards'
import { ThreatGraph } from '@/components/dashboard/threat-graph'
import { LiveFeed } from '@/components/dashboard/live-feed'
import {
  AttacksPerHourChart,
  VectorDistributionChart,
  TopBrandsChart
} from '@/components/dashboard/mini-charts'

export default function LiveDashboard() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6 flex items-center gap-4">
          <Image
            src="/spidernet-logo.svg"
            alt="SpiderNET"
            width={56}
            height={56}
            priority
            className="rounded-lg ring-1 ring-red-500/30 bg-slate-950 p-1"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">Live Dashboard</h1>
            <p className="text-sm text-slate-400">
              Real-time social engineering threat monitoring
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <KPICards />

        {/* Threat Map (Neo4j) + Live Alert Feed (MySQL) */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ThreatGraph />
          <LiveFeed />
        </div>

        {/* Mini Charts */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <AttacksPerHourChart />
          <VectorDistributionChart />
          <TopBrandsChart />
        </div>
      </MainContent>
    </div>
  )
}
