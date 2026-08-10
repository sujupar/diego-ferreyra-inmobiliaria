'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CompleteVisitDialog } from '../_components/CompleteVisitDialog'
import { toast } from 'sonner'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

/** Mismas etiquetas que el listado (`VisitsTable`) — mantener sincronizadas. */
const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: 'A confirmar',
  scheduled: 'Agendada',
  completed: 'Realizada',
  no_show: 'No se realizó',
  cancelled: 'Cancelada',
}

interface QuestionnaireRow {
  id: string
  response_source: 'advisor' | 'client'
  liked: boolean | null
  most_liked: string | null
  least_liked: string | null
  in_price: boolean | null
  hypothetical_offer: number | null
  responded_at: string
}

/**
 * D30 — tres estados, no dos. Antes la pantalla solo distinguía "hay visita" de
 * "no hay visita", y esta segunda se pintaba SIEMPRE como "Cargando…": una
 * visita borrada, un id que no es UUID (500) o un corte de red dejaban la
 * palabra "Cargando…" sobre fondo vacío, para siempre, sin mensaje ni salida
 * (el botón "Volver a visitas" quedaba debajo del early-return).
 */
type EstadoCarga = 'cargando' | 'ok' | 'no-encontrada' | 'error'

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [visit, setVisit] = useState<PropertyVisitWithRelations | null>(null)
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireRow[]>([])

  const load = useCallback(async () => {
    // El render solo mira `estado` cuando NO hay visita, así que esto no
    // parpadea en los recargados de `confirmVisit`/`onCompleted`; sirve para
    // que el botón "Reintentar" del cartel de error muestre que está haciendo
    // algo en vez de dejar el mismo error en pantalla.
    setEstado('cargando')
    try {
      const res = await fetch(`/api/visits/${id}`)
      // 404 es distinto de "se rompió": la visita no existe (link viejo, o la
      // propiedad se borró y la cascada se la llevó). Reintentar no la trae.
      if (res.status === 404) {
        setEstado('no-encontrada')
        return
      }
      // Sin este chequeo, un 401/500 devolvía JSON `{error}`, `json.data` era
      // `undefined` y `setVisit(undefined)` volvía al mismo "Cargando…" eterno.
      // OJO: hoy es REDUNDANTE con el `if (!json?.data)` de abajo — sacarlo no
      // rompe ningún test, porque ninguna respuesta de error trae `data`. Se
      // deja igual: nombra el status en el log (sin él, un 500 se investiga
      // como "no devolvió la visita") y no hace depender el camino de error de
      // la forma del cuerpo. Si algún día el guard de abajo se toca, este es
      // el que sigue cubriendo el 500.
      if (!res.ok) throw new Error(`GET /api/visits/${id} respondió ${res.status}`)
      const json = await res.json()
      if (!json?.data) throw new Error(`GET /api/visits/${id} no devolvió la visita`)
      setVisit(json.data)
      setEstado('ok')
    } catch (err) {
      // `res.json()` también lanza si el cuerpo no es JSON (el 504 con HTML del
      // gateway). Antes eso dejaba la promesa rechazada sin catch: mismo
      // "Cargando…" eterno, más un error mudo en consola.
      console.error(err)
      setEstado('error')
      return
    }
    // El cuestionario es accesorio: que falle no puede tumbar la ficha.
    try {
      const qr = await fetch(`/api/visits/${id}/questionnaire`)
      const qj = qr.ok ? await qr.json() : null
      setQuestionnaires(Array.isArray(qj?.data) ? qj.data : [])
    } catch (err) {
      console.error(err)
      setQuestionnaires([])
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * La visita llega como 'pending_confirmation' cuando la propuso el cliente desde
   * el recorrido. Recién al confirmarla pasa a 'scheduled' y habilita "¿Se realizó?".
   */
  async function confirmVisit() {
    setConfirming(true)
    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'scheduled' }),
      })
      if (!res.ok) throw new Error('No se pudo confirmar')
      toast.success('Visita confirmada')
      await load()
    } catch {
      toast.error('No pudimos confirmar la visita. Probá de nuevo.')
    } finally {
      setConfirming(false)
    }
  }

  async function sendQuestionnaire() {
    const res = await fetch(`/api/visits/${id}/send-questionnaire`, { method: 'POST' })
    if (res.ok) toast.success('Cuestionario enviado al cliente')
    else toast.error('No se pudo enviar (¿endpoint todavía no creado?)')
  }

  // Con la visita ya en pantalla, un recargado que falle NO la borra: se
  // conserva lo que hay (el `console.error` queda, y las acciones avisan por
  // su cuenta con un toast). El cartel de error es solo para cuando no hay nada
  // que mostrar.
  if (!visit) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        {/* El link de vuelta va ARRIBA del corte: antes vivía debajo y en el
            camino de error no se dibujaba nunca. */}
        <Button variant="ghost" asChild>
          <Link href="/visits">← Volver a visitas</Link>
        </Button>
        {estado === 'cargando' ? (
          <p className="p-6 text-muted-foreground">Cargando…</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <h2 className="text-lg font-medium">
                {estado === 'no-encontrada' ? 'No encontramos esta visita' : 'No pudimos cargar la visita'}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {estado === 'no-encontrada'
                  ? 'Puede que se haya cancelado, o que la propiedad ya no esté en el sistema. Si llegaste desde un mail viejo, el link puede haber quedado sin destino.'
                  : 'Puede ser un problema de conexión o un link mal formado. Probá de nuevo.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" onClick={() => void load()}>Reintentar</Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/visits">Ver todas las visitas</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <Button variant="ghost" asChild>
        <Link href="/visits">← Volver a visitas</Link>
      </Button>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{visit.property?.address}</h1>
          <p className="text-muted-foreground">{new Date(visit.scheduled_at).toLocaleString('es-AR')}</p>
        </div>
        <Badge>{STATUS_LABEL[visit.status] ?? visit.status}</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>
            <strong>{visit.client_name}</strong>
          </p>
          <p>{visit.client_email}</p>
          <p>{visit.client_phone}</p>
        </CardContent>
      </Card>

      {visit.status === 'pending_confirmation' && (
        <Card className="border-amber-300">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              El cliente propuso este día y esta franja desde el recorrido. Llamalo para
              cerrar el horario y, cuando esté acordado, confirmá la visita.
            </p>
            <Button onClick={confirmVisit} disabled={confirming}>
              {confirming ? 'Confirmando…' : 'Confirmar visita'}
            </Button>
          </CardContent>
        </Card>
      )}

      {visit.status === 'scheduled' && (
        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-2">
            <Button onClick={() => setCompleteOpen(true)}>¿Se realizó?</Button>
          </CardContent>
        </Card>
      )}

      {visit.status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Cuestionario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {questionnaires.length > 0 ? (
              <div className="space-y-2">
                {questionnaires.map((q) => (
                  <div key={q.id} className="border rounded p-3 space-y-1 text-sm">
                    <Badge>{q.response_source === 'client' ? 'Cliente' : 'Asesor'}</Badge>
                    <p>
                      ¿Le gustó? <strong>{q.liked === null ? '-' : q.liked ? 'Sí' : 'No'}</strong>
                    </p>
                    <p>Más le gustó: {q.most_liked ?? '-'}</p>
                    <p>Menos le gustó: {q.least_liked ?? '-'}</p>
                    <p>
                      ¿En precio? <strong>{q.in_price === null ? '-' : q.in_price ? 'Sí' : 'No'}</strong>
                    </p>
                    <p>Oferta hipotética: USD {q.hypothetical_offer ?? '-'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(q.responded_at).toLocaleString('es-AR')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin respuestas todavía</p>
            )}
            <Button onClick={sendQuestionnaire}>Enviar cuestionario al cliente</Button>
          </CardContent>
        </Card>
      )}

      <CompleteVisitDialog
        visitId={visit.id}
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        onCompleted={load}
      />
    </div>
  )
}
