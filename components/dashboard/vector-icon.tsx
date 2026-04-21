import { cn } from '@/lib/utils'
import { Mail, MessageSquare, Phone } from 'lucide-react'
import type { Vector } from '@/lib/mock-data'

const vectorConfig: Record<Vector, { icon: typeof Mail; color: string; bg: string }> = {
  email: { icon: Mail, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  sms: { icon: MessageSquare, color: 'text-green-400', bg: 'bg-green-500/20' },
  call: { icon: Phone, color: 'text-orange-400', bg: 'bg-orange-500/20' }
}

interface VectorIconProps {
  vector: Vector
  showLabel?: boolean
  className?: string
}

export function VectorIcon({ vector, showLabel = false, className }: VectorIconProps) {
  const config = vectorConfig[vector]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
        config.bg,
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', config.color)} />
      {showLabel && (
        <span className={cn('text-xs font-medium capitalize', config.color)}>
          {vector}
        </span>
      )}
    </span>
  )
}

interface VectorChipsProps {
  vectors: Vector[]
  showLabels?: boolean
}

export function VectorChips({ vectors, showLabels = false }: VectorChipsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {vectors.map((vector) => (
        <VectorIcon key={vector} vector={vector} showLabel={showLabels} />
      ))}
    </div>
  )
}
