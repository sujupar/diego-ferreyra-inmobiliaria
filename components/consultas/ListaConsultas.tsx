'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { agruparPorDia } from '@/lib/consultas/bandeja'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'
import { FilaConsulta } from './FilaConsulta'

/**
 * La lista agrupada por día de Argentina, la más nueva arriba, con "Ver más" y
 * el total (spec §3.2). Las filas llegan ya ordenadas y sin repetir.
 */
export function ListaConsultas({
  filas, total, hoy, seleccionadaId, cargandoMas, errorMas, onAbrir, onAgendar, onVerMas,
}: {
  filas: ConsultaEnBandeja[]
  total: number
  /** AAAA-MM-DD de Argentina: decide qué grupo es "Hoy" y cuál "Ayer". */
  hoy: string
  seleccionadaId: string | null
  cargandoMas: boolean
  errorMas: string | null
  onAbrir: (c: ConsultaEnBandeja) => void
  onAgendar: (c: ConsultaEnBandeja) => void
  onVerMas: () => void
}) {
  const grupos = agruparPorDia(filas, hoy)
  return (
    <section aria-label="Lista de consultas" className="overflow-hidden rounded-xl border bg-card">
      {grupos.map((g) => (
        <div key={g.dia}>
          <h2 className="border-b bg-muted/50 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {g.etiqueta}
          </h2>
          {g.filas.map((c) => (
            <FilaConsulta
              key={c.id}
              consulta={c}
              seleccionada={c.id === seleccionadaId}
              onAbrir={() => onAbrir(c)}
              onAgendar={() => onAgendar(c)}
            />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
        <span>{`Mostrando ${filas.length} de ${total}`}</span>
        {filas.length < total && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onVerMas} disabled={cargandoMas}>
            {cargandoMas && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            Ver más
          </Button>
        )}
      </div>
      {errorMas && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{errorMas}</p>}
    </section>
  )
}
