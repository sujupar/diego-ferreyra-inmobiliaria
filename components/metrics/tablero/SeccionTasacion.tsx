'use client'

/** Sección 1 del Tablero: la campaña de tasación (ajuste, el período contra el comparado, embudo, landing y anuncios). */

import type { ReactNode } from 'react'
import type { Tablero } from '@/lib/metrics/tablero/servidor'
import type { LandingVariante } from '@/lib/metrics/panel/embudo'
import { fechaCorta, num, pct } from '@/components/metrics/panel/formato'
import { AjusteVigente, HistorialAjustes } from './Ajustes'
import { AnunciosActivos } from './AnunciosActivos'
import { Caja, CeldaPuntos, CeldaVar, Plata, Seccion, Subtitulo, tabla, td, tdR, th } from './ui'
import { rangoCorto } from './rango-corto'

const VERSION: Record<string, string> = { A: 'Versión A', B: 'Versión B (Tasación Neta)', '-': 'Sin versión', alto_valor: 'Alto valor' }
const nombreVersiones = (vs: string[]) => vs.map(v => VERSION[v] ?? v).join(' y ')

export function SeccionTasacion({ t, onCambio }: { t: Tablero; onCambio: () => void }) {
  const s = t.tasacion, a = s.actual, b = s.anterior
  const comp = t.comparacion.rango
  const colA = rangoCorto(t.parametros.rango), colB = comp ? rangoCorto(comp) : null
  const div = (x: number | null | undefined, y: number | null | undefined) => (x == null || !y ? null : x / y)
  // Entre nov-25 y mar-26 Meta midió mal las visitas de tasación: ahí van "sin dato".
  const visA = s.visitasConfiables.actual ? a?.visitas ?? null : null
  const visB = s.visitasConfiables.anterior ? b?.visitas ?? null : null

  const filas: { nombre: string; act: ReactNode; ant: ReactNode; va: number | null; vb: number | null; bueno: 'sube' | 'baja'; puntos?: boolean }[] = [
    { nombre: 'Gasto total', act: <Plata u={a?.gastoUsd} a={a?.gasto} />, ant: <Plata u={b?.gastoUsd} a={b?.gasto} />, va: a?.gastoUsd ?? null, vb: b?.gastoUsd ?? null, bueno: 'baja' },
    { nombre: 'Gasto por día', act: <Plata u={div(a?.gastoUsd, s.diasActual)} a={div(a?.gasto, s.diasActual)} />, ant: <Plata u={div(b?.gastoUsd, s.diasAnterior)} a={div(b?.gasto, s.diasAnterior)} />, va: div(a?.gastoUsd, s.diasActual), vb: div(b?.gastoUsd, s.diasAnterior), bueno: 'baja' },
    { nombre: 'Registros', act: num(a?.registros), ant: num(b?.registros), va: a?.registros ?? null, vb: b?.registros ?? null, bueno: 'sube' },
    { nombre: 'Costo por registro', act: <Plata u={a?.costoPorRegistroUsd} a={a?.costoPorRegistro} />, ant: <Plata u={b?.costoPorRegistroUsd} a={b?.costoPorRegistro} />, va: a?.costoPorRegistroUsd ?? null, vb: b?.costoPorRegistroUsd ?? null, bueno: 'baja' },
    { nombre: 'Visitas a la página', act: num(visA), ant: num(visB), va: visA, vb: visB, bueno: 'sube' },
    { nombre: 'Costo por visita', act: <Plata u={div(a?.gastoUsd, visA)} a={div(a?.gasto, visA)} decimales={2} />, ant: <Plata u={div(b?.gastoUsd, visB)} a={div(b?.gasto, visB)} decimales={2} />, va: div(a?.gastoUsd, visA), vb: div(b?.gastoUsd, visB), bueno: 'baja' },
    { nombre: 'CTR (clics ÷ impresiones)', act: pct(div(a?.clics, a?.impresiones), 2), ant: pct(div(b?.clics, b?.impresiones), 2), va: div(a?.clics, a?.impresiones), vb: div(b?.clics, b?.impresiones), bueno: 'sube', puntos: true },
  ]

  return (
    <Seccion n={1} titulo={`Campaña de tasación · ${colA}`}>
      <AjusteVigente ajuste={s.ultimoAjuste} />
      <HistorialAjustes ajustes={s.ajustes} onCambio={onCambio} />

      <Subtitulo fuente={`Meta Ads (gasto sin impuestos), en USD al dólar blue de cada día. Meta se sincroniza una vez por día${s.ultimoDiaConGasto ? `: último día cargado, ${fechaCorta(s.ultimoDiaConGasto)}` : ''}.`}>El período</Subtitulo>
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Campaña de tasación</th><th className={`${th} text-right`}>{colA}</th>
            {colB && <><th className={`${th} text-right`}>{colB}</th><th className={`${th} text-right`}>Variación</th></>}
          </tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.nombre} className="border-b last:border-0">
                <td className={td}>{f.nombre}</td>
                <td className={`${tdR} font-semibold`}>{f.act}</td>
                {colB && <><td className={`${tdR} text-muted-foreground`}>{f.ant}</td>{f.puntos ? <CeldaPuntos actual={f.va} antes={f.vb} /> : <CeldaVar actual={f.va} antes={f.vb} bueno={f.bueno} />}</>}
              </tr>
            ))}
          </tbody>
        </table>
      </Caja>

      <Subtitulo fuente="Impresiones, clics y visitas: Meta. Solicitudes en adelante: la plataforma, personas únicas que pidieron tasación en el período y hasta dónde llegaron (las del período en curso todavía pueden avanzar). El % es sobre el paso anterior.">Embudo · cuántos pasan de cada paso al siguiente</Subtitulo>
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Paso</th><th className={`${th} text-right`}>{colA}</th><th className={`${th} text-right`}>% del paso</th>
            {colB && <><th className={`${th} text-right`}>{colB}</th><th className={`${th} text-right`}>% del paso</th><th className={`${th} text-right`}>Diferencia</th></>}
          </tr></thead>
          <tbody>
            {s.embudo.map((p, i) => {
              const q = s.embudoAntes?.[i]
              return (
                <tr key={p.clave} className="border-b last:border-0">
                  <td className={td}>{p.etapa}</td>
                  <td className={tdR}>{num(p.cantidad)}</td>
                  <td className={`${tdR} font-semibold`}>{i === 0 ? '' : pct(p.pct)}</td>
                  {colB && <>
                    <td className={`${tdR} text-muted-foreground`}>{num(q?.cantidad)}</td>
                    <td className={`${tdR} text-muted-foreground`}>{i === 0 ? '' : pct(q?.pct)}</td>
                    {i === 0 ? <td /> : <CeldaPuntos actual={p.pct} antes={q?.pct} />}
                  </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Caja>

      <Subtitulo fuente="Visitas: personas distintas por día que midió la plataforma en la landing (sin robots). Conversión: solicitudes ÷ visitas. En la columna comparada, las versiones que tuvieron visitas en ese período.">Landing de tasación</Subtitulo>
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b"><th className={`${th} text-left`}>Período</th><th className={`${th} text-left`}>Versión publicada</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Solicitudes</th><th className={`${th} text-right`}>Conversión</th></tr></thead>
          <tbody>
            {s.landing.actual.map(v => <FilaLanding key={'a' + v.variante} periodo={`${colA} · publicada hoy`} v={v} />)}
            {s.landing.otrasDelPeriodo.map(v => <FilaLanding key={'o' + v.variante} periodo={`${colA} · antes del cambio`} v={v} tenue />)}
            {colB && (s.landing.comparado?.length
              ? s.landing.comparado.map(v => <FilaLanding key={'c' + v.variante} periodo={`${colB}${s.landing.comparado!.length > 1 ? ' · en prueba A/B' : ''}`} v={v} tenue />)
              : <tr><td className={td}>{colB}</td><td className={td} colSpan={4}><span className="text-muted-foreground">sin visitas medidas (la plataforma mide visitas desde el 20/07/2026)</span></td></tr>)}
            {s.landing.actual.length === 0 && <tr><td className={td} colSpan={5}><span className="text-muted-foreground">Sin visitas medidas a la versión publicada ({nombreVersiones(s.landing.publicadas)}).</span></td></tr>}
          </tbody>
        </table>
      </Caja>

      <Subtitulo fuente="Meta en vivo (se vuelve a leer cada 30 minutos). Cada fila suma todas las versiones y conjuntos de un mismo anuncio en el período. Activo = alguna versión está activa hoy. Incluye lo que va de hoy, que el resto de la página suma recién mañana: por eso el total puede dar un poco más que el de la campaña.">Anuncios activos · lo que hicieron en el período</Subtitulo>
      <AnunciosActivos rango={t.parametros.rango} />
    </Seccion>
  )
}

function FilaLanding({ periodo, v, tenue }: { periodo: string; v: LandingVariante; tenue?: boolean }) {
  return (
    <tr className={`border-b last:border-0 ${tenue ? 'text-muted-foreground' : ''}`}>
      <td className={td}>{periodo}</td>
      <td className={td}>{VERSION[v.variante] ?? v.variante}</td>
      <td className={tdR}>{num(v.visitas)}</td>
      <td className={tdR}>{num(v.solicitudes)}</td>
      <td className={`${tdR} font-semibold`}>{pct(v.conversion)}</td>
    </tr>
  )
}
