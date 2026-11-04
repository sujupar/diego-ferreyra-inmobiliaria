import { describe, expect, it } from 'vitest'
import { avanzarCopia, PARTE, TECHO_OPERACION_MS, type DepsCopia } from './copia'

/** Un almacenamiento falso que se comporta como la subida reanudable de Supabase. */
function escenario(
  total: number,
  opciones: { msPorParte?: number; msCrear?: number; subidaVencida?: boolean; parteCorta?: boolean } = {},
) {
  let reloj = 0
  const subidas = new Map<string, number>()
  let creadas = 0
  const descargas: [number, number][] = []
  const techos: number[] = []
  const deps: DepsCopia = {
    ahora: () => reloj,
    async crearSubida(t) {
      expect(t).toBe(total)
      reloj += opciones.msCrear ?? 0
      const url = `tus-${++creadas}`
      subidas.set(url, 0)
      return url
    },
    async offsetDeSubida(url) {
      if (opciones.subidaVencida && url === 'tus-vieja') return null
      return subidas.get(url) ?? null
    },
    async descargar(desde, hasta, techoMs) {
      descargas.push([desde, hasta])
      techos.push(techoMs)
      reloj += (opciones.msPorParte ?? 1000) / 2
      const largo = hasta - desde + 1
      return new Uint8Array(opciones.parteCorta ? largo - 1 : largo)
    },
    async subirParte(url, offset, bytes, techoMs) {
      techos.push(techoMs)
      reloj += (opciones.msPorParte ?? 1000) / 2
      expect(subidas.get(url)).toBe(offset)
      subidas.set(url, offset + bytes.length)
      return offset + bytes.length
    },
  }
  return { deps, subidas, descargas, techos, creadas: () => creadas }
}

describe('avanzarCopia', () => {
  it('con partes rápidas copia varias en una vuelta', async () => {
    const total = PARTE * 2 + 10
    const e = escenario(total, { msPorParte: 200 })
    const r = await avanzarCopia({ total, subidaUrl: null }, e.deps, 7000)
    expect(r).toEqual({ subidaUrl: 'tus-1', copiado: total, terminado: true })
    expect(e.descargas).toEqual([
      [0, PARTE - 1],
      [PARTE, PARTE * 2 - 1],
      [PARTE * 2, PARTE * 2 + 9],
    ])
  })

  it('no empieza otra parte si no le alcanza el tiempo para bajarla Y subirla en el peor caso', async () => {
    const total = PARTE * 5
    const e = escenario(total, { msPorParte: 2000 })
    const r1 = await avanzarCopia({ total, subidaUrl: null }, e.deps, 7000)
    expect(r1.copiado).toBe(PARTE) // tras 2 s quedan 5 s < 2 × techo
    const r2 = await avanzarCopia({ total, subidaUrl: r1.subidaUrl }, e.deps, 7000)
    expect(r2.copiado).toBe(PARTE * 2)
    expect(e.creadas()).toBe(1)
  })

  it('ninguna operación espera más que su techo, y el techo nunca pasa el presupuesto que queda', async () => {
    const e = escenario(PARTE * 3, { msPorParte: 200 })
    await avanzarCopia({ total: PARTE * 3, subidaUrl: null }, e.deps, 4000)
    expect(e.techos.length).toBeGreaterThan(0)
    for (const t of e.techos) expect(t).toBeLessThanOrEqual(TECHO_OPERACION_MS)
    expect(e.techos[0]).toBeLessThanOrEqual(2000)
  })

  it('si abrir la subida se llevó casi todo el tiempo, devuelve sin copiar (abrirla ya fue avanzar)', async () => {
    const e = escenario(PARTE * 2, { msCrear: 5000 })
    const r = await avanzarCopia({ total: PARTE * 2, subidaUrl: null }, e.deps, 6000)
    expect(r).toEqual({ subidaUrl: 'tus-1', copiado: 0, terminado: false })
    expect(e.descargas).toHaveLength(0)
  })

  it('con una subida ya abierta copia al menos una parte aunque quede poco tiempo', async () => {
    const e = escenario(PARTE * 2)
    e.subidas.set('tus-a', 0)
    const r = await avanzarCopia({ total: PARTE * 2, subidaUrl: 'tus-a' }, e.deps, 500)
    expect(r.copiado).toBe(PARTE)
  })

  it('retoma desde lo que el almacenamiento dice que ya tiene (no desde lo que creíamos)', async () => {
    const total = PARTE * 3
    const e = escenario(total, { msPorParte: 100 })
    e.subidas.set('tus-a', PARTE) // la función anterior murió después de subir la primera parte
    const r = await avanzarCopia({ total, subidaUrl: 'tus-a' }, e.deps, 60_000)
    expect(e.descargas[0]).toEqual([PARTE, PARTE * 2 - 1])
    expect(r).toMatchObject({ subidaUrl: 'tus-a', terminado: true })
  })

  it('una subida vencida empieza una nueva desde cero', async () => {
    const e = escenario(PARTE, { subidaVencida: true })
    const r = await avanzarCopia({ total: PARTE, subidaUrl: 'tus-vieja' }, e.deps, 7000)
    expect(r).toMatchObject({ subidaUrl: 'tus-1', copiado: PARTE, terminado: true })
  })

  it('si Drive entrega menos bytes, no se sube nada roto', async () => {
    const e = escenario(PARTE, { parteCorta: true })
    await expect(avanzarCopia({ total: PARTE, subidaUrl: null }, e.deps, 7000)).rejects.toThrow()
    expect(e.subidas.get('tus-1')).toBe(0)
  })

  it('un almacenamiento que dice tener más que el total es un error', async () => {
    const e = escenario(10)
    e.subidas.set('tus-x', 50)
    await expect(avanzarCopia({ total: 10, subidaUrl: 'tus-x' }, e.deps, 7000)).rejects.toThrow(/más/)
  })
})
