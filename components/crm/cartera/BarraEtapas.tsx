import type { GrupoDeEtapas } from '@/lib/crm/cartera-pantalla'
import { miles } from '@/lib/crm/cartera-pantalla'
import { NOMBRE_ETAPA, type EtapaCRM } from '@/lib/crm/etapas'
import { cn } from '@/lib/utils'

// Barra chica de etapas (maqueta `barraEtapas()`, `.be`; spec crm-sistema-diseno "Barra de
// etapas"): botones de texto con el número, sin fondos de color ni tarjetas, bajo una base
// escrita. Tocar una etapa filtra; tocarla de nuevo saca el filtro. La elegida se marca con
// borde y `aria-pressed`, no solo con color. No repite el total (está en "Abiertos N").

export function BarraEtapas({
  grupos,
  conteo,
  elegida,
  alTocar,
  error = false,
}: {
  grupos: GrupoDeEtapas[]
  conteo: Record<EtapaCRM, number>
  elegida: EtapaCRM | ''
  alTocar: (e: EtapaCRM) => void
  /** La lista no se pudo leer: ningún número (spec "Falla la lista"). */
  error?: boolean
}) {
  if (error) {
    return (
      <p className="text-xs text-texto-suave" data-barra="error">
        No se pudo contar por etapa
      </p>
    )
  }
  return (
    <div aria-label="Procesos por etapa" role="group" className="flex min-w-0 flex-col gap-2 md:flex-1 md:flex-row md:flex-wrap md:gap-x-6 md:gap-y-1">
      {grupos.map((g) => (
        <div key={g.base} className="flex min-w-0 flex-col gap-1 md:flex-row md:flex-wrap md:items-center md:gap-x-2">
          <p className="text-xs text-texto-suave">{g.base}</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-1 p-0">
            {g.etapas.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  aria-pressed={elegida === e}
                  onClick={() => alTocar(e)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-transparent px-2 text-[13px] text-texto-suave hover:bg-accent md:raton:min-h-8',
                    'aria-pressed:border-foreground aria-pressed:text-foreground',
                    'outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  )}
                >
                  <span>{NOMBRE_ETAPA[e]}</span>
                  <strong className="font-semibold tabular-nums text-foreground">{miles(conteo[e] ?? 0)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
