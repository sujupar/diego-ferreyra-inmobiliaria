'use client'

/** Secciones 3 (consultas y propiedades) y 4 (plata) del Tablero. */

import type { Tablero } from '@/lib/metrics/tablero/servidor'
import { ETIQUETA_PORTAL } from '@/lib/metrics/tablero/comercial'
import { ETIQUETA_ESTADO_COMERCIAL } from '@/lib/metrics/tablero/propiedades'
import { num, usd } from '@/components/metrics/panel/formato'
import { Caja, CeldaVar, Seccion, tabla, td, tdR, th } from './ui'
import { rangoCorto } from './rango-corto'

/** Cabecera "qué · período · comparado · variación". Va afuera del render: declarada adentro, React la remonta en cada cambio de estado. */
function Cab({ primera, colA, colB }: { primera: string; colA: string; colB: string | null }) {
  return (
    <thead><tr className="border-b">
      <th className={`${th} text-left`}>{primera}</th><th className={`${th} text-right`}>{colA}</th>
      {colB && <><th className={`${th} text-right`}>{colB}</th><th className={`${th} text-right`}>Variación</th></>}
    </tr></thead>
  )
}

export function SeccionConsultas({ t }: { t: Tablero }) {
  const comp = t.comparacion.rango
  const colA = rangoCorto(t.parametros.rango), colB = comp ? rangoCorto(comp) : null
  const c = t.consultas, ant = new Map(c.anterior?.porPortal.map(x => [x.portal, x.cantidad]) ?? [])
  const portales = [...new Set([...c.actual.porPortal.map(x => x.portal), ...(c.anterior?.porPortal.map(x => x.portal) ?? [])])]
  const act = new Map(c.actual.porPortal.map(x => [x.portal, x.cantidad]))
  const p = t.propiedades
  const filasProp: [string, number, number | null][] = [
    ['Captadas', p.actual.captadas, p.anterior?.captadas ?? null],
    ['Reservas', p.actual.reservas, p.anterior?.reservas ?? null],
    ['Escrituras', p.actual.escrituras, p.anterior?.escrituras ?? null],
  ]
  return (
    <Seccion n={3} titulo="Consultas y propiedades">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <Caja>
          <table className={tabla}>
            <Cab primera="Consultas de portales" colA={colA} colB={colB} />
            <tbody>
              {portales.map(k => (
                <tr key={k} className="border-b last:border-0">
                  <td className={td}>{ETIQUETA_PORTAL[k] ?? k}</td>
                  <td className={`${tdR} font-semibold`}>{num(act.get(k) ?? 0)}</td>
                  {colB && <><td className={`${tdR} text-muted-foreground`}>{c.anterior ? num(ant.get(k) ?? 0) : 'sin dato'}</td><CeldaVar actual={act.get(k) ?? 0} antes={c.anterior ? ant.get(k) ?? 0 : null} /></>}
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className={td}>Total</td><td className={tdR}>{num(c.actual.total)}</td>
                {colB && <><td className={tdR}>{num(c.anterior?.total)}</td><CeldaVar actual={c.actual.total} antes={c.anterior?.total} /></>}
              </tr>
            </tbody>
          </table>
        </Caja>
        <Caja>
          <table className={tabla}>
            <Cab primera="Propiedades" colA={colA} colB={colB} />
            <tbody>
              {filasProp.map(([k, a, b]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className={td}>{k}</td><td className={`${tdR} font-semibold`}>{num(a)}</td>
                  {colB && <><td className={`${tdR} text-muted-foreground`}>{num(b)}</td><CeldaVar actual={a} antes={b} /></>}
                </tr>
              ))}
            </tbody>
          </table>
        </Caja>
        <Caja>
          <table className={tabla}>
            <thead><tr className="border-b"><th className={`${th} text-left`}>Cartera hoy</th><th className={`${th} text-right`}>Propiedades</th></tr></thead>
            <tbody>
              {p.cartera.porEstado.map(e => (
                <tr key={e.estado} className="border-b last:border-0"><td className={td}>{ETIQUETA_ESTADO_COMERCIAL[e.estado] ?? e.estado}</td><td className={tdR}>{num(e.cantidad)}</td></tr>
              ))}
            </tbody>
          </table>
        </Caja>
      </div>
    </Seccion>
  )
}

export function SeccionPlata({ t }: { t: Tablero }) {
  const comp = t.comparacion.rango
  const colA = rangoCorto(t.parametros.rango), colB = comp ? rangoCorto(comp) : null
  const a = t.plata.actual, b = t.plata.anterior
  const com = (x: typeof a) => x.repartoUsd.asesor + x.repartoUsd.julian + x.repartoUsd.referidor
  const filas: [string, number, number | null, 'sube' | 'baja', string?][] = [
    ['Facturación (honorarios)', a.facturacionUsd, b?.facturacionUsd ?? null, 'sube'],
    ['Comisiones (asesor, Julián, referidor)', com(a), b ? com(b) : null, 'baja'],
    ['Gastos de las propiedades vendidas', a.gastosPropiedadesUsd, b?.gastosPropiedadesUsd ?? null, 'baja'],
    ['Publicidad para captar (tasación y clase)', a.publicidadCaptacionUsd, b?.publicidadCaptacionUsd ?? null, 'baja'],
    ['Publicidad de propiedades', a.publicidadPropiedadesUsd, b?.publicidadPropiedadesUsd ?? null, 'baja'],
    ['Gastos fijos (prorrateados al período)', a.gastosFijosUsd, b?.gastosFijosUsd ?? null, 'baja', a.gastosAConfirmar ? 'a confirmar' : undefined],
    ['Impuestos', a.impuestosUsd, b?.impuestosUsd ?? null, 'baja', a.sinImpuestos ? 'sin impuestos cargados' : undefined],
  ]
  return (
    <Seccion n={4} titulo="Plata" fuente="Ventas y gastos cargados en la plataforma; publicidad de Meta en USD al dólar blue de cada día. Si el período comparado no tiene gasto de Meta cargado, no se compara.">
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Plata (USD)</th><th className={`${th} text-right`}>{colA}</th>
            {colB && <><th className={`${th} text-right`}>{colB}</th><th className={`${th} text-right`}>Variación</th></>}
          </tr></thead>
          <tbody>
            {filas.map(([k, x, y, bueno, nota]) => (
              <tr key={k} className="border-b last:border-0">
                <td className={td}>{k}{nota && <span className="text-xs text-amber-700 dark:text-amber-400"> · {nota}</span>}</td>
                <td className={tdR}>{usd(x)}</td>
                {colB && <><td className={`${tdR} text-muted-foreground`}>{usd(y)}</td><CeldaVar actual={x} antes={y} bueno={bueno} /></>}
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className={td}>Margen neto</td>
              <td className={`${tdR} ${a.margenNetoUsd < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{usd(a.margenNetoUsd)}</td>
              {colB && <><td className={tdR}>{usd(b?.margenNetoUsd)}</td><td /></>}
            </tr>
          </tbody>
        </table>
      </Caja>
      <p className="text-xs text-muted-foreground tabular-n">
        Año {t.plata.anio.desde.slice(0, 4)} hasta el {rangoCorto({ desde: t.plata.anio.hasta, hasta: t.plata.anio.hasta })}: facturado {usd(t.plata.facturadoAnioUsd)} · margen neto {usd(t.plata.margenNetoAnioUsd)}.
        {' '}Costo por captación del período: {usd(t.plata.adquisicion.costoPorCaptacionUsd)} ({num(t.plata.adquisicion.captaciones)} captaciones del embudo; máximo {usd(t.plata.adquisicion.costoMaximoUsd)}).
      </p>
    </Seccion>
  )
}
