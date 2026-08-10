// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { LandingSection } from './LandingSection'
import { ENRICH_STAGES } from '@/lib/landing/enrich'

/**
 * Regla que cubre este archivo: crear la landing dispara UN SOLO loop de
 * enriquecimiento.
 *
 * Cada etapa es una llamada de IA que se paga (Gemini Vision sobre las fotos,
 * créditos de ScraperAPI para la zona, la descripción, los avatares). El efecto
 * que "retoma" el enriquecimiento tras una recarga se re-evalúa apenas cambia
 * `landing`, así que si `start()` no marca `resumedRef` antes de setearla,
 * arrancan DOS loops en paralelo y todo se paga dos veces — sin que nada se vea
 * raro en pantalla (hay una sola barra de progreso).
 *
 * Cómo lo detecta el test sin mirar la implementación: el servidor falso lleva
 * el puntero de etapa igual que el real (una etapa por llamada, compartida). Con
 * UN loop hacen falta exactamente `ENRICH_STAGES.length + 1` llamadas (las que
 * avanzan + la que devuelve `done`). Con DOS, cada loop necesita ver su propio
 * `done` → una llamada de más. Mutar la línea `resumedRef.current = true` de
 * `start()` tiene que poner este test en rojo.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

vi.mock('sonner', () => ({
  toast: { success: () => {}, error: () => {}, info: () => {} },
}))

function respuesta(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

/**
 * El servidor falso TARDA (un turno del reloj, no microtareas).
 *
 * Sin esto el test no prueba nada: con respuestas instantáneas el loop entero
 * termina antes de que React alcance a re-renderizar, así que cuando el efecto
 * de resume por fin corre ya ve `enrich: 'done'` y corta solo — el segundo loop
 * nunca llega a existir y la mutación queda VERDE. En producción cada etapa
 * tarda segundos, o sea que React siempre alcanza a pintar en el medio. Este
 * `setTimeout` es lo que hace que el test se parezca a la realidad.
 */
function tardar(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

const LANDING_BASE = {
  status: 'draft' as const,
  template_id: 'luxury',
  public_slug: null,
  wizard_state: {} as Record<string, unknown>,
}

let llamadasEnrich: number
let etapa: number

beforeEach(() => {
  llamadasEnrich = 0
  etapa = 0

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    await tardar()

    // Estado inicial: la propiedad todavía no tiene landing.
    if (url.endsWith('/landing') && metodo === 'GET') {
      return respuesta({ landing: null, templates: [] })
    }

    // Creación: vuelve rápido y SIN IA, con la primera etapa pendiente.
    if (url.endsWith('/landing') && metodo === 'POST') {
      return respuesta({
        landing: { ...LANDING_BASE, wizard_state: { enrich: ENRICH_STAGES[0] } },
        templates: [],
      })
    }

    // Enriquecimiento: UNA etapa por llamada, con el puntero del lado del
    // servidor (que es lo que hace que dos loops en paralelo se pisen).
    if (url.endsWith('/landing/enrich') && metodo === 'POST') {
      llamadasEnrich++
      if (etapa >= ENRICH_STAGES.length) {
        return respuesta({ landing: { ...LANDING_BASE, wizard_state: { enrich: 'done' } }, done: true })
      }
      etapa++
      const siguiente = ENRICH_STAGES[etapa] ?? 'done'
      return respuesta({
        landing: { ...LANDING_BASE, wizard_state: { enrich: siguiente } },
        stage: siguiente,
        label: 'Generando…',
        percent: etapa * 25,
      })
    }

    throw new Error(`fetch no esperado: ${metodo} ${url}`)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LandingSection — creación de la landing', () => {
  it('corre UN solo loop de enriquecimiento (cada etapa de IA se paga una vez)', async () => {
    render(<LandingSection propertyId="prop-1" />)

    const boton = await screen.findByRole('button', { name: /Crear landing con IA/i })
    fireEvent.click(boton)

    // El servidor ya corrió todas las etapas…
    await waitFor(() => expect(etapa).toBe(ENRICH_STAGES.length))
    // …y le damos tiempo a que termine cualquier cosa que siga en vuelo (con dos
    // loops, el segundo todavía tiene que pedir su propio `done`).
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })

    // Un loop: N etapas + la llamada que responde `done`. Dos loops darían una más.
    expect(llamadasEnrich).toBe(ENRICH_STAGES.length + 1)
  })

  it('no vuelve a enriquecer una landing ya terminada', async () => {
    // Dejamos morir lo que el test anterior pudiera tener en vuelo antes de contar.
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    llamadasEnrich = 0

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      if (url.endsWith('/landing') && metodo === 'GET') {
        return respuesta({
          landing: { ...LANDING_BASE, wizard_state: { enrich: 'done', questions: [] } },
          templates: [],
        })
      }
      if (url.endsWith('/landing/enrich')) { llamadasEnrich++; return respuesta({ done: true }) }
      throw new Error(`fetch no esperado: ${metodo} ${url}`)
    }))

    render(<LandingSection propertyId="prop-1" />)
    await screen.findByText(/Landing Page — en construcción/i)
    expect(llamadasEnrich).toBe(0)
  })
})
