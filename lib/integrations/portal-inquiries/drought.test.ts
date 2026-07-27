import { describe, it, expect } from 'vitest'
import { evaluateDrought, DROUGHT_THRESHOLD_MS, ALERT_THROTTLE_MS } from './drought'

const NOW = new Date('2026-07-27T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

describe('evaluateDrought', () => {
  it('con emails (fetched>0) no hay sequía y el reloj se resetea a ahora', () => {
    const v = evaluateDrought({ fetched: 7, lastNonZeroFetchAt: hoursAgo(100), lastAlertAt: null, now: NOW })
    expect(v).toEqual({ isDrought: false, shouldAlert: false, nextLastNonZeroFetchAt: NOW, hoursDry: 0 })
  })

  it('fetched=0 por menos de 48h: sin sequía, el reloj NO se mueve', () => {
    const last = hoursAgo(47)
    const v = evaluateDrought({ fetched: 0, lastNonZeroFetchAt: last, lastAlertAt: null, now: NOW })
    expect(v.isDrought).toBe(false)
    expect(v.shouldAlert).toBe(false)
    expect(v.nextLastNonZeroFetchAt).toBe(last)
  })

  it('fetched=0 por 48h o más: sequía + alerta (primera vez)', () => {
    const v = evaluateDrought({ fetched: 0, lastNonZeroFetchAt: hoursAgo(48), lastAlertAt: null, now: NOW })
    expect(v.isDrought).toBe(true)
    expect(v.shouldAlert).toBe(true)
    expect(v.hoursDry).toBe(48)
  })

  it('sequía con alerta reciente (<24h): NO re-alertar (throttle)', () => {
    const v = evaluateDrought({ fetched: 0, lastNonZeroFetchAt: hoursAgo(72), lastAlertAt: hoursAgo(23), now: NOW })
    expect(v.isDrought).toBe(true)
    expect(v.shouldAlert).toBe(false)
  })

  it('sequía con alerta vieja (>=24h): re-alertar', () => {
    const v = evaluateDrought({ fetched: 0, lastNonZeroFetchAt: hoursAgo(72), lastAlertAt: hoursAgo(24), now: NOW })
    expect(v.shouldAlert).toBe(true)
    expect(v.hoursDry).toBe(72)
  })

  it('sin dato previo (primer arranque): arranca el reloj, nunca alerta', () => {
    const v = evaluateDrought({ fetched: 0, lastNonZeroFetchAt: null, lastAlertAt: null, now: NOW })
    expect(v.isDrought).toBe(false)
    expect(v.shouldAlert).toBe(false)
    expect(v.nextLastNonZeroFetchAt).toBe(NOW)
  })

  it('constantes: 48h de umbral, 24h de throttle', () => {
    expect(DROUGHT_THRESHOLD_MS).toBe(48 * 3_600_000)
    expect(ALERT_THROTTLE_MS).toBe(24 * 3_600_000)
  })
})
