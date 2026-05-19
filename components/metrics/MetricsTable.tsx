'use client'

import type { MetricsComparison, FunnelMetrics } from '@/lib/metrics/types'
import { FUNNEL_METRIC_KEYS, FUNNEL_METRIC_LABELS } from '@/lib/metrics/types'

function fmtDelta(d: number | undefined): { text: string; cls: string } {
  if (d === undefined) return { text: '—', cls: 'text-muted-foreground' }
  if (d === Infinity)   return { text: '+∞',  cls: 'text-emerald-600' }
  if (d > 0)            return { text: `+${d}%`, cls: 'text-emerald-600' }
  if (d < 0)            return { text: `${d}%`,  cls: 'text-rose-600' }
  return { text: '0%',  cls: 'text-muted-foreground' }
}

export function MetricsTable({ data }: { data: MetricsComparison<FunnelMetrics> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="text-left py-2 px-3 border font-medium">Métrica</th>
            <th className="text-right py-2 px-3 border font-medium">Actual</th>
            <th className="text-right py-2 px-3 border font-medium">Anterior</th>
            <th className="text-right py-2 px-3 border font-medium">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {FUNNEL_METRIC_KEYS.map(k => {
            const cur = data.current[k]
            const prev = data.previous[k]
            const delta = fmtDelta(data.delta_pct[k])
            return (
              <tr key={k} className="hover:bg-muted/40">
                <td className="py-2 px-3 border">{FUNNEL_METRIC_LABELS[k]}</td>
                <td className="py-2 px-3 border text-right font-semibold">{cur}</td>
                <td className="py-2 px-3 border text-right text-muted-foreground">{prev}</td>
                <td className={`py-2 px-3 border text-right font-medium ${delta.cls}`}>{delta.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
