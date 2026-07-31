import { describe, it, expect, vi, afterEach } from 'vitest'
import { issueLeadTicket } from './anti-bot'
import { isTicketFresh, ensureFreshLeadTicket, fetchLeadTicket } from './lead-ticket-client'

// Hallazgo #8 (revisión adversarial 2026-07-31): falsos positivos de "Posible
// bot" sobre personas reales que dejan el popup abierto más de 30 min (TTL
// del ticket) antes de enviar. Estas pruebas verifican la mitad pura de la
// solución: detectar que el ticket vino vencido y decidir si hace falta
// repedirlo — sin tocar la red.
describe('isTicketFresh', () => {
  it('un ticket recién emitido (mismo formato que issueLeadTicket) está fresco', () => {
    const t = issueLeadTicket()
    expect(isTicketFresh(t)).toBe(true)
  })

  it('un ticket vencido (30 min TTL) deja de estar fresco', () => {
    const now = Date.now()
    const t = issueLeadTicket(now)
    expect(isTicketFresh(t, now + 31 * 60_000)).toBe(false)
    expect(isTicketFresh(t, now + 29 * 60_000)).toBe(true)
  })

  it('null/undefined/vacío/mal formado nunca están frescos, y nunca lanza', () => {
    expect(isTicketFresh(null)).toBe(false)
    expect(isTicketFresh(undefined)).toBe(false)
    expect(isTicketFresh('')).toBe(false)
    expect(isTicketFresh('sin-punto')).toBe(false)
    expect(isTicketFresh('no-numero.abc')).toBe(false)
  })
})

describe('ensureFreshLeadTicket', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('si el ticket actual sigue fresco, NO pega a la red — lo devuelve tal cual', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const t = issueLeadTicket()
    const result = await ensureFreshLeadTicket(t)
    expect(result).toBe(t)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('si el ticket está vencido, pide uno nuevo a /api/leads/ticket', async () => {
    const now = Date.now()
    const stale = issueLeadTicket(now - 40 * 60_000) // emitido hace 40 min, TTL 30 → vencido
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: 'nuevo-ticket.firma' }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await ensureFreshLeadTicket(stale, now)
    expect(fetchSpy).toHaveBeenCalledWith('/api/leads/ticket')
    expect(result).toBe('nuevo-ticket.firma')
  })

  it('si no hay ticket (null) también pide uno nuevo', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ticket: 'x.y' }) })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await ensureFreshLeadTicket(null)
    expect(fetchSpy).toHaveBeenCalled()
    expect(result).toBe('x.y')
  })
})

describe('fetchLeadTicket', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('nunca lanza: red caída → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(fetchLeadTicket()).resolves.toBeNull()
  })

  it('nunca lanza: respuesta no-ok → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(fetchLeadTicket()).resolves.toBeNull()
  })

  it('respuesta ok con ticket string lo devuelve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ticket: 'abc.def' }) }),
    )
    await expect(fetchLeadTicket()).resolves.toBe('abc.def')
  })
})
