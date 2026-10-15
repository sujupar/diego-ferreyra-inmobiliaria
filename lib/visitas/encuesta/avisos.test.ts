import { describe, it, expect } from 'vitest'
import {
  puedeEmpezar, canalesPendientes, cierreDeEmail, cierreTrasFallo, rangoDelBarrido, peorCasoEquipoMs,
  LIMITE_INICIO_MS, TECHO_NETLIFY_MS, TIMEOUT_CANAL_MS, MAX_INTENTOS_AVISO,
} from './avisos'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

describe('presupuesto de tiempo (Netlify corta a ~26 s; maxDuration no sirve acá)', () => {
  it('con 6 destinatarios el email al equipo entra; con 7 ya no (si se suman, este test avisa)', () => {
    expect(peorCasoEquipoMs(6)).toBeLessThan(TECHO_NETLIFY_MS)
    expect(peorCasoEquipoMs(7)).toBeGreaterThanOrEqual(TECHO_NETLIFY_MS)
  })
  it('cada canal de regalo, empezado en su límite, termina antes del techo', () => {
    expect(LIMITE_INICIO_MS.regalo_whatsapp + TIMEOUT_CANAL_MS).toBeLessThan(TECHO_NETLIFY_MS)
    expect(LIMITE_INICIO_MS.regalo_email + TIMEOUT_CANAL_MS).toBeLessThan(TECHO_NETLIFY_MS)
  })
  it('puedeEmpezar respeta el límite de cada canal', () => {
    expect(puedeEmpezar('equipo', 4_999)).toBe(true)
    expect(puedeEmpezar('equipo', 5_000)).toBe(false)
    expect(puedeEmpezar('regalo_email', 15_000)).toBe(true)
  })
})

describe('canalesPendientes', () => {
  it('solo en encuestas terminadas, en orden, y con intentos bajo el tope', () => {
    expect(canalesPendientes(encuestaDePrueba())).toEqual([])
    const hecha = encuestaDePrueba({ completed_at: '2026-10-15T14:00:00Z', gift_whatsapp_status: 'no_corresponde' })
    expect(canalesPendientes(hecha)).toEqual(['equipo', 'regalo_email'])
    expect(canalesPendientes({ ...hecha, notice_attempts: MAX_INTENTOS_AVISO })).toEqual([])
  })
})

describe('cierres', () => {
  it('email: salió → enviado; vencido → fallido (no se reintenta: pudo haber salido); otro → pendiente', () => {
    expect(cierreDeEmail({ ok: true, sent: 2, failed: 0, errors: [] })).toBe('enviado')
    expect(cierreDeEmail({ ok: false, sent: 1, failed: 1, errors: ['Tiempo de espera agotado: Resend no respondió en 3000 ms'] })).toBe('fallido')
    expect(cierreDeEmail({ ok: false, sent: 0, failed: 0, errors: ['RESEND_API_KEY not set; skipping email send'] })).toBe('pendiente')
    expect(cierreDeEmail(null)).toBe('pendiente')
  })
  it('tras un fallo vuelve a pendiente hasta el tercero', () => {
    expect(cierreTrasFallo(0)).toEqual({ estado: 'pendiente', intentos: 1 })
    expect(cierreTrasFallo(2)).toEqual({ estado: 'fallido', intentos: 3 })
  })
  it('el barrido mira los últimos 7 días, dejando 2 minutos a la pantalla de gracias', () => {
    expect(rangoDelBarrido(new Date('2026-10-15T15:00:00Z'))).toEqual({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' })
  })
})
