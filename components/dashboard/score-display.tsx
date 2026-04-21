import { cn } from '@/lib/utils'

interface ScoreDisplayProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showBar?: boolean
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-red-400'
  if (score >= 60) return 'text-orange-400'
  if (score >= 40) return 'text-yellow-400'
  if (score >= 20) return 'text-blue-400'
  return 'text-slate-400'
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-red-500'
  if (score >= 60) return 'bg-orange-500'
  if (score >= 40) return 'bg-yellow-500'
  if (score >= 20) return 'bg-blue-500'
  return 'bg-slate-500'
}

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl font-bold'
}

export function ScoreDisplay({ score, size = 'md', showBar = false, className }: ScoreDisplayProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn(sizeStyles[size], getScoreColor(score))}>
        {score.toFixed(1)}
      </span>
      {showBar && (
        <div className="h-1.5 w-16 rounded-full bg-slate-700">
          <div
            className={cn('h-full rounded-full transition-all', getScoreBgColor(score))}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface LargeScoreDisplayProps {
  score: number
  label?: string
}

export function LargeScoreDisplay({ score, label = 'C(G) Score' }: LargeScoreDisplayProps) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={cn('text-5xl font-bold', getScoreColor(score))}>
        {score.toFixed(1)}
      </span>
      <div className="mt-2 h-2 w-32 rounded-full bg-slate-700">
        <div
          className={cn('h-full rounded-full transition-all', getScoreBgColor(score))}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  )
}
