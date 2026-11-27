// crm-cartera-por-rol, tarea 6.6: la ficha lee `?volver=` con `enlaceVolver` y le pasa a la
// pantalla el enlace ya validado (dato plano). Válido → "Volver al CRM"/"Volver a Contactos";
// inválido o ausente → sin enlace.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

vi.mock('@/lib/auth/require-role', () => ({ requireAuth: async () => ({ id: 'u-1', profile: { role: 'coordinador' } }) }))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: async () => true }))

import FichaContactoPage from './page'

async function abrir(sp: Record<string, string>): Promise<ReactElement<Record<string, unknown>>> {
  const el = await FichaContactoPage({ params: Promise.resolve({ id: 'c-1' }), searchParams: Promise.resolve(sp) })
  if (!isValidElement<Record<string, unknown>>(el)) throw new Error('la página no devolvió un elemento')
  return el
}

beforeEach(() => vi.clearAllMocks())

describe('/contacts/[id] — "Volver"', () => {
  it('desde el CRM con filtros: "Volver al CRM" a la dirección guardada', async () => {
    const el = await abrir({ volver: '/crm?etapa=seguimiento&q=Pinto' })
    expect(el.props.volver).toEqual({ href: '/crm?etapa=seguimiento&q=Pinto', texto: 'Volver al CRM' })
  })

  it('desde Contactos: "Volver a Contactos"', async () => {
    const el = await abrir({ volver: '/contacts?seg=cerrados' })
    expect(el.props.volver).toEqual({ href: '/contacts?seg=cerrados', texto: 'Volver a Contactos' })
  })

  it.each(['https://otro.com', '//otro.com', '/\\otro.com', '/crm@otro.com', '/crmx', '/contacts/123', 'javascript:alert(1)', '/tasks'])(
    'una vuelta manipulada (%s) no dibuja el enlace',
    async (volver) => {
      const el = await abrir({ volver })
      expect(el.props.volver).toBeNull()
    },
  )

  it('sin "volver" (abierta desde Pendientes o escribiendo la dirección) no hay enlace', async () => {
    const el = await abrir({})
    expect(el.props.volver).toBeNull()
    expect(el.props.abrirEditor).toBe(false)
  })
})
