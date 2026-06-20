import { describe, it, expect } from 'vitest'
import { VideoProgressTracker, QUARTILE_BITS } from './video-progress'

describe('VideoProgressTracker', () => {
  it('cuenta segundos ÚNICOS vistos (no infla por re-muestreo del mismo segundo)', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    t.sample(5.1)
    t.sample(5.4)
    t.sample(5.9) // mismo segundo (5) tres veces
    t.sample(6.2)
    expect(t.watchSeconds).toBe(2) // segundos 5 y 6
  })

  it('progreso lineal: watchSeconds ≈ segundos vistos y maxPercent acorde', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    for (let s = 0; s <= 10; s++) t.sample(s)
    expect(t.watchSeconds).toBe(11) // 0..10 inclusive
    expect(t.maxPercent).toBe(10)
    expect(t.completed).toBe(false)
  })

  it('un SEEK al 90% no infla watchSeconds (atención real), pero sí sube maxPercent', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    t.sample(2) // vio 2s al inicio
    t.sample(90) // salta al 90%
    t.sample(91)
    t.sample(92)
    expect(t.maxPercent).toBe(92) // profundidad
    expect(t.watchSeconds).toBe(4) // 2, 90, 91, 92 — NO 92 segundos
  })

  it('setea los bits de cuartiles según la profundidad', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    t.sample(76) // 76% → 25,50,75
    expect(t.quartiles).toBe(QUARTILE_BITS.p25 | QUARTILE_BITS.p50 | QUARTILE_BITS.p75)
    expect(t.completed).toBe(false)
    t.sample(96) // 96% → +95 (y marca completado)
    expect(t.quartiles & QUARTILE_BITS.p95).toBeTruthy()
    expect(t.completed).toBe(true)
  })

  it('markEnded marca completado y 100% aunque el último sample no llegue', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    t.sample(93)
    expect(t.completed).toBe(false)
    t.markEnded()
    expect(t.completed).toBe(true)
    expect(t.maxPercent).toBe(100)
    expect(t.quartiles & QUARTILE_BITS.p100).toBeTruthy()
  })

  it('sin duración válida: no calcula porcentaje pero igual cuenta segundos', () => {
    const t = new VideoProgressTracker()
    t.sample(3)
    t.sample(4)
    expect(t.maxPercent).toBe(0)
    expect(t.watchSeconds).toBe(2)
  })

  it('ignora samples inválidos (NaN / negativos)', () => {
    const t = new VideoProgressTracker()
    t.setDuration(100)
    t.sample(Number.NaN)
    t.sample(-5)
    t.sample(10)
    expect(t.watchSeconds).toBe(1)
    expect(t.maxPercent).toBe(10)
  })

  describe('bucketString (retención momento a momento)', () => {
    it('marca los tramos vistos en orden (inicio del video = bucket 0)', () => {
      const t = new VideoProgressTracker()
      t.setDuration(100)
      for (let s = 0; s <= 9; s++) t.sample(s) // primeros 10s de 100s = buckets 0..9
      const bs = t.bucketString()!
      expect(bs.length).toBe(100)
      expect(bs.slice(0, 10)).toBe('1111111111')
      expect(bs.slice(10)).toBe('0'.repeat(90)) // nada después del 10%
    })

    it('detecta SALTOS: ve el inicio y un tramo lejano, deja huecos en el medio', () => {
      const t = new VideoProgressTracker()
      t.setDuration(100)
      t.sample(1) // bucket 1
      t.sample(90) // bucket 90 (saltó)
      const bs = t.bucketString()!
      expect(bs[1]).toBe('1')
      expect(bs[90]).toBe('1')
      expect(bs[45]).toBe('0') // el medio quedó sin ver
    })

    it('sin duración válida → null', () => {
      const t = new VideoProgressTracker()
      t.sample(5)
      expect(t.bucketString()).toBeNull()
    })

    it('el snapshot incluye watchedBuckets', () => {
      const t = new VideoProgressTracker()
      t.setDuration(50)
      t.sample(0)
      expect(t.snapshot().watchedBuckets).toBeTypeOf('string')
      expect(t.snapshot().watchedBuckets!.length).toBe(100)
    })
  })
})
