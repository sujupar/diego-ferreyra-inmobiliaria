'use client'

/** Sección 2 del Tablero: campañas del período, registros en las páginas de propiedades y reels con respuesta automática. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import type { Tablero } from '@/lib/metrics/tablero/servidor'
import type { ResumenReels } from '@/lib/metrics/tablero/reels'
import type { Rango } from '@/lib/metrics/panel/rango'
import { fechaCorta, num } from '@/components/metrics/panel/formato'
import { Caja, CeldaVar, Plata, Seccion, Subtitulo, tabla, td, tdR, th } from './ui'
import { rangoCorto } from './rango-corto'

const TIPO: Record<string, string> = { tasacion: 'Tasación', clase: 'Clase gratuita', propiedad: 'Propiedad' }

export function SeccionCampanias({ t }: { t: Tablero }) {
  const comp = t.comparacion.rango
  const colA = rangoCorto(t.parametros.rango), colB = comp ? rangoCorto(comp) : null
  const reg = t.registros.actual, regB = t.registros.anterior
  const antesPorProp = new Map(regB?.porPropiedad.map(r => [r.propiedadId, r.total]) ?? [])
  return (
    <Seccion n={2} titulo="Campañas del período">
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Campaña · {colA}</th><th className={`${th} text-right`}>Gasto</th><th className={`${th} text-right`}>Visitas</th>
            <th className={`${th} text-right`}>Registros</th><th className={`${th} text-right`}>Costo por registro</th>
            {colB && <><th className={`${th} text-right`}>Costo por registro {colB}</th><th className={`${th} text-right`}>Variación</th></>}
          </tr></thead>
          <tbody>
            {t.campanias.length === 0 && <tr><td className={td} colSpan={7}><span className="text-muted-foreground">Sin gasto en el período.</span></td></tr>}
            {t.campanias.map(c => (
              <tr key={c.campaniaId} className="border-b last:border-0">
                <td className={td}>
                  {/* Tasación y clase se nombran por su embudo: el nombre interno de Meta no le dice nada al que lee. */}
                  {c.tipo !== 'propiedad' ? TIPO[c.tipo] : <>
                    <span className="text-xs text-muted-foreground">Propiedad · </span>
                    {c.propiedadId ? <Link className="hover:underline underline-offset-2" href={`/properties/${c.propiedadId}`}>{c.nombre}</Link> : c.nombre}
                  </>}
                </td>
                <td className={tdR}><Plata u={c.gastoUsd} a={c.gasto} /></td>
                <td className={tdR}>{num(c.visitas)}</td>
                <td className={tdR}>{num(c.registros)}</td>
                <td className={`${tdR} font-semibold`}>{c.registros === 0 ? <span className="text-muted-foreground font-normal">sin registros</span> : <Plata u={c.costoPorRegistroUsd} a={c.costoPorRegistro} />}</td>
                {colB && <>
                  <td className={`${tdR} text-muted-foreground`}>{c.antes ? <Plata u={c.antes.costoPorRegistroUsd} a={c.antes.costoPorRegistro} /> : '—'}</td>
                  <CeldaVar actual={c.costoPorRegistroUsd} antes={c.antes?.costoPorRegistroUsd} bueno="baja" />
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </Caja>

      <Subtitulo fuente="Registros en las fichas públicas de las propiedades (sin robots ni borrados). De dónde vinieron sale del enlace por el que entró cada persona. Misma persona = mismo email o teléfono.">
        Registros en páginas de propiedades · {num(reg.total)} registros de {num(reg.personas)} {reg.personas === 1 ? 'persona' : 'personas'}{colB ? ` · ${colB}: ${regB ? num(regB.total) : 'sin dato'}` : ''}
      </Subtitulo>
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Propiedad</th><th className={`${th} text-left`}>De dónde vinieron</th>
            <th className={`${th} text-right`}>{colA}</th>{colB && <th className={`${th} text-right`}>{colB}</th>}
          </tr></thead>
          <tbody>
            {reg.porPropiedad.length === 0 && <tr><td className={td} colSpan={4}><span className="text-muted-foreground">Sin registros en el período.</span></td></tr>}
            {reg.porPropiedad.map(p => (
              <tr key={p.propiedadId} className="border-b last:border-0 align-top">
                <td className={td}><Link className="hover:underline underline-offset-2" href={`/properties/${p.propiedadId}`}>{p.direccion ?? 'Propiedad'}</Link></td>
                <td className={`${td} text-muted-foreground`}>
                  {p.detalle.map(d => `${d.etiqueta}${d.cantidad > 1 ? ` ×${d.cantidad}` : ''}`).join(' · ')}
                  {p.personas < p.total && <span> · {p.personas} {p.personas === 1 ? 'persona' : 'personas'}</span>}
                </td>
                <td className={`${tdR} font-semibold`}>{num(p.total)}</td>
                {colB && <td className={`${tdR} text-muted-foreground`}>{regB ? num(antesPorProp.get(p.propiedadId) ?? 0) : 'sin dato'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Caja>

      <Subtitulo fuente="Vistas: Instagram (en vivo). Comentarios, privados, visitas y registros: la plataforma. Cuenta desde que se publicó cada reel; los comentarios simulados del modo prueba no cuentan.">Reels de Instagram con respuesta automática · desde que se publicó cada uno</Subtitulo>
      <Reels rango={t.parametros.rango} colA={colA} />
    </Seccion>
  )
}

type RespReels = ({ disponible: true } & ResumenReels) | { disponible: false; motivo: string }

function Reels({ rango, colA }: { rango: Rango; colA: string }) {
  const [res, setRes] = useState<{ clave: string; valor: RespReels } | null>(null)
  const clave = `${rango.desde}|${rango.hasta}`
  // La respuesta guarda de qué período es: si cambió el período, se muestra "cargando" sin vaciar el estado en el efecto.
  const r = res?.clave === clave ? res.valor : null
  useEffect(() => {
    let vivo = true
    fetch(`/api/metrics/tablero/reels?${new URLSearchParams({ desde: rango.desde, hasta: rango.hasta })}`)
      .then(x => (x.ok ? x.json() : null)).catch(() => null)
      .then(d => { if (vivo) setRes({ clave: `${rango.desde}|${rango.hasta}`, valor: d ?? { disponible: false, motivo: 'no disponible' } }) })
    return () => { vivo = false }
  }, [rango.desde, rango.hasta])
  if (!r) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Leyendo los reels…</p>
  if (!r.disponible) return <p className="text-sm text-muted-foreground">Reels no disponibles ({r.motivo}).</p>
  if (r.filas.length === 0) return <p className="text-sm text-muted-foreground">No hay reels publicados.</p>
  const tt = r.total
  const conR = r.filas.filter(f => f.conRespuesta)
  return (
    <div className="space-y-2">
      <Caja>
        <table className={tabla}>
          <thead><tr className="border-b">
            <th className={`${th} text-left`}>Reel</th><th className={`${th} text-right`}>Publicado</th><th className={`${th} text-right`}>Vistas</th>
            <th className={`${th} text-right`}>Comentarios</th><th className={`${th} text-right`}>Personas que comentaron</th><th className={`${th} text-right`}>Privados</th>
            <th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Personas registradas</th>
            <th className={`${th} text-right`}>Comentarios por registro</th><th className={`${th} text-right`}>Privados por registro</th>
          </tr></thead>
          <tbody>
            {r.filas.map(f => (
              <tr key={f.reelId} className={`border-b last:border-0 ${f.conRespuesta ? '' : 'text-muted-foreground'}`}>
                <td className={td}>
                  {f.propiedadId ? <Link className="hover:underline underline-offset-2" href={`/properties/${f.propiedadId}`}>{f.direccion ?? 'Propiedad'}</Link> : f.direccion ?? 'Reel'}
                  {!f.conRespuesta && <span className="ml-1.5 text-xs rounded-full border px-1.5">sin respuesta automática</span>}
                </td>
                <td className={tdR}>{fechaCorta(f.publicado)}</td>
                <td className={tdR}>{num(f.vistas)}</td>
                <td className={tdR}>{num(f.comentarios)}</td>
                <td className={tdR}>{num(f.personasComentaron)}</td>
                <td className={tdR}>{num(f.privados)}</td>
                <td className={tdR}>{num(f.visitas)}</td>
                <td className={`${tdR} font-semibold`}>{num(f.personasRegistradas)}</td>
                <td className={tdR}>{f.comentariosPorRegistro == null ? '—' : num(f.comentariosPorRegistro)}</td>
                <td className={tdR}>{f.privadosPorRegistro == null ? '—' : num(f.privadosPorRegistro)}</td>
              </tr>
            ))}
            {conR.length > 1 && (
              <tr className="border-t font-semibold">
                <td className={td}>Total con respuesta automática</td><td />
                <td className={tdR}>{num(tt.vistas)}</td><td className={tdR}>{num(tt.comentarios)}</td><td className={tdR}>{num(tt.personasComentaron)}</td>
                <td className={tdR}>{num(tt.privados)}</td><td className={tdR}>{num(tt.visitas)}</td><td className={tdR}>{num(tt.personasRegistradas)}</td>
                <td className={tdR}>{tt.comentariosPorRegistro == null ? '—' : num(tt.comentariosPorRegistro)}</td>
                <td className={tdR}>{tt.privadosPorRegistro == null ? '—' : num(tt.privadosPorRegistro)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Caja>
      <p className="text-xs text-muted-foreground tabular-n">
        {tt.personasRegistradas > 0 && <>Por cada persona registrada: {tt.vistasPorRegistro != null && <>{num(tt.vistasPorRegistro)} vistas, </>}{num(tt.personasComentaron / tt.personasRegistradas)} personas que comentaron, {num(tt.privadosPorRegistro)} privados y {num(tt.visitas / tt.personasRegistradas)} visitas. </>}
        {colA}: {conR.map(f => `${f.direccion ?? 'reel'} ${f.periodo.comentarios} comentarios, ${f.periodo.privados} privados, ${f.periodo.visitas} visitas y ${f.periodo.registros} ${f.periodo.registros === 1 ? 'registro' : 'registros'}`).join(' · ')}.
      </p>
    </div>
  )
}
