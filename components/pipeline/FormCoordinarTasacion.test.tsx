// @vitest-environment happy-dom
/**
 * Formulario de "Coordinar tasación" (`/pipeline/new`, crm-ficha-y-llamadas, tarea 8.3;
 * design.md D9). Con `?deal=` convierte esa solicitud (manda `from_deal_id`, sin
 * `origin`); con `?contact=` coordina a esa persona (manda `contact_id`); sin nada, lo
 * de siempre. No se usan temporizadores simulados (CLAUDE.md).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav }))

import { FormCoordinarTasacion } from './FormCoordinarTasacion'

type Respuesta = { status: number; body: unknown }
let respuestaPost: Respuesta
let enviados: Record<string, unknown>[]

const PROCESO = {
  id: 'd-1',
  contact_id: 'c-1',
  origin: 'embudo',
  notes: 'Mensaje que dejó la persona',
  property_address: 'Av. Belgrano 1500',
  property_type: 'departamento',
  property_type_other: null,
  neighborhood: 'Monserrat',
  rooms: 2,
  covered_area: 75,
  contacts: { full_name: 'Marta Gómez', phone: '+5491155554444', email: 'marta@example.com' },
}
const CONTACTO = { contact: { id: 'c-9', full_name: 'Lucía Clase', phone: '+5491166667777', email: null, origin: 'clase_gratuita' } }

function responder(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body }
}

beforeEach(() => {
  nav.push.mockReset()
  enviados = []
  respuestaPost = { status: 200, body: { success: true, id: 'd-1', contact_id: 'c-1' } }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/users/advisors') return responder(200, { data: [{ id: 'asesor-9', full_name: 'Ana Asesora' }] })
      if (url === '/api/deals/d-1') return responder(200, { data: PROCESO })
      if (url === '/api/contacts/c-9') return responder(200, CONTACTO)
      if (url === '/api/deals' && init?.method === 'POST') {
        enviados.push(JSON.parse(init.body ?? '{}'))
        return responder(respuestaPost.status, respuestaPost.body)
      }
      return responder(404, { error: 'no' })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const campo = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
const escribir = (id: string, valor: string) => fireEvent.change(campo(id), { target: { value: valor } })
const enviar = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement)

async function completarLoQueFalta(conOrigen: boolean) {
  await waitFor(() => expect(screen.getByRole('option', { name: 'Ana Asesora' })).toBeTruthy())
  if (conOrigen) escribir('origin', 'referido')
  escribir('assignedTo', 'asesor-9')
  escribir('scheduledDate', '2026-12-01')
}

describe('FormCoordinarTasacion — sin parámetros (como hoy)', () => {
  it('manda origin, sin from_deal_id ni contact_id, y vuelve a /pipeline', async () => {
    render(<FormCoordinarTasacion dealId={null} contactId={null} />)
    escribir('contactName', 'Juan Pérez')
    escribir('contactPhone', '11 5555-4444')
    escribir('contactEmail', 'juan@example.com')
    escribir('propertyType', 'casa')
    escribir('neighborhood', 'Palermo')
    escribir('rooms', '3')
    escribir('propertyAddress', 'Calle 1')
    await completarLoQueFalta(true)
    enviar()
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toMatchObject({ origin: 'referido', contact_name: 'Juan Pérez', assigned_to: 'asesor-9' })
    expect(enviados[0]).not.toHaveProperty('from_deal_id')
    expect(enviados[0]).not.toHaveProperty('contact_id')
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/pipeline'), { timeout: 3000 })
  })

  it('el campo Origen está habilitado y vacío', () => {
    render(<FormCoordinarTasacion dealId={null} contactId={null} />)
    expect((campo('origin') as HTMLSelectElement).disabled).toBe(false)
    expect(campo('origin').value).toBe('')
  })
})

describe('FormCoordinarTasacion — con ?deal= (convertir la solicitud)', () => {
  it('precarga persona y propiedad, deja Notas vacío y muestra el origen fijo', async () => {
    render(<FormCoordinarTasacion dealId="d-1" contactId={null} />)
    await waitFor(() => expect(campo('contactName').value).toBe('Marta Gómez'))
    expect(campo('contactPhone').value).toBe('+5491155554444')
    expect(campo('contactEmail').value).toBe('marta@example.com')
    expect(campo('propertyAddress').value).toBe('Av. Belgrano 1500')
    expect(campo('propertyType').value).toBe('departamento')
    expect(campo('neighborhood').value).toBe('Monserrat')
    expect(campo('rooms').value).toBe('2')
    expect(campo('coveredArea').value).toBe('75')
    expect(campo('notes').value).toBe('')
    const origen = campo('origin') as HTMLSelectElement
    expect(origen.disabled).toBe(true)
    expect(origen.selectedOptions[0]?.textContent).toBe('Embudo')
  })

  it('un proceso sin origen dice "Sin origen"', async () => {
    vi.mocked(fetch).mockImplementation((async (url: string) => {
      if (url === '/api/deals/d-1') return responder(200, { data: { ...PROCESO, origin: null } })
      return responder(200, { data: [] })
    }) as unknown as typeof fetch)
    render(<FormCoordinarTasacion dealId="d-1" contactId={null} />)
    await waitFor(() => expect((campo('origin') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Sin origen'))
  })

  it('al guardar manda from_deal_id, NO manda origin, y vuelve a la ficha de la persona', async () => {
    render(<FormCoordinarTasacion dealId="d-1" contactId={null} />)
    await waitFor(() => expect(campo('contactName').value).toBe('Marta Gómez'))
    await completarLoQueFalta(false)
    enviar()
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toMatchObject({ from_deal_id: 'd-1', contact_name: 'Marta Gómez', property_address: 'Av. Belgrano 1500' })
    expect(enviados[0]).not.toHaveProperty('origin')
    expect(enviados[0]).not.toHaveProperty('contact_id')
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/contacts/c-1'), { timeout: 3000 })
  })

  it('ante un 409 muestra "El proceso ya cambió de etapa" y conserva lo escrito', async () => {
    respuestaPost = { status: 409, body: { error: 'El proceso ya cambió de etapa' } }
    render(<FormCoordinarTasacion dealId="d-1" contactId={null} />)
    await waitFor(() => expect(campo('contactName').value).toBe('Marta Gómez'))
    await completarLoQueFalta(false)
    escribir('notes', 'Tiene perro')
    enviar()
    await waitFor(() => expect(screen.getByText('El proceso ya cambió de etapa')).toBeTruthy())
    expect(campo('notes').value).toBe('Tiene perro')
    expect(campo('scheduledDate').value).toBe('2026-12-01')
    expect(nav.push).not.toHaveBeenCalled()
  })
})

describe('FormCoordinarTasacion — con ?contact= (proceso nuevo para esa persona)', () => {
  it('precarga solo la persona; Origen vacío aunque el contacto sea de la clase', async () => {
    render(<FormCoordinarTasacion dealId={null} contactId="c-9" />)
    await waitFor(() => expect(campo('contactName').value).toBe('Lucía Clase'))
    expect(campo('contactPhone').value).toBe('+5491166667777')
    expect(campo('contactEmail').value).toBe('')
    expect(campo('propertyAddress').value).toBe('')
    expect(campo('origin').value).toBe('')
    expect((campo('origin') as HTMLSelectElement).disabled).toBe(false)
  })

  it('al guardar manda contact_id y el origen elegido, y vuelve a la ficha', async () => {
    respuestaPost = { status: 200, body: { success: true, id: 'd-nuevo', contact_id: 'c-9' } }
    render(<FormCoordinarTasacion dealId={null} contactId="c-9" />)
    await waitFor(() => expect(campo('contactName').value).toBe('Lucía Clase'))
    escribir('contactEmail', 'lucia@example.com')
    escribir('propertyType', 'ph')
    escribir('neighborhood', 'Caballito')
    escribir('rooms', '3')
    escribir('propertyAddress', 'Calle 2')
    await completarLoQueFalta(true)
    enviar()
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toMatchObject({ contact_id: 'c-9', origin: 'referido', contact_email: 'lucia@example.com' })
    expect(enviados[0]).not.toHaveProperty('from_deal_id')
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/contacts/c-9'), { timeout: 3000 })
  })
})

describe('FormCoordinarTasacion — avisos de la respuesta', () => {
  it('un warning de la respuesta se muestra', async () => {
    respuestaPost = {
      status: 200,
      body: { success: true, id: 'd-1', contact_id: 'c-1', warning: 'Ya hay otro contacto con ese email o teléfono: revisá si es la misma persona.' },
    }
    render(<FormCoordinarTasacion dealId="d-1" contactId={null} />)
    await waitFor(() => expect(campo('contactName').value).toBe('Marta Gómez'))
    await completarLoQueFalta(false)
    enviar()
    await waitFor(() => expect(screen.getByText(/Ya hay otro contacto con ese email o teléfono/)).toBeTruthy())
  })
})
