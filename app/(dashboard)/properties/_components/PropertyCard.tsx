'use client'

import Image from 'next/image'
import { MapPin, Bed, Bath, Square } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OwnershipBadge } from './OwnershipBadge'
import { cn } from '@/lib/utils'

export interface PropertyCardData {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  asking_price: number
  currency: string
  status: string
  photos: string[]
  rooms?: number | null
  bathrooms?: number | null
  covered_area?: number | null
  assigned_to?: string | null
}

interface Props {
  property: PropertyCardData
  currentUserId?: string
  statusInfo: { label: string; color: string }
  onClick: () => void
}

function formatCurrency(v: number, c: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: c === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
  }).format(v)
}

export function PropertyCard({ property, currentUserId, statusInfo, onClick }: Props) {
  const isMine = !!currentUserId && property.assigned_to === currentUserId
  const hero = property.photos?.[0]

  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group cursor-pointer overflow-hidden transition-all hover:shadow-lg',
        isMine && 'ring-2 ring-amber-400'
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {hero ? (
          <Image
            src={hero}
            alt={property.address}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Sin foto
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge className={cn('text-white', statusInfo.color)}>{statusInfo.label}</Badge>
        </div>
        <div className="absolute top-2 right-2">
          <OwnershipBadge isMine={isMine} />
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        <p className="text-lg font-semibold tracking-tight">
          {formatCurrency(property.asking_price, property.currency)}
        </p>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{property.neighborhood}, {property.city}</span>
        </div>
        <p className="text-sm font-medium truncate">{property.address}</p>
        <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
          {property.rooms != null && (
            <span className="flex items-center gap-1"><Bed className="size-3" /> {property.rooms}</span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1"><Bath className="size-3" /> {property.bathrooms}</span>
          )}
          {property.covered_area != null && (
            <span className="flex items-center gap-1"><Square className="size-3" /> {property.covered_area}m²</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
