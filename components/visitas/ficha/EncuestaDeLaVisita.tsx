'use client'
/**
 * La encuesta en la ficha de la visita (spec §3.3 "Realizada: ver/copiar/reenviar encuesta; ver
 * respuestas" + adenda §11.4). El estado y si se puede reenviar los calcula el SERVIDOR (decisión de
 * envío); acá solo se muestran. Copiar usa el portapapeles; si el navegador no lo permite, el link
 * aparece en un campo para copiarlo a mano.
 *
 * "Copiar link" solo con `linkDisponible`: una visita reabierta después de "Se realizó" (se marcó
 * por error) deja de servir el link, y la ficha no puede ofrecer copiar algo que ya no corresponde
 * a una visita realizada (Review Focus 4).
 */
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { filasDeRespuestas, type EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'
import type { ClaveEstadoEncuesta } from '@/lib/visitas/encuesta/estado-envio'
import { cn } from '@/lib/utils'

const COLOR: Record<ClaveEstadoEncuesta, string> = {
  respondida: 'bg-emerald-50 text-emerald-900',
  abierta: 'bg-brand-soft text-brand',
  leida: 'bg-brand-soft text-brand',
  entregada: 'bg-brand-soft text-brand',
  enviada: 'bg-brand-soft text-brand',
  fallo: 'bg-red-50 text-red-900',
  vencida: 'bg-secondary text-muted-foreground',
  sin_enviar: 'bg-amber-50 text-amber-900',
}

export function EncuestaDeLaVisita({ visitaId, realizada, encuesta, onCambio }: {
  visitaId: string
  realizada: boolean
  encuesta: EncuestaParaFicha | null
  onCambio: (e: EncuestaParaFicha) => void
}) {
  const [ocupado, setOcupado] = useState<'link' | 'reenviar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarLink, setMostrarLink] = useState(false)

  async function pedir(accion: 'link' | 'reenviar') {
    setOcupado(accion); setError(null)
    try {
      const r = await leerRespuesta<EncuestaParaFicha | null>(await fetch(`/api/visits/${visitaId}/encuesta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      }))
      if (!r.ok) { setError(r.error); return }
      if (r.data) {
        onCambio(r.data)
        if (accion === 'reenviar') toast.success('Encuesta reenviada')
      }
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado')
    } catch {
      setMostrarLink(true)
    }
  }

  if (!encuesta && !realizada) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Encuesta</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!encuesta ? (
          <>
            <p className="text-muted-foreground">Esta visita todavía no tiene link de encuesta.</p>
            <Button type="button" className="min-h-11 max-md:w-full" disabled={ocupado !== null} onClick={() => void pedir('link')}>
              {ocupado === 'link' ? 'Creando…' : 'Crear link de la encuesta'}
            </Button>
          </>
        ) : (
          <>
            <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', COLOR[encuesta.estado.clave])}>{encuesta.estado.texto}</span>
            {!encuesta.respondidaEl && (
              // Con la visita reabierta el link sirve la página "no disponible": decir
              // "vence el <fecha futura>" sería mentir sobre un link que ya no anda.
              <p className="text-muted-foreground">{!encuesta.linkDisponible ? 'El link no está disponible mientras la visita no esté marcada como realizada.' : encuesta.vencida ? 'El link ya venció.' : `El link vence el ${formatearFechaLarga(encuesta.venceEl)}.`}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {encuesta.linkDisponible && (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => void copiar(encuesta.link)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />Copiar link
                </Button>
              )}
              {encuesta.puedeReenviar && (
                <Button type="button" variant="outline" className="min-h-11" disabled={ocupado !== null} onClick={() => void pedir('reenviar')}>
                  <Send className="h-4 w-4" aria-hidden="true" />{ocupado === 'reenviar' ? 'Enviando…' : 'Reenviar por WhatsApp'}
                </Button>
              )}
            </div>
            {mostrarLink && (
              <input readOnly aria-label="Link de la encuesta" value={encuesta.link} onFocus={e => e.currentTarget.select()}
                className="w-full rounded-md border px-2 py-2 text-base" />
            )}
            {encuesta.respuestas && (
              <div className="space-y-2">
                <h4 className="font-semibold">{encuesta.respuestas.completa ? 'Respuestas' : 'Respuestas (sin terminar)'}</h4>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                  {filasDeRespuestas(encuesta.respuestas).map(f => (
                    <Fragment key={f.etiqueta}>
                      <dt className="text-muted-foreground">{f.etiqueta}</dt>
                      <dd className="break-words">{f.valor}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
