'use client'

import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Tablero } from '@/lib/metrics/tablero/servidor'
import type { LandingVariante } from '@/lib/metrics/panel/embudo'
import type { VideoCohorte } from '@/lib/metrics/panel/video-cohortes'
import { fechaCorta, num, pct } from '@/components/metrics/panel/formato'
import { Franja, Numero, Seccion, tabla, th } from './Franja'

const REGLA = 'Estado: conversión (solicitudes ÷ visitas) de la versión publicada contra el período comparado. Menos de 10 % de diferencia = Igual.'
const VARIANTE: Record<string, string> = { A: 'Tasación · Versión A', B: 'Tasación · Versión B ("Tasación Neta")', '-': 'Tasación', alto_valor: 'Tasación · alto valor' }

export function FranjaPagina({ t }: { t: Tablero }) {
  const p = t.pagina, x = p.actual, y = p.anterior
  const antesDeMedir = t.parametros.rango.desde < p.medicionVideoDesde
  return (
    <Franja titulo="Página y video" estado={p.estado} regla={REGLA} numeros={<>
      <Numero titulo="Visitas a la página" valor={num(x.visitas)} actual={x.visitas} antes={y?.visitas} antesTexto={y ? num(y.visitas) : undefined}
        fuente="Personas distintas por día que entraron a la landing de tasación publicada hoy, medidas por la plataforma (sin robots)." />
      <Numero titulo="Conversión" valor={pct(x.conversion)} actual={x.conversion} antes={y?.conversion} antesTexto={y ? pct(y.conversion) : undefined}
        sub={x.solicitudes != null ? `${x.solicitudes} solicitudes` : undefined} fuente="Solicitudes de personas únicas que entraron por esa versión ÷ visitas." />
      <Numero titulo="Tocan play" valor={pct(x.pctTocaPlay, 0)} actual={x.pctTocaPlay} antes={y?.pctTocaPlay} antesTexto={y ? pct(y.pctTocaPlay, 0) : undefined}
        fuente="De todas las personas que entraron a la landing publicada, cuántas tocaron reproducir el video." />
      <Numero titulo="% del video visto" valor={`${pct(x.pctVistoRegistrados, 0)} / ${pct(x.pctVistoNoRegistrados, 0)}`}
        sub="registrados / no registrados" fuente={`Promedio del video visto por persona (quien no tocó play cuenta 0). La medición es confiable desde el ${fechaCorta(p.medicionVideoDesde)}.`} />
    </>}>
      {antesDeMedir && <p className="text-xs text-amber-700 dark:text-amber-400">El video se mide bien desde el {fechaCorta(p.medicionVideoDesde)}: antes, lo visto sale por debajo de lo real.</p>}
      <Seccion titulo="Landings publicadas">
        <Landings filas={p.landings} />
      </Seccion>
      <Seccion titulo="Videos publicados" fuente="Todas las personas que entraron a la página, separadas por si se registraron o no.">
        <Videos videos={p.videos} />
      </Seccion>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button type="button" className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Ver versiones anteriores <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <Seccion titulo="Landings"><Landings filas={p.landingsAnteriores} /></Seccion>
          <Seccion titulo="Videos"><Videos videos={p.videosAnteriores} /></Seccion>
        </CollapsibleContent>
      </Collapsible>
    </Franja>
  )
}

function Landings({ filas }: { filas: LandingVariante[] }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Sin visitas en el período.</p>
  return (
    <div className="overflow-x-auto">
      <table className={tabla}>
        <thead><tr className="border-b"><th className={`${th} text-left`}>Landing</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Solicitudes</th><th className={`${th} text-right`}>Conversión</th></tr></thead>
        <tbody>
          {filas.map(v => (
            <tr key={v.embudo + v.variante} className="border-b last:border-0">
              <td className="py-1.5">{v.embudo === 'clase' ? 'Clase gratuita' : VARIANTE[v.variante] ?? v.variante}</td>
              <td className="text-right">{num(v.visitas)}</td><td className="text-right">{v.solicitudes}</td><td className="text-right font-medium">{pct(v.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Videos({ videos }: { videos: VideoCohorte[] | null }) {
  if (videos == null) return <p className="text-sm text-muted-foreground">No disponible.</p>
  if (videos.length === 0) return <p className="text-sm text-muted-foreground">Sin visitas en el período.</p>
  return (
    <div className="space-y-3">
      {videos.map(v => (
        <div key={v.videoKey} className="overflow-x-auto">
          <p className="text-xs font-medium mb-1">{v.label}{v.duracionS ? ` · ${Math.floor(v.duracionS / 60)}:${String(v.duracionS % 60).padStart(2, '0')}` : ''}</p>
          <table className={tabla}>
            <thead><tr className="border-b"><th className={`${th} text-left`} /><th className={`${th} text-right`}>Personas</th><th className={`${th} text-right`}>Tocaron play</th><th className={`${th} text-right`}>% visto</th><th className={`${th} text-right`}>Llegaron al final</th></tr></thead>
            <tbody>
              {([['Registrados', v.registrado], ['No registrados', v.noRegistrado]] as const).map(([l, g]) => (
                <tr key={l} className="border-b last:border-0">
                  <td className="py-1.5">{l}</td>
                  <td className="text-right">{num(g.personas)}</td>
                  <td className="text-right">{g.tocaronPlay} {g.personas ? <span className="text-xs text-muted-foreground">({pct(g.tocaronPlay / g.personas, 0)})</span> : null}</td>
                  <td className="text-right">{pct(g.pctPromTodos, 0)}</td>
                  <td className="text-right">{g.llegaronFinal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
