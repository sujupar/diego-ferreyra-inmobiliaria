import { isPipelineState, PIPELINE_STATE_LABELS, type PipelineState } from '@/lib/leads/tags'
import { cn } from '@/lib/utils'

/**
 * Chip del estado del embudo (`property_leads.pipeline_state`, task 1/2).
 * Paleta PROPIA, distinta de `colorForTag` (esa es de etiquetas libres del
 * equipo; esta es de un enum fijo de 7 valores) — clases Tailwind literales
 * (no interpoladas) por la misma razón que `lib/leads/tags.ts`: Tailwind v4
 * escanea el código en busca de nombres de clase completos.
 */
const STATE_CLASSES: Record<PipelineState, string> = {
  nuevo: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  contactado: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800',
  visita_agendada:
    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/50 dark:text-violet-300 dark:border-violet-800',
  visito: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-800',
  negociando: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800',
  cerrado: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800',
  perdido: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800',
}

/**
 * `null`/`undefined`/un string inválido (API todavía sin el campo, o algún
 * valor futuro que este archivo no conoce) → no renderiza nada, nunca revienta
 * ni muestra basura ("undefined"). Es la misma resiliencia que pide el brief
 * para todo el contrato nuevo.
 */
export function PipelineStateChip({ state, className }: { state: string | null | undefined; className?: string }) {
  if (!state || !isPipelineState(state)) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none',
        STATE_CLASSES[state],
        className,
      )}
    >
      {PIPELINE_STATE_LABELS[state]}
    </span>
  )
}
