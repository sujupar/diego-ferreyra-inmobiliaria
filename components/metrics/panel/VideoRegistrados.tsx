'use client'

import { AlertTriangle } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Panel } from '@/lib/metrics/panel/servidor'
import { MEDICION_CONFIABLE_DESDE, type GrupoVideo, type VideoCohorte } from '@/lib/metrics/panel/video-cohortes'
import { HEATMAP_PAGES, isHeatmapPageKey } from '@/lib/funnel/heatmap-pages'
import { DeDondeSale } from './DeDondeSale'
import { fechaCorta, num, pct } from './formato'

/** Con menos personas que esto, un promedio cambia mucho con una sola visita. */
const POCOS_CASOS = 20

// Colores validados con el script de la skill `dataviz` (claro y oscuro, daltonismo incluido).
const COLORES = '[--serie-reg:#2a78d6] [--serie-no:#eb6834] dark:[--serie-reg:#3987e5] dark:[--serie-no:#d95926]'

const segundos = (s: number | null) => (s == null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`)

/**
 * Cuánto del video vio cada persona que entró a la landing, separando a las que
 * se registraron de las que no. El denominador es TODA visita (quien no tocó
 * play cuenta 0 %). Spec: docs/superpowers/specs/2026-11-20-metricas-video-registrados-design.md
 */
export function VideoRegistrados({ panel, embudos }: { panel: Panel; embudos: ('tasacion' | 'clase')[] }) {
  const lista = panel.videoCohortes
  const titulo = (
    <h3 className="font-semibold flex items-center gap-1">
      Video: los que se registraron vs. los que no
      <DeDondeSale texto="Cada persona que entró a la landing en el período, una vez. Si tocó play, cuenta lo que vio de verdad (segundos sin repetir y sin adelantar ÷ duración del video); si no tocó play, cuenta 0 %. Registrada = dejó sus datos en algún formulario. Las pruebas internas no cuentan." />
    </h3>
  )
  if (lista == null) {
    return <section className="rounded-xl border bg-card p-4 space-y-2">{titulo}<p className="text-sm text-muted-foreground">No se pudo calcular ahora. Probá recargar el panel.</p></section>
  }
  const videos = lista.filter(v => isHeatmapPageKey(v.pagina) && embudos.includes(HEATMAP_PAGES[v.pagina].funnel))
  const desdeAntes = panel.parametros.rango.desde < MEDICION_CONFIABLE_DESDE

  return (
    <section className={`rounded-xl border bg-card p-4 space-y-4 ${COLORES}`}>
      {titulo}
      {desdeAntes && (
        <p className="flex gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>La medición precisa arranca el {fechaCorta(MEDICION_CONFIABLE_DESDE)}. Antes de esa fecha lo visto figura MENOS de lo real (se perdía el último tramo al cerrar la app de Instagram). Para comparar con confianza, elegí un período desde el {fechaCorta(MEDICION_CONFIABLE_DESDE)}.</span>
        </p>
      )}
      {videos.length === 0 ? <p className="text-sm text-muted-foreground">Sin visitas a las landings en el período.</p> : videos.map(v => <BloqueVideo key={v.videoKey} v={v} />)}
    </section>
  )
}

function BloqueVideo({ v }: { v: VideoCohorte }) {
  const grupos: [string, string, GrupoVideo][] = [['Se registraron', 'var(--serie-reg)', v.registrado], ['No se registraron', 'var(--serie-no)', v.noRegistrado]]
  const filas: [string, (g: GrupoVideo) => string, string?][] = [
    ['Tocaron play', g => (g.personas ? `${pct(g.tocaronPlay / g.personas, 0)} (${g.tocaronPlay})` : '—')],
    ['% del video visto, promedio de todos', g => pct(g.pctPromTodos, 0), 'Incluye con 0 % a los que no tocaron play.'],
    ['% del video visto, de los que tocaron play', g => pct(g.pctPromPlay, 0)],
    ['Tiempo visto, de los que tocaron play', g => segundos(g.segPromPlay)],
    ['Vieron el 90 % o más', g => (g.tocaronPlay ? `${pct(g.llegaronFinal / g.tocaronPlay, 0)} (${g.llegaronFinal})` : '—'), 'Sobre los que tocaron play.'],
  ]
  const pocos = grupos.some(([, , g]) => g.personas > 0 && g.personas < POCOS_CASOS)
  const datos = Array.from({ length: 100 }, (_, i) => ({
    tramo: i,
    reg: v.registrado.conCurva ? Math.round(v.registrado.curva[i] * 1000) / 10 : null,
    no: v.noRegistrado.conCurva ? Math.round(v.noRegistrado.curva[i] * 1000) / 10 : null,
  }))
  const hayCurva = v.registrado.conCurva + v.noRegistrado.conCurva > 0

  return (
    <div className="space-y-3 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{v.label}</span>
        {v.duracionS != null && <span className="text-xs text-muted-foreground">Dura {segundos(v.duracionS)}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-n">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1 text-left font-normal" />
              {grupos.map(([nombre, color, g]) => (
                <th key={nombre} className="px-2 text-right font-normal">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{nombre}</span>
                  <div className="text-foreground">{num(g.personas)} personas</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(([nombre, valor, ayuda]) => (
              <tr key={nombre} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{nombre}{ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}</td>
                {grupos.map(([g, , datosG]) => <td key={g} className="px-2 text-right font-medium">{datosG.personas ? valor(datosG) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pocos && <p className="text-xs text-muted-foreground">Pocos casos (menos de {POCOS_CASOS} personas en un grupo): tomalo como señal, no como conclusión.</p>}

      {hayCurva && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">De los que tocaron play, qué % seguía mirando en cada punto del video.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="tramo" type="number" domain={[0, 99]} ticks={[0, 25, 50, 75, 99]} tickFormatter={t => (t === 99 ? 'Final' : `${t}%`)} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val, nombre) => [val == null ? 'sin dato' : `${String(val).replace('.', ',')}%`, nombre]}
                  labelFormatter={t => `En el ${t}% del video${v.duracionS ? ` (${segundos(Math.round((Number(t) / 100) * v.duracionS))})` : ''}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="reg" name={`Se registraron (${v.registrado.conCurva})`} stroke="var(--serie-reg)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="no" name={`No se registraron (${v.noRegistrado.conCurva})`} stroke="var(--serie-no)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver la curva como tabla</summary>
            <table className="mt-1 w-full tabular-n">
              <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left font-normal">Punto del video</th><th className="text-right font-normal">Se registraron</th><th className="text-right font-normal">No se registraron</th></tr></thead>
              <tbody>
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map(t => (
                  <tr key={t} className="border-b last:border-0">
                    <td className="py-0.5">{t === 99 ? 'Final' : `${t}%`}</td>
                    <td className="text-right">{v.registrado.conCurva ? pct(v.registrado.curva[t], 0) : '—'}</td>
                    <td className="text-right">{v.noRegistrado.conCurva ? pct(v.noRegistrado.curva[t], 0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  )
}
