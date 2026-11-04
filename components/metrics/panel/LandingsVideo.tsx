'use client'

import type { Panel } from '@/lib/metrics/panel/servidor'
import { DeDondeSale } from './DeDondeSale'
import { num, pct } from './formato'

const VARIANTE: Record<string, string> = { A: 'Versión A', B: 'Versión B ("Tasación Neta")', '-': 'Landing (sin prueba A/B)', alto_valor: 'Landing alto valor' }
const VIDEO: Record<string, string> = {
  'hero-tasacion': 'Video de la landing de tasación (A)',
  'hero-tasacion-neta': 'Video de la landing B "Tasación Neta"',
  'hero-clase': 'Video de la landing de la clase',
  'clase-completa': 'La clase completa',
}

export function LandingsVideo({ panel, embudos }: { panel: Panel; embudos: ('tasacion' | 'clase')[] }) {
  const variantes = panel.variantes.filter(v => embudos.includes(v.embudo))
  const videos = panel.video.filter(v => embudos.includes(v.embudo as 'tasacion' | 'clase'))
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-1">Conversión por landing <DeDondeSale texto="Personas distintas por día medidas por la plataforma (desde el 20/7/2026, sin robots) y solicitudes de personas únicas que entraron por esa versión. Fuera de ese rango no hay dato por versión." /></h3>
        {variantes.length === 0 ? <p className="text-sm text-muted-foreground">Sin visitas medidas en el período.</p> : (
          <table className="w-full text-sm tabular-n">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left font-normal py-1">Landing</th><th className="text-right font-normal">Visitas</th><th className="text-right font-normal">Solicitudes</th><th className="text-right font-normal">Conversión</th></tr></thead>
            <tbody>
              {variantes.map(v => (
                <tr key={v.embudo + v.variante} className="border-b last:border-0">
                  <td className="py-1.5">{v.embudo === 'clase' ? 'Clase gratuita' : VARIANTE[v.variante] ?? v.variante}</td>
                  <td className="text-right">{num(v.visitas)}</td><td className="text-right">{v.solicitudes}</td><td className="text-right font-medium">{pct(v.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-1">Video de las landings <DeDondeSale texto="De las personas que le dieron play, qué % llegó al 25, 50, 75% y al final. Medido por la plataforma desde el 20/6/2026." /></h3>
        {videos.length === 0 ? <p className="text-sm text-muted-foreground">Sin reproducciones en el período.</p> : (
          <div className="space-y-3">
            {videos.map(v => {
              const tramos = [['25%', v.llegan_25], ['50%', v.llegan_50], ['75%', v.llegan_75], ['Final', v.completan]] as const
              return (
                <div key={v.video_key} className="space-y-1">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{VIDEO[v.video_key] ?? v.video_key}</span>
                    <span className="text-muted-foreground text-xs tabular-n">{v.reproducciones} plays de {v.cargas} cargas ({pct(v.cargas ? v.reproducciones / v.cargas : null, 0)}) · {v.segundos_promedio ?? '—'} s vistos en promedio</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {tramos.map(([t, n]) => {
                      const p = v.reproducciones ? n / v.reproducciones : 0
                      return (
                        <div key={t} className="rounded-md bg-muted/40 overflow-hidden relative h-8">
                          <div className="absolute inset-y-0 left-0 bg-[color:var(--brand)]/25" style={{ width: `${Math.round(p * 100)}%` }} />
                          <span className="relative text-xs px-1.5 leading-8 tabular-n">{t}: {pct(p, 0)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
