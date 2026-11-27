// @vitest-environment happy-dom
/**
 * Carrera entre una recarga de la línea de tiempo y un "Ver más" (revisión de código de
 * crm-linea-de-tiempo, hallazgo 4): el "Ver más" no tiene que hacer descartar la recarga.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { CONTACTO, actividadDePrueba, fichaDePrueba, lineaDePrueba } from './datos-prueba'
import { simularRed } from './red-prueba'
import { useFicha } from './use-ficha'

afterEach(() => vi.unstubAllGlobals())
const BASE = `/api/contacts/${CONTACTO}`

describe('useFicha: recarga y "Ver más"', () => {
  it('una recarga en curso no se descarta porque se tocó "Ver más"', async () => {
    let llamada = 0
    let soltarRecarga: (() => void) | null = null
    simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/tasks`]: { body: { tareas: [], total: 0 } },
      [`${BASE}/activities`]: (url) => {
        llamada++
        if (url.includes('antes=')) return { body: { items: lineaDePrueba([actividadDePrueba({ id: 'vieja', occurred_at: '2026-10-01T10:00:00Z' })]), hay_mas: false } }
        if (llamada === 1) return { body: { items: lineaDePrueba([actividadDePrueba({ id: 'a1' })]), hay_mas: true } }
        // La recarga queda pendiente hasta que la soltamos.
        return new Promise((ok) => {
          soltarRecarga = () => ok({ body: { items: lineaDePrueba([actividadDePrueba({ id: 'nueva' }), actividadDePrueba({ id: 'a1' })]), hay_mas: true } })
        })
      },
    })
    const { result } = renderHook(() => useFicha(CONTACTO))
    await waitFor(() => expect(result.current.actividad.estado).toBe('ok'))

    act(() => void result.current.recargarActividad())
    await waitFor(() => expect(soltarRecarga).not.toBeNull())
    act(() => result.current.verMas())
    await act(async () => soltarRecarga!())

    await waitFor(() =>
      expect(result.current.actividad.items.map((i) => (i.tipo === 'actividad' ? i.actividad.id : i.evento.id))).toContain('nueva'),
    )
    expect(result.current.actividad.cargandoMas).toBe(false)
  })

  it('"Ver más" no sale mientras la página 1 está en camino (no saltea renglones)', async () => {
    let soltar: (() => void) | null = null
    let primera = true
    const red = simularRed({
      [`${BASE}/ficha`]: { body: fichaDePrueba() },
      [`${BASE}/tasks`]: { body: { tareas: [], total: 0 } },
      [`${BASE}/activities`]: (url) => {
        if (url.includes('antes=')) return { body: { items: [], hay_mas: false } }
        if (primera) {
          primera = false
          return { body: { items: lineaDePrueba([actividadDePrueba({ id: 'a1' })]), hay_mas: true } }
        }
        return new Promise((ok) => {
          soltar = () => ok({ body: { items: lineaDePrueba([actividadDePrueba({ id: 'nueva' }), actividadDePrueba({ id: 'a1' })]), hay_mas: true } })
        })
      },
    })
    const { result } = renderHook(() => useFicha(CONTACTO))
    await waitFor(() => expect(result.current.actividad.estado).toBe('ok'))
    act(() => void result.current.recargarActividad())
    await waitFor(() => expect(soltar).not.toBeNull())
    act(() => result.current.verMas())
    const conCursor = () => red.mock.calls.filter(([u]) => String(u).includes('antes=')).length
    expect(conCursor()).toBe(0)
    await act(async () => soltar!())
    await waitFor(() => expect(result.current.actividad.items).toHaveLength(2))
    // Ya llegó la página 1: ahora sí, y con el cursor de la lista NUEVA.
    act(() => result.current.verMas())
    await waitFor(() => expect(conCursor()).toBe(1))
    expect(String(red.mock.calls.find(([u]) => String(u).includes('antes='))![0])).toContain(encodeURIComponent('actividad:a1'))
  })
})
