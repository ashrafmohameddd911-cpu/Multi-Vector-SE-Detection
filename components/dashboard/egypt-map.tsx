'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { threatLocations, type Severity } from '@/lib/mock-data'

const severityColors: Record<Severity, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#3B82F6',
  DISMISSED: '#6B7280'
}

export function EgyptMap() {
  return (
    <Card className="bg-[#1E293B] border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Live Threat Map - Egypt
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[300px] w-full rounded-lg bg-slate-800/50 overflow-hidden">
          {/* Simplified Egypt outline */}
          <svg
            viewBox="0 0 400 400"
            className="absolute inset-0 h-full w-full"
            style={{ opacity: 0.3 }}
          >
            <path
              d="M100,50 L300,50 L350,150 L350,350 L200,400 L100,350 L50,200 Z"
              fill="none"
              stroke="#64748B"
              strokeWidth="2"
            />
            {/* Nile River */}
            <path
              d="M200,80 Q180,150 190,200 Q200,250 180,300 Q160,350 170,400"
              fill="none"
              stroke="#3B82F6"
              strokeWidth="1.5"
              opacity="0.5"
            />
            {/* Major cities */}
            <circle cx="190" cy="100" r="4" fill="#64748B" /> {/* Alexandria */}
            <circle cx="210" cy="130" r="5" fill="#64748B" /> {/* Cairo */}
            <circle cx="270" cy="180" r="3" fill="#64748B" /> {/* Suez */}
            <circle cx="180" cy="280" r="3" fill="#64748B" /> {/* Luxor */}
            <circle cx="170" cy="350" r="3" fill="#64748B" /> {/* Aswan */}
          </svg>

          {/* Threat dots */}
          {threatLocations.map((location, index) => {
            // Map lat/lng to SVG coordinates (simplified)
            const x = ((location.lng - 25) / 10) * 300 + 50
            const y = ((32 - location.lat) / 10) * 350 + 25

            return (
              <div
                key={location.id}
                className="absolute"
                style={{
                  left: `${(x / 400) * 100}%`,
                  top: `${(y / 400) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div
                  className="relative"
                  style={{
                    animationDelay: `${index * 0.2}s`
                  }}
                >
                  <span
                    className="absolute inline-flex h-4 w-4 animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: severityColors[location.severity] }}
                  />
                  <span
                    className="relative inline-flex h-4 w-4 rounded-full cursor-pointer hover:scale-150 transition-transform"
                    style={{ backgroundColor: severityColors[location.severity] }}
                    title={`${location.campaignType} - ${location.severity}`}
                  />
                </div>
              </div>
            )
          })}

          {/* Legend */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 rounded bg-slate-900/80 p-2">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map((severity) => (
              <div key={severity} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: severityColors[severity] }}
                />
                <span className="text-xs text-slate-400">{severity}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
