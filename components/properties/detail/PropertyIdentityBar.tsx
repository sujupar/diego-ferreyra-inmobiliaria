'use client'

import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatMoney, operationLabel, propertyTypeLabel } from '@/lib/properties/detail-view'

interface Props {
  operationType: string | null
  propertyType: string
  address: string
  neighborhood: string
  city: string
  price: number
  currency: string
  statusLabel: string
  statusColor: string
  /** El abogado no ve datos comerciales. */
  showPrice: boolean
}

export function PropertyIdentityBar({
  operationType, propertyType, address, neighborhood, city,
  price, currency, statusLabel, statusColor, showPrice,
}: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* Un solo nodo de texto: así el probe de render puede buscar la frase entera. */}
        <p className="eyebrow">{`${propertyTypeLabel(propertyType)} ${operationLabel(operationType)}`}</p>
        <h1 className="display text-3xl md:text-4xl mt-1 break-words">{address}</h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm mt-1.5">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="break-words">{[neighborhood, city].filter(Boolean).join(', ')}</span>
        </p>
      </div>
      <div className="sm:text-right shrink-0">
        {showPrice && (
          <>
            <p className="eyebrow">Precio de publicación</p>
            <p className="display text-3xl tabular-n mt-1">{formatMoney(price, currency)}</p>
          </>
        )}
        <Badge className={`text-white text-xs mt-2 ${statusColor}`}>{statusLabel}</Badge>
      </div>
    </div>
  )
}
