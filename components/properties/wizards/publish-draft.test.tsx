// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMlPublishDraft } from './ml/useMlPublishDraft'
import { useApPublishDraft } from './ap/useApPublishDraft'

/**
 * El botón "Siguiente" de los dos asistentes de publicación queda deshabilitado
 * mientras `saving` es true, y `saving` se apaga mirando lo que devuelve
 * `save()`. Si `save()` TIRA —y tiraba: hacía `await r.json()` pelado, así que
 * la página HTML de error de un 504 lo reventaba— el botón quedaba muerto en
 * "Guardando…" para siempre y la única salida era recargar la página.
 *
 * El PATCH que dispara ese botón es justo el que puede tardar: recalcula la
 * validación pidiéndole los atributos de la categoría al portal, sin techo de
 * tiempo, y con el caché de 24hs frío eso es un ida y vuelta real.
 *
 * Regla que se prueba acá: `save()` NUNCA tira. Devuelve false y avisa.
 * Mutar el `leerJson(...)` de vuelta a `r.json()`, o sacar el try/catch, tiene
 * que poner estos tests en rojo.
 */

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: () => {} } }))

function respuesta(cuerpo: string, ok: boolean, status: number) {
  return { ok, status, text: async () => cuerpo, json: async () => JSON.parse(cuerpo) } as unknown as Response
}

/** Preview mínimo válido para que el hook arme el draft. */
const PREVIEW = JSON.stringify({
  property: { photos: ['a.jpg'], title: 'Depto', description: 'x', asking_price: 1, address: 'Calle 1' },
  payload: null,
  validation: { ok: true, errors: [], warnings: [] },
  listing: null,
})
const ATTRS = JSON.stringify({ prefill: {}, listingTypeSelected: 'free', mediaChoice: 'none' })

/** El PATCH devuelve la página HTML de error del gateway (el caso que rompía). */
function stubFetch(patchResponse: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'PATCH') return patchResponse()
    if (url.includes('attributes')) return respuesta(ATTRS, true, 200)
    return respuesta(PREVIEW, true, 200)
  }))
}

const CASOS = [
  { nombre: 'MercadoLibre', hook: useMlPublishDraft },
  { nombre: 'Argenprop', hook: useApPublishDraft },
] as const

beforeEach(() => { toastError.mockClear() })
afterEach(() => { vi.unstubAllGlobals() })

describe.each(CASOS)('$nombre — save() del asistente de publicación', ({ hook }) => {
  it('no TIRA cuando el gateway devuelve su página HTML de 504: devuelve false y avisa', async () => {
    stubFetch(async () => respuesta('<HTML><head>Gateway Timeout</head></HTML>', false, 504))
    const { result } = renderHook(() => hook('prop-1'))
    await waitFor(() => expect(result.current.draft).not.toBeNull())

    let devuelto: boolean | undefined
    await act(async () => { devuelto = await result.current.save() })

    expect(devuelto).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError.mock.calls[0][0]).toMatch(/tardó demasiado/i)
    expect(toastError.mock.calls[0][0]).not.toMatch(/Unexpected token/i)
  })

  it('no TIRA cuando el fetch ni siquiera llega (conexión caída)', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    const { result } = renderHook(() => hook('prop-1'))
    await waitFor(() => expect(result.current.draft).not.toBeNull())

    let devuelto: boolean | undefined
    await act(async () => { devuelto = await result.current.save() })

    expect(devuelto).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('sigue mostrando el error del servidor cuando el 400 SÍ es JSON', async () => {
    stubFetch(async () => respuesta('{"error":"Falta la categoría"}', false, 400))
    const { result } = renderHook(() => hook('prop-1'))
    await waitFor(() => expect(result.current.draft).not.toBeNull())

    let devuelto: boolean | undefined
    await act(async () => { devuelto = await result.current.save() })

    expect(devuelto).toBe(false)
    expect(toastError).toHaveBeenCalledWith('Falta la categoría')
  })

  it('guarda bien y aplica la validación recalculada', async () => {
    stubFetch(async () => respuesta('{"validation":{"ok":true,"errors":[],"warnings":["ojo"]}}', true, 200))
    const { result } = renderHook(() => hook('prop-1'))
    await waitFor(() => expect(result.current.draft).not.toBeNull())

    let devuelto: boolean | undefined
    await act(async () => { devuelto = await result.current.save() })

    expect(devuelto).toBe(true)
    expect(toastError).not.toHaveBeenCalled()
    expect(result.current.validation.warnings).toEqual(['ojo'])
  })
})
