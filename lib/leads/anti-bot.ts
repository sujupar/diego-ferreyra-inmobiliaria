/**
 * Frenar el bot del formulario público (Task 6).
 *
 * Evidencia de la auditoría (A4): un bot ejecuta JS de verdad (el honeypot no
 * lo agarra) y crea leads "John Doe" idénticos 2-4 min DESPUÉS de crear una
 * campaña — no después de que se registre una persona. Regla dura: NUNCA se
 * rechaza un lead. Perder un lead real (falso positivo) es mucho peor que
 * guardar uno falso. Este módulo solo MARCA (`suspected_bot` + `bot_reason`,
 * migración `20260731000001`, ya aplicada); la decisión de ocultar/filtrar
 * queda del lado del Inbox.
 *
 * Dos señales, cualquiera alcanza para marcar:
 *  1) Ficha de un solo uso ausente/vencida/inválida — `GET /api/leads/ticket`
 *     entrega un token HMAC de vida corta (30 min) que el popup pide al
 *     ABRIRSE y manda en el POST. Un script que le pega directo a
 *     `POST /api/leads` (sin cargar la página, sin pedir ficha) no la tiene.
 *     Nota de diseño: NO hay un store de un solo uso persistido (no se agregó
 *     ninguna migración para esto) — el TTL corto + la firma HMAC son la
 *     defensa; no es un nonce anti-replay real. Suficiente para el objetivo
 *     (detectar scripts que pegan directo a la API), no para un atacante que
 *     sí carga la página primero.
 *  2) Datos de relleno conocidos (nombre/email/teléfono tipo "John Doe").
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const TICKET_TTL_MS = 30 * 60 * 1000

/** Mismo secreto que ya protege los crons (`x-cron-secret`) — ver CLAUDE.md § pg_cron.
 * Fallback de desarrollo si ninguna env var está seteada (nunca revienta el build). */
function ticketSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-insecure-lead-ticket-secret'
}

function sign(expiresAt: string): string {
  return createHmac('sha256', ticketSecret()).update(expiresAt).digest('hex')
}

/** `GET /api/leads/ticket` llama a esto. Formato: `<expiraEnMs>.<firmaHex>`. */
export function issueLeadTicket(now: number = Date.now()): string {
  const expiresAt = String(now + TICKET_TTL_MS)
  return `${expiresAt}.${sign(expiresAt)}`
}

/** Firma + vencimiento. Nunca lanza ante un ticket mal formado — devuelve `false`. */
export function isValidLeadTicket(
  ticket: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!ticket) return false
  const idx = ticket.indexOf('.')
  if (idx < 0) return false
  const expiresAtStr = ticket.slice(0, idx)
  const sig = ticket.slice(idx + 1)
  if (!expiresAtStr || !sig) return false
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false // vencido (o corrupto)

  const expected = sign(expiresAtStr)
  if (sig.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// ── Datos de relleno conocidos (evidencia real: A4 del audit) ───────────────

const FILLER_NAME_PATTERNS = [/^john\s+doe$/i, /^jane\s+doe$/i, /^test\s+test$/i, /^asdf+$/i]
const FILLER_EMAIL_PATTERNS = [/^john\.?doe@/i, /^jane\.?doe@/i, /^test@test/i, /^asdf/i]

/** Detecta patrones de relleno. Devuelve el motivo (texto libre, auditable) o `null` si no matchea nada. */
export function detectFillerLeadData(input: {
  name: string
  email?: string | null
  phone?: string | null
}): string | null {
  const reasons: string[] = []

  const name = input.name.trim()
  if (name && FILLER_NAME_PATTERNS.some(re => re.test(name))) {
    reasons.push(`nombre de relleno ("${name}")`)
  }

  const email = input.email?.trim() ?? ''
  if (email && FILLER_EMAIL_PATTERNS.some(re => re.test(email))) {
    reasons.push(`email de relleno ("${email}")`)
  }

  // El teléfono real del bot fue "+54 11 1234 5678" — dígitos "...12345678".
  // Comparamos por DÍGITOS (no por el string crudo) porque el separador
  // cambia según cómo se compuso (espacios, guiones, "+").
  const phoneDigits = (input.phone ?? '').replace(/\D/g, '')
  if (phoneDigits.length >= 8 && phoneDigits.endsWith('12345678')) {
    reasons.push('teléfono de relleno (termina en 1234 5678)')
  }

  return reasons.length > 0 ? reasons.join(' · ') : null
}

export interface LeadSubmissionInput {
  name: string
  email?: string | null
  phone?: string | null
  ticket?: string | null
}

export interface LeadSubmissionEvaluation {
  suspectedBot: boolean
  reason: string | null
}

/** Combina las dos señales. Cualquiera alcanza para marcar `suspected_bot=true`. */
export function evaluateLeadSubmission(input: LeadSubmissionInput): LeadSubmissionEvaluation {
  const reasons: string[] = []
  if (!isValidLeadTicket(input.ticket)) reasons.push('sin ficha de sesión válida')
  const filler = detectFillerLeadData({ name: input.name, email: input.email, phone: input.phone })
  if (filler) reasons.push(filler)
  return { suspectedBot: reasons.length > 0, reason: reasons.length > 0 ? reasons.join(' · ') : null }
}
