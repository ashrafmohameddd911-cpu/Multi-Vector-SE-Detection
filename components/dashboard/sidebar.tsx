'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/components/providers/sidebar-provider'
import {
  LayoutDashboard,
  AlertTriangle,
  Search,
  Network,
  BarChart3,
  Settings2,
  FileSearch,
  Mail,
  ChevronLeft
} from 'lucide-react'

const navigation = [
  { name: 'Live Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Alert Queue', href: '/alerts', icon: AlertTriangle },
  { name: 'Group Investigation', href: '/investigation', icon: Search },
  { name: 'Campaign Graph', href: '/graph', icon: Network },
  { name: 'Metrics', href: '/metrics', icon: BarChart3 },
  { name: 'Rules Manager', href: '/rules', icon: Settings2 },
  { name: 'Message Inspector', href: '/inspector', icon: FileSearch },
  { name: 'Add Messages', href: '/messages', icon: Mail },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isOpen, toggleSidebar } = useSidebar()

  return (
    <>
      <aside className={cn(
        'fixed left-0 top-0 z-40 h-screen w-64 bg-[#0F172A] border-r border-slate-700 transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-slate-700 px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 ring-1 ring-red-500/40">
                <Image
                  src="/spidernet-logo.svg"
                  alt="SpiderNET"
                  width={36}
                  height={36}
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">SpiderNET</h1>
                <p className="text-xs text-slate-400">Threat Detection</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Status */}
          <div className="border-t border-slate-700 p-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-xs text-slate-400">System Online</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Last sync: Just now</p>
          </div>
        </div>
      </aside>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="fixed left-0 top-6 z-50 flex h-10 w-10 items-center justify-center rounded-r-lg bg-blue-600 hover:bg-blue-700 transition-colors"
        aria-label="Toggle sidebar"
        title={isOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <ChevronLeft className={cn(
          'h-5 w-5 text-white transition-transform duration-300',
          isOpen ? 'rotate-0' : 'rotate-180'
        )} />
      </button>

      {/* Overlay when sidebar is open (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  )
}
