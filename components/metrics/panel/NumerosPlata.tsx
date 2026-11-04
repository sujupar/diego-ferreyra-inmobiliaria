'use client'

import type { Panel } from '@/lib/metrics/panel/servidor'
import { DeDondeSale, Variacion } from './DeDondeSale'
import { pct, usd, variacion } from './formato'

function Tarjeta({ titulo, valor, sub, ayuda, v, bueno }: { titulo: string; valor: string; sub?: string; ayuda: string; v: number | null; bueno?: 'sube' | 'baja' }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1 min-w-0">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{titulo} <DeDondeSale texto={ayuda} /></p>
      <p className="text-2xl font-semibold tabular-n truncate">{valor}</p>
      <div className="flex items-center gap-2 min-h-4">
        <Variacion v={v} bueno={bueno} />
        {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
      </div>
    </div>
  )
}

export function NumerosPlata({ panel }: { panel: Panel }) {
  const a = panel.actual, b = panel.anterior
  const pa = a.plata, pb = b?.plata
  const invA = pa.publicidadCaptacionUsd, invB = pb?.publicidadCaptacionUsd
  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Tarjeta titulo="Facturación" valor={usd(pa.facturacionUsd)} v={variacion(pa.facturacionUsd, pb?.facturacionUsd)}
        sub={`${pa.ventas} ventas${pa.ventasIncompletas ? ` · ${pa.ventasIncompletas} con datos faltantes` : ''}`}
        ayuda="Honorarios cobrados de las ventas reservadas en el período (la venta cuenta en el mes de la reserva). Fuente: ventas cargadas en la plataforma." />
      <Tarjeta titulo="Margen bruto" valor={usd(pa.margenBrutoUsd)} v={variacion(pa.margenBrutoUsd, pb?.margenBrutoUsd)}
        sub={pa.margenBrutoPct == null ? undefined : `${pct(pa.margenBrutoPct, 0)} de lo facturado`}
        ayuda="Facturación − reparto (asesor, Julián, referidor) − gastos de cada propiedad vendida. Es lo que le queda a Diego de las ventas." />
      <Tarjeta titulo="Margen neto" valor={usd(pa.margenNetoUsd)} v={variacion(pa.margenNetoUsd, pb?.margenNetoUsd)}
        sub={pa.sinImpuestos ? 'sin impuestos cargados' : pa.gastosAConfirmar ? 'gastos a confirmar' : pa.margenNetoPct == null ? undefined : `${pct(pa.margenNetoPct, 0)} de lo facturado`}
        ayuda="Margen bruto − gastos fijos del período (prorrateados por día) − impuestos − toda la publicidad de Meta (captación y anuncios de propiedades)." />
      <Tarjeta titulo="Costo por captación" valor={usd(a.adquisicion.costoPorCaptacionUsd)} bueno="baja"
        v={variacion(a.adquisicion.costoPorCaptacionUsd, b?.adquisicion.costoPorCaptacionUsd)}
        sub={`${a.adquisicion.captaciones} captaciones del embudo · máximo ${usd(a.adquisicion.costoMaximoUsd)}`}
        ayuda="Publicidad de los embudos de tasación y clase ÷ propiedades captadas que vinieron de esos embudos en el período. El máximo es lo que se puede pagar por captación dejando 3 a 1: beneficio por captación ÷ 3." />
      <Tarjeta titulo="Inversión en Meta" valor={usd(invA)} v={variacion(invA, invB)} bueno="baja"
        sub={pa.publicidadPropiedadesUsd ? `+ ${usd(pa.publicidadPropiedadesUsd)} en anuncios de propiedades` : 'embudos de tasación y clase'}
        ayuda="Gasto de las campañas de tasación y clase, en dólares al blue de cada día. Los anuncios de propiedades se muestran aparte: son costo de vender, no de captar." />
    </section>
  )
}
