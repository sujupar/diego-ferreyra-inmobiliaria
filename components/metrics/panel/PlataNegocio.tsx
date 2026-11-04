'use client'

import type { Panel } from '@/lib/metrics/panel/servidor'
import { DeDondeSale } from './DeDondeSale'
import { fechaCorta, pct, usd } from './formato'
import { ORIGENES } from './FormVenta'

function Linea({ t, v, signo, fuerte, ayuda, nota }: { t: string; v: number | null; signo?: '−'; fuerte?: boolean; ayuda?: string; nota?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? 'border-t font-semibold' : ''}`}>
      <span className="text-sm">{signo && <span className="text-muted-foreground mr-1">{signo}</span>}{t} {ayuda && <DeDondeSale texto={ayuda} />}{nota && <span className="text-xs text-amber-700 dark:text-amber-400 ml-1">{nota}</span>}</span>
      <span className="tabular-n text-sm">{usd(v)}</span>
    </div>
  )
}

const origen = (k: string | null) => ORIGENES.find(o => o.key === k)?.label ?? 'sin dato'

export function PlataNegocio({ panel }: { panel: Panel }) {
  const p = panel.actual.plata, adq = panel.actual.adquisicion
  return (
    <section className="grid gap-4 lg:grid-cols-5">
      <div className="rounded-xl border bg-card p-4 lg:col-span-2 space-y-1">
        <h3 className="font-semibold mb-2">Plata del negocio en el período</h3>
        <Linea t={`Facturación (${p.ventas} ventas)`} v={p.facturacionUsd} ayuda="Honorarios cobrados de las ventas reservadas en el período." />
        <Linea signo="−" t="Asesor" v={p.repartoUsd.asesor} />
        <Linea signo="−" t="Julián" v={p.repartoUsd.julian} />
        <Linea signo="−" t="Referidores" v={p.repartoUsd.referidor} />
        <Linea signo="−" t="Gastos de las propiedades vendidas" v={p.gastosPropiedadesUsd} />
        <Linea t={`Margen bruto${p.margenBrutoPct == null ? '' : ` (${pct(p.margenBrutoPct, 0)})`}`} v={p.margenBrutoUsd} fuerte />
        <Linea signo="−" t="Gastos fijos" v={p.gastosFijosUsd} nota={p.gastosAConfirmar ? 'a confirmar' : undefined} ayuda="Monto mensual de cada gasto, prorrateado por los días del período." />
        <Linea signo="−" t="Impuestos" v={p.impuestosUsd} nota={p.sinImpuestos ? 'falta cargarlos' : undefined} />
        <Linea signo="−" t="Publicidad de captación" v={p.publicidadCaptacionUsd} />
        <Linea signo="−" t="Anuncios de propiedades" v={p.publicidadPropiedadesUsd} />
        <Linea t={`Margen neto${p.margenNetoPct == null ? '' : ` (${pct(p.margenNetoPct, 0)})`}`} v={p.margenNetoUsd} fuerte />
        <div className="border-t mt-2 pt-2 space-y-1">
          <Linea t="Costo real por captación" v={adq.costoPorCaptacionUsd} ayuda="Publicidad de captación ÷ captaciones de los embudos en el período." />
          <Linea t="Beneficio bruto por captación" v={adq.beneficioBrutoPorCaptacionUsd} ayuda={`Limpio promedio por venta × % de captaciones que se venden (supuesto: ${pct(adq.tasaVenta, 0)}, de la planilla: 6 de cada 11).`} />
          <Linea t="Costo máximo por captación (3 a 1)" v={adq.costoMaximoUsd} ayuda="Lo máximo que conviene pagar para conseguir una captación: el beneficio bruto por captación ÷ 3." fuerte />
          {adq.retorno != null && <p className="text-xs text-muted-foreground">Hoy cada dólar invertido en captar vuelve {adq.retorno.toFixed(1).replace('.', ',')} veces.</p>}
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 lg:col-span-3 space-y-2 min-w-0">
        <h3 className="font-semibold">Ventas del período</h3>
        {panel.ventasDelPeriodo.length === 0 ? <p className="text-sm text-muted-foreground">No hay ventas reservadas en el período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-n">
              <thead><tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-normal py-1">Propiedad</th><th className="text-left font-normal px-2">Reserva</th><th className="text-left font-normal px-2">Llegó por</th>
                <th className="text-right font-normal px-2">Precio</th><th className="text-right font-normal px-2">Cobrado</th><th className="text-right font-normal pl-2">Limpio Diego</th>
              </tr></thead>
              <tbody>
                {panel.ventasDelPeriodo.map(({ venta: v, calc: c }) => (
                  <tr key={v.id ?? v.direccion} className="border-b last:border-0 align-top">
                    <td className="py-1.5">
                      {v.direccion}
                      {(c.faltan.length > 0 || v.a_confirmar) && <span className="block text-xs text-amber-700 dark:text-amber-400">{v.a_confirmar ? 'a confirmar' : ''}{v.a_confirmar && c.faltan.length ? ' · ' : ''}{c.faltan.length ? `faltan: ${c.faltan.join(', ')}` : ''}</span>}
                    </td>
                    <td className="px-2 whitespace-nowrap">{fechaCorta(v.reservada_en)}</td>
                    <td className="px-2">{origen(v.origen_dueno)}</td>
                    <td className="text-right px-2">{usd(c.precioUsd)}</td>
                    <td className="text-right px-2">{usd(c.cobradoUsd)}</td>
                    <td className="text-right pl-2 font-medium">{usd(c.limpioDiegoUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <OrigenVentas panel={panel} />
      </div>
    </section>
  )
}

function OrigenVentas({ panel }: { panel: Panel }) {
  const m = new Map<string, { n: number; limpio: number }>()
  for (const { venta, calc } of panel.ventasDelPeriodo) {
    const k = origen(venta.origen_dueno)
    const x = m.get(k) ?? { n: 0, limpio: 0 }
    x.n++; x.limpio += calc.limpioDiegoUsd ?? 0
    m.set(k, x)
  }
  if (m.size === 0) return null
  return (
    <p className="text-xs text-muted-foreground pt-1">
      De dónde vinieron: {[...m.entries()].sort((a, b) => b[1].limpio - a[1].limpio).map(([k, x]) => `${k} ${x.n} (${usd(x.limpio)})`).join(' · ')}
    </p>
  )
}
