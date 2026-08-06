'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import {
  cuelloDeBotella, esMuestraChica, etiquetaEtapa, formatearDuracion,
  type StageTiming,
} from '@/lib/metrics/funnel-insights'

export function CuelloDeBotellaPanel({ timings }: { timings: StageTiming[] }) {
  const { masLento, texto } = cuelloDeBotella(timings)
  const pasos = [...timings]
    .filter(t => t.hasta !== 'lost' && t.desde !== 'lost')
    .sort((a, b) => b.mediana_dias - a.mediana_dias)

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Dónde se traba?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuánto tarda cada paso del embudo. Se usa la mediana y no el promedio: un caso
          que tardó meses correría el promedio y escondería la realidad.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`text-sm rounded-lg px-3 py-2 ${masLento ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
          {texto}
        </p>

        {pasos.length > 0 && (
          <div className="space-y-1.5">
            {pasos.map(t => (
              <div key={`${t.desde}-${t.hasta}`} className="flex items-center justify-between gap-3 text-sm border-b pb-1.5 last:border-0">
                <span className="min-w-0">
                  {etiquetaEtapa(t.desde)} <span className="text-muted-foreground">→</span> {etiquetaEtapa(t.hasta)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <strong className="tabular-n">{formatearDuracion(t.mediana_dias)}</strong>
                  <span className="text-xs text-muted-foreground tabular-n">{t.n} casos</span>
                  {esMuestraChica(t.n) && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label="muestra chica" />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
