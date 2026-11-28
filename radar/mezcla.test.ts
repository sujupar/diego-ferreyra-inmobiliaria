import { describe, expect, it } from 'vitest'
import { elegirPublicables, type Aprobado } from './mezcla'
import type { Categoria, ConfigRadar } from './tipos'

const cfg: ConfigRadar = {
  multiplicadorMin: 3, diasMax: 14, vistasMin: 1000, reelsBase: 10, diasMaduro: 3,
  puntajeMin: 6, topeDiario: 10, topeCuentas: 50, topeReels: 100,
}

let n = 0
function ap(categoria: Categoria, puntaje = 8, multiplicador = 5): Aprobado {
  n++
  return { shortcode: `s${n}`, multiplicador, clas: { categoria, tema: 'otro', puntaje, razon: '' } }
}
const lote = (c: Categoria, cant: number) => Array.from({ length: cant }, () => ap(c))
const esInmob = (a: Aprobado) => a.clas.categoria.startsWith('inmobiliario')

describe('elegirPublicables', () => {
  it('12 inmobiliarios + 5 otros, semana vacía: 10 en total, 1 o 2 otros', () => {
    const r = elegirPublicables([...lote('inmobiliario_ar', 12), ...lote('formato_otro_rubro', 5)], { inmobiliarias: 0, otras: 0 }, cfg)
    const otros = r.filter((a) => !esInmob(a)).length
    expect(r).toHaveLength(10)
    expect(otros).toBeGreaterThanOrEqual(1)
    expect(otros).toBeLessThanOrEqual(2)
  })

  it('1 inmobiliario + 3 otros, semana vacía: 2 (1 + el mínimo de 1 otro)', () => {
    const r = elegirPublicables([...lote('inmobiliario_ar', 1), ...lote('formato_otro_rubro', 3)], { inmobiliarias: 0, otras: 0 }, cfg)
    expect(r).toHaveLength(2)
  })

  it('0 inmobiliarios + 3 otros: nada', () => {
    expect(elegirPublicables(lote('formato_otro_rubro', 3), { inmobiliarias: 0, otras: 0 }, cfg)).toHaveLength(0)
  })

  it('semana al límite: 2 inmobiliarios + 1 otro (mínimo diario) aunque pase el 20 %', () => {
    const r = elegirPublicables([...lote('inmobiliario_ar', 2), ...lote('formato_otro_rubro', 2)], { inmobiliarias: 8, otras: 2 }, cfg)
    expect(r.filter(esInmob)).toHaveLength(2)
    expect(r.filter((a) => !esInmob(a))).toHaveLength(1)
  })

  it('nunca salen no_sirve ni puntaje bajo el mínimo', () => {
    const r = elegirPublicables(
      [ap('no_sirve', 10), ap('inmobiliario_ar', 5), ap('formato_otro_rubro', 3), ap('inmobiliario_ar', 6)],
      { inmobiliarias: 0, otras: 0 }, cfg)
    expect(r.every((a) => a.clas.categoria !== 'no_sirve' && a.clas.puntaje >= 6)).toBe(true)
    expect(r.filter(esInmob)).toHaveLength(1)
  })

  it('ordena por multiplicador*puntaje y desempata a favor de inmobiliario_ar', () => {
    const otro = ap('inmobiliario_otro_pais', 8, 5)
    const ar = ap('inmobiliario_ar', 8, 5)
    const fuerte = ap('inmobiliario_otro_pais', 9, 9)
    const r = elegirPublicables([otro, ar, fuerte], { inmobiliarias: 0, otras: 0 }, cfg)
    expect(r.map((a) => a.shortcode)).toEqual([fuerte.shortcode, ar.shortcode, otro.shortcode])
  })

  it('con semana cargada y el tope diario recortando, la proporción semanal real no pasa 20 %', () => {
    const semana = { inmobiliarias: 8, otras: 2 }
    const r = elegirPublicables([...lote('inmobiliario_ar', 12), ...lote('formato_otro_rubro', 5)], semana, cfg)
    const otros = r.filter((a) => !esInmob(a)).length
    const inmob = r.length - otros
    expect(r).toHaveLength(10)
    expect(inmob).toBe(8)
    expect(otros).toBe(2)
    expect((semana.otras + otros) / (semana.inmobiliarias + semana.otras + r.length)).toBeLessThanOrEqual(0.2)
  })
})
