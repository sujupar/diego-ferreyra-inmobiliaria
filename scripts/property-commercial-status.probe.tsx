/**
 * Probe de render de la tarjeta de estado comercial, en los cinco estados.
 * Correr: npx tsx scripts/property-commercial-status.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PropertyCommercialStatusCard } from '@/components/properties/detail/PropertyCommercialStatusCard'
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
import { COMMERCIAL_STATUSES } from '@/lib/properties/commercial-status'

for (const s of COMMERCIAL_STATUSES) {
  const html = renderToStaticMarkup(
    <PropertyCommercialStatusCard
      propertyId="p1" current={s.key} currency="USD"
      soldPrice={s.key === 'vendida' ? 180000 : null}
      soldCurrency={s.key === 'vendida' ? 'USD' : null}
      soldAt={s.key === 'vendida' ? '2026-08-01' : null}
      onChanged={() => {}}
    />,
  )
  if (!html.includes(s.label)) throw new Error(`[${s.key}] no muestra su etiqueta`)
  if (!html.includes('Estado de la propiedad')) throw new Error(`[${s.key}] falta el encabezado`)
  for (const otro of COMMERCIAL_STATUSES) {
    if (otro.key === s.key) continue
    if (!html.includes(otro.label)) throw new Error(`[${s.key}] no ofrece cambiar a ${otro.label}`)
  }
  if (s.key === 'vendida' && !html.includes('180.000')) {
    throw new Error('[vendida] no muestra el precio real cargado')
  }
  console.log(`✓ ${s.label}`)
}

// El abogado NO debe ver la tarjeta: la puerta está en OverviewTab, no en la
// tarjeta misma, así que se verifica ahí.
const propiedad = {
  id: 'p1', address: 'Av. Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta', asking_price: 185000,
  currency: 'USD', commission_percentage: 3, commercial_status: 'reservada',
  latitude: null, longitude: null,
}
const htmlAbogado = renderToStaticMarkup(
  <OverviewTab property={propiedad} isAbogado onChanged={() => {}} />)
if (htmlAbogado.includes('Estado de la propiedad')) {
  throw new Error('[abogado] no debería ver la tarjeta de estado comercial')
}
const htmlAsesor = renderToStaticMarkup(
  <OverviewTab property={propiedad} isAbogado={false} onChanged={() => {}} />)
if (!htmlAsesor.includes('Estado de la propiedad')) {
  throw new Error('[asesor] debería ver la tarjeta de estado comercial')
}
console.log('✓ la tarjeta se le oculta al abogado')

console.log('\nLa tarjeta renderiza en los cinco estados.')
