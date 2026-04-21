import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/mock-data'

const severityStyles: Record<Severity, string> = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-slate-900',
  LOW: 'bg-blue-500 text-white',
  DISMISSED: 'bg-slate-500 text-white'
}

interface SeverityBadgeProps {
  severity: Severity
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        severityStyles[severity],
        className
      )}
    >
      {severity}
    </span>
  )
}
