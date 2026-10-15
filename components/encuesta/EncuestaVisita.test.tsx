// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/image', () => ({ default: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))

import { EncuestaVisita } from './EncuestaVisita'
import { armarEncuestaPublica, type EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EncuestaFila, VisitaDeEncuesta } from '@/lib/visitas/encuesta/tipos'

const REGALO = { titulo: 'Guía de Caballito', portada: null }
function encuesta(e: Partial<EncuestaFila> = {}, v: Partial<VisitaDeEncuesta> = {}, regalo: EncuestaPublica['regalo'] = REGALO): EncuestaPublica {
  const r = armarEncuestaPublica(encuestaConVisitaDePrueba(e, v), { regalo, regaloPorWhatsapp: false, ahora: new Date('2026-10-15T15:00:00Z') })
  if (r.tipo !== 'disponible') throw new Error('la encuesta de prueba tendría que estar disponible')
  return r.encuesta
}

interface Llamada { url: string; metodo: string; cuerpo: unknown }
let llamadas: Llamada[]
let responder: (l: Llamada) => Response | Promise<Response>
const BASE = `/api/public/encuesta/${TOKEN_DE_PRUEBA}`
const ok = (data: unknown = { ok: true }) => new Response(JSON.stringify({ data }), { status: 200 })
const patches = (paso?: string) => llamadas.filter(l => l.metodo === 'PATCH' && (!paso || (l.cuerpo as { paso: string }).paso === paso))

beforeEach(() => {
  llamadas = []
  responder = l => l.metodo === 'POST' && l.url === BASE
    ? ok({ completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `${BASE}/regalo` } })
    : ok()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const l = { url, metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : null }
    llamadas.push(l)
    return responder(l)
  }))
})

