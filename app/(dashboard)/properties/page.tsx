'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Calendar, Loader2 } from 'lucide-react'
import { getAppraisals, AppraisalSummary } from '@/lib/supabase/appraisals'

function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<AppraisalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    getAppraisals(1, 50)
      .then(({ data, count }) => {
        setProperties(data)
        setTotalCount(count)
      })
      .catch(err => console.error('Error loading properties:', err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            {totalCount} propiedad{totalCount !== 1 ? 'es' : ''} tasada{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin propiedades</h3>
            <p className="text-sm text-muted-foreground">
              Las propiedades aparecen aqui cuando se realizan tasaciones.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-medium text-muted-foreground">Propiedad</th>
                <th className="pb-3 font-medium text-muted-foreground">Ubicacion</th>
                <th className="pb-3 text-right font-medium text-muted-foreground">Precio Publicacion</th>
                <th className="pb-3 text-right font-medium text-muted-foreground">Comparables</th>
                <th className="pb-3 text-right font-medium text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {properties.map(prop => (
                <tr key={prop.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      {prop.property_images?.[0] ? (
                        <img
                          src={prop.property_images[0]}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium truncate max-w-[250px]">
                        {prop.property_title || 'Sin titulo'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{prop.property_location}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-medium">
                    {formatCurrency(prop.publication_price, prop.currency || 'USD')}
                  </td>
                  <td className="py-3 text-right">
                    <Badge variant="secondary">{prop.comparable_count}</Badge>
                  </td>
                  <td className="py-3 text-right text-muted-foreground">
                    <div className="flex items-center justify-end gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(prop.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
