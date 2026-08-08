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

// Sin contenedor rounded-xl/border/bg-card propio: el padre (`/metrics`) ya
// pone esta tabla adentro de un `<Card>` — agregarle el mismo marco de
// `DataTable` la anidaría dos veces (lección de la Tarea 9). Sí toma el resto
// de la receta visual: cabecera `eyebrow`, filas separadas por `border-t` en
// vez de grilla completa, y `tabular-n` en las columnas de números.
export function MetricsTable({ data }: { data: MetricsComparison<FunnelMetrics> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 eyebrow whitespace-nowrap">Métrica</th>
            <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Actual</th>
            <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Anterior</th>
            <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {FUNNEL_METRIC_KEYS.map(k => {
            const cur = data.current[k]
            const prev = data.previous[k]
            const delta = fmtDelta(data.delta_pct[k])
            return (
              <tr key={k} className="border-t hover:bg-muted/40">
                <td className="py-2 px-3">{FUNNEL_METRIC_LABELS[k]}</td>
                <td className="py-2 px-3 text-right font-semibold tabular-n">{cur}</td>
                <td className="py-2 px-3 text-right text-muted-foreground tabular-n">{prev}</td>
                <td className={`py-2 px-3 text-right font-medium tabular-n ${delta.cls}`}>{delta.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
