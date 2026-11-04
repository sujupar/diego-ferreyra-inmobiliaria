'use client'

import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** "¿De dónde sale?": la fórmula y la fuente de un número, al pasar o tocar. */
export function DeDondeSale({ texto }: { texto: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="¿De dónde sale este número?" className="inline-flex text-muted-foreground hover:text-foreground align-middle">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{texto}</TooltipContent>
    </Tooltip>
  )
}

/** Flecha de variación contra el período comparado. `bueno` = si subir es bueno. */
export function Variacion({ v, bueno = 'sube' }: { v: number | null; bueno?: 'sube' | 'baja' }) {
  if (v == null) return null
  const mejora = bueno === 'sube' ? v > 0 : v < 0
  const color = Math.abs(v) < 0.005 ? 'text-muted-foreground' : mejora ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
  const s = (v > 0 ? '+' : v < 0 ? '−' : '') + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.abs(v * 100)) + '%'
  return <span className={`text-xs tabular-n ${color}`}>{s}</span>
}
