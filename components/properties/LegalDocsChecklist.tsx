'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Loader2, Scale, FileCheck2, CalendarClock, FilePlus2 } from 'lucide-react'
import type { LegalDocsState, LegalFlags, DocItemState, LegalDocDefinition } from '@/types/legal-docs.types'
import { LEGAL_DOCS_CATALOG, getApplicableDocs } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  onUpdated: () => void
}

// Colored status icon wrapper — muted editorial palette
function StatusIcon({ status }: { status: DocItemState['status'] }) {
  const configs: Record<DocItemState['status'], { icon: any; bg: string; fg: string }> = {
    approved: { icon: CheckCircle, bg: 'bg-emerald-50 dark:bg-emerald-950/30', fg: 'text-emerald-700 dark:text-emerald-400' },
    rejected: { icon: XCircle, bg: 'bg-red-50 dark:bg-red-950/30', fg: 'text-[color:var(--destructive)]' },
    pending: { icon: Clock, bg: 'bg-amber-50 dark:bg-amber-950/30', fg: 'text-amber-700 dark:text-amber-400' },
    missing: { icon: AlertTriangle, bg: 'bg-muted/60', fg: 'text-muted-foreground' },
  }
  const { icon: Icon, bg, fg } = configs[status]
  return (
    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      <Icon className={`h-5 w-5 ${fg}`} />
    </div>
  )
}

