import { describe, it, expect } from 'vitest'
import { guardarPendiente, tomarPendiente, type Almacen } from './video-pendiente'

function memoria(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  }
}

const AHORA = 1_800_000_000_000

describe('respaldo del estado del video', () => {
  it('lo guardado en una visita se devuelve en la siguiente, una sola vez', () => {
    const m = memoria()
    guardarPendiente(m, 'hero-x', { watchSeconds: 12 }, AHORA)
    expect(tomarPendiente(m, 'hero-x', AHORA + 1000)).toEqual({ watchSeconds: 12 })
    expect(tomarPendiente(m, 'hero-x', AHORA + 2000)).toBeNull()
  })

  it('cada video tiene su propio respaldo', () => {
    const m = memoria()
    guardarPendiente(m, 'a', { n: 1 }, AHORA)
    guardarPendiente(m, 'b', { n: 2 }, AHORA)
    expect(tomarPendiente(m, 'b', AHORA)).toEqual({ n: 2 })
    expect(tomarPendiente(m, 'a', AHORA)).toEqual({ n: 1 })
  })

  it('el último envío pisa al anterior', () => {
    const m = memoria()
    guardarPendiente(m, 'a', { n: 1 }, AHORA)
    guardarPendiente(m, 'a', { n: 9 }, AHORA + 5000)
    expect(tomarPendiente(m, 'a', AHORA + 6000)).toEqual({ n: 9 })
  })

  it('más de 30 días: no se reenvía y se borra', () => {
    const m = memoria()
    guardarPendiente(m, 'a', { n: 1 }, AHORA)
    expect(tomarPendiente(m, 'a', AHORA + 31 * 24 * 3600 * 1000)).toBeNull()
    expect(m.datos.size).toBe(0)
  })

  it('contenido roto o sin almacenamiento: null, sin errores', () => {
    const m = memoria()
    m.setItem('df_video_pend:a', '{no es json')
    expect(tomarPendiente(m, 'a', AHORA)).toBeNull()
    expect(m.datos.size).toBe(0)
    expect(tomarPendiente(null, 'a', AHORA)).toBeNull()
    expect(() => guardarPendiente(null, 'a', {}, AHORA)).not.toThrow()
  })

  it('almacenamiento que tira error (lleno / bloqueado): no rompe', () => {
    const roto: Almacen = {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('lleno') },
      removeItem: () => { throw new Error('x') },
    }
    expect(() => guardarPendiente(roto, 'a', { n: 1 }, AHORA)).not.toThrow()
    expect(tomarPendiente(roto, 'a', AHORA)).toBeNull()
  })
})
