'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Bed, Bath, Square, Calendar, ExternalLink, Video, Box } from 'lucide-react'
import { PropertyGallery } from './PropertyGallery'
import { OwnershipBadge } from './OwnershipBadge'

export interface DetailProperty {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  description?: string | null
  asking_price: number
  currency: string
  status: string
  photos: string[]
  rooms?: number | null
  bathrooms?: number | null
  covered_area?: number | null
  total_area?: number | null
  video_url?: string | null
  tour_3d_url?: string | null
  assigned_to?: string | null
}

function formatCurrency(v: number, c: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: c === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
  }).format(v)
}

interface Props {
  property: DetailProperty | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  onScheduleVisit: (propertyId: string) => void
}

export function PropertyDetailModal({ property, open, onOpenChange, currentUserId, onScheduleVisit }: Props) {
  if (!property) return null
  const isMine = !!currentUserId && property.assigned_to === currentUserId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6 space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-2xl">{property.address}</DialogTitle>
              <p className="flex items-center gap-1 text-muted-foreground text-sm">
                <MapPin className="size-4" /> {property.neighborhood}, {property.city}
              </p>
              <p className="text-3xl font-bold pt-2">{formatCurrency(property.asking_price, property.currency)}</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Badge>{property.property_type}</Badge>
              <OwnershipBadge isMine={isMine} />
            </div>
          </header>

          <PropertyGallery photos={property.photos} alt={property.address} />

          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {property.rooms != null && (
              <Stat icon={<Bed />} label="Ambientes" value={String(property.rooms)} />
            )}
            {property.bathrooms != null && (
              <Stat icon={<Bath />} label="Baños" value={String(property.bathrooms)} />
            )}
            {property.covered_area != null && (
              <Stat icon={<Square />} label="Sup. cubierta" value={`${property.covered_area} m²`} />
            )}
            {property.total_area != null && (
              <Stat icon={<Square />} label="Sup. total" value={`${property.total_area} m²`} />
            )}
          </section>

          {(property.video_url || property.tour_3d_url) && (
            <section className="flex flex-wrap gap-2">
              {property.video_url && (
                <Button variant="outline" asChild>
                  <a href={property.video_url} target="_blank" rel="noopener noreferrer">
                    <Video className="size-4 mr-1" /> Ver video <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
              {property.tour_3d_url && (
                <Button variant="outline" asChild>
                  <a href={property.tour_3d_url} target="_blank" rel="noopener noreferrer">
                    <Box className="size-4 mr-1" /> Tour 360° <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
            </section>
          )}

          {property.description && (
            <section>
              <h3 className="font-semibold mb-2">Descripción</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.description}</p>
            </section>
          )}

          <footer className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t flex flex-wrap gap-2 justify-end">
            <Button variant="outline" asChild>
              <Link href={`/properties/${property.id}`}>Ver detalle completo</Link>
            </Button>
            <Button onClick={() => onScheduleVisit(property.id)} className="gap-2">
              <Calendar className="size-4" />
              Agendar visita
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <div className="size-5 mx-auto text-muted-foreground [&_svg]:size-5">{icon}</div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}
