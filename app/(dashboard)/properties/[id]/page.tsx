'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Upload, FileText, Image, CheckCircle, XCircle,
  Send, ArrowLeft, MapPin, Home, Scale, Camera, AlertTriangle,
  Archive, Trash2, RotateCcw
} from 'lucide-react'
import { LegalDocsChecklist } from '@/components/properties/LegalDocsChecklist'
import { LegalReviewHistory } from '@/components/properties/LegalReviewHistory'
import { PortalListingsCard } from '@/components/properties/PortalListingsCard'
import { PortalMetricsChart } from '@/components/properties/PortalMetricsChart'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pendiente Documentos', color: 'bg-amber-500' },
  pending_photos: { label: 'Pendiente Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision Legal', color: 'bg-purple-500' },
  approved: { label: 'Captación Completa', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
  descartada: { label: 'Descartada', color: 'bg-slate-500' },
}

interface PropertyData {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_area: number | null
  total_area: number | null
  asking_price: number
  currency: string
  commission_percentage: number
  contract_start_date: string | null
  contract_end_date: string | null
  origin: string | null
  status: string
  documents: Array<{ name: string; url: string }>
  photos: string[]
  legal_status: string
  legal_notes: string | null
  legal_reviewed_at: string | null
  created_at: string
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // User info for role-based actions
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [legalDocsData, setLegalDocsData] = useState<{ docs: LegalDocsState; flags: LegalFlags } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
  }, [])

  async function fetchProperty() {
    try {
      const res = await fetch(`/api/properties/${id}`)
      if (res.ok) {
        const { data } = await res.json()
        setProperty(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProperty() }, [id])

  async function fetchLegalDocs() {
    try {
      const res = await fetch(`/api/properties/${id}/legal-docs`)
      if (res.ok) {
        const { data } = await res.json()
        setLegalDocsData(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { fetchLegalDocs() }, [id])

  async function handleUpload(file: File, type: 'photo' | 'document') {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)

      const res = await fetch(`/api/properties/${id}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      await fetchProperty()
    } catch (err) {
      alert('Error al subir archivo')
    } finally {
      setUploading(false)
    }
  }

  async function handleUpdateStatus(newStatus: string) {
    setSubmitting(true)
    try {
      await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      await fetchProperty()
    } catch (err) {
      alert('Error al actualizar estado')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDiscard() {
    if (!confirm(`¿Descartar la propiedad "${property?.address}"?\n\nQueda guardada en el sistema (status="Descartada") y se puede restaurar cambiándola de estado, pero no avanza más en el flujo de captación.`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'descartada' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al descartar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRestore() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al restaurar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!property) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE la propiedad "${property.address}".\n\n` +
      `Esta acción no se puede deshacer. Se borran también sus publicaciones en portales, métricas, fotos, eventos legales y revisiones.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Error al eliminar')
        setSubmitting(false)
        return
      }
      router.push('/properties')
    } catch {
      alert('Error al eliminar')
      setSubmitting(false)
    }
  }

  async function handleReview(approved: boolean) {
    if (!userInfo?.id) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes: reviewNotes }),
      })
      if (!res.ok) throw new Error('Error')
      setReviewNotes('')
      await fetchProperty()
    } catch {
      alert('Error al procesar revisión')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!property) return <div className="text-center py-20"><p>Propiedad no encontrada</p></div>

  // Derive smart status label based on both status and legal_status
  const statusInfo = (() => {
    if (property.status === 'pending_review' && property.legal_status === 'approved') {
      return { label: 'Pendiente Fotos', color: 'bg-amber-500' }
    }
    return STATUS_LABELS[property.status] || { label: property.status, color: 'bg-gray-400' }
  })()
  const docs = Array.isArray(property.documents) ? property.documents : []
  const photos = property.photos || []
  const isAbogado = userInfo?.role === 'abogado'
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  const legalApproved = property.legal_status === 'approved'
  const legalRejected = property.legal_status === 'rejected'
  const legalPending = !legalApproved && !legalRejected
  const hasPhotos = photos.length > 0
  const isFullyApproved = legalApproved && hasPhotos
  const isDiscarded = property.status === 'descartada'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Propiedad</p>
          <h1 className="display text-3xl">{property.address}</h1>
          <p className="text-muted-foreground flex items-center gap-1 text-sm"><MapPin className="h-4 w-4" />{property.neighborhood}, {property.city}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="eyebrow">Estado</span>
          <Badge className={`text-white text-xs ${statusInfo.color}`}>{statusInfo.label}</Badge>
        </div>
      </div>

      {/* Dual-track Progress */}
      <Card>
        <CardContent className="py-4 space-y-3">
          {/* Track 1: Legal Review */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[color:var(--brand-soft)]/40 flex items-center justify-center">
                <Scale className="h-4 w-4 text-[color:var(--brand)]" />
              </div>
              <span className="text-sm font-medium">Revisión Legal</span>
            </div>
            {legalApproved ? (
              <Badge className="bg-emerald-600/90 text-white text-xs"><CheckCircle className="h-3 w-3 mr-1" />Aprobada</Badge>
            ) : legalRejected ? (
              <Badge className="bg-[color:var(--destructive)] text-white text-xs"><XCircle className="h-3 w-3 mr-1" />Rechazada</Badge>
            ) : property.status === 'pending_review' ? (
              <Badge className="bg-purple-500 text-white text-xs"><div className="h-2 w-2 rounded-full bg-white animate-pulse mr-1" />En revisión</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Pendiente envío</Badge>
            )}
          </div>

          {/* Track 2: Photos */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-amber-100/60 dark:bg-amber-950/30 flex items-center justify-center">
                <Camera className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <span className="text-sm font-medium">Fotos de la Propiedad</span>
            </div>
            {hasPhotos ? (
              <Badge className="bg-emerald-600/90 text-white text-xs"><CheckCircle className="h-3 w-3 mr-1" /><span className="tabular-n">{photos.length}</span> foto{photos.length !== 1 ? 's' : ''}</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Sin fotos</Badge>
            )}
          </div>

          {/* Overall Status */}
          <div className="border-t pt-3 mt-2">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Estado de Captación</span>
              {isFullyApproved ? (
                <Badge className="bg-emerald-700 text-white"><CheckCircle className="h-3.5 w-3.5 mr-1" />Captación Completa</Badge>
              ) : legalRejected ? (
                <Badge className="bg-[color:var(--destructive)] text-white">Documentación Rechazada</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-300">En proceso</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <div className={`grid grid-cols-1 ${isAbogado ? '' : 'lg:grid-cols-2'} gap-6`}>
        <Card>
          <CardHeader>
            <CardTitle className="display text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              Datos de la Propiedad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <span className="eyebrow">Dirección</span><span className="font-medium">{property.address}</span>
              <span className="eyebrow">Barrio</span><span>{property.neighborhood}</span>
              {property.city && <><span className="eyebrow">Ciudad</span><span>{property.city}</span></>}
              <span className="eyebrow">Tipo</span><span className="capitalize">{property.property_type}</span>
              {property.rooms && <><span className="eyebrow">Ambientes</span><span className="tabular-n">{property.rooms}</span></>}
              {property.bedrooms && <><span className="eyebrow">Dormitorios</span><span className="tabular-n">{property.bedrooms}</span></>}
              {property.bathrooms && <><span className="eyebrow">Baños</span><span className="tabular-n">{property.bathrooms}</span></>}
              {property.garages && <><span className="eyebrow">Cocheras</span><span className="tabular-n">{property.garages}</span></>}
              {property.covered_area && <><span className="eyebrow">Sup. Cubierta</span><span className="tabular-n">{property.covered_area} m²</span></>}
              {property.total_area && <><span className="eyebrow">Sup. Total</span><span className="tabular-n">{property.total_area} m²</span></>}
            </div>
          </CardContent>
        </Card>

        {/* Datos Comerciales: oculto al abogado */}
        {!isAbogado && (
          <Card>
            <CardHeader>
              <CardTitle className="display text-base">Datos Comerciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <span className="eyebrow">Precio</span>
                <span className="tabular-n text-base">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency, minimumFractionDigits: 0 }).format(property.asking_price)}</span>
                <span className="eyebrow">Comisión</span><span className="tabular-n">{property.commission_percentage}%</span>
                {property.contract_start_date && <><span className="eyebrow">Inicio contrato</span><span className="tabular-n">{property.contract_start_date}</span></>}
                {property.contract_end_date && <><span className="eyebrow">Fin contrato</span><span className="tabular-n">{property.contract_end_date}</span></>}
                {property.origin && <><span className="eyebrow">Origen</span><span className="capitalize">{property.origin}</span></>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Legal Docs Checklist */}
      <LegalDocsChecklist
        propertyId={property.id}
        propertyType={property.property_type || ''}
        docs={legalDocsData?.docs || {}}
        flags={legalDocsData?.flags || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }}
        isAbogado={isAbogado}
        onUpdated={fetchLegalDocs}
      />

      {/* Photos: oculto al abogado */}
      {!isAbogado && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg"><Image className="h-5 w-5 inline mr-2" />Fotos ({photos.length})</CardTitle>
              <div>
                <input ref={photoRef} type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'photo')} />
                <Button size="sm" variant="outline" onClick={() => photoRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                  Subir Foto
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fotos subidas.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {photos.map((url, i) => (
                  <img key={i} src={url} alt={`Foto ${i + 1}`} className="rounded-lg h-32 w-full object-cover" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Legal Review Result (for non-abogado when already reviewed) */}
      {!isAbogado && (legalApproved || legalRejected) && (
        <Card className={legalApproved ? 'border-green-300' : 'border-red-300'}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              {legalApproved ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              <span className="font-medium">{legalApproved ? 'Revisión legal aprobada' : 'Rechazada en revisión legal'}</span>
            </div>
            {property.legal_notes && <p className="mt-2 text-sm text-muted-foreground">{property.legal_notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* === ACTIONS === */}

      {/* Asesor: Send to legal review */}
      {!isAbogado && (property.status === 'pending_docs' || property.status === 'pending_photos') && docs.length > 0 && (
        <Button onClick={() => handleUpdateStatus('pending_review')} disabled={submitting} size="lg" className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
          Enviar a Revisión Legal
        </Button>
      )}

      {/* Asesor: Waiting for review */}
      {!isAbogado && property.status === 'pending_review' && legalPending && (
        <Card className="border-purple-300 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />
            <div>
              <p className="font-medium text-purple-900 dark:text-purple-100">En Revisión Legal</p>
              <p className="text-sm text-purple-700 dark:text-purple-300">La documentación fue enviada al abogado para su revisión.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abogado: Review action card */}
      {isAbogado && property.status === 'pending_review' && legalPending && (
        <Card className="border-2 border-purple-400">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-600" />
              Revisión Legal Pendiente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Revisa la documentación de esta propiedad y aprueba o rechaza según corresponda.
            </p>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Observaciones (opcional)..."
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={() => handleReview(true)} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Aprobar
              </Button>
              <Button onClick={() => handleReview(false)} disabled={submitting} variant="destructive" className="flex-1" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abogado: Already reviewed */}
      {isAbogado && (legalApproved || legalRejected) && (
        <Card className={legalApproved ? 'border-green-300 bg-green-50/50' : 'border-red-300 bg-red-50/50'}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              {legalApproved ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              <span className="font-medium">{legalApproved ? 'Aprobaste esta propiedad' : 'Rechazaste esta propiedad'}</span>
            </div>
            {property.legal_notes && <p className="mt-2 text-sm text-muted-foreground">{property.legal_notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Missing photos reminder */}
      {legalApproved && !hasPhotos && !isAbogado && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">Fotos pendientes</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">La revisión legal fue aprobada. Sube las fotos de la propiedad para completar la captación.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Track record histórico de revisión legal */}
      <LegalReviewHistory propertyId={property.id} />

      {/* Publicación en portales + métricas (visible una vez captada la propiedad) */}
      {!isAbogado && property.status === 'approved' && (
        <>
          <PortalListingsCard propertyId={property.id} />
          <PortalMetricsChart propertyId={property.id} />
        </>
      )}

      {/* Acciones de descarte y eliminación — oculto al abogado */}
      {!isAbogado && (
        <Card className={isDiscarded ? 'border-slate-300' : 'border-dashed border-muted-foreground/30'}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Acciones de archivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isDiscarded ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Esta propiedad está descartada. Podés restaurarla a borrador para volver a trabajarla, o eliminarla definitivamente.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleRestore} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    Restaurar a borrador
                  </Button>
                  {canHardDelete && (
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar definitivamente
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Descartar deja la propiedad guardada pero fuera del flujo activo. Eliminar la borra para siempre junto con sus publicaciones, métricas y eventos legales.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleDiscard} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Archive className="h-4 w-4 mr-1" />}
                    Descartar
                  </Button>
                  {canHardDelete && (
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar definitivamente
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
