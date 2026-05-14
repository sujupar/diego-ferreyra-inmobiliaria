'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Pause,
} from 'lucide-react'

interface Listing {
  id: string
  portal: 'mercadolibre' | 'argenprop' | 'zonaprop' | string
  status: string
  external_id: string | null
  external_url: string | null
  attempts: number
  last_published_at: string | null
  last_error: string | null
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
  properati: 'Properati',
  mudafy: 'Mudafy',
}

function statusBadge(status: string) {
  switch (status) {
    case 'published':
      return { icon: CheckCircle, color: 'bg-emerald-600/90 text-white', label: 'Publicado' }
    case 'publishing':
      return { icon: Clock, color: 'bg-blue-500 text-white', label: 'Publicando…' }
    case 'pending':
      return { icon: Clock, color: 'bg-amber-500 text-white', label: 'En cola' }
    case 'failed':
      return { icon: XCircle, color: 'bg-[color:var(--destructive)] text-white', label: 'Falló' }
    case 'disabled':
      return {
        icon: AlertTriangle,
        color: 'bg-gray-400 text-white',
        label: 'Esperando credenciales',
      }
    case 'paused':
      return { icon: Pause, color: 'bg-gray-500 text-white', label: 'Pausado' }
    default:
      return { icon: AlertTriangle, color: 'bg-gray-400 text-white', label: status }
  }
}

export function PortalListingsCard({ propertyId }: { propertyId: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/properties/${propertyId}/listings`)
      if (res.ok) {
        const { data } = await res.json()
        setListings(data ?? [])
      }
    } catch (err) {
      console.error('[portal-listings] load failed', err)
    }
  }

  useEffect(() => {
    load()
    // refresca cada 30s para mostrar transiciones de estado
    const handle = setInterval(load, 30000)
    return () => clearInterval(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  async function retry(listingId: string) {
    setRefreshing(listingId)
    try {
      await fetch(`/api/properties/${propertyId}/listings/${listingId}/retry`, {
        method: 'POST',
      })
      await load()
    } finally {
      setRefreshing(null)
    }
  }

  if (!listings) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base">Publicación en portales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {listings.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no se encoló ninguna publicación. Se activa al captarse la propiedad.
          </p>
        )}
        {listings.map(l => {
          const badge = statusBadge(l.status)
          const Icon = badge.icon
          return (
            <div
              key={l.id}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">{PORTAL_LABEL[l.portal] ?? l.portal}</span>
                {l.last_error && (
                  <span className="text-xs text-[color:var(--destructive)]">
                    {l.last_error.slice(0, 200)}
                  </span>
                )}
                {l.last_published_at && (
                  <span className="text-xs text-muted-foreground">
                    Publicado el {new Date(l.last_published_at).toLocaleString('es-AR')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${badge.color}`}>
                  <Icon className="h-3 w-3 mr-1" />
                  {badge.label}
                </Badge>
                {l.external_url && (
                  <a href={l.external_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" aria-label="Ver aviso en el portal">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                {l.status === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={refreshing === l.id}
                    onClick={() => retry(l.id)}
                    aria-label="Reintentar publicación"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${refreshing === l.id ? 'animate-spin' : ''}`}
                    />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
