'use client'

import Link from 'next/link'
import type { Tablero } from '@/lib/metrics/tablero/servidor'
import { ETIQUETA_ORIGEN, ETIQUETA_PORTAL, type OrigenRegistro } from '@/lib/metrics/tablero/comercial'
import { fechaCorta, num, pct } from '@/components/metrics/panel/formato'
import { Franja, Numero, Seccion, tabla, th } from './Franja'

const REGLA = 'Estado: tasaciones agendadas contra el período comparado. Menos de 10 % de diferencia = Igual.'
const FUENTE_EMBUDO = 'Embudo de tasación del panel (personas únicas, sin pruebas ni colegas), cada paso en la fecha en que ocurrió.'
const ETAPA: Record<string, string> = { solicitud: 'Solicitudes', agendada: 'Agendadas', realizada: 'Tasaciones hechas', entregada: 'Informes entregados', captada: 'Captadas' }
const ORIGENES: OrigenRegistro[] = ['meta', 'reel', 'cartel', 'directo']

export function FranjaComercial({ t }: { t: Tablero }) {
  const c = t.comercial, x = c.actual, y = c.anterior
  const max = Math.max(1, ...c.pasos.map(p => p.cantidad))
  return (
    <Franja titulo="Comercial" estado={c.estado} regla={REGLA} numeros={<>
      <Numero titulo="Solicitudes de tasación" valor={num(x.solicitudes)} actual={x.solicitudes} antes={y?.solicitudes} antesTexto={y ? num(y.solicitudes) : undefined} fuente={FUENTE_EMBUDO} />
      <Numero titulo="Agendadas" valor={num(x.agendadas)} actual={x.agendadas} antes={y?.agendadas} antesTexto={y ? num(y.agendadas) : undefined} fuente={FUENTE_EMBUDO} />
      <Numero titulo="Tasaciones hechas" valor={num(x.realizadas)} actual={x.realizadas} antes={y?.realizadas} antesTexto={y ? num(y.realizadas) : undefined} fuente={FUENTE_EMBUDO} />
      <Numero titulo="Captadas del embudo" valor={num(x.captadas)} actual={x.captadas} antes={y?.captadas} antesTexto={y ? num(y.captadas) : undefined} fuente={FUENTE_EMBUDO} />
    </>}>
      <Seccion titulo="Embudo de tasación" fuente={FUENTE_EMBUDO + ' El % es sobre el paso anterior.'}>
        <div className="space-y-1.5">
          {c.pasos.map(p => (
            <div key={p.etapa} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2 text-sm">
              <span className="text-muted-foreground">{ETAPA[p.etapa]}</span>
              <div className="h-5 rounded bg-muted/40 overflow-hidden"><div className="h-full bg-[color:var(--brand)]/30" style={{ width: `${Math.round((p.cantidad / max) * 100)}%` }} /></div>
              <span className="tabular-n w-24 text-right">{num(p.cantidad)}{p.pctPaso != null && <span className="text-xs text-muted-foreground"> · {pct(p.pctPaso, 0)}</span>}</span>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="De solicitud a agendada" fuente="Mediana de días entre la solicitud y la agenda, de las personas agendadas en el período (sin el sistema viejo).">
        <p className="text-sm tabular-n">
          {c.medianaDiasAgenda.dias == null ? 'sin agendadas en el período' : `${num(c.medianaDiasAgenda.dias, 1)} días (${c.medianaDiasAgenda.n} agendadas)`}
          {c.medianaDiasAgendaAntes?.dias != null && <span className="text-muted-foreground"> · antes {num(c.medianaDiasAgendaAntes.dias, 1)} días</span>}
        </p>
      </Seccion>

      <Seccion titulo={`Sin agendar hace más de 48 h (${c.sinAgendar.length})`} fuente="Solicitudes de tasación del período que siguen en la etapa 'Solicitud' del CRM, sin agenda, pedidas hace más de 48 horas.">
        {c.sinAgendar.length === 0 ? <p className="text-sm text-muted-foreground">Ninguna.</p> : (
          <ul className="divide-y border rounded-lg text-sm">
            {c.sinAgendar.map(s => (
              <li key={s.dealId} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                <Link href={`/pipeline/${s.dealId}`} className="font-medium underline-offset-2 hover:underline">{s.nombre ?? 'Sin nombre'}</Link>
                <span className="text-xs text-muted-foreground tabular-n">pidió el {fechaCorta(s.solicitud)} · hace {Math.floor(s.horas / 24)} días</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Referidos" fuente="Procesos con origen 'referido': nuevos creados en el período y cuántos entraron a cada etapa en el período (historial de etapas).">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([['Nuevos', 'nuevos'], ['Agendados', 'agendados'], ['Visitados', 'realizados'], ['Captados', 'captados']] as const).map(([l, k]) => (
            <Numero key={k} titulo={l} valor={num(c.referidos[k])} actual={c.referidos[k]} antes={c.referidosAntes?.[k]} antesTexto={c.referidosAntes ? num(c.referidosAntes[k]) : undefined} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo={`Registros en las páginas de propiedades (${c.registros.total}${c.registrosAntes != null ? ` · antes ${c.registrosAntes}` : ''})`}
        fuente="Formularios de las fichas públicas (property_leads), sin robots ni borrados. Origen: 'visita:*' = cartel en la visita; utm de reel = reel; fbclid o utm de anuncio = Meta; si no, directo.">
        {c.registros.porPropiedad.length === 0 ? <p className="text-sm text-muted-foreground">Sin registros en el período.</p> : (
          <div className="overflow-x-auto">
            <table className={tabla}>
              <thead><tr className="border-b"><th className={`${th} text-left`}>Propiedad</th><th className={`${th} text-right`}>Total</th>{ORIGENES.map(o => <th key={o} className={`${th} text-right`}>{ETIQUETA_ORIGEN[o]}</th>)}</tr></thead>
              <tbody>
                {c.registros.porPropiedad.map(p => (
                  <tr key={p.propiedadId} className="border-b last:border-0">
                    <td className="py-1.5 pr-2"><Link href={`/properties/${p.propiedadId}`} className="underline-offset-2 hover:underline">{p.direccion ?? 'Propiedad'}</Link></td>
                    <td className="text-right font-medium">{p.total}</td>
                    {ORIGENES.map(o => <td key={o} className="text-right">{p.porOrigen[o] || ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo={`Consultas de portales (${c.consultas.total}${c.consultasAntes != null ? ` · antes ${c.consultasAntes}` : ''})`} fuente="Consultas que llegaron por mail de cada portal (portal_inquiries), por fecha de recepción.">
        {c.consultas.total === 0 ? <p className="text-sm text-muted-foreground">Sin consultas en el período.</p> : (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-n">
            {c.consultas.porPortal.map(p => <span key={p.portal}>{ETIQUETA_PORTAL[p.portal] ?? p.portal}: <strong>{p.cantidad}</strong></span>)}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Llamadas">
        <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
      </Seccion>
    </Franja>
  )
}
