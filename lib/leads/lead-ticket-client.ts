/**
 * Lado CLIENTE de la ficha de un solo uso anti-bot (Task 6, `lib/leads/anti-bot.ts`).
 *
 * Sin 'server-only' a propósito — lo importan componentes 'use client'
 * (`LeadCaptureProvider`, `LeadForm`). NO importa `node:crypto` (a diferencia
 * de `anti-bot.ts`, que sí y por eso nunca se debe importar desde el browser):
 * acá solo se lee el timestamp de vencimiento que ya viaja en texto plano
 * dentro del ticket (`<expiraEnMs>.<firmaHex>`), nunca se verifica la firma
 * del lado del cliente (eso lo hace `isValidLeadTicket` en el servidor).
 *
 * Por qué existe (hallazgo #8, revisión adversarial 2026-07-31): el ticket
 * dura 30 min y se pedía SOLO al abrir el popup. Alguien que deja el popup
 * abierto más de 30 min (charla con otra pestaña, llamada) antes de mandar el
 * formulario manda un ticket YA vencido → se marca "Posible bot" a una
 * persona real. `isTicketFresh` deja re-pedir la ficha justo antes del
 * submit, sin re-pedirla en cada tecla.
 */

/** `true` si el ticket existe y todavía no venció, sin verificar la firma (eso es cosa del servidor). */
export function isTicketFresh(ticket: string | null | undefined, now: number = Date.now()): boolean {
  if (!ticket) return false
  const idx = ticket.indexOf('.')
  if (idx < 0) return false
  const expiresAt = Number(ticket.slice(0, idx))
  return Number.isFinite(expiresAt) && expiresAt > now
}

/** `GET /api/leads/ticket`. Nunca lanza — `null` ante cualquier fallo (red, adblocker, 5xx). */
export async function fetchLeadTicket(): Promise<string | null> {
  try {
    const res = await fetch('/api/leads/ticket')
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { ticket?: string } | null
    return typeof data?.ticket === 'string' ? data.ticket : null
  } catch {
    return null
  }
}

/** Ticket a punto de usar en un submit: si el que hay está fresco lo devuelve tal cual, si no pide uno nuevo. */
export async function ensureFreshLeadTicket(current: string | null, now: number = Date.now()): Promise<string | null> {
  if (isTicketFresh(current, now)) return current
  return fetchLeadTicket()
}
