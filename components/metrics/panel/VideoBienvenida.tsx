'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { leerJson } from '@/lib/crm/leer-json'
import { BASE_CHICA, type ConteoGrupo, type Grupo, type PanelVideoBienvenida } from '@/lib/metrics/panel/video-bienvenida'
import { DeDondeSale } from './DeDondeSale'
import { fechaCorta, pct } from './formato'

/**
 * "Video de bienvenida" (tasacion-video-bienvenida, D7): quién recibió el WhatsApp con el
 * video, quién lo abrió y lo miró, y si eso cambia cuántos atienden la llamada de Paula y
 * cuántos coordinan la tasación. Carga sus propios datos: si falla, el resto del panel sigue.
 */
const NOMBRE_GRUPO: Record<Grupo, string> = { vio: 'Vio el video', abrio: 'Abrió sin mirar', no_abrio: 'No abrió' }

const parte = (n: number, de: number) => (de > 0 ? `${pct(n / de, 0)} (${n})` : '—')

export function VideoBienvenida() {
  const [panel, setPanel] = useState<PanelVideoBienvenida | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const r = await leerJson<PanelVideoBienvenida>(await fetch('/api/metrics/video-bienvenida', { cache: 'no-store' }))
        if (!vivo) return
        if (r.ok) setPanel(r.data)
        else setError(r.error)
      } catch {
        if (vivo) setError('No se pudo cargar el panel del video de bienvenida.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const titulo = (
    <h3 className="font-semibold flex items-center gap-1">
      Video de bienvenida
      <DeDondeSale texto="Personas que recibieron el WhatsApp con el video después de pedir una tasación (una por persona, sin pruebas internas). Lo visto se cuenta por tramos del video, sin repetir y sin adelantar. Atendió = alguna llamada con resultado Agendó, Volver a llamar o No le interesa. Coordinó = su solicitud llegó a Coordinada o más allá." />
    </h3>
  )

  if (error) {
    return <section className="rounded-xl border bg-card p-4 space-y-2">{titulo}<p className="text-sm text-muted-foreground">{error}</p></section>
  }
  if (!panel) {
    return <section className="rounded-xl border bg-card p-4 space-y-2">{titulo}<p className="text-sm text-muted-foreground">Cargando…</p></section>
  }

  const r = panel.resumen
  return (
    <section className="rounded-xl border bg-card p-4 space-y-5" data-panel-video-bienvenida>
      {titulo}
      {r.recibieron === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía nadie recibió el video.</p>
      ) : (
        <>
          {r.baseChica && (
            <p className="flex gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Base chica: {r.recibieron} personas. Con menos de {BASE_CHICA}, una sola persona mueve mucho los porcentajes.</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Recibieron el video', String(r.recibieron)],
              ['Abrieron el enlace', parte(r.abrieron, r.recibieron)],
              ['Tocaron play', parte(r.tocaronPlay, r.recibieron)],
              ['Vieron la mitad o más', parte(r.mitadOMas, r.recibieron)],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{etiqueta}</div>
                <div className="text-lg font-semibold tabular-nums">{valor}</div>
              </div>
            ))}
          </div>

          <TablaConteos
            titulo="¿Atienden y coordinan más los que vieron el video?"
            filas={panel.grupos.map((g) => [NOMBRE_GRUPO[g.grupo], g])}
          />
        </>
      )}

      {panel.antesDespues ? (
        <TablaConteos
          titulo={`Antes y después del cambio (${fechaCorta(panel.antesDespues.desde)})`}
          nota="Las llamadas se registran recién desde el 26/11/2026: “Atendió” antes del cambio tiene poca base. “Coordinó” se compara completo."
          filas={[
            ['14 días antes', panel.antesDespues.antes],
            ['Desde el cambio', panel.antesDespues.despues],
          ]}
        />
      ) : (
        <p className="text-xs text-muted-foreground">La comparación antes/después aparece cuando el mensaje con video empiece a salir.</p>
      )}

      {panel.personas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Persona por persona</h4>
          <div className="overflow-x-auto">
            <table className="stack w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Persona</th>
                  <th className="py-1.5 pr-3 font-medium">Le llegó</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Abrió</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Vio</th>
                  <th className="py-1.5 pr-3 font-medium">Atendió</th>
                  <th className="py-1.5 font-medium">Coordinó</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {panel.personas.map((p) => (
                  <tr key={`${p.nombre}-${p.enviado}`} className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:py-2">
                    <td className="py-1.5 pr-3 font-medium max-sm:col-span-2">{p.nombre}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap"><span className="sm:hidden text-muted-foreground">Le llegó: </span>{fechaCorta(p.enviado.slice(0, 10))}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums max-sm:text-left"><span className="sm:hidden text-muted-foreground">Abrió: </span>{p.aperturas ? `${p.aperturas} ${p.aperturas === 1 ? 'vez' : 'veces'}` : 'No'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap max-sm:text-left"><span className="sm:hidden text-muted-foreground">Vio: </span>{p.minutos ? `${p.minutos} · ${p.porcentaje} %` : '—'}</td>
                    <td className="py-1.5 pr-3"><span className="sm:hidden text-muted-foreground">Atendió: </span>{p.atendio ? 'Sí' : 'No'}</td>
                    <td className="py-1.5"><span className="sm:hidden text-muted-foreground">Coordinó: </span>{p.coordino ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function TablaConteos({ titulo, nota, filas }: { titulo: string; nota?: string; filas: [string, ConteoGrupo][] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{titulo}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium" />
              <th className="py-1.5 pr-3 font-medium text-right">Personas</th>
              <th className="py-1.5 pr-3 font-medium text-right">Atendió</th>
              <th className="py-1.5 font-medium text-right">Coordinó</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filas.map(([nombre, c]) => (
              <tr key={nombre}>
                <td className="py-1.5 pr-3">{nombre}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {c.personas}
                  {c.personas > 0 && c.personas < BASE_CHICA && <span className="ml-1 text-xs text-muted-foreground">(base chica)</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{parte(c.atendio, c.personas)}</td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{parte(c.coordino, c.personas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}
