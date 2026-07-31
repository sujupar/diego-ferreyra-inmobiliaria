'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney, operationLabel, propertyTypeLabel } from '@/lib/properties/detail-view'

// Leaflet toca `window`: fuera del render de servidor.
const PropertyLocationMap = dynamic(
  () => import('../PropertyLocationMap').then(m => m.PropertyLocationMap),
  { ssr: false, loading: () => <div className="h-[260px] w-full rounded-2xl border bg-muted/40" /> },
)

export interface OverviewProperty {
  address: string
  neighborhood: string
  city: string
  property_type: string
  operation_type?: string | null
  description?: string | null
  amenities?: unknown
  expensas?: number | null
  floor?: number | null
  age?: number | null
  asking_price: number
  currency: string
  commission_percentage: number
  contract_start_date?: string | null
  contract_end_date?: string | null
  origin?: string | null
  latitude?: number | null
  longitude?: number | null
}

/** `amenities` es jsonb: puede llegar como array, como objeto de banderas o null. */
function amenityList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/_/g, ' '))
  }
  return []
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="font-medium text-sm mt-0.5">{value}</p>
    </div>
  )
}

export function OverviewTab({ property, isAbogado }: { property: OverviewProperty; isAbogado: boolean }) {
  const amenities = amenityList(property.amenities)
  const hasCoords = property.latitude != null && property.longitude != null

  const specs: Array<{ label: string; value: string }> = [
    { label: 'Tipo', value: propertyTypeLabel(property.property_type) },
    { label: 'Operación', value: operationLabel(property.operation_type).replace(/^en /, '') },
  ]
  if (property.floor != null) specs.push({ label: 'Piso', value: property.floor === 0 ? 'PB' : `${property.floor}º` })
  if (property.age) specs.push({ label: 'Antigüedad', value: `${property.age} año${property.age === 1 ? '' : 's'}` })
  if (property.expensas) specs.push({ label: 'Expensas', value: formatMoney(property.expensas, 'ARS') })

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6">
        <section>
          <p className="eyebrow">La propiedad</p>
          <h2 className="display text-xl mt-1 mb-3">Descripción</h2>
          {property.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {property.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Esta propiedad todavía no tiene descripción cargada.
            </p>
          )}
        </section>

        <section>
          <p className="eyebrow">Ficha</p>
          <h2 className="display text-xl mt-1 mb-3">Características</h2>
          <div className="grid grid-cols-2 gap-2">
            {specs.map(s => <Spec key={s.label} label={s.label} value={s.value} />)}
          </div>

          {amenities.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map(a => (
                  <span key={a} className="rounded-full border bg-card px-3 py-1 text-xs capitalize">{a}</span>
                ))}
              </div>
            </div>
          )}

          {!isAbogado && (
            <Card className="mt-4">
              <CardContent className="py-4">
                <p className="eyebrow mb-3">Datos comerciales</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <span className="text-muted-foreground">Precio</span>
                  <span className="tabular-n font-medium">{formatMoney(property.asking_price, property.currency)}</span>
                  <span className="text-muted-foreground">Comisión</span>
                  <span className="tabular-n">{property.commission_percentage}%</span>
                  {property.contract_start_date && (<><span className="text-muted-foreground">Inicio contrato</span><span className="tabular-n">{property.contract_start_date}</span></>)}
                  {property.contract_end_date && (<><span className="text-muted-foreground">Fin contrato</span><span className="tabular-n">{property.contract_end_date}</span></>)}
                  {property.origin && (<><span className="text-muted-foreground">Origen</span><span className="capitalize">{property.origin}</span></>)}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      <section>
        <p className="eyebrow">Dónde está</p>
        <h2 className="display text-xl mt-1 mb-3">Ubicación</h2>
        <p className="text-sm text-muted-foreground mb-3">
          {[property.address, property.neighborhood, property.city].filter(Boolean).join(' · ')}
        </p>
        {hasCoords ? (
          <PropertyLocationMap lat={property.latitude!} lng={property.longitude!} label={property.address} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Esta propiedad todavía no tiene ubicación precisa cargada.
          </p>
        )}
      </section>
    </div>
  )
}
