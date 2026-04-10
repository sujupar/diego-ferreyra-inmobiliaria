'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, MapPin, Calendar, Loader2, ChevronRight } from 'lucide-react'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pend. Docs', color: 'bg-amber-500' },
  pending_photos: { label: 'Pend. Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision', color: 'bg-purple-500' },
  approved: { label: 'Aprobada', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
}

interface Property {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  asking_price: number
  currency: string
  status: string
  origin: string | null
  photos: string[]
  created_at: string
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')

  useEffect(() => {
    const url = filterStatus ? `/api/properties?status=${filterStatus}` : '/api/properties'
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then(({ data }) => setProperties(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [filterStatus])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">{properties.length} propiedad{properties.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link href="/properties/new">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Propiedad</Button>
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={filterStatus === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus('')}>Todas</Button>
        {Object.entries(STATUS_INFO).map(([key, info]) => (
          <Button key={key} variant={filterStatus === key ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(key)}>
            {info.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin propiedades</h3>
            <p className="text-sm text-muted-foreground mb-4">Crea tu primera propiedad captada.</p>
            <Link href="/properties/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Propiedad</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {properties.map(prop => {
            const statusInfo = STATUS_INFO[prop.status] || { label: prop.status, color: 'bg-gray-400' }
            return (
              <Link key={prop.id} href={`/properties/${prop.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    {prop.photos?.[0] ? (
                      <img src={prop.photos[0]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{prop.address}</span>
                        <Badge className={`text-xs text-white ${statusInfo.color}`}>{statusInfo.label}</Badge>
                        {prop.origin && <Badge variant="secondary" className="text-xs capitalize">{prop.origin}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{prop.neighborhood}</span>
                        <span className="capitalize">{prop.property_type}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(prop.created_at)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(prop.asking_price, prop.currency)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
