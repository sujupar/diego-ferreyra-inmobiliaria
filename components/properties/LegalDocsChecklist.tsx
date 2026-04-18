'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react'
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

export function LegalDocsChecklist({ propertyId, propertyType, docs, flags, isAbogado, onUpdated }: Props) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [savingFlags, setSavingFlags] = useState(false)
  const [reviewingKey, setReviewingKey] = useState<string | null>(null)
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

  const renderItem = (def: LegalDocDefinition) => {
    const state: DocItemState = docs[def.key] || { status: 'missing' }
    const hasFile = !!state.file_url
    const canReview = isAbogado && hasFile && (state.status === 'pending' || state.status === 'rejected')
    return (
      <div key={def.key} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
        <div className="shrink-0">
          {state.status === 'approved' && <CheckCircle className="h-5 w-5 text-green-600" />}
          {state.status === 'rejected' && <XCircle className="h-5 w-5 text-red-600" />}
          {state.status === 'pending' && <Clock className="h-5 w-5 text-amber-500" />}
          {state.status === 'missing' && <AlertTriangle className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{def.label}</span>
            {def.category === 'mandatory' && <Badge variant="destructive" className="text-xs">Obligatorio</Badge>}
            {def.category === 'temporal' && <Badge className="text-xs bg-amber-500">Temporal</Badge>}
            {def.category === 'optional' && <Badge variant="secondary" className="text-xs">Opcional</Badge>}
            {state.status === 'rejected' && <Badge variant="destructive" className="text-xs">Rechazado</Badge>}
            {state.status === 'approved' && <Badge className="text-xs bg-green-600">Aprobado</Badge>}
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
            >
              {uploadingKey === def.key
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Upload className="h-3.5 w-3.5 mr-1" />{hasFile ? 'Reemplazar' : 'Subir'}</>
              }
            </Button>
          </div>
        )}
        {canReview && (
          <div className="shrink-0 flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="text-green-700 border-green-300"
              onClick={() => handleReviewItem(def.key, true)}
              disabled={reviewingKey === def.key}
            >
              {reviewingKey === def.key
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300"
              onClick={() => {
                const note = prompt('Motivo del rechazo (requerido):')
                if (note) handleReviewItem(def.key, false, note)
              }}
              disabled={reviewingKey === def.key}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Flags condicionales (solo asesor puede cambiar) */}
      {!isAbogado && (
        <Card>
          <CardHeader><CardTitle className="text-base">Situación Jurídica</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_succession} onChange={e => handleFlagChange('has_succession', e.target.checked)} disabled={savingFlags} />
              ¿Hay sucesión?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_divorce} onChange={e => handleFlagChange('has_divorce', e.target.checked)} disabled={savingFlags} />
              ¿Hay divorcio?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_powers} onChange={e => handleFlagChange('has_powers', e.target.checked)} disabled={savingFlags} />
              ¿Hay poderes?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.is_credit_purchase} onChange={e => handleFlagChange('is_credit_purchase', e.target.checked)} disabled={savingFlags} />
              ¿Compra a crédito?
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Documentos Obligatorios</CardTitle></CardHeader>
        <CardContent className="space-y-2">{mandatory.map(renderItem)}</CardContent>
      </Card>

      {temporal.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Documentos Temporales (con alerta)</CardTitle></CardHeader>
          <CardContent className="space-y-2">{temporal.map(renderItem)}</CardContent>
        </Card>
      )}

      {optional.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Documentos Opcionales</CardTitle></CardHeader>
          <CardContent className="space-y-2">{optional.map(renderItem)}</CardContent>
        </Card>
      )}
    </div>
  )
}

// Keep catalog export convenience
export { LEGAL_DOCS_CATALOG }
