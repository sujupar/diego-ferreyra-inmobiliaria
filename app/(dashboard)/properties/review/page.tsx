'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, FileText, Image, MapPin, Scale, ChevronRight } from 'lucide-react'

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
  covered_area: number | null
  created_at: string
}

export default function PropertyReviewPage() {
  const [properties, setProperties] = useState<ReviewProperty[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/properties?status=pending_review')
      .then(r => r.json())
      .then(({ data }) => setProperties(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6" /> Revisión Legal
        </h1>
        <p className="text-muted-foreground">{properties.length} propiedad{properties.length !== 1 ? 'es' : ''} pendiente{properties.length !== 1 ? 's' : ''} de revisión</p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">Todo al día</h3>
            <p className="text-sm text-muted-foreground">No hay propiedades pendientes de revisión.</p>
          </CardContent>
        </Card>
      ) : (
        properties.map(prop => (
          <Link key={prop.id} href={`/properties/${prop.id}`}>
            <Card className="overflow-hidden hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="py-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{prop.address}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3.5 w-3.5" /> {prop.neighborhood}, {prop.city}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-500 text-white">Pendiente Revisión</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="capitalize">{prop.property_type}</span>
                  <span>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency, minimumFractionDigits: 0 }).format(prop.asking_price)}</span>
                  {prop.rooms && <span>{prop.rooms} amb.</span>}
                  {prop.covered_area && <span>{prop.covered_area} m²</span>}
                  <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{prop.documents?.length || 0} docs</span>
                  <span className="flex items-center gap-1"><Image className="h-3.5 w-3.5" />{prop.photos?.length || 0} fotos</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  )
}
