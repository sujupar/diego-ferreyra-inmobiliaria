// @vitest-environment happy-dom
/**
 * Video de bienvenida (tasacion-video-bienvenida, D4): el reproductor de las landings acepta una
 * identidad fija (`anonId`) y avisa los segundos reproducidos. Sin esas props tiene que seguir
 * midiendo EXACTAMENTE como hoy (con la cookie del navegador): lo usan las landings pagas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/lib/funnel/anon-id', () => ({ getOrCreateAnonId: () => 'cookie-del-navegador' }))
vi.mock('@/lib/funnel/heatmap-preview', () => ({ isHeatmapPreview: () => false }))

import { FunnelClickToPlayVideo } from './FunnelClickToPlayVideo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let cont: HTMLDivElement
let root: Root
let enviados: Array<Record<string, unknown>>

beforeEach(() => {
  enviados = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
    if (init?.body) enviados.push(JSON.parse(init.body))
    return new Response('{}')
  }))
  // El flush final usa sendBeacon: en happy-dom saldría de verdad contra localhost.
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_url: string, data: Blob) => {
      void data.text().then((t) => enviados.push(JSON.parse(t)))
      return true
    },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
  cont = document.createElement('div')
  document.body.appendChild(cont)
  root = createRoot(cont)
})

afterEach(() => {
  act(() => root.unmount())
  cont.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function video(): HTMLVideoElement {
  const v = cont.querySelector('video')
  if (!v) throw new Error('sin <video>')
  return v
}

function tocarPlay() {
  const b = cont.querySelector('button[aria-label="Reproducir video"]') as HTMLButtonElement | null
  if (!b) throw new Error('sin botón de play')
  act(() => { b.click() })
}

function disparar(v: HTMLVideoElement, evento: string, currentTime?: number, paused = false) {
  if (currentTime !== undefined) Object.defineProperty(v, 'currentTime', { configurable: true, value: currentTime })
  Object.defineProperty(v, 'paused', { configurable: true, value: paused })
  act(() => { v.dispatchEvent(new Event(evento)) })
}

describe('identidad de la medición', () => {
  it('con anonId, la medición viaja con esa identidad y no con la cookie', () => {
    act(() => root.render(<FunnelClickToPlayVideo src="/v.mp4" trackKey="bienvenida-tasacion-v1" anonId="bv:k7Hq2mXb9T" vslBar />))
    tocarPlay()
    disparar(video(), 'playing', 0)
    expect(enviados.at(-1)).toMatchObject({ anonId: 'bv:k7Hq2mXb9T', videoKey: 'bienvenida-tasacion-v1', funnel: null })
  })

  it('sin anonId, sigue usando la cookie del navegador (las landings no cambian)', () => {
    act(() => root.render(<FunnelClickToPlayVideo src="/v.mp4" trackKey="hero-tasacion" funnel="tasacion" />))
    tocarPlay()
    disparar(video(), 'playing', 0)
    expect(enviados.at(-1)).toMatchObject({ anonId: 'cookie-del-navegador', funnel: 'tasacion' })
  })

  it('sin trackKey no se manda nada (la vista del equipo)', () => {
    act(() => root.render(<FunnelClickToPlayVideo src="/v.mp4" anonId="bv:k7Hq2mXb9T" vslBar />))
    tocarPlay()
    disparar(video(), 'playing', 0)
    expect(enviados).toEqual([])
  })
})

describe('segundos reproducidos', () => {
  it('suma la reproducción normal y no los saltos', () => {
    const avisos: number[] = []
    act(() => root.render(<FunnelClickToPlayVideo src="/v.mp4" vslBar onSegundosReproducidos={(s) => avisos.push(s)} />))
    const v = video()
    disparar(v, 'timeupdate', 0)
    disparar(v, 'timeupdate', 1)
    disparar(v, 'timeupdate', 2)
    disparar(v, 'timeupdate', 300) // adelantó
    disparar(v, 'timeupdate', 301)
    expect(avisos.at(-1)).toBeCloseTo(3)
  })

  it('en pausa no suma', () => {
    const avisos: number[] = []
    act(() => root.render(<FunnelClickToPlayVideo src="/v.mp4" vslBar onSegundosReproducidos={(s) => avisos.push(s)} />))
    const v = video()
    disparar(v, 'timeupdate', 10, true)
    disparar(v, 'timeupdate', 11, true)
    expect(avisos).toEqual([])
  })
})
