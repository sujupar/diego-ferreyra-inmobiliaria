// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { OverviewTab, type OverviewProperty } from './OverviewTab'

/**
 * D3 — el CABLE entre la ficha y la tarjeta de estado comercial.
 *
 * `estadoComercialEfectivo` tiene sus tests puros y `PropertyCommercialStatusCard`
 * los suyos, pero lo que estaba roto era el alambre del medio: la ficha le
 * pasaba `commercial_status` a secas. Una propiedad descartada con la acción
 * masiva del listado (que manda `PUT {status:'descartada'}` y NO toca la
 * columna comercial, que es NOT NULL DEFAULT 'disponible') mostraba badge
 * "Descartada" arriba y tarjeta "Disponible" abajo — y como la tarjeta ofrece
 * los OTROS estados, "Disponible" —el botón para recuperarla— no aparecía.
 */

function propiedad(extra: Partial<OverviewProperty> = {}): OverviewProperty {
  return {
    id: 'p1',
    status: 'approved',
    commercial_status: 'disponible',
    sold_price: null, sold_currency: null, sold_at: null,
    address: 'Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
    property_type: 'departamento', operation_type: 'venta',
    description: null, amenities: null, expensas: null, floor: null, age: null,
    asking_price: 180000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: 'embudo',
    latitude: null, longitude: null,
    ...extra,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

describe('OverviewTab — estado comercial', () => {
  it('una descartada desde el listado se muestra descartada y ofrece recuperarla', () => {
    render(
      <OverviewTab
        property={propiedad({ status: 'descartada', commercial_status: 'disponible' })}
        isAbogado={false}
        onChanged={() => {}}
      />,
    )

    expect(screen.getByText('Descartada')).toBeInTheDocument()
    // El botón que la devuelve al flujo activo, que antes no existía.
    expect(screen.getByRole('button', { name: /^disponible$/i })).toBeInTheDocument()
    // Y ya no ofrece "Descartada", que es donde estaba.
    expect(screen.queryByRole('button', { name: /^descartada$/i })).not.toBeInTheDocument()
  })

  it('una propiedad viva sigue mostrándose disponible', () => {
    render(<OverviewTab property={propiedad()} isAbogado={false} onChanged={() => {}} />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^disponible$/i })).not.toBeInTheDocument()
  })

  it('un estado comercial explícito manda sobre el espejo heredado', () => {
    render(
      <OverviewTab
        property={propiedad({ status: 'descartada', commercial_status: 'vendida', sold_price: 150000 })}
        isAbogado={false}
        onChanged={() => {}}
      />,
    )
    expect(screen.getByText('Vendida')).toBeInTheDocument()
  })

  it('al abogado no le muestra la tarjeta comercial', () => {
    render(
      <OverviewTab
        property={propiedad({ status: 'descartada' })}
        isAbogado
        onChanged={() => {}}
      />,
    )
    expect(screen.queryByText('Estado de la propiedad')).not.toBeInTheDocument()
  })
})
