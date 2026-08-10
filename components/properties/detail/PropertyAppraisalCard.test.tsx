// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PropertyAppraisalCard } from './PropertyAppraisalCard'
import { OverviewTab, type OverviewProperty } from './tabs/OverviewTab'

/**
 * La entrada CONTEXTUAL del abogado a la tasación: existe solo dentro de la
 * ficha de la propiedad que revisa, es de solo lectura y no ofrece ni un botón.
 *
 * Estos casos cubren el alambre —que la ficha le pase el `appraisal_id` y que
 * la tarjeta se monte para el abogado y solo para él—, que es exactamente la
 * clase de cosa que ningún test puro atrapa: `alcanceTasaciones` puede estar
 * perfecto y el panel no aparecer nunca porque el campo llega `undefined`.
 */

const TASACION = {
  id: 'tasacion-1',
  property_title: 'Departamento en Palermo',
  property_location: 'Gorriti 4500, Palermo',
  publication_price: 195000,
  sale_value: 180000,
  currency: 'USD',
  comparable_count: 6,
  created_at: '2026-05-14T15:00:00.000Z',
}

function responder(estado: number, cuerpo: unknown) {
  return vi.fn().mockResolvedValue({
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => cuerpo,
  })
}

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
  vi.stubGlobal('fetch', responder(200, { data: TASACION }))
})

/** Las URLs de tasación que se llegaron a pedir (la ficha pide otras cosas). */
function pedidosDeTasacion(): string[] {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map(c => String(c[0]))
    .filter(u => u.includes('/api/appraisals/'))
}

describe('PropertyAppraisalCard', () => {
  it('muestra qué se tasó, cuándo y con qué resultado', async () => {
    render(<PropertyAppraisalCard appraisalId="tasacion-1" />)

    expect(await screen.findByText('Departamento en Palermo')).toBeInTheDocument()
    expect(screen.getByText('Gorriti 4500, Palermo')).toBeInTheDocument()
    expect(screen.getByText('Valor de publicación')).toBeInTheDocument()
    expect(screen.getByText('Valor de venta estimado')).toBeInTheDocument()
    expect(screen.getByText('Comparables')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText(/Tasada el 14\/05\/2026/)).toBeInTheDocument()
  })

  it('no muestra "dinero en mano" ni aunque el servidor lo mandara', async () => {
    // El servidor no lo manda (no está en el `select`), y la pantalla tampoco
    // tiene dónde ponerlo: la economía de la operación no es asunto del abogado.
    // Se le pasa el campo A PROPÓSITO para que el caso pruebe la pantalla y no
    // el mock — la espera del título es lo que garantiza que ya cargó.
    vi.stubGlobal('fetch', responder(200, { data: { ...TASACION, money_in_hand: 174600 } }))
    render(<PropertyAppraisalCard appraisalId="tasacion-1" />)
    await screen.findByText('Departamento en Palermo')
    expect(screen.queryByText(/dinero en mano/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/comisión/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/174\.600|174,600/)).not.toBeInTheDocument()
  })

  it('pide exactamente esa tasación, y nada más', async () => {
    render(<PropertyAppraisalCard appraisalId="tasacion-1" />)
    await screen.findByText('Departamento en Palermo')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/appraisals/tasacion-1')
  })

  it('no ofrece NINGUNA acción: es de solo lectura', async () => {
    const { container } = render(<PropertyAppraisalCard appraisalId="tasacion-1" />)
    await screen.findByText('Departamento en Palermo')
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('si el servidor dice 403, la tarjeta desaparece en vez de gritar', async () => {
    vi.stubGlobal('fetch', responder(403, { error: 'forbidden' }))
    const { container } = render(<PropertyAppraisalCard appraisalId="tasacion-ajena" />)
    await waitFor(() => expect(container.textContent).not.toContain('Tasación de esta propiedad'))
  })

  it('un 404 tampoco deja un cartel de error colgado', async () => {
    vi.stubGlobal('fetch', responder(404, { error: 'Not found' }))
    const { container } = render(<PropertyAppraisalCard appraisalId="tasacion-borrada" />)
    await waitFor(() => expect(container.textContent).not.toContain('Tasación de esta propiedad'))
  })
})

describe('OverviewTab — el cable con la ficha de la propiedad', () => {
  it('el abogado ve la tasación de la propiedad que revisa', async () => {
    render(
      <OverviewTab
        property={propiedad({ appraisal_id: 'tasacion-1' })}
        isAbogado
        onChanged={() => {}}
      />,
    )
    expect(await screen.findByText('Departamento en Palermo')).toBeInTheDocument()
  })

  it('sobre una propiedad SIN tasación vinculada no se pide ninguna', async () => {
    render(
      <OverviewTab
        property={propiedad({ appraisal_id: null })}
        isAbogado
        onChanged={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText('Ubicación')).toBeInTheDocument())
    expect(screen.queryByText('Tasación de esta propiedad')).not.toBeInTheDocument()
    expect(pedidosDeTasacion()).toEqual([])
  })

  it('a los demás roles no se les cambia la pantalla: llegan por el Historial', async () => {
    render(
      <OverviewTab
        property={propiedad({ appraisal_id: 'tasacion-1' })}
        isAbogado={false}
        onChanged={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText('Ubicación')).toBeInTheDocument())
    expect(screen.queryByText('Tasación de esta propiedad')).not.toBeInTheDocument()
    // La tarjeta de estado comercial sí pide lo suyo; lo que NO sale es el
    // pedido de la tasación.
    expect(pedidosDeTasacion()).toEqual([])
  })
})
