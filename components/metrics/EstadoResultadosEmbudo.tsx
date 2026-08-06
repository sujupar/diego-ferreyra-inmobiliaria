'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import {
  cobertura, construirEstado, formatearDuracion,
  type FunnelCosts, type StatementStage,
} from '@/lib/metrics/funnel-insights'

export interface InversionPorCampana {
  campana: string
  gasto: number
}

interface Props {
  etapas: StatementStage[]
  inversion: InversionPorCampana[]
  /** Solo se usa para la cobertura de datos; los costos se recalculan acá. */
  costs: FunnelCosts | null
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
})
const NUM = new Intl.NumberFormat('es-AR')

export function EstadoResultadosEmbudo({ etapas, inversion, costs }: Props) {
  const total = inversion.reduce((a, i) => a + Number(i.gasto), 0)
  const lineas = construirEstado(etapas, total)
  const cob = costs ? cobertura(costs) : null

  if (etapas.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Estado de resultados del embudo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin datos para este período.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de resultados del embudo</CardTitle>
        <p className="text-xs text-muted-foreground">
          Se lee de arriba abajo: cada línea explica la siguiente. Sigue a las solicitudes
          que <strong>entraron en este período</strong> y muestra qué pasó con ellas, así el
          porcentaje que convierte compara siempre la misma gente.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Inversión ────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between border-b pb-1.5">
            <span className="eyebrow">Inversión publicitaria</span>
            <span className="display text-lg tabular-n">{ARS.format(total)}</span>
          </div>

          <div className="mt-2 space-y-1">
            {inversion.map(i => (
              <div key={i.campana} className="flex items-baseline justify-between text-sm pl-3">
                <span className="text-muted-foreground truncate pr-3">{i.campana}</span>
                <span className="tabular-n text-muted-foreground shrink-0">{ARS.format(Number(i.gasto))}</span>
              </div>
            ))}
          </div>

          {cob && (
            <p className={`text-xs mt-2 rounded-md px-2.5 py-1.5 ${cob.confiable ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
              {cob.texto}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            Si acá aparece una campaña de una propiedad puntual, es porque se creó a mano en
            Ads Manager y el sistema no la reconoce como tal. Las creadas desde la plataforma
            se descuentan solas.
          </p>
        </section>

        {/* ── La cascada ───────────────────────────────────────────────────── */}
        <section className="space-y-0">
          {lineas.map((l, i) => (
            <div key={l.etapa}>
              {/* Conector con la etapa anterior */}
              {i > 0 && (
                <div className={`ml-3 border-l-2 pl-4 py-2 text-xs ${l.esCuelloDeBotella ? 'border-amber-400' : 'border-muted'}`}>
                  <span className={l.esCuelloDeBotella ? 'text-amber-800 dark:text-amber-200 font-medium' : 'text-muted-foreground'}>
                    pasan {NUM.format(l.cantidad)} de {NUM.format(lineas[i - 1].cantidad)}
                    {l.conversionPct !== null && <> · <strong>{l.conversionPct}%</strong></>}
                    {l.perdidos !== null && l.perdidos > 0 && <> · se pierden {NUM.format(l.perdidos)}</>}
                    {l.medianaDias !== null && <> · {formatearDuracion(l.medianaDias)}</>}
                  </span>
                  {l.esCuelloDeBotella && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      acá se traba
                    </span>
                  )}
                </div>
              )}

              {/* La línea de la etapa */}
              <div className="py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium uppercase text-xs tracking-wide">{l.label}</span>
                  <span className="flex items-baseline gap-4 shrink-0">
                    <span className="display text-lg tabular-n">{NUM.format(l.cantidad)}</span>
                    <span className="text-xs text-muted-foreground tabular-n w-32 text-right">
                      {l.costoUnitario == null ? 'sin costo' : `${ARS.format(l.costoUnitario)} c/u`}
                    </span>
                  </span>
                </div>

                {/*
                  La barra: ancho proporcional al volumen, para que el desplome se
                  VEA. Se resalta SOLO el cuello de botella y el resto queda gris
                  (forma "emphasis"): pintar las cinco de colores distintos
                  escondería justo el dato que importa.
                  El costo NO va como barra: su escala va de $31 mil a $3,4
                  millones y necesitaría un segundo eje, que deforma la lectura.
                */}
                <div
                  className="mt-1.5 h-2.5 w-full rounded-full bg-muted/60 overflow-hidden"
                  role="img"
                  aria-label={`${l.label}: ${NUM.format(l.cantidad)}`}
                  title={`${l.label}: ${NUM.format(l.cantidad)}${l.costoUnitario ? ` · ${ARS.format(l.costoUnitario)} c/u` : ''}`}
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      l.esCuelloDeBotella
                        ? 'bg-[#2a78d6] dark:bg-[#3987e5]'
                        : 'bg-muted-foreground/30'
                    }`}
                    style={{ width: `${Math.max(l.pctDelMaximo, l.cantidad > 0 ? 1.5 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <p className="text-xs text-muted-foreground">
          El costo por unidad es la inversión total dividida por los que llegaron a esa
          etapa. Es lo que costó, a hoy, conseguir uno.
        </p>
      </CardContent>
    </Card>
  )
}
