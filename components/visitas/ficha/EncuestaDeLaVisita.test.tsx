// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { EncuestaDeLaVisita } from './EncuestaDeLaVisita'
import type { EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'

const VISITA = '66666666-6666-4666-8666-666666666666'
const LINK = 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y'
const FICHA: EncuestaParaFicha = {
  link: LINK, linkDisponible: true, estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' }, puedeReenviar: false, vencida: false,
  venceEl: '2026-11-14T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [],
}
let respuesta: { status: number; body: unknown }
const pedidos: unknown[] = []

beforeEach(() => {
  pedidos.length = 0
  respuesta = { status: 200, body: { data: { ...FICHA, estado: { clave: 'enviada', texto: 'Enviada' } } } }
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    pedidos.push(init?.body ? JSON.parse(String(init.body)) : null)
    return new Response(JSON.stringify(respuesta.body), { status: respuesta.status })
  }))
})

describe('EncuestaDeLaVisita (criterio 18)', () => {
  it('estado, vencimiento y "Copiar link" que copia el link', async () => {
    const usuario = userEvent.setup()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={FICHA} onCambio={() => {}} />)
    expect(screen.getByText('Sin enviar (envío apagado)')).toBeInTheDocument()
    expect(screen.getByText(/El link vence el/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Copiar link/ }))
    expect(await navigator.clipboard.readText()).toBe(LINK)
  })
  it('si el navegador no deja copiar, muestra el link para copiarlo a mano', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denegado') }) } })
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={FICHA} onCambio={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }))
    expect(await screen.findByLabelText('Link de la encuesta')).toHaveValue(LINK)
  })
  it('reenviar (solo si se puede) y su error en castellano', async () => {
    const onCambio = vi.fn()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={{ ...FICHA, puedeReenviar: true }} onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: /Reenviar por WhatsApp/ }))
    expect(pedidos[0]).toEqual({ accion: 'reenviar' })
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ estado: { clave: 'enviada', texto: 'Enviada' } }))
    respuesta = { status: 409, body: { error: 'No se puede reenviar: ya respondió' } }
    await userEvent.click(screen.getByRole('button', { name: /Reenviar por WhatsApp/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede reenviar: ya respondió')
  })
  it('una visita realizada sin encuesta ofrece crear el link', async () => {
    const onCambio = vi.fn()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={null} onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear link de la encuesta' }))
    expect(pedidos[0]).toEqual({ accion: 'link' })
    expect(onCambio).toHaveBeenCalled()
  })
  it('las respuestas, en palabras, y un fallo de Meta en rojo', () => {
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada onCambio={() => {}} encuesta={{
      ...FICHA, estado: { clave: 'fallo', texto: 'Falló: la plantilla no existe o todavía no está aprobada' },
      respondidaEl: '2026-10-15T14:00:00Z',
      respuestas: { completa: true, leGusto: true, masGusto: ['La luz', 'Otra: El barrio'], menosGusto: ['Nada en especial'], precio: 'Le parece alto', oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: null },
    }} />)
    expect(screen.getByText('Falló: la plantilla no existe o todavía no está aprobada')).toBeInTheDocument()
    expect(screen.getByText('La luz, Otra: El barrio')).toBeInTheDocument()
    expect(screen.getByText('US$ 135.000')).toBeInTheDocument()
  })
  it('una visita no realizada y sin encuesta no muestra nada', () => {
    const { container } = render(<EncuestaDeLaVisita visitaId={VISITA} realizada={false} encuesta={null} onCambio={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
