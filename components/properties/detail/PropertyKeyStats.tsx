'use client'

import type { KeyStat } from '@/lib/properties/detail-view'

/**
 * Fila de datos clave. Si no hay ninguno cargado, no se dibuja nada.
 *
 * Dos columnas abajo de 375px. Con tres, la tarjeta baja a ~91px y quedan 66
 * útiles: "ANTIGÜEDAD" en versalitas con `letter-spacing: .14em` (la utilidad
 * `eyebrow`) es UNA palabra sin puntos de corte más ancha que su caja, y un
 * valor de expensas como "$ 185.000" en la mono tampoco entra. El `truncate` va
 * igual como red: son hasta NUEVE datos y el más largo depende de la propiedad.
 */
export function PropertyKeyStats({ stats }: { stats: KeyStat[] }) {
  if (stats.length === 0) return null
  return (
    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {stats.map(s => (
        <div key={s.key} className="min-w-0 rounded-xl border bg-card px-3 py-2.5 text-center">
          <p className="display text-base tabular-n leading-tight truncate" title={s.value}>{s.value}</p>
          <p className="eyebrow mt-0.5 truncate" title={s.label}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}
