import { describe, expect, it } from 'vitest'
import type { ReelCrudo } from '../tipos'
import { cruzarReels } from './cruce'
import type { ReelDePestana } from './parsers'

const tab = (shortcode: string, vistas: number | null): ReelDePestana => ({
  shortcode,
  pk: '1',
  vistas,
  likes: 5,
  comentarios: 2,
  urlPortada: 'https://cdn/tab.jpg',
})
const det = (shortcode: string, extra: Partial<ReelCrudo> = {}): ReelCrudo => ({
  shortcode,
  pk: '1',
  cuenta: 'otra',
  publicadoAt: '2026-11-20T10:00:00.000Z',
  vistas: null,
  likes: 9,
  comentarios: 9,
  caption: 'texto',
  duracionSeg: null,
  urlPortada: null,
  esReel: false,
  ...extra,
})

describe('cruzarReels', () => {
  it('mantiene el orden de la pestaña Reels y toma las vistas de ahí', () => {
    const detalle = new Map([['B', det('B')], ['A', det('A')]])
    const { reels } = cruzarReels([tab('A', 100), tab('B', 200)], detalle, 'cuenta')
    expect(reels.map((r) => r.shortcode)).toEqual(['A', 'B'])
    expect(reels.map((r) => r.vistas)).toEqual([100, 200])
    expect(reels.every((r) => r.esReel && r.cuenta === 'cuenta')).toBe(true)
    expect(reels[0].publicadoAt).toBe('2026-11-20T10:00:00.000Z')
    expect(reels[0].caption).toBe('texto')
  })
  it('sin vistas en ningún lado queda null, nunca 0', () => {
    const { reels } = cruzarReels([tab('A', null)], new Map([['A', det('A')]]), 'c')
    expect(reels[0].vistas).toBeNull()
  })
  it('si la pestaña no trae vistas usa las del detalle (media/info)', () => {
    const { reels } = cruzarReels([tab('A', null)], new Map([['A', det('A', { vistas: 77 })]]), 'c')
    expect(reels[0].vistas).toBe(77)
  })
  it('un reel que no está en la grilla queda afuera y se informa', () => {
    const { reels, sinFecha } = cruzarReels([tab('A', 1), tab('X', 2)], new Map([['A', det('A')]]), 'c')
    expect(reels.map((r) => r.shortcode)).toEqual(['A'])
    expect(sinFecha).toEqual(['X'])
  })
  it('la portada del detalle manda; si falta, la de la pestaña', () => {
    const { reels } = cruzarReels([tab('A', 1)], new Map([['A', det('A')]]), 'c')
    expect(reels[0].urlPortada).toBe('https://cdn/tab.jpg')
  })
})
