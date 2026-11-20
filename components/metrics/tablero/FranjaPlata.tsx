'use client'

import type { Tablero } from '@/lib/metrics/tablero/servidor'
import { usd } from '@/components/metrics/panel/formato'
import { Franja, Numero, Seccion } from './Franja'

const REGLA = 'Estado: margen neto contra el período comparado. Menos de 10 % de diferencia = Igual.'

export function FranjaPlata({ t }: { t: Tablero }) {
  const p = t.plata, x = p.actual, y = p.anterior, d = p.detalle, a = p.adquisicion
  const filas: [string, number | null, string?][] = [
    ['Facturación', d.facturacionUsd],
    ['− Reparto al asesor', -d.repartoUsd.asesor],
    ['− Reparto a Julián', -d.repartoUsd.julian],
    ['− Reparto al referidor', -d.repartoUsd.referidor],
    ['− Gastos de las propiedades vendidas', -d.gastosPropiedadesUsd],
    ['= Margen bruto', d.margenBrutoUsd],
    ['− Gastos fijos', -d.gastosFijosUsd, d.gastosAConfirmar ? 'a confirmar' : undefined],
    ['− Impuestos', -d.impuestosUsd, d.sinImpuestos ? 'sin impuestos cargados' : undefined],
    ['− Publicidad de captación (tasación y clase)', -d.publicidadCaptacionUsd],
    ['− Publicidad de propiedades', -d.publicidadPropiedadesUsd],
    ['= Margen neto', d.margenNetoUsd],
  ]
  return (
    <Franja titulo="Plata" estado={p.estado} regla={REGLA} numeros={<>
      <Numero titulo="Facturación" valor={usd(x.facturacionUsd)} actual={x.facturacionUsd} antes={y?.facturacionUsd} antesTexto={y ? usd(y.facturacionUsd) : undefined}
        sub={`${d.ventas} ventas`} fuente="Honorarios cobrados de las ventas reservadas en el período (ventas cargadas en la plataforma)." />
      <Numero titulo="Comisiones" valor={usd(x.comisionesUsd)} actual={x.comisionesUsd} antes={y?.comisionesUsd} antesTexto={y ? usd(y.comisionesUsd) : undefined} bueno="baja"
        fuente="Reparto de esas ventas: asesor, Julián y referidor." />
      <Numero titulo="Publicidad" valor={usd(x.publicidadUsd)} actual={x.publicidadUsd} antes={y?.publicidadUsd} antesTexto={y ? usd(y.publicidadUsd) : undefined} bueno="baja"
        fuente="Todo el gasto de Meta del período (captación y anuncios de propiedades), en dólares al blue de cada día." />
      <Numero titulo="Margen neto" valor={usd(x.margenNetoUsd)} actual={x.margenNetoUsd} antes={y?.margenNetoUsd} antesTexto={y ? usd(y.margenNetoUsd) : undefined}
        sub={d.sinImpuestos ? 'sin impuestos cargados' : d.gastosAConfirmar ? 'gastos a confirmar' : undefined}
        fuente="Facturación − reparto − gastos de propiedades − gastos fijos prorrateados − impuestos − toda la publicidad." />
    </>}>
      <Seccion titulo="Cuenta completa del período">
        <table className="w-full max-w-xl text-sm tabular-n">
          <tbody>
            {filas.map(([l, v, nota]) => (
              <tr key={l} className={`border-b last:border-0 ${l.startsWith('=') ? 'font-semibold' : ''}`}>
                <td className="py-1.5 pr-2">{l}{nota && <span className="text-xs font-normal text-amber-700 dark:text-amber-400"> · {nota}</span>}</td>
                <td className="text-right">{usd(v === 0 ? 0 : v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>
      <Seccion titulo="Costo por captación" fuente="Publicidad de tasación y clase ÷ propiedades captadas que vinieron de esos embudos en el período. El máximo deja 3 a 1: beneficio por captación ÷ 3.">
        <p className="text-sm tabular-n">{usd(a.costoPorCaptacionUsd)} · {a.captaciones} captaciones del embudo · máximo {usd(a.costoMaximoUsd)}</p>
      </Seccion>
    </Franja>
  )
}
