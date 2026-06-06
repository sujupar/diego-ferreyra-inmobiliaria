'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, ExternalLink, Pause, Play, Trash2, Building2 } from 'lucide-react'
import type { MlListing } from './types'

export function ManageListingPanel({
  listing,
  propertyAddress,
  propertyTitle,
  managing,
  onAction,
  onBackToDetail,
}: {
  listing: MlListing
  propertyAddress: string
  propertyTitle: string | null
  managing: 'pause' | 'close' | 'activate' | null
  onAction: (action: 'pause' | 'close' | 'activate') => void
  onBackToDetail: () => void
}) {
  const statusInfo = {
    published: { label: 'Activo y visible', color: 'bg-emerald-600' },
    paused: { label: 'Pausado (no visible)', color: 'bg-amber-500' },
    closed: { label: 'Cerrado (definitivo)', color: 'bg-gray-500' },
    failed: { label: 'Error', color: 'bg-red-500' },
    publishing: { label: 'Publicando…', color: 'bg-blue-500' },
    pending: { label: 'En cola', color: 'bg-blue-500' },
  }[listing.status] ?? { label: listing.status, color: 'bg-gray-400' }

  const isPublished = listing.status === 'published'
  const isPaused = listing.status === 'paused'
  const isClosed = listing.status === 'closed'

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[color:var(--brand)]" />
              Aviso en MercadoLibre
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
                Abrir aviso en MercadoLibre
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!isClosed && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">¿Qué querés hacer?</p>

              {isPublished && (
                <Button onClick={() => onAction('pause')} disabled={managing !== null} variant="outline" className="w-full justify-start">
                  {managing === 'pause' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                  Pausar el aviso (reversible)
                </Button>
              )}

              {isPaused && (
                <Button onClick={() => onAction('activate')} disabled={managing !== null} variant="outline" className="w-full justify-start">
                  {managing === 'activate' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  Reactivar el aviso
                </Button>
              )}

              <Button onClick={() => onAction('close')} disabled={managing !== null} variant="destructive" className="w-full justify-start">
                {managing === 'close' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Cerrar definitivamente
              </Button>
              <p className="text-xs text-muted-foreground pt-1">
                <strong>Pausar</strong> deja el aviso oculto pero podés reactivarlo después. <strong>Cerrar</strong> termina el aviso de forma definitiva — para volver a publicar habría que hacerlo desde cero.
              </p>
            </div>
          )}

          {isClosed && (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground">
                El aviso fue cerrado. Si querés volver a publicar la propiedad, andá al detalle y empezá el flujo de nuevo.
              </p>
            </div>
          )}

          <Button onClick={onBackToDetail} variant="ghost" className="w-full mt-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al detalle de la propiedad
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
