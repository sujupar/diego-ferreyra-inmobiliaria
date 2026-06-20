import { describe, it, expect } from 'vitest'
import { HeatmapSession } from './heatmap-session'

describe('HeatmapSession', () => {
  it('guarda el scroll MÁXIMO (no regresa)', () => {
    const s = new HeatmapSession()
    s.setScroll(40)
    s.setScroll(80)
    s.setScroll(55)
    expect(s.snapshot().maxScrollPct).toBe(80)
  })

  it('acumula tiempo visible por sección y marca reached', () => {
    const s = new HeatmapSession()
    s.registerSections(['hero', 'cta'])
    s.markReached('hero')
    s.addVisibleMs('hero', 1200)
    s.addVisibleMs('hero', 800)
    const snap = s.snapshot()
    const hero = snap.sections.find((x) => x.key === 'hero')!
    expect(hero.reached).toBe(true)
    expect(hero.ms).toBe(2000)
    expect(snap.sections.find((x) => x.key === 'cta')!.reached).toBe(false)
  })

  it('numera los clics con seq incremental y posición relativa', () => {
    const s = new HeatmapSession()
    s.addClick({ section: 'hero', xPct: 50, yPct: 20, tag: 'button', nowMs: 0, rawX: 100, rawY: 100 })
    s.addClick({ section: 'cta', xPct: 33.33, yPct: 66.66, tag: 'a', nowMs: 5000, rawX: 400, rawY: 900 })
    const c = s.snapshot().clicks
    expect(c[0].seq).toBe(0)
    expect(c[1].seq).toBe(1)
    expect(c[1].section).toBe('cta')
    expect(c[1].xPct).toBe(33.3)
  })

  it('detecta rage clicks (≥2 clics rápidos en ~mismo punto)', () => {
    const s = new HeatmapSession()
    s.addClick({ section: 'cta', xPct: 50, yPct: 50, tag: 'button', nowMs: 0, rawX: 200, rawY: 200 })
    s.addClick({ section: 'cta', xPct: 50, yPct: 50, tag: 'button', nowMs: 300, rawX: 205, rawY: 203 })
    const c = s.snapshot().clicks
    expect(c[0].rage).toBe(false)
    expect(c[1].rage).toBe(true) // <1s y <30px del anterior
  })

  it('respeta el cap de clics', () => {
    const s = new HeatmapSession(3)
    for (let i = 0; i < 10; i++) s.addClick({ section: 'x', xPct: 0, yPct: 0, tag: 'other', nowMs: i * 2000, rawX: i, rawY: i })
    expect(s.snapshot().clicks.length).toBe(3)
  })

  it('hasData es false sin interacción real', () => {
    const s = new HeatmapSession()
    s.registerSections(['hero'])
    expect(s.hasData()).toBe(false)
    s.setScroll(10)
    expect(s.hasData()).toBe(true)
  })
})
