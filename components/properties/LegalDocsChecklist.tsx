'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
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
import { Upload, FileText, CheckCircle, XCircle, Loader2, Scale, ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import type { LegalDocsState, LegalFlags, DocItemState, LegalDocDefinition } from '@/types/legal-docs.types'
import { LEGAL_DOCS_CATALOG, getApplicableDocs, summarizeLegalDocs } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  onUpdated: () => void
}

/**
 * Punto de estado chico. Reemplaza al ícono de 36 px de la versión anterior:
 * con 7-12 documentos, esos círculos hacían que la sección ocupara pantallas.
 */
const STATUS_DOT: Record<DocItemState['status'], { className: string; label: string }> = {
  approved: { className: 'bg-emerald-500', label: 'Aprobado' },
  rejected: { className: 'bg-[color:var(--destructive)]', label: 'Rechazado' },
  pending: { className: 'bg-amber-500', label: 'En revisión' },
  missing: { className: 'bg-muted-foreground/30', label: 'Falta' },
}

function StatusDot({ status }: { status: DocItemState['status'] }) {
  const { className, label } = STATUS_DOT[status]
  return <span aria-label={label} title={label} className={`h-2.5 w-2.5 rounded-full shrink-0 ${className}`} />
}

/** Anillo de "N de M aprobados" — el dato ya lo calcula summarizeLegalDocs. */
function ProgressRing({ approved, total }: { approved: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((approved / total) * 100)
  return (
    <span
      aria-hidden
      className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center"
      style={{ background: `conic-gradient(var(--brand) 0 ${pct}%, var(--muted) ${pct}% 100%)` }}
    >
      <span className="h-8 w-8 rounded-full bg-card flex items-center justify-center text-[11px] font-semibold tabular-nums">
        {approved}/{total}
      </span>
    </span>
  )
}

export function LegalDocsChecklist({ propertyId, propertyType, docs, flags, isAbogado, onUpdated }: Props) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
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

  const summary = summarizeLegalDocs(docs, applicable.map(d => d.key))
  const summaryPill =
    summary.tone === 'bad' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
    summary.tone === 'warn' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'

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
    setUploadProgress(0)
    const sizeLabel = `${(file.size / 1024 / 1024).toFixed(1)} MB`
    const loadingToast = toast.loading(`Subiendo ${file.name} (${sizeLabel})…`)

    try {
      // 1) Pedir signed upload URL
      const initRes = await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type }),
      })
      const initData = await initRes.json().catch(() => ({}))
      if (!initRes.ok) {
        toast.error(initData?.error || 'No se pudo iniciar la subida', { id: loadingToast })
        return
      }
      const { signedUrl, path, token } = initData as { signedUrl: string; path: string; token: string }

      // 2) Upload directo a Storage con XHR para progreso real
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signedUrl, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'true')
        // Token también pasado como header por compat con SDK
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setUploadProgress(pct)
            toast.loading(`Subiendo ${file.name} — ${pct}%`, { id: loadingToast })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'Error de Storage'}`))
        }
        xhr.onerror = () => reject(new Error('Error de red durante el upload'))
        xhr.onabort = () => reject(new Error('Upload cancelado'))
        xhr.send(file)
      })

      // 3) Commit metadata
      const commitRes = await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}/upload-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, fileName: file.name }),
      })
      const commitData = await commitRes.json().catch(() => ({}))
      if (!commitRes.ok) {
        toast.error(commitData?.error || 'No se pudo registrar el documento', { id: loadingToast })
        return
      }

      onUpdated()
      toast.success(`Documento subido (${sizeLabel}) — en revisión`, { id: loadingToast })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir el documento', { id: loadingToast })
    } finally {
      setUploadingKey(null)
      setUploadProgress(0)
    }
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

    return (
      <div key={def.key} className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-card">
        <StatusDot status={state.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium">{def.label}</span>
            {def.category === 'mandatory' && <span className="eyebrow">Obligatorio</span>}
            {state.status === 'rejected' && <Badge variant="destructive" className="text-[10px] h-4">Rechazado</Badge>}
          </div>
          {hasFile && (
            <a href={state.file_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5">
              <FileText className="h-3 w-3" />{state.file_name}
            </a>
          )}
          {state.reviewer_notes && (
            <p className={`text-xs mt-0.5 ${state.status === 'rejected' ? 'text-red-700' : 'text-muted-foreground'}`}>
              <span className="font-semibold">Abogado: </span>{state.reviewer_notes}
            </p>
          )}
        </div>

        {!isAbogado && (
          <>
            <input
              ref={el => { fileInputs.current[def.key] = el }}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.tif,.tiff"
              onChange={e => e.target.files?.[0] && handleUpload(def.key, e.target.files[0])}
            />
            <Button
              size="sm"
              variant={hasFile ? 'ghost' : 'outline'}
              onClick={() => fileInputs.current[def.key]?.click()}
              disabled={uploadingKey === def.key}
              className="shrink-0 gap-1 tabular-nums"
            >
              {uploadingKey === def.key
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{uploadProgress > 0 ? `${uploadProgress}%` : '…'}</>
                : <><Upload className="h-3.5 w-3.5" />{hasFile ? 'Reemplazar' : 'Subir'}</>}
            </Button>
          </>
        )}

        {canReview && (
          <div className="shrink-0 flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="border-[color:var(--brand)]/30 text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/40 hover:text-[color:var(--brand)]"
              onClick={() => handleReviewItem(def.key, true)}
              disabled={reviewingKey === def.key}
              aria-label={`Aprobar ${def.label}`}
            >
              {reviewingKey === def.key
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-[color:var(--destructive)]/80 hover:bg-red-50 hover:text-[color:var(--destructive)]"
              onClick={() => openRejectDialog(def.key, def.label)}
              disabled={reviewingKey === def.key}
              aria-label={`Rechazar ${def.label}`}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  /** Separador de una línea. Antes cada grupo era una Card con CardHeader. */
  const group = (title: string, items: LegalDocDefinition[], emptyCopy?: string) => {
    if (items.length === 0 && !emptyCopy) return null
    return (
      <div className="space-y-1.5">
        <p className="eyebrow pt-1">{title}</p>
        {items.length === 0
          ? <p className="text-xs text-muted-foreground italic">{emptyCopy}</p>
          : items.map(renderItem)}
      </div>
    )
  }

  return (
    <>
      <Collapsible defaultOpen={summary.tone !== 'ok'} className="rounded-2xl border bg-card">
        <CollapsibleTrigger asChild>
          <button className="group w-full flex items-center gap-3 px-5 py-4 text-left">
            <span className="h-9 w-9 rounded-full bg-[color:var(--brand-soft)]/40 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-[color:var(--brand)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="eyebrow block">Documentación</span>
              <span className="display text-base">Checklist legal</span>
            </span>
            <ProgressRing approved={summary.approved} total={summary.total} />
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${summaryPill}`}>{summary.label}</span>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4">
            {/* Flags condicionales (solo asesor puede cambiar) */}
            {!isAbogado && (
              <div>
                <p className="eyebrow mb-2">Situación jurídica</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['has_succession', 'Sucesión'],
                    ['has_divorce', 'Divorcio'],
                    ['has_powers', 'Poderes'],
                    ['is_credit_purchase', 'Compra a crédito'],
                  ] as Array<[keyof LegalFlags, string]>).map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer transition ${
                        flags[key] ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]/30 font-medium' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={flags[key]}
                        onChange={e => handleFlagChange(key, e.target.checked)}
                        disabled={savingFlags}
                        className="h-3.5 w-3.5 rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {group('Obligatorios', mandatory, 'No hay documentos obligatorios para este tipo de propiedad.')}
            {group('Temporales (con vencimiento)', temporal)}
            {group('Opcionales', optional)}
          </div>
        </CollapsibleContent>
      </Collapsible>

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
