'use client'

import type { CurrentStateRow, DealStageKey } from '@/lib/metrics/types'
import { DEAL_STAGE_ORDER, DEAL_STAGE_LABELS } from '@/lib/metrics/types'

const STAGE_COLORS: Record<DealStageKey, string> = {
  clase_gratuita: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  request:        'bg-sky-50 text-sky-700 border-sky-200',
  scheduled:      'bg-blue-50 text-blue-700 border-blue-200',
  not_visited:    'bg-rose-50 text-rose-700 border-rose-200',
  visited:        'bg-amber-50 text-amber-700 border-amber-200',
  appraisal_sent: 'bg-purple-50 text-purple-700 border-purple-200',
  followup:       'bg-orange-50 text-orange-700 border-orange-200',
  captured:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost:           'bg-red-50 text-red-700 border-red-200',
  comprador:      'bg-teal-50 text-teal-700 border-teal-200',
}

/**
 * Replica las cards del CRM dentro del dashboard de métricas (Opción B).
 * Muestra cuántos deals creados en el rango están AHORA en cada stage del
 * pipeline. Coincide 1:1 con los conteos de /crm para el mismo rango.
 */
export function CurrentStateBreakdown({ rows }: { rows: CurrentStateRow[] }) {
  const byStage = new Map(rows.map(r => [r.stage, r.count]))
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Deals creados en este rango, agrupados por su <strong>stage actual</strong>. Coincide
        con las cards del CRM. Total de procesos: <strong>{total}</strong>.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {DEAL_STAGE_ORDER.map(stage => {
          const count = byStage.get(stage) ?? 0
          const color = STAGE_COLORS[stage]
          return (
            <div
              key={stage}
              className={`rounded-md border px-3 py-2.5 ${color}`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                {DEAL_STAGE_LABELS[stage]}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{count}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
