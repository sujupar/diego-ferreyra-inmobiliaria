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
  it('sin precio publicado pregunta en general y no ofrece atajos', async () => {
    // propiedad siempre existe en el constructor de pruebas
    const sinPrecio = encuestaConVisitaDePrueba().visita.propiedad!
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'] }, { propiedad: { ...sinPrecio, asking_price: null } })} />)
    expect(screen.getByRole('heading', { name: '¿Qué te parece el precio?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Correcto' }))
    expect(await screen.findByRole('heading', { name: /ofertarías/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /%:/ })).not.toBeInTheDocument()
  })
})

describe('EncuestaVisita — ronda 1 (revisión)', () => {
  it('letra + Enter rápido no saltea una pregunta (hallazgo 1)', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await screen.findByRole('radio', { name: /Sí/ })
    await userEvent.keyboard('a')
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument()
    // Si el temporizador del auto-avance no se hubiera cancelado, a los 350 ms saltaría OTRA vez.
    await new Promise(r => setTimeout(r, 400))
    expect(screen.getByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument()
    expect(patches('gusto')).toHaveLength(1)
  })
  it('"Sí" y atrás antes de los 350 ms no vuelve solo a "gusto" (hallazgo 2)', async () => {
    render(<EncuestaVisita encuesta={encuesta()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quiero mi regalo' }))
    await userEvent.click(await screen.findByRole('radio', { name: /Sí/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la pregunta anterior' }))
    expect(screen.getByRole('heading', { name: /este regalo es tuyo/ })).toBeInTheDocument()
    await new Promise(r => setTimeout(r, 400))
    expect(screen.getByRole('heading', { name: /este regalo es tuyo/ })).toBeInTheDocument()
  })
  it('Enter en el teléfono pasa al email, no manda el formulario (hallazgo 3)', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto', offer_declined: true }, { client_phone: null })} />)
    const telefono = await screen.findByLabelText('Tu WhatsApp')
    await userEvent.type(telefono, '1158234521')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('Tu email (opcional)')).toHaveFocus()
    expect(llamadas.filter(l => l.metodo === 'POST')).toHaveLength(0)
  })
  it('el botón sigue apagado pero explica por qué, al salir del campo (hallazgo 4)', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto', offer_declined: true }, { client_phone: null })} />)
    const telefono = await screen.findByLabelText('Tu WhatsApp')
    expect(screen.queryByText(/El teléfono tiene que tener/)).not.toBeInTheDocument()
    await userEvent.type(telefono, '123')
    await userEvent.tab()
    expect(await screen.findByText('El teléfono tiene que tener al menos 8 números.')).toBeInTheDocument()
    expect(telefono).toHaveAttribute('aria-invalid', 'true')
    expect(telefono).toHaveAttribute('aria-describedby', 'telefono-ayuda')
    const email = screen.getByLabelText('Tu email (opcional)')
    await userEvent.type(email, 'ana@')
    await userEvent.tab()
    expect(await screen.findByText('Revisá el email, o dejalo vacío.')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'email-ayuda')
    expect(screen.getByRole('button', { name: 'Quiero mi regalo' })).toBeDisabled()
  })
  it('Reintentar vuelve a mandar la misma respuesta (hallazgo 5)', async () => {
    let fallos = 0
    responder = l => {
      if (l.metodo === 'PATCH' && (l.cuerpo as { paso: string } | null)?.paso === 'gusto') {
        fallos++
        return fallos === 1 ? Promise.reject(new Error('red')) : ok()
      }
      return ok()
    }
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await userEvent.click(await screen.findByRole('radio', { name: /No/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu respuesta')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument())
    expect(patches('gusto')).toHaveLength(2)
  })
  it('↑/↓ mueve el foco entre opciones; las letras no despachan mientras hay un guardado en curso (hallazgo 6)', async () => {
    let soltar: () => void = () => {}
    responder = l => {
      if (l.metodo === 'PATCH' && (l.cuerpo as { paso: string } | null)?.paso === 'gusto') {
        return new Promise<Response>(r => { soltar = () => r(ok()) })
      }
      return ok()
    }
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    const si = await screen.findByRole('radio', { name: /Sí/ })
    const no = screen.getByRole('radio', { name: /No/ })
    si.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(no).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(si).toHaveFocus()
    await userEvent.click(si)
    await new Promise(r => setTimeout(r, 400)) // dispara el auto-avance: queda "ocupado" hasta soltar()
    await userEvent.keyboard('b')
    expect(patches('gusto')).toHaveLength(1)
    soltar()
    await waitFor(() => expect(screen.getByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument())
  })
  it('doble toque en la misma opción manda UNA sola vez', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    const si = await screen.findByRole('radio', { name: /Sí/ })
    await userEvent.dblClick(si)
    await waitFor(() => expect(screen.getByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument())
    expect(patches('gusto')).toHaveLength(1)
  })
  it('el foco va al título al cambiar de paso', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mariana, ¿te gustó Doblas 248?' })).toHaveFocus())
  })
  it('la barra de avance tiene valores consistentes (nunca "paso N de M" visible)', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    const barra = screen.getByRole('progressbar', { name: 'Avance de la encuesta' })
    expect(barra).toHaveAttribute('aria-valuemin', '0')
    expect(barra).toHaveAttribute('aria-valuemax', '100')
    expect(barra).toHaveAttribute('aria-valuenow', '0')
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await waitFor(() => expect(barra).toHaveAttribute('aria-valuenow', String(Math.round((1 / 7) * 100))))
  })
})
