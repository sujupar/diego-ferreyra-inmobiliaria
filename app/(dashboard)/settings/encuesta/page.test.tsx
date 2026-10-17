// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// El panel del regalo general tiene sus propias pruebas (RegaloDeLaEncuesta.test.tsx) y su propio
// fetch: acá solo importa que la pantalla lo incluya.
vi.mock('@/components/visitas/encuesta/RegaloDeLaEncuesta', () => ({
  RegaloGeneralDeLaEncuesta: () => <section aria-label="Regalo general de la encuesta" />,
}))
import AjustesEncuestaPage from './page'

const DATOS = {
  ajustes: { envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] },
  plantillas: [
    { uso: 'encuesta', variable: 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', configurada: 'encuesta_visita_v1', conocida: true, conBoton: true, conDocumento: false },
    { uso: 'regalo', variable: 'WHATSAPP_TEMPLATE_REGALO_VISITA', configurada: null, conocida: false, conBoton: false, conDocumento: false },
  ],
  whatsappModoPrueba: false,
}
const pedidos: Array<{ metodo: string; cuerpo: unknown }> = []
let respuestaGet: { status: number; body: unknown }
let respuestaPatch: { status: number; body: unknown }

beforeEach(() => {
  pedidos.length = 0
  respuestaGet = { status: 200, body: { data: DATOS } }
  respuestaPatch = { status: 200, body: { data: { ...DATOS, ajustes: { ...DATOS.ajustes, envio_automatico: true } } } }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    pedidos.push({ metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : null })
    const r = metodo === 'PATCH' ? respuestaPatch : respuestaGet
    return new Response(JSON.stringify(r.body), { status: r.status })
  }))
})

describe('/settings/encuesta', () => {
  it('muestra los interruptores, la lista de prueba y el estado de las plantillas', async () => {
    render(<AjustesEncuestaPage />)
    expect(await screen.findByRole('switch', { name: 'Mandar la encuesta por WhatsApp' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Solo propiedades con regalo' })).toBeChecked()
    expect(screen.getByText('5491158234521')).toBeInTheDocument()
    expect(screen.getByText('encuesta_visita_v1')).toBeInTheDocument()
    expect(screen.getByText('Sin configurar: no se manda nada')).toBeInTheDocument()
  })
  it('incluye el panel del regalo general', async () => {
    render(<AjustesEncuestaPage />)
    expect(await screen.findByRole('region', { name: 'Regalo general de la encuesta' })).toBeInTheDocument()
  })
  it('prender el envío pide confirmación y recién ahí guarda', async () => {
    render(<AjustesEncuestaPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Mandar la encuesta por WhatsApp' }))
    expect(pedidos.filter(p => p.metodo === 'PATCH')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Sí, prender' }))
    await waitFor(() => expect(pedidos.find(p => p.metodo === 'PATCH')?.cuerpo).toEqual({ envio_automatico: true }))
  })
  it('apagar "solo con regalo" guarda sin preguntar', async () => {
    render(<AjustesEncuestaPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Solo propiedades con regalo' }))
    await waitFor(() => expect(pedidos.find(p => p.metodo === 'PATCH')?.cuerpo).toEqual({ solo_con_regalo: false }))
  })
  it('un teléfono que el servidor rechaza muestra su error', async () => {
    respuestaPatch = { status: 400, body: { error: 'Revisá estos teléfonos: 123' } }
    render(<AjustesEncuestaPage />)
    await userEvent.type(await screen.findByLabelText('Agregar teléfono de prueba'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar teléfonos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá estos teléfonos: 123')
  })
  it('sin permiso lo dice', async () => {
    respuestaGet = { status: 403, body: { error: 'No tenés permiso' } }
    render(<AjustesEncuestaPage />)
    expect(await screen.findByText('Solo admin y dueño pueden ver esta configuración.')).toBeInTheDocument()
  })
})
