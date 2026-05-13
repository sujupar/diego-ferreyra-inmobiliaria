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

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [visit, setVisit] = useState<PropertyVisitWithRelations | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireRow[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/visits/${id}`)
    const json = await res.json()
    setVisit(json.data)
    const qr = await fetch(`/api/visits/${id}/questionnaire`)
    if (qr.ok) {
      const qj = await qr.json()
      setQuestionnaires(Array.isArray(qj.data) ? qj.data : [])
    } else {
      setQuestionnaires([])
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function sendQuestionnaire() {
    const res = await fetch(`/api/visits/${id}/send-questionnaire`, { method: 'POST' })
    if (res.ok) toast.success('Cuestionario enviado al cliente')
    else toast.error('No se pudo enviar (¿endpoint todavía no creado?)')
  }

  if (!visit) return <div className="p-6">Cargando…</div>

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
        <Badge>{visit.status}</Badge>
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
