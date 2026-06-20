/**
 * Lógica PURA (sin DOM) para medir el progreso de un video.
 *
 * Dos métricas honestas, no una:
 *  - `maxPercent`  → profundidad: el punto más lejano alcanzado (sube con seek).
 *  - `watchSeconds`→ atención real: cantidad de SEGUNDOS ÚNICOS efectivamente
 *                    vistos. Como acumulamos `Math.floor(currentTime)` en un Set,
 *                    los saltos (seek/rewind) NO inflan el conteo: un seek al 90%
 *                    y mirar 2s = 2 segundos vistos, no 90.
 *
 * `quartiles` es un bitmap: 1=25% 2=50% 4=75% 8=95% 16=100%.
 */

export const QUARTILE_BITS = { p25: 1, p50: 2, p75: 4, p95: 8, p100: 16 } as const

export interface VideoProgressSnapshot {
  watchSeconds: number
  maxPercent: number
  quartiles: number
  completed: boolean
  durationS: number
  /** Bitmap de 100 chars '0'/'1': qué tramos (1% c/u) del video se vieron. null si no hay duración. */
  watchedBuckets: string | null
}

export class VideoProgressTracker {
  private seconds = new Set<number>()
  private _maxPercent = 0
  private _quartiles = 0
  private _completed = false
  private _duration = 0

  setDuration(d: number): void {
    if (Number.isFinite(d) && d > 0) this._duration = d
  }

  /** Llamar en cada `timeupdate` (idealmente throttleado a ~1/s) con currentTime. */
  sample(t: number): void {
    if (!Number.isFinite(t) || t < 0) return
    this.seconds.add(Math.floor(t))
    if (this._duration > 0) {
      const pct = Math.min(100, Math.round((t / this._duration) * 100))
      if (pct > this._maxPercent) this._maxPercent = pct
      if (pct >= 25) this._quartiles |= QUARTILE_BITS.p25
      if (pct >= 50) this._quartiles |= QUARTILE_BITS.p50
      if (pct >= 75) this._quartiles |= QUARTILE_BITS.p75
      if (pct >= 95) {
        this._quartiles |= QUARTILE_BITS.p95
        this._completed = true
      }
      if (pct >= 100) this._quartiles |= QUARTILE_BITS.p100
    }
  }

  /**
   * Bitmap de `buckets` chars '0'/'1': marca qué tramos del video se vieron
   * (cada bucket = 1/buckets de la duración). Permite la retención momento a
   * momento (qué % ve cada tramo, detecta saltos). null si no hay duración.
   */
  bucketString(buckets = 100): string | null {
    if (this._duration <= 0) return null
    const arr = new Array<string>(buckets).fill('0')
    for (const sec of this.seconds) {
      let b = Math.floor((sec / this._duration) * buckets)
      if (b < 0) b = 0
      if (b >= buckets) b = buckets - 1
      arr[b] = '1'
    }
    return arr.join('')
  }

  /** Llamar en el evento `ended`: marca completado aunque el último sample no llegue a 100. */
  markEnded(): void {
    this._quartiles |= QUARTILE_BITS.p95 | QUARTILE_BITS.p100
    this._completed = true
    if (this._duration > 0) this._maxPercent = 100
  }

  get watchSeconds(): number {
    return this.seconds.size
  }
  get maxPercent(): number {
    return this._maxPercent
  }
  get quartiles(): number {
    return this._quartiles
  }
  get completed(): boolean {
    return this._completed
  }
  get durationS(): number {
    return this._duration
  }

  snapshot(): VideoProgressSnapshot {
    return {
      watchSeconds: this.watchSeconds,
      maxPercent: this._maxPercent,
      quartiles: this._quartiles,
      completed: this._completed,
      durationS: this._duration,
      watchedBuckets: this.bucketString(),
    }
  }
}
