import { describe, expect, it } from 'vitest'
import { mediana, medirCuenta } from './medicion'
import type { ConfigRadar, ReelCrudo } from './tipos'

const AHORA = new Date('2026-11-28T12:00:00Z')
const CFG: ConfigRadar = {
  multiplicadorMin: 3, diasMax: 30, vistasMin: 20_000, reelsBase: 24, diasMaduro: 7,
  puntajeMin: 6, topeDiario: 10, topeCuentas: 50, topeReels: 20,
}
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()
let n = 0
function reel(p: Partial<ReelCrudo> & { dias: number }): ReelCrudo {
  const { dias, ...resto } = p
  n++
  return {
    shortcode: `R${n}`, pk: `${n}`, cuenta: 'cuenta', publicadoAt: haceDias(dias), vistas: 10_000,
    likes: 100, comentarios: 10, caption: '', duracionSeg: 30, urlPortada: null, esReel: true, ...resto,
  }
}
const maduros = (k: number, vistas = 10_000) => Array.from({ length: k }, (_, i) => reel({ dias: 40 + i, vistas }))

describe('mediana', () => {
  it('vacío → null, impar y par', () => {
    expect(mediana([])).toBeNull()
    expect(mediana([1, 3, 2])).toBe(2)
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('medirCuenta', () => {
  it('base 10.000 y un candidato de 6x', () => {
    const viral = reel({ dias: 5, vistas: 60_000 })
    const m = medirCuenta([...maduros(10), viral], CFG, AHORA)
    expect(m.base).toBe(10_000)
    expect(m.baseN).toBe(10)
    expect(m.candidatos).toHaveLength(1)
    expect(m.candidatos[0].shortcode).toBe(viral.shortcode)
    expect(m.candidatos[0].multiplicador).toBe(6)
  })

  it('ignora reels sin vistas, con 0 o que no son reel', () => {
    const basura = [reel({ dias: 3, vistas: null }), reel({ dias: 3, vistas: 0 }), reel({ dias: 3, vistas: 900_000, esReel: false })]
    const m = medirCuenta([...maduros(10), ...basura], CFG, AHORA)
    expect(m.candidatos).toHaveLength(0)
    expect(m.descartados.map((d) => d.shortcode)).not.toContain(basura[0].shortcode)
    expect(m.descartados.map((d) => d.shortcode)).not.toContain(basura[2].shortcode)
    expect(m.baseN).toBe(10)
  })

  it('un reel de hace 2 días no entra a la base pero sí puede ser candidato', () => {
    const joven = reel({ dias: 2, vistas: 90_000 })
    const m = medirCuenta([...maduros(6), joven], CFG, AHORA)
    expect(m.base).toBe(10_000)
    expect(m.baseN).toBe(6)
    expect(m.candidatos.map((c) => c.shortcode)).toEqual([joven.shortcode])
  })

  it('base insuficiente con 5 maduros', () => {
    const m = medirCuenta([...maduros(5), reel({ dias: 2, vistas: 90_000 })], CFG, AHORA)
    expect(m.base).toBeNull()
    expect(m.candidatos).toHaveLength(0)
    expect(m.descartados.length).toBeGreaterThan(0)
    expect(m.descartados.every((d) => d.motivo === 'base insuficiente')).toBe(true)
  })

  it('umbrales: bajo multiplicador, pocas vistas y viejo', () => {
    const bajo = reel({ dias: 5, vistas: 29_000 })      // 2,9x
    const pocas = reel({ dias: 5, vistas: 19_999 })     // 2x y < vistasMin
    const viejo = reel({ dias: 31, vistas: 100_000 })   // 10x pero viejo
    const m = medirCuenta([...maduros(10), bajo, pocas, viejo], CFG, AHORA)
    const motivo = (r: ReelCrudo) => m.descartados.find((d) => d.shortcode === r.shortcode)?.motivo
    expect(motivo(bajo)).toBe('bajo multiplicador')
    expect(motivo(pocas)).toBe('pocas vistas')
    expect(motivo(viejo)).toBe('viejo')
    expect(m.candidatos.map((c) => c.shortcode)).not.toContain(bajo.shortcode)
  })

  it('pocas vistas aun con multiplicador alto', () => {
    const m = medirCuenta([...maduros(10, 1_000), reel({ dias: 5, vistas: 19_999 })], CFG, AHORA)
    expect(m.descartados.find((d) => d.motivo === 'pocas vistas')?.multiplicador).toBeCloseTo(19.999)
  })

  it('la base usa solo los reelsBase más recientes', () => {
    const recientes = Array.from({ length: 3 }, (_, i) => reel({ dias: 10 + i, vistas: 50_000 }))
    const viejos = Array.from({ length: 5 }, (_, i) => reel({ dias: 60 + i, vistas: 1_000 }))
    const m = medirCuenta([...recientes, ...viejos], { ...CFG, reelsBase: 6 }, AHORA)
    // 6 más recientes: 3x50.000 + 3x1.000 → mediana 25.500
    expect(m.baseN).toBe(6)
    expect(m.base).toBe(25_500)
  })
})
