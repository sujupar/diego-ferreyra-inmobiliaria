'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  data: {
    total: number
    con_asesor: number
    por_mes: { mes: string; total: number; con_asesor: number }[]
  }
}

/**
 * Muestra el PROBLEMA en vez de una métrica falsa.
 *
 * Al 2026-08-06 solo 28 de 815 deals tienen asesor asignado, así que cualquier
 * número "por asesor" sería una mentira estadística. Esta pantalla existe para
 * que se vea, y es el argumento para arreglar la asignación en la operación.
 */
export function CoberturaAsesoresPanel({ data }: Props) {
  const pct = data.total > 0 ? Math.round((data.con_asesor / data.total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Por asesor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 text-sm">
          Solo <strong className="tabular-n">{data.con_asesor} de {data.total}</strong> solicitudes
          tienen asesor asignado ({pct}%). Hasta que se asigne al crear la solicitud,
          esta sección <strong>no puede medir</strong> nada por persona.
        </div>

        {data.por_mes.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="eyebrow">Asignación mes a mes</p>
            {data.por_mes.map(m => (
              <div key={m.mes} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span className="tabular-n">{m.mes}</span>
                <span className="tabular-n text-muted-foreground">
                  {m.con_asesor} de {m.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
