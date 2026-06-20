/**
 * Lógica PURA (sin DOM) del mapa de calor interno: acumula, por sesión, el scroll
 * máximo, el tiempo visible por sección y los clics (con posición RELATIVA a la
 * sección → responsive). Idempotente: el snapshot se reenvía y el servidor toma
 * GREATEST (scroll/ms) y dedup de clics por `seq`.
 */

export interface HeatmapClick {
  seq: number
  section: string | null
  xPct: number
  yPct: number
  tag: string
  rage: boolean
}

export interface HeatmapSnapshot {
  maxScrollPct: number
  sections: { key: string; reached: boolean; ms: number }[]
  clicks: HeatmapClick[]
}

const clampPct = (v: number): number => {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10))
}

const RAGE_MS = 1000
const RAGE_PX = 30

export class HeatmapSession {
  private maxScroll = 0
  private sections = new Map<string, { reached: boolean; ms: number }>()
  private clicks: HeatmapClick[] = []
  private lastClick: { x: number; y: number; t: number } | null = null
  private clickCap: number

  constructor(clickCap = 60) {
    this.clickCap = clickCap
  }

  registerSections(keys: string[]): void {
    for (const k of keys) if (k && !this.sections.has(k)) this.sections.set(k, { reached: false, ms: 0 })
  }

  setScroll(pct: number): void {
    if (!Number.isFinite(pct)) return
    const v = Math.min(100, Math.max(0, Math.round(pct)))
    if (v > this.maxScroll) this.maxScroll = v
  }

  markReached(key: string): void {
    this.ensure(key).reached = true
  }

  addVisibleMs(key: string, ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.ensure(key).ms += ms
  }

  /** Registra un clic. `rawX/rawY` (px) se usan para detectar rage clicks. */
  addClick(input: {
    section: string | null
    xPct: number
    yPct: number
    tag: string
    nowMs: number
    rawX: number
    rawY: number
  }): void {
    if (this.clicks.length >= this.clickCap) return
    const rage =
      !!this.lastClick &&
      input.nowMs - this.lastClick.t < RAGE_MS &&
      Math.abs(input.rawX - this.lastClick.x) < RAGE_PX &&
      Math.abs(input.rawY - this.lastClick.y) < RAGE_PX
    this.lastClick = { x: input.rawX, y: input.rawY, t: input.nowMs }
    this.clicks.push({
      seq: this.clicks.length,
      section: input.section,
      xPct: clampPct(input.xPct),
      yPct: clampPct(input.yPct),
      tag: input.tag,
      rage,
    })
  }

  hasData(): boolean {
    return (
      this.maxScroll > 0 ||
      this.clicks.length > 0 ||
      [...this.sections.values()].some((s) => s.ms > 0 || s.reached)
    )
  }

  snapshot(): HeatmapSnapshot {
    return {
      maxScrollPct: this.maxScroll,
      sections: [...this.sections.entries()].map(([key, v]) => ({ key, reached: v.reached, ms: Math.round(v.ms) })),
      clicks: this.clicks.slice(),
    }
  }

  private ensure(key: string) {
    let s = this.sections.get(key)
    if (!s) {
      s = { reached: false, ms: 0 }
      this.sections.set(key, s)
    }
    return s
  }
}
