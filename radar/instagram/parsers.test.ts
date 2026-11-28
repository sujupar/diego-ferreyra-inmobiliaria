import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsearBusqueda,
  parsearComentarios,
  parsearExplorar,
  parsearPerfil,
  parsearPestanaReels,
  parsearReels,
  shortcodeAPk,
} from './parsers'

const muestra = (n: string): unknown => JSON.parse(readFileSync(join(__dirname, 'fixtures', `${n}.json`), 'utf8'))
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('parsearPerfil', () => {
  it('lee usuario, id y seguidores reales de la muestra', () => {
    expect(parsearPerfil(muestra('perfil'))).toEqual({ usuario: 'toribioachaval', igUserId: '3205359895', seguidores: 80096 })
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearPerfil({})).toThrow('forma inesperada')
  })
})

describe('parsearReels (grilla de la cuenta y media/info)', () => {
  const reels = parsearReels(muestra('reels'), 'toribioachaval')
  it('devuelve reels con fecha ISO y esReel', () => {
    const reel = reels.find((r) => r.esReel)!
    expect(reel).toBeDefined()
    expect(reel.publicadoAt).toMatch(ISO)
    expect(reel.shortcode).toBe('DgN1RcBBMlU')
    expect(reel.pk).toBe('4039118735599257940')
    expect(reel.cuenta).toBe('toribioachaval')
    expect(reel.likes).toBe(429)
    expect(reel.comentarios).toBe(20)
    expect(reel.caption.length).toBeGreaterThan(0)
  })
  it('marca esReel:false en los posts sin video (carruseles)', () => {
    const carrusel = reels.find((r) => r.shortcode === 'DgITUCalHOK')!
    expect(carrusel.esReel).toBe(false)
  })
  it('media/info trae vistas numéricas y duración', () => {
    const [r] = parsearReels(muestra('media-info'), 'toribioachaval')
    expect(r.vistas).toBe(18026)
    expect(typeof r.vistas).toBe('number')
    expect(r.duracionSeg).toBeCloseTo(89.97, 1)
    expect(r.esReel).toBe(true)
    expect(r.publicadoAt).toMatch(ISO)
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearReels({}, 'x')).toThrow('forma inesperada')
  })
  it('tira ante una fecha inválida, nunca emite NaN', () => {
    const malo = { items: [{ code: 'abc', pk: '1', media_type: 2, taken_at: 'ayer', user: { username: 'x' } }] }
    expect(() => parsearReels(malo, 'x')).toThrow('forma inesperada')
    const sinFecha = { items: [{ code: 'abc', pk: '1', media_type: 2, user: { username: 'x' } }] }
    expect(() => parsearReels(sinFecha, 'x')).toThrow('forma inesperada')
  })
})

describe('parsearPestanaReels', () => {
  it('devuelve vistas por shortcode', () => {
    const m = parsearPestanaReels(muestra('reels-pestana'))
    expect(m.reels.length).toBeGreaterThanOrEqual(1)
    const r = m.reels.find((x) => x.shortcode === 'DgN1RcBBMlU')!
    expect(r.vistas).toBe(18024)
    expect(r.pk).toBe('4039118735599257940')
    expect(typeof m.hayMas).toBe('boolean')
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearPestanaReels({})).toThrow('forma inesperada')
  })
})

describe('parsearExplorar', () => {
  it('devuelve reels de otras cuentas con vistas y fecha', () => {
    const reels = parsearExplorar(muestra('explorar'))
    expect(reels.length).toBeGreaterThanOrEqual(1)
    expect(reels[0].cuenta.length).toBeGreaterThan(0)
    expect(reels.every((r) => r.publicadoAt.match(ISO))).toBe(true)
    expect(reels.some((r) => typeof r.vistas === 'number')).toBe(true)
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearExplorar({})).toThrow('forma inesperada')
  })
})

describe('parsearBusqueda', () => {
  it('devuelve usuarios sin repetir', () => {
    const us = parsearBusqueda(muestra('busqueda'))
    expect(us.length).toBeGreaterThanOrEqual(1)
    expect(new Set(us).size).toBe(us.length)
    expect(us.every((u) => /^[a-z0-9._]+$/i.test(u))).toBe(true)
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearBusqueda({})).toThrow('forma inesperada')
  })
})

describe('parsearComentarios', () => {
  it('devuelve textos no vacíos', () => {
    const cs = parsearComentarios(muestra('comentarios'))
    expect(cs.length).toBeGreaterThanOrEqual(1)
    expect(cs.every((c) => c.trim().length > 0)).toBe(true)
  })
  it('tira ante una forma desconocida', () => {
    expect(() => parsearComentarios({})).toThrow('forma inesperada')
  })
})

describe('shortcodeAPk', () => {
  it('convierte el shortcode al id numérico', () => {
    expect(shortcodeAPk('DgN1RcBBMlU')).toBe('4039118735599257940')
  })
  it('tira con caracteres inválidos', () => {
    expect(() => shortcodeAPk('a$b')).toThrow()
  })
})
