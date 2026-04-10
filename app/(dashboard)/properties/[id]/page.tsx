'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, FileText, Image, CheckCircle, XCircle, Send, ArrowLeft, MapPin, Home } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pendiente Documentos', color: 'bg-amber-500' },
  pending_photos: { label: 'Pendiente Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision Legal', color: 'bg-purple-500' },
  approved: { label: 'Aprobada', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!property) return <div className="text-center py-20"><p>Propiedad no encontrada</p></div>

  const statusInfo = STATUS_LABELS[property.status] || { label: property.status, color: 'bg-gray-400' }
  const docs = Array.isArray(property.documents) ? property.documents : []
  const photos = property.photos || []

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{property.address}</h1>
          <p className="text-muted-foreground flex items-center gap-1"><MapPin className="h-4 w-4" />{property.neighborhood}, {property.city}</p>
        </div>
        <Badge className={`text-white ${statusInfo.color}`}>{statusInfo.label}</Badge>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {['pending_docs', 'pending_photos', 'pending_review', 'approved'].map((step, i) => {
              const stepInfo = STATUS_LABELS[step]
              const isActive = property.status === step
              const isPast = ['pending_docs', 'pending_photos', 'pending_review', 'approved', 'active'].indexOf(property.status) > i
              return (
                <div key={step} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isActive ? `${stepInfo.color} text-white` : isPast ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                    {isPast && !isActive && <CheckCircle className="h-3.5 w-3.5" />}
                    {stepInfo.label}
                  </div>
                  {i < 3 && <div className="w-6 h-0.5 bg-muted" />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg"><Home className="h-5 w-5 inline mr-2" />Datos de la Propiedad</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Tipo:</span><span className="capitalize">{property.property_type}</span>
              {property.rooms && <><span className="text-muted-foreground">Ambientes:</span><span>{property.rooms}</span></>}
              {property.bedrooms && <><span className="text-muted-foreground">Dormitorios:</span><span>{property.bedrooms}</span></>}
              {property.bathrooms && <><span className="text-muted-foreground">Banos:</span><span>{property.bathrooms}</span></>}
              {property.garages && <><span className="text-muted-foreground">Cocheras:</span><span>{property.garages}</span></>}
              {property.covered_area && <><span className="text-muted-foreground">Sup. Cubierta:</span><span>{property.covered_area} m2</span></>}
              {property.total_area && <><span className="text-muted-foreground">Sup. Total:</span><span>{property.total_area} m2</span></>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Datos Comerciales</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Precio:</span>
              <span className="font-bold">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency, minimumFractionDigits: 0 }).format(property.asking_price)}</span>
              <span className="text-muted-foreground">Comision:</span><span>{property.commission_percentage}%</span>
              {property.contract_start_date && <><span className="text-muted-foreground">Inicio contrato:</span><span>{property.contract_start_date}</span></>}
              {property.contract_end_date && <><span className="text-muted-foreground">Fin contrato:</span><span>{property.contract_end_date}</span></>}
              {property.origin && <><span className="text-muted-foreground">Origen:</span><span className="capitalize">{property.origin}</span></>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg"><FileText className="h-5 w-5 inline mr-2" />Documentacion ({docs.length})</CardTitle>
            <div>
              <input ref={docRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'document')} />
              <Button size="sm" variant="outline" onClick={() => docRef.current?.click()} disabled={uploading || property.status === 'approved'}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Subir Documento
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay documentos subidos.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((doc, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <a href={doc.url} target="_blank" rel="noopener" className="hover:underline text-blue-600">{doc.name}</a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg"><Image className="h-5 w-5 inline mr-2" />Fotos ({photos.length})</CardTitle>
            <div>
              <input ref={photoRef} type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'photo')} />
              <Button size="sm" variant="outline" onClick={() => photoRef.current?.click()} disabled={uploading || property.status === 'approved'}>
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

      {/* Legal Review Result */}
      {property.legal_status !== 'pending' && (
        <Card className={property.legal_status === 'approved' ? 'border-green-300' : 'border-red-300'}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              {property.legal_status === 'approved' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              <span className="font-medium">{property.legal_status === 'approved' ? 'Aprobada por revision legal' : 'Rechazada en revision legal'}</span>
            </div>
            {property.legal_notes && <p className="mt-2 text-sm text-muted-foreground">{property.legal_notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {property.status === 'pending_docs' && docs.length > 0 && (
          <Button onClick={() => handleUpdateStatus('pending_photos')} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Documentos completos - Avanzar a Fotos
          </Button>
        )}
        {property.status === 'pending_photos' && photos.length > 0 && (
          <Button onClick={() => handleUpdateStatus('pending_review')} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            <Send className="h-4 w-4 mr-1" /> Enviar a Revision Legal
          </Button>
        )}
      </div>
    </div>
  )
}
