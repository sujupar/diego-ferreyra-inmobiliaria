import { describe, expect, it } from 'vitest'
import { ColaDeGuardado } from './cola-guardado'

function diferido() {
  let resolver!: () => void
  let rechazar!: (e: Error) => void
  const promesa = new Promise<void>((res, rej) => {
    resolver = res
    rechazar = rej
  })
  return { promesa, resolver, rechazar }
}

describe('ColaDeGuardado', () => {
  it('manda los cambios de un mismo video de a uno y en orden', async () => {
    const enviados: Record<string, unknown>[] = []
    const primero = diferido()
    let llamadas = 0
    const cola = new ColaDeGuardado(async (_id, campos) => {
      enviados.push(campos)
      if (++llamadas === 1) await primero.promesa
    })
    cola.agregar('v1', { descripcion: 'vieja' })
    const p1 = cola.enviar('v1')
    cola.agregar('v1', { descripcion: 'nueva' })
    const p2 = cola.enviar('v1')
    await new Promise((r) => setTimeout(r, 0))
    expect(enviados).toEqual([{ descripcion: 'vieja' }]) // el segundo espera al primero
    primero.resolver()
    await Promise.all([p1, p2])
    expect(enviados).toEqual([{ descripcion: 'vieja' }, { descripcion: 'nueva' }])
  })

  it('si un envío falla, los cambios vuelven a quedar pendientes', async () => {
    let fallar = true
    const enviados: Record<string, unknown>[] = []
    const cola = new ColaDeGuardado(async (_id, campos) => {
      if (fallar) throw new Error('sin red')
      enviados.push(campos)
    })
    cola.agregar('v1', { descripcion: 'hola' })
    await cola.enviar('v1').catch(() => {})
    expect(cola.hayPendientes()).toBe(true)
    fallar = false
    cola.agregar('v1', { titulo_youtube: 'T' })
    await cola.enviar('v1')
    expect(enviados).toEqual([{ descripcion: 'hola', titulo_youtube: 'T' }])
    expect(cola.hayPendientes()).toBe(false)
  })

  it('lo más nuevo gana al reponer un envío fallido', async () => {
    let fallar = true
    const enviados: Record<string, unknown>[] = []
    const espera = diferido()
    const cola = new ColaDeGuardado(async (_id, campos) => {
      await espera.promesa
      if (fallar) throw new Error('sin red')
      enviados.push(campos)
    })
    cola.agregar('v1', { descripcion: 'vieja' })
    const p = cola.enviar('v1')
    cola.agregar('v1', { descripcion: 'nueva' }) // llega mientras el viejo está en vuelo
    espera.resolver()
    await p.catch(() => {})
    fallar = false
    await cola.vaciar()
    expect(enviados).toEqual([{ descripcion: 'nueva' }])
  })

  it('vaciar espera lo que está en vuelo y avisa si algo no se guardó', async () => {
    const cola = new ColaDeGuardado(async () => {
      throw new Error('sin red')
    })
    cola.agregar('v1', { descripcion: 'hola' })
    await expect(cola.vaciar()).rejects.toThrow(/no se guard/i)
  })

  it('vaciar sin nada pendiente no hace nada', async () => {
    const cola = new ColaDeGuardado(async () => {})
    await expect(cola.vaciar()).resolves.toBeUndefined()
  })
})
