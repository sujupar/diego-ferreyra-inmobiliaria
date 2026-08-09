/**
 * Probe de render de la ficha de propiedad rediseñada.
 * Verifica que las pestañas renderizan en los escenarios reales SIN navegador
 * (Turbopack no arranca en esta carpeta por el acento de "Gestión" en el path).
 *
 * Correr: npx tsx scripts/property-detail-tabs.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PropertyHeroGallery } from '@/components/properties/detail/PropertyHeroGallery'
import { PropertyIdentityBar } from '@/components/properties/detail/PropertyIdentityBar'
import { PropertyKeyStats } from '@/components/properties/detail/PropertyKeyStats'
import { PropertyNextStepBanner } from '@/components/properties/detail/PropertyNextStepBanner'
import { PropertyTabsNav } from '@/components/properties/detail/PropertyTabsNav'
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
import { HistoryTab } from '@/components/properties/detail/tabs/HistoryTab'
import { buildKeyStats, nextStep, visibleTabs } from '@/lib/properties/detail-view'

function check(name: string, html: string, needles: string[]) {
  for (const n of needles) {
    if (!html.includes(n)) throw new Error(`[${name}] falta en el render: ${n}`)
  }
  console.log(`✓ ${name}`)
}

const property = {
  address: 'Av. Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  description: 'Tres ambientes al frente con balcón corrido.',
  amenities: ['parrilla', 'sum'], expensas: 145000, floor: 4, age: 12,
  asking_price: 185000, currency: 'USD', commission_percentage: 3,
  contract_start_date: null, contract_end_date: null, origin: 'embudo',
  latitude: null, longitude: null,
}

// 1) Captada y completa
check('galería con fotos', renderToStaticMarkup(
  <PropertyHeroGallery photos={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg']}
    address="Av. Rivadavia 4820" plansCount={2} hasVideo hasTour />,
), ['6 fotos', '2 planos', 'Video', 'Recorrido 360°', '+1'])

check('identidad', renderToStaticMarkup(
  <PropertyIdentityBar operationType="venta" propertyType="departamento"
    address="Av. Rivadavia 4820" neighborhood="Caballito" city="CABA"
    price={185000} currency="USD" statusLabel="Captación Completa" statusColor="bg-green-500" showPrice />,
), ['Departamento en venta', 'Av. Rivadavia 4820', 'Caballito, CABA'])

check('datos clave', renderToStaticMarkup(
  <PropertyKeyStats stats={buildKeyStats({ rooms: 3, bathrooms: 2, covered_area: 78, floor: 0 })} />,
), ['Ambientes', 'Baños', '78 m²', 'PB'])

check('pestaña Propiedad', renderToStaticMarkup(
  <OverviewTab property={property} isAbogado={false} />,
), ['Descripción', 'Características', 'Datos comerciales', 'parrilla',
    'Esta propiedad todavía no tiene ubicación precisa cargada'])

check('pestaña Propiedad (abogado, sin datos comerciales)', renderToStaticMarkup(
  <OverviewTab property={property} isAbogado />,
), ['Descripción'])
if (renderToStaticMarkup(<OverviewTab property={property} isAbogado />).includes('Datos comerciales')) {
  throw new Error('[abogado] no debería ver los datos comerciales')
}

check('pestaña Historial', renderToStaticMarkup(
  <HistoryTab propertyId="p1" flowHistory={null} feedback={[]} />,
), ['Historial'])

// 2) Sin fotos
check('galería vacía', renderToStaticMarkup(
  <PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} />,
), ['Todavía no hay fotos de esta propiedad'])

// 3) Captada, con la documentación pendiente (recordatorio, no bloqueo)
const stepPendiente = nextStep({
  role: 'asesor', status: 'approved', legalStatus: 'pending', legalNotes: null,
  legalSubmittedAt: null,
  photosCount: 3, documentsCount: 0, ghlImported: false, ghlMissing: [],
  importSource: null, legalDocsPending: false, originPending: false,
})
check('próximo paso pendiente', renderToStaticMarkup(
  <PropertyNextStepBanner step={stepPendiente} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} onSubirFotos={() => {}} />,
), ['Documentación legal pendiente', 'Ir a Documentación'])

// 4) Pestañas por rol
check('pestañas del asesor', renderToStaticMarkup(
  <PropertyTabsNav tabs={visibleTabs({ role: 'asesor', status: 'approved' })} active="propiedad" onChange={() => {}} />,
), ['Propiedad', 'Multimedia', 'Documentación', 'Difusión', 'Historial'])

const abogadoHtml = renderToStaticMarkup(
  <PropertyTabsNav tabs={visibleTabs({ role: 'abogado', status: 'approved' })} active="propiedad" onChange={() => {}} />,
)
if (abogadoHtml.includes('Multimedia') || abogadoHtml.includes('Difusión')) {
  throw new Error('[abogado] no debería ver Multimedia ni Difusión')
}
console.log('✓ pestañas del abogado')

console.log('\nTodas las pestañas renderizan.')
