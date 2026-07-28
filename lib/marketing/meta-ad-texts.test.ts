/**
 * Reparto de textos entre los anuncios de una campaña Meta.
 *
 * Regla del negocio: cada anuncio lleva HASTA 5 textos principales y 5 títulos
 * (Meta los rota optimizando por rendimiento), y dos anuncios de la misma
 * campaña NUNCA deben quedar con el mismo conjunto — un creative idéntico a
 * otro de la cuenta lo rechaza Meta con 400 subcode 3858798.
 */
import { describe, it, expect } from 'vitest'
import { pickWindow, mergeVariantOutcomes, type VariantOutcome } from './meta-campaign-builder'

const TEXTS = Array.from({ length: 10 }, (_, i) => `t${i}`)

describe('pickWindow', () => {
  it('devuelve `count` elementos desde `start`', () => {
    expect(pickWindow(TEXTS, 0, 5)).toEqual(['t0', 't1', 't2', 't3', 't4'])
    expect(pickWindow(TEXTS, 3, 5)).toEqual(['t3', 't4', 't5', 't6', 't7'])
  })

  it('da la vuelta (wrap-around) sin salirse del array', () => {
    expect(pickWindow(TEXTS, 8, 5)).toEqual(['t8', 't9', 't0', 't1', 't2'])
  })

  it('nunca devuelve más elementos que los disponibles (sin repetir)', () => {
    const w = pickWindow(['a', 'b', 'c'], 1, 5)
    expect(w).toHaveLength(3)
    expect(new Set(w).size).toBe(3)
  })

  it('array vacío → vacío (no rompe)', () => {
    expect(pickWindow([], 0, 5)).toEqual([])
  })

  it('los 6 anuncios de una campaña reciben conjuntos DISTINTOS', () => {
    // 6 pares de piezas (E2.5) × ventana de 5 sobre 10 textos.
    const sets = Array.from({ length: 6 }, (_, i) => pickWindow(TEXTS, i, 5).join('|'))
    expect(new Set(sets).size).toBe(6)
  })

  it('cada anuncio recibe 5 textos aunque la IA devuelva pocos (no recorta anuncios)', () => {
    // Con 3 textos, los 6 anuncios igual se arman (con 3 textos cada uno).
    const sets = Array.from({ length: 6 }, (_, i) => pickWindow(['a', 'b', 'c'], i, 5))
    expect(sets.every(s => s.length === 3)).toBe(true)
  })
})

/**
 * Aislamiento de fallos: el bug reportado fue una campaña publicada con 3 de 6
 * anuncios porque un creative rechazado abortaba el lote entero. Estos casos
 * cubren el merge de la pasada inicial con la de reintentos.
 */
const ok = (index: number, value: string): VariantOutcome<string> => ({ ok: true, index, value })
const fail = (index: number, error: string): VariantOutcome<string> => ({ ok: false, index, error })
const IDX = [0, 1, 2, 3, 4, 5]

describe('mergeVariantOutcomes', () => {
  it('todas OK → 6 éxitos en orden, sin fallos', () => {
    const first = IDX.map(i => ok(i, `ad${i}`))
    const { succeeded, failed } = mergeVariantOutcomes(IDX, first, [])
    expect(failed).toEqual([])
    expect(succeeded.map(s => s.value)).toEqual(['ad0', 'ad1', 'ad2', 'ad3', 'ad4', 'ad5'])
  })

  it('el reintento RESCATA a las que fallaron', () => {
    const first = [ok(0, 'ad0'), fail(1, 'duplicado'), ok(2, 'ad2'), fail(3, 'duplicado'), ok(4, 'ad4'), ok(5, 'ad5')]
    const retry = [ok(1, 'ad1r'), ok(3, 'ad3r')]
    const { succeeded, failed } = mergeVariantOutcomes(IDX, first, retry)
    expect(failed).toEqual([])
    // Orden preservado y con los valores del reintento en su posición.
    expect(succeeded.map(s => s.value)).toEqual(['ad0', 'ad1r', 'ad2', 'ad3r', 'ad4', 'ad5'])
  })

  it('si el reintento también falla, reporta el error del REINTENTO', () => {
    const first = [ok(0, 'ad0'), fail(1, 'error viejo'), ...IDX.slice(2).map(i => ok(i, `ad${i}`))]
    const retry = [fail(1, 'error nuevo')]
    const { succeeded, failed } = mergeVariantOutcomes(IDX, first, retry)
    expect(succeeded).toHaveLength(5)
    expect(failed).toEqual([{ index: 1, error: 'error nuevo' }])
  })

  it('una que falla NO se lleva puestas a las demás (el bug de 3 de 6)', () => {
    const first = [ok(0, 'ad0'), fail(1, 'x'), fail(2, 'x'), fail(3, 'x'), ok(4, 'ad4'), ok(5, 'ad5')]
    const { succeeded, failed } = mergeVariantOutcomes(IDX, first, [])
    expect(succeeded).toHaveLength(3)
    expect(failed.map(f => f.index)).toEqual([1, 2, 3])
  })

  it('todas fallan → 0 éxitos (el builder tira para archivar el zombi)', () => {
    const first = IDX.map(i => fail(i, 'boom'))
    const { succeeded, failed } = mergeVariantOutcomes(IDX, first, IDX.map(i => fail(i, 'boom otra vez')))
    expect(succeeded).toEqual([])
    expect(failed).toHaveLength(6)
  })
})
