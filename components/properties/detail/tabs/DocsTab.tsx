'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, Scale } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LegalDocsChecklist } from '@/components/properties/LegalDocsChecklist'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  status: string
  legalStatus: string
  legalNotes: string | null
  onUpdated: () => void
  onReviewed: () => void
}

export function DocsTab({
  propertyId, propertyType, docs, flags, isAbogado,
  status, legalStatus, legalNotes, onUpdated, onReviewed,
}: Props) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const legalApproved = legalStatus === 'approved'
  const legalRejected = legalStatus === 'rejected'
  const canReview = isAbogado && status === 'pending_review' && !legalApproved && !legalRejected

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