export function LegalDocsChecklist({ propertyId, propertyType, docs, flags, isAbogado, onUpdated }: Props) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [savingFlags, setSavingFlags] = useState(false)
  const [reviewingKey, setReviewingKey] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; itemKey: string; label: string; notes: string }>(
    { open: false, itemKey: '', label: '', notes: '' }
  )
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const applicable = getApplicableDocs(flags, propertyType)
  const mandatory = applicable.filter(d => d.category === 'mandatory')
  const temporal = applicable.filter(d => d.category === 'temporal')
  const optional = applicable.filter(d => d.category === 'optional')

  async function handleFlagChange(flag: keyof LegalFlags, value: boolean) {
    setSavingFlags(true)
    try {
      await fetch(`/api/properties/${propertyId}/legal-docs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: { [flag]: value } }),
      })
      onUpdated()
    } finally { setSavingFlags(false) }
  }

  async function handleUpload(itemKey: string, file: File) {
    setUploadingKey(itemKey)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}`, { method: 'POST', body: fd })
      onUpdated()
    } finally { setUploadingKey(null) }
  }

  async function handleReviewItem(itemKey: string, approved: boolean, notes?: string) {
    setReviewingKey(itemKey)
    try {
      await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes }),
      })
      onUpdated()
    } finally { setReviewingKey(null) }
  }

  function openRejectDialog(itemKey: string, label: string) {
    setRejectDialog({ open: true, itemKey, label, notes: '' })
  }

  async function confirmReject() {
    if (!rejectDialog.notes.trim()) return
    const { itemKey, notes } = rejectDialog
    setRejectDialog(prev => ({ ...prev, open: false }))
    await handleReviewItem(itemKey, false, notes.trim())
  }

  const renderItem = (def: LegalDocDefinition) => {
    const state: DocItemState = docs[def.key] || { status: 'missing' }
    const hasFile = !!state.file_url
    const canReview = isAbogado && hasFile && (state.status === 'pending' || state.status === 'rejected')

    // Subtle background tint based on status — muted editorial palette
    const statusTint =
      state.status === 'approved' ? 'border-emerald-200/70 bg-emerald-50/30 dark:bg-emerald-950/15' :
      state.status === 'rejected' ? 'border-red-200/70 bg-red-50/30 dark:bg-red-950/15' :
      state.status === 'pending' ? 'border-amber-200/70 bg-amber-50/25 dark:bg-amber-950/15' :
      'border-border bg-card'

    return (
      <div
        key={def.key}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 hover:shadow-sm ${statusTint}`}
      >
        <StatusIcon status={state.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{def.label}</span>
            {def.category === 'mandatory' && <Badge variant="destructive" className="text-xs">Obligatorio</Badge>}
            {def.category === 'temporal' && <Badge className="text-xs bg-amber-500 hover:bg-amber-500/90">Temporal</Badge>}
            {def.category === 'optional' && <Badge variant="secondary" className="text-xs">Opcional</Badge>}
            {state.status === 'rejected' && <Badge variant="destructive" className="text-xs">Rechazado</Badge>}
            {state.status === 'approved' && <Badge className="text-xs bg-green-600 hover:bg-green-600/90">Aprobado</Badge>}
          </div>
          {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
          {hasFile && (
            <a href={state.file_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
              <FileText className="h-3 w-3" /> {state.file_name}
            </a>
          )}
          {state.reviewer_notes && (
            <p className={`text-xs mt-1 ${state.status === 'rejected' ? 'text-red-700' : 'text-muted-foreground'}`}>
              <span className="font-semibold">Abogado: </span>{state.reviewer_notes}
            </p>
          )}
        </div>
        {!isAbogado && (
          <div className="shrink-0">
            <input
              ref={el => { fileInputs.current[def.key] = el }}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.png"
              onChange={e => e.target.files?.[0] && handleUpload(def.key, e.target.files[0])}
            />
            <Button
              size="sm"
              variant={hasFile ? 'outline' : 'default'}
              onClick={() => fileInputs.current[def.key]?.click()}
              disabled={uploadingKey === def.key}
              className="gap-1"
            >
              {uploadingKey === def.key
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Upload className="h-3.5 w-3.5" />{hasFile ? 'Reemplazar' : 'Subir'}</>
              }
            </Button>
          </div>
        )}
        {canReview && (
          <div className="shrink-0 flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="border-[color:var(--brass)]/30 text-[color:var(--brass)] hover:bg-[color:var(--brass-soft)]/40 hover:text-[color:var(--brass)] transition-all duration-200"
              onClick={() => handleReviewItem(def.key, true)}
              disabled={reviewingKey === def.key}
              aria-label="Aprobar documento"
            >
              {reviewingKey === def.key
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-[color:var(--destructive)]/80 hover:bg-red-50 hover:text-[color:var(--destructive)] transition-all duration-200"
              onClick={() => openRejectDialog(def.key, def.label)}
              disabled={reviewingKey === def.key}
              aria-label="Rechazar documento"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Consistent card + header styling — editorial
  const sectionCard = (icon: any, title: string, eyebrowLabel: string, items: LegalDocDefinition[], emptyCopy?: string) => {
    const Icon = icon
    return (
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader>
          <div className="space-y-1">
            <p className="eyebrow">{eyebrowLabel}</p>
            <CardTitle className="display text-base flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {title}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0
            ? <p className="text-xs text-muted-foreground italic">{emptyCopy || 'No hay documentos en esta sección.'}</p>
            : items.map(renderItem)}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Flags condicionales (solo asesor puede cambiar) */}
        {!isAbogado && (
          <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
            <CardHeader>
              <div className="space-y-1">
                <p className="eyebrow">Contexto</p>
                <CardTitle className="display text-base flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  Situación Jurídica
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/50">
                <input type="checkbox" checked={flags.has_succession} onChange={e => handleFlagChange('has_succession', e.target.checked)} disabled={savingFlags} className="h-4 w-4 rounded" />
                ¿Hay sucesión?
              </label>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/50">
                <input type="checkbox" checked={flags.has_divorce} onChange={e => handleFlagChange('has_divorce', e.target.checked)} disabled={savingFlags} className="h-4 w-4 rounded" />
                ¿Hay divorcio?
              </label>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/50">
                <input type="checkbox" checked={flags.has_powers} onChange={e => handleFlagChange('has_powers', e.target.checked)} disabled={savingFlags} className="h-4 w-4 rounded" />
                ¿Hay poderes?
              </label>
              <label className="flex items-center gap-2 cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/50">
                <input type="checkbox" checked={flags.is_credit_purchase} onChange={e => handleFlagChange('is_credit_purchase', e.target.checked)} disabled={savingFlags} className="h-4 w-4 rounded" />
                ¿Compra a crédito?
              </label>
            </CardContent>
          </Card>
        )}

        {sectionCard(FileCheck2, 'Documentos Obligatorios', 'Obligatorios', mandatory, 'No hay documentos obligatorios para este tipo de propiedad.')}

        {temporal.length > 0 && sectionCard(CalendarClock, 'Documentos Temporales (con alerta)', 'Temporales', temporal)}

        {optional.length > 0 && sectionCard(FilePlus2, 'Documentos Opcionales', 'Opcionales', optional)}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar documento</DialogTitle>
            <DialogDescription>
              {rejectDialog.label} — indicá el motivo para que el asesor pueda corregirlo.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Ej: La escritura está vencida, falta firma del titular, etc."
            value={rejectDialog.notes}
            onChange={e => setRejectDialog(prev => ({ ...prev, notes: e.target.value }))}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(prev => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectDialog.notes.trim() || reviewingKey === rejectDialog.itemKey}
              className="gap-1"
            >
              {reviewingKey === rejectDialog.itemKey
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <XCircle className="h-4 w-4" />}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Keep catalog export convenience
export { LEGAL_DOCS_CATALOG }
