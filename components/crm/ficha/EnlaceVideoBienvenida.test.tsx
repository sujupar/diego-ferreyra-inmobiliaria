// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { EnlaceVideoBienvenida } from './EnlaceVideoBienvenida'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ENLACE = { codigo: 'k7Hq2mXb9T', url: 'https://inmodf.com.ar/t/k7Hq2mXb9T' }
let cont: HTMLDivElement
let root: Root
let respuestas: Array<{ status: number; cuerpo: unknown }>
let pedidos: Array<{ url: string; metodo: string }>

beforeEach(() => {
  respuestas = []
  pedidos = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    pedidos.push({ url, metodo: init?.method ?? 'GET' })
    const r = respuestas.shift() ?? { status: 500, cuerpo: { error: 'x' } }
    return new Response(JSON.stringify(r.cuerpo), { status: r.status })
  }))
  cont = document.createElement('div')
  document.body.appendChild(cont)
  root = createRoot(cont)
})
afterEach(() => {
  act(() => root.unmount())
  cont.remove()
  vi.unstubAllGlobals()
})

async function montar() {
  await act(async () => { root.render(<EnlaceVideoBienvenida contactoId="c-1" />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('tarjeta "Video de bienvenida" de la ficha', () => {
  it('con enlace: muestra la dirección corta y "Copiar", que lo copia y dice "Copiado"', async () => {
    const escribir = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: escribir } })
    respuestas.push({ status: 200, cuerpo: { enlace: ENLACE, puedeCrear: false } })
    await montar()
    expect(cont.textContent).toContain('inmodf.com.ar/t/k7Hq2mXb9T')
    const boton = [...cont.querySelectorAll('button')].find((b) => b.textContent?.includes('Copiar'))!
    await act(async () => { boton.click() })
    expect(escribir).toHaveBeenCalledWith('https://inmodf.com.ar/t/k7Hq2mXb9T')
    expect(cont.textContent).toContain('Copiado')
  })

  it('sin enlace pero con solicitud del embudo: "Crear enlace del video" lo crea con un POST y lo muestra', async () => {
    respuestas.push({ status: 200, cuerpo: { enlace: null, puedeCrear: true } })
    respuestas.push({ status: 200, cuerpo: { enlace: ENLACE } })
    await montar()
    const boton = [...cont.querySelectorAll('button')].find((b) => b.textContent?.includes('Crear enlace del video'))!
    await act(async () => { boton.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(pedidos.map((p) => p.metodo)).toEqual(['GET', 'POST'])
    expect(cont.textContent).toContain('inmodf.com.ar/t/k7Hq2mXb9T')
  })

  it('sin enlace ni forma de crearlo, la tarjeta no aparece', async () => {
    respuestas.push({ status: 200, cuerpo: { enlace: null, puedeCrear: false } })
    await montar()
    expect(cont.querySelector('[data-video-bienvenida]')).toBeNull()
  })

  it('si la lectura falla, la tarjeta no aparece', async () => {
    respuestas.push({ status: 500, cuerpo: { error: 'x' } })
    await montar()
    expect(cont.querySelector('[data-video-bienvenida]')).toBeNull()
  })
})
