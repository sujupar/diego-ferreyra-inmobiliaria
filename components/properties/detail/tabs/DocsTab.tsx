'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, Scale, Send } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LegalDocsChecklist } from '@/components/properties/LegalDocsChecklist'
import { envioDocumentacion, puedeRevisarDocumentacion } from '@/lib/properties/captacion'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  legalStatus: string
  /** `properties.legal_submitted_at`. Null = nunca se envió al abogado. */
  legalSubmittedAt: string | null
  legalNotes: string | null
  /** Ítems del checklist con archivo subido (`contarDocumentosCargados`). */
  documentosCargados: number
  /** Mandarle la documentación al abogado. Mismo camino que usa el aviso. */
  onSubmitReview: () => void
  /** Hay un envío en vuelo (lo maneja la página, que es la dueña del pedido). */
  enviando: boolean
  onUpdated: () => void
  onReviewed: () => void
}

export function DocsTab({
  propertyId, propertyType, docs, flags, isAbogado,
  legalStatus, legalSubmittedAt, legalNotes,
  documentosCargados, onSubmitReview, enviando, onUpdated, onReviewed,
}: Props) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const legalApproved = legalStatus === 'approved'
  const legalRejected = legalStatus === 'rejected'

  // El envío al abogado vive ACÁ, no colgado del aviso de la cabecera: ese
  // aviso muestra un solo paso por vez, así que el botón desaparecía en cuanto
  // ganaba otro paso (sin fotos → "Fotos pendientes") y una propiedad rechazada
  // leía "volvé a enviarla" sin que existiera el botón. Ver `envioDocumentacion`.
  const envio = envioDocumentacion({
    role: isAbogado ? 'abogado' : 'asesor',
    legalStatus,
    legalSubmittedAt,
    documentosCargados,
  })
  // Ya NO mira `properties.status`. Con la documentación fuera del camino
  // crítico de la captación, subir una foto pasa la propiedad a 'approved' — y
  // con la condición vieja (`status === 'pending_review'`) eso le sacaba al
  // abogado los botones de aprobar y rechazar en el medio de su revisión: la
  // propiedad desaparecía de su bandeja y su tarea quedaba abierta para siempre.
  const canReview = puedeRevisarDocumentacion({
    role: isAbogado ? 'abogado' : null,
    legalStatus,
    legalSubmittedAt,
  })

  async function review(approved: boolean) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes }),
      })
      if (!res.ok) throw new Error('Error')
      setNotes('')
      onReviewed()
    } catch {
      alert('Error al procesar revisión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Legales</p>
        <h2 className="display text-xl mt-1">Documentación</h2>
      </div>

      {(legalApproved || legalRejected) && (
        <Card className={legalApproved ? 'border-emerald-300' : 'border-red-300'}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              {legalApproved
                ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                : <XCircle className="h-5 w-5 text-[color:var(--destructive)]" />}
              <span className="font-medium">
                {legalApproved
                  ? (isAbogado ? 'Aprobaste esta propiedad' : 'Revisión legal aprobada')
                  : (isAbogado ? 'Rechazaste esta propiedad' : 'Rechazada en revisión legal')}
              </span>
            </div>
            {legalNotes && <p className="mt-2 text-sm text-muted-foreground">{legalNotes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Enviar (o volver a enviar) al abogado. Los tres estados quedan
          distinguibles: se puede mandar, todavía no hay nada que mandar, o ya
          está en manos del abogado. */}
      {envio !== 'oculto' && (
        <Card className={envio === 'reenviar' ? 'border-amber-300' : undefined}>
          <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">
                {envio === 'reenviar' ? 'Volver a enviar al abogado' : 'Enviar al abogado'}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {envio === 'sin-documentos'
                  ? 'Subí al menos un documento de la lista de abajo para poder mandárselo al abogado.'
                  : envio === 'reenviar'
                    ? 'Corregí lo observado y volvé a enviarla: la revisión se reabre.'
                    : `${documentosCargados} documento${documentosCargados === 1 ? '' : 's'} cargado${documentosCargados === 1 ? '' : 's'}. La propiedad se sigue difundiendo mientras el abogado revisa.`}
              </p>
            </div>
            <div className="shrink-0">
              <Button onClick={onSubmitReview} disabled={enviando || envio === 'sin-documentos'}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                {envio === 'reenviar' ? 'Volver a enviar' : 'Enviar a Revisión Legal'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ya está en manos del abogado: sin este renglón, cuando el aviso de la
          cabecera muestra otro paso (típico: faltan las fotos) el asesor no
          tiene forma de saber que la documentación ya se envió. */}
      {!isAbogado && envio === 'oculto' && !legalApproved && !legalRejected && legalSubmittedAt && (
        <p className="text-sm text-muted-foreground">
          La documentación está en revisión legal. Te avisamos cuando el abogado la resuelva.
        </p>
      )}

      {canReview && (
        <Card className="border-2 border-[color:var(--brand)]/40">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-[color:var(--brand)]" />
              <span className="display text-base">Revisión legal pendiente</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Revisá la documentación de abajo y aprobá o rechazá según corresponda.
            </p>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Observaciones (opcional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={() => review(true)} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Aprobar
              </Button>
              <Button onClick={() => review(false)} disabled={submitting} variant="destructive" className="flex-1" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <LegalDocsChecklist
        propertyId={propertyId}
        propertyType={propertyType}
        docs={docs}
        flags={flags}
        isAbogado={isAbogado}
        onUpdated={onUpdated}
      />
    </div>
  )
}
