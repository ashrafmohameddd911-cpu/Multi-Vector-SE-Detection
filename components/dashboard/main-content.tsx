'use client'

import { useSidebar } from '@/components/providers/sidebar-provider'
import { cn } from '@/lib/utils'

export function MainContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isOpen } = useSidebar()

  return (
    <main className={cn(
      'min-h-screen transition-all duration-300 ease-in-out p-6',
      isOpen ? 'ml-64' : 'ml-0',
      className
    )}>
      {children}
    </main>
  )
}
