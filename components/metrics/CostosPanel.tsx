'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cobertura, type FunnelCosts } from '@/lib/metrics/funnel-insights'

export interface VolumenPorOrigen {
  origen: string
  solicitudes: number
  captaciones: number
}

const ORIGEN_LABEL: Record<string, string> = {
  embudo: 'Embudo (pago)',
  clase_gratuita: 'Clase gratuita (pago)',
  referido: 'Referido',
  historico: 'Histórico (sistema anterior)',
  comprador: 'Comprador',
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

function Costo({ label, valor, detalle }: { label: string; valor: number | null; detalle: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="display text-xl tabular-n mt-1">
        {valor == null ? <span className="text-muted-foreground text-base">Sin datos</span> : ARS.format(valor)}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>
    </div>
  )
}

export function CostosPanel({ costs, porOrigen = [] }: {
  costs: FunnelCosts | null
  porOrigen?: VolumenPorOrigen[]
}) {
  if (!costs) {
    return (
      <Card>
        <CardHeader><CardTitle>¿Cuánto cuesta?</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin datos para este período.</p>
        </CardContent>
      </Card>
    )
  }

  const cob = cobertura(costs)

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Cuánto cuesta?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Inversión publicitaria del embudo de captación, sin contar lo que se gasta en
          promocionar propiedades ya captadas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-sm rounded-lg px-3 py-2 ${cob.confiable ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
          {cob.texto}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Costo label="Por solicitud" valor={costs.costo_solicitud} detalle={`${costs.solicitudes} solicitudes`} />
          <Costo label="Por tasación entregada" valor={costs.costo_tasacion} detalle={`${costs.tasaciones} tasaciones`} />
          <Costo label="Por captación" valor={costs.costo_captacion} detalle={`${costs.captaciones} captaciones`} />
        </div>

        <p className="text-xs text-muted-foreground">
          Inversión del período: <strong className="tabular-n">{ARS.format(costs.inversion)}</strong>
        </p>

        {porOrigen.length > 0 && (
          <div className="pt-2 border-t space-y-1">
            <p className="eyebrow">De dónde vienen</p>
            <p className="text-xs text-muted-foreground pb-1">
              El referido no cuesta publicidad: comparar contra lo pago es lo que dice
              dónde conviene poner el esfuerzo.
            </p>
            {porOrigen.map(o => (
              <div key={o.origen} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                <span>{ORIGEN_LABEL[o.origen] ?? o.origen}</span>
                <span className="text-muted-foreground tabular-n text-xs">
                  {o.solicitudes} solicitudes · {o.captaciones} captadas
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