describe('EncuestaVisita (criterios 20, 21, 22)', () => {
  it('bienvenida con regalo: nombre, dirección, regalo, "menos de un minuto", sin contar preguntas', async () => {
    render(<EncuestaVisita encuesta={encuesta()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mariana, este regalo es tuyo.' })).toBeInTheDocument()
    expect(screen.getByText('Visitaste Doblas 248, Caballito')).toBeInTheDocument()
    expect(screen.getByText('Guía de Caballito')).toBeInTheDocument()
    expect(screen.getByText(/Te lleva menos de un minuto/)).toBeInTheDocument()
    expect(screen.queryByText(/\d+ (de|preguntas)/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiero mi regalo' })).toBeInTheDocument()
    await waitFor(() => expect(patches('abierta')).toHaveLength(1))
  })
  it('sin regalo: bienvenida neutra, sin la palabra regalo', () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mariana, ¿qué te pareció Doblas 248?' })).toBeInTheDocument()
    expect(screen.queryByText(/regalo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeInTheDocument()
  })
  it('la primera pantalla no anima ni se esconde (sale del servidor tal cual)', () => {
    const { container } = render(<EncuestaVisita encuesta={encuesta()} />)
    expect(container.querySelector('.encuesta-entra')).toBeNull()
  })
  it('Sí avanza solo y guarda esa respuesta', async () => {
    render(<EncuestaVisita encuesta={encuesta()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quiero mi regalo' }))
    await userEvent.click(await screen.findByRole('radio', { name: /Sí/ }))
    expect(await screen.findByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument()
    expect(patches('gusto')[0].cuerpo).toEqual({ paso: 'gusto', valor: true })
  })
  it('si no se puede guardar, se queda en la pregunta y lo dice', async () => {
    responder = l => (l.metodo === 'PATCH' && (l.cuerpo as { paso: string }).paso === 'gusto' ? Promise.reject(new Error('red')) : ok())
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await userEvent.click(await screen.findByRole('radio', { name: /No/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu respuesta')
    expect(screen.getByRole('heading', { name: 'Mariana, ¿te gustó Doblas 248?' })).toBeInTheDocument()
  })
  it('retoma en la 3 si ya respondió la 1 y la 2 (criterio 21)', () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'] })} />)
    expect(screen.getByRole('heading', { name: '¿Y lo que menos te gustó?' })).toBeInTheDocument()
  })
  it('atrás vuelve a la anterior con lo elegido marcado', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la pregunta anterior' }))
    expect(await screen.findByRole('radio', { name: /Sí/ })).toHaveAttribute('aria-checked', 'true')
  })
  it('"Otra cosa" pide el texto antes del OK', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true })} />)
    await userEvent.click(screen.getByRole('button', { name: /Otra cosa/ }))
    expect(screen.getByRole('button', { name: /OK/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('¿Qué otra cosa?'), 'El barrio')
    await userEvent.click(screen.getByRole('button', { name: /OK/ }))
    await waitFor(() => expect(patches('mas_gusto')[0].cuerpo).toEqual({ paso: 'mas_gusto', etiquetas: ['otra'], otra: 'El barrio' }))
  })
  it('la oferta se ve agrupada; "Prefiero no decirlo" guarda y avanza', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' })} />)
    const campo = screen.getByLabelText('Tu oferta en dólares')
    await userEvent.type(campo, '1290000')
    expect(campo).toHaveValue('1.290.000')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByText('El propietario no ve tu nombre.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Prefiero no decirlo' }))
    await waitFor(() => expect(patches('oferta')[0].cuerpo).toEqual({ paso: 'oferta', monto: null, declina: true }))
    expect(await screen.findByRole('heading', { name: 'Confirmá tus datos para recibirlo' })).toBeInTheDocument()
  })
  it('final: un doble toque manda UNA vez; gracias con la descarga y los avisos', async () => {
    let soltar: () => void = () => {}
    responder = l => {
      if (l.metodo === 'POST' && l.url === BASE) {
        return new Promise<Response>(r => { soltar = () => r(ok({ completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `${BASE}/regalo` } })) })
      }
      return ok()
    }
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    render(<EncuestaVisita encuesta={encuesta(todo)} />)
    const boton = screen.getByRole('button', { name: 'Quiero mi regalo' })
    await userEvent.dblClick(boton)
    soltar()
    expect(await screen.findByRole('link', { name: /Descargar Guía de Caballito/ })).toHaveAttribute('href', `${BASE}/regalo`)
    expect(llamadas.filter(l => l.metodo === 'POST' && l.url === BASE)).toHaveLength(1)
    await waitFor(() => expect(llamadas.some(l => l.url === `${BASE}/avisos`)).toBe(true))
  })
  it('si el servidor dice que falta una respuesta, vuelve a esa pregunta', async () => {
    responder = l => (l.metodo === 'POST' && l.url === BASE
      ? new Response(JSON.stringify({ error: 'Falta responder una pregunta', paso: 'precio' }), { status: 409 })
      : ok())
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    render(<EncuestaVisita encuesta={encuesta(todo)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quiero mi regalo' }))
    expect(await screen.findByRole('heading', { name: /Está publicada en US\$ 150\.000/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Falta responder esta pregunta')
  })
  it('ya respondida: directo a gracias, sin marcar "abierta"', async () => {
    render(<EncuestaVisita encuesta={encuesta({ completed_at: '2026-10-15T14:00:00Z' })} />)
    expect(screen.getByRole('link', { name: /Descargar Guía de Caballito/ })).toBeInTheDocument()
    await new Promise(r => setTimeout(r, 20))
    expect(patches('abierta')).toHaveLength(0)
  })
  it('el honeypot existe pero no es para personas', () => {
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    const { container } = render(<EncuestaVisita encuesta={encuesta(todo)} />)
    const trampa = container.querySelector('input[name="empresa"]')
    expect(trampa).toHaveAttribute('tabindex', '-1')
    expect(trampa?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
  it('teclado en computadora: B elige "No" en ¿Te gustó?', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await screen.findByRole('radio', { name: /No/ })
    await userEvent.keyboard('b')
    await waitFor(() => expect(patches('gusto')[0]?.cuerpo).toEqual({ paso: 'gusto', valor: false }))
  })
  it('sin precio publicado pregunta en general y no ofrece atajos', () => {
    // propiedad siempre existe en el constructor de pruebas
    const sinPrecio = encuestaConVisitaDePrueba().visita.propiedad!
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'] }, { propiedad: { ...sinPrecio, asking_price: null } })} />)
    expect(screen.getByRole('heading', { name: '¿Qué te parece el precio?' })).toBeInTheDocument()
  })
})
