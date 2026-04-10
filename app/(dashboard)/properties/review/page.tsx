'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, FileText, Image, MapPin, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ReviewProperty {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  asking_price: number
  currency: string
  documents: Array<{ name: string; url: string }>
  photos: string[]
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  covered_area: number | null
  created_at: string
}

export default function PropertyReviewPage() {
  const [properties, setProperties] = useState<ReviewProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    // Get current user ID
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))

    fetch('/api/properties?status=pending_review')
      .then(r => r.json())
      .then(({ data }) => setProperties(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  async function handleReview(id: string, approved: boolean) {
    if (!userId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, reviewer_id: userId, notes }),
      })
      if (!res.ok) throw new Error('Error')
      setProperties(prev => prev.filter(p => p.id !== id))
      setReviewingId(null)
      setNotes('')
    } catch {
      alert('Error al procesar revision')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6" /> Revision Legal
        </h1>
        <p className="text-muted-foreground">{properties.length} propiedad{properties.length !== 1 ? 'es' : ''} pendiente{properties.length !== 1 ? 's' : ''} de revision</p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">Todo al dia</h3>
            <p className="text-sm text-muted-foreground">No hay propiedades pendientes de revision.</p>
          </CardContent>
        </Card>
      ) : (
        properties.map(prop => (
          <Card key={prop.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{prop.address}</CardTitle>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {prop.neighborhood}, {prop.city}
                  </p>
                </div>
                <Badge className="bg-purple-500 text-white">Pendiente Revision</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Property info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> <span className="capitalize">{prop.property_type}</span></div>
                <div><span className="text-muted-foreground">Precio:</span> {new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency, minimumFractionDigits: 0 }).format(prop.asking_price)}</div>
                {prop.rooms && <div><span className="text-muted-foreground">Ambientes:</span> {prop.rooms}</div>}
                {prop.covered_area && <div><span className="text-muted-foreground">Superficie:</span> {prop.covered_area} m2</div>}
              </div>

              {/* Documents */}
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><FileText className="h-4 w-4" /> Documentos ({prop.documents?.length || 0})</h4>
                {(prop.documents || []).length > 0 ? (
                  <ul className="space-y-1">
                    {prop.documents.map((doc, i) => (
                      <li key={i}><a href={doc.url} target="_blank" rel="noopener" className="text-sm text-blue-600 hover:underline">{doc.name}</a></li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Sin documentos</p>}
              </div>

              {/* Photos */}
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Image className="h-4 w-4" /> Fotos ({prop.photos?.length || 0})</h4>
                {(prop.photos || []).length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {prop.photos.map((url, i) => (
                      <img key={i} src={url} alt="" className="rounded h-20 w-full object-cover" />
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sin fotos</p>}
              </div>

              {/* Review actions */}
              {reviewingId === prop.id ? (
                <div className="space-y-3 border-t pt-4">
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Observaciones (opcional)..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => handleReview(prop.id, true)} disabled={submitting} className="bg-green-600 hover:bg-green-700">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Aprobar
                    </Button>
                    <Button onClick={() => handleReview(prop.id, false)} disabled={submitting} variant="destructive">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Rechazar
                    </Button>
                    <Button variant="ghost" onClick={() => { setReviewingId(null); setNotes('') }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4">
                  <Button onClick={() => setReviewingId(prop.id)}>
                    <Scale className="h-4 w-4 mr-1" /> Revisar esta propiedad
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
