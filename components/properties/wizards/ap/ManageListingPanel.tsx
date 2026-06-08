'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, ExternalLink, Play, Trash2, Building2 } from 'lucide-react'
import type { ApListing } from './types'

export function ManageListingPanel({
  listing,
  propertyAddress,
  propertyTitle,
  managing,
  onAction,
  onBackToDetail,
}: {
  listing: ApListing
  propertyAddress: string
  propertyTitle: string | null
  managing: 'baja' | 'republish' | null
  onAction: (action: 'baja' | 'republish') => void
  onBackToDetail: () => void
}) {
  const statusInfo = {
    published: { label: 'Activo y visible', color: 'bg-emerald-600' },
    paused: { label: 'Dado de baja', color: 'bg-amber-500' },
    failed: { label: 'Error', color: 'bg-red-500' },
    publishing: { label: 'Publicando…', color: 'bg-blue-500' },
    pending: { label: 'En cola', color: 'bg-blue-500' },
  }[listing.status] ?? { label: listing.status, color: 'bg-gray-400' }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[color:var(--brand)]" />
              Aviso en Argenprop
            </span>
            <Badge className={`${statusInfo.color} text-white text-[10px] h-5`}>{statusInfo.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
            <p><strong>{propertyTitle ?? propertyAddress}</strong></p>
            <p className="text-muted-foreground text-xs">
              ID del aviso: <code className="text-foreground">{listing.external_id}</code>
            </p>
            {listing.last_published_at && (
              <p className="text-muted-foreground text-xs">
                Publicado: {new Date(listing.last_published_at).toLocaleString('es-AR')}
              </p>
            )}
            {listing.last_error && <p className="text-amber-700 text-xs mt-2">⚠ {listing.last_error}</p>}
            {listing.external_url && (
              <a
                href={listing.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline mt-2"
              >
                Abrir aviso en Argenprop
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">¿Qué querés hacer?</p>

            {listing.status === 'published' && (
              <Button onClick={() => onAction('baja')} disabled={managing !== null} variant="destructive" className="w-full justify-start">
                {managing === 'baja' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Dar de baja en Argenprop
              </Button>
            )}
            {listing.status === 'paused' && (
              <Button onClick={() => onAction('republish')} disabled={managing !== null} variant="outline" className="w-full justify-start">
                {managing === 'republish' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Volver a publicar
              </Button>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              <strong>Dar de baja</strong> saca el aviso de Argenprop. Después podés volver a publicarlo desde acá.
            </p>
          </div>

          <Button onClick={onBackToDetail} variant="ghost" className="w-full mt-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al detalle de la propiedad
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
