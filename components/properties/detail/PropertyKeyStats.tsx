'use client'

import type { KeyStat } from '@/lib/properties/detail-view'

/** Fila de datos clave. Si no hay ninguno cargado, no se dibuja nada. */
export function PropertyKeyStats({ stats }: { stats: KeyStat[] }) {
  if (stats.length === 0) return null
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {stats.map(s => (
        <div key={s.key} className="rounded-xl border bg-card px-3 py-2.5 text-center">
          <p className="display text-base tabular-n leading-tight">{s.value}</p>
          <p className="eyebrow mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
