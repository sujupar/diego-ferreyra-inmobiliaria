/**
 * Parseo puro + verificación de firma del webhook entrante de WhatsApp Cloud
 * API (Meta). Sin 'server-only': `parseWebhookPayload` y `verifySignature` no
 * tocan la red ni la base — los prueba `webhook.test.ts` con payloads reales
 * de Meta. La ruta `app/api/webhooks/whatsapp/route.ts` es la única que hace
 * I/O (leer el body crudo, pegarle a Supabase).
 *
 * Shape de referencia (Meta, Cloud API v21.0):
 *   { object, entry: [{ id, changes: [{ field: 'messages', value: {
 *       metadata, contacts?, messages?: [...], statuses?: [...]
 *   } }] }] }
 * `messages` y `statuses` son mutuamente excluyentes por change, pero un POST
 * puede traer varios `entry`/`changes` mezclando ambos tipos de eventos.
 */
import { timingSafeEqual, createHmac } from 'node:crypto'

/** Tipos de mensaje que Meta puede mandar. `type` funciona como discriminante del payload crudo. */
export type InboundMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'button'
  | 'interactive'
  | 'reaction'
  | 'unknown'

export interface InboundMessage {
  /** `messages[].id` — clave para no duplicar si Meta reintenta la entrega del webhook. */
  waMessageId: string
  /** `messages[].from` — número del remitente, tal cual lo manda Meta (sin '+'). */
  from: string
  contactName: string | null
  type: InboundMessageType
  /** Texto legible corto para mostrar en el Inbox sin abrir el payload crudo. */
  bodyPreview: string
  timestamp: string
  /** El objeto `messages[i]` completo, para debug / futuras necesidades. */
  payload: unknown
}

export interface StatusUpdate {
  /** `statuses[].id` — el `wa_message_id` que dejó `logOutbound` al enviar. */
  waMessageId: string
  /** Estado crudo de Meta (`sent`/`delivered`/`read`/`failed`/lo que sea nuevo). Normalizar con `mapMetaStatus` al persistir. */
  status: string
  timestamp: string
  errorCode: string | null
  errorMessage: string | null
  /** El objeto `statuses[i]` completo. */
  payload: unknown
}

export interface ParsedWebhookPayload {
  inbound: InboundMessage[]
  statuses: StatusUpdate[]
}

const EMPTY: ParsedWebhookPayload = { inbound: [], statuses: [] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Descripción en español de un tipo de mensaje no-texto, para `body_preview`. Nunca se descarta el mensaje. */
function describeNonTextMessage(type: string, msg: Record<string, unknown>): string {
  switch (type) {
    case 'image':
      return '[imagen]' + (isRecord(msg.image) && typeof msg.image.caption === 'string' ? ` ${msg.image.caption}` : '')
    case 'audio':
      return '[audio]'
    case 'video':
      return '[video]' + (isRecord(msg.video) && typeof msg.video.caption === 'string' ? ` ${msg.video.caption}` : '')
    case 'document':
      return '[documento]' + (isRecord(msg.document) && typeof msg.document.filename === 'string' ? ` ${msg.document.filename}` : '')
    case 'sticker':
      return '[sticker]'
    case 'location': {
      const loc = isRecord(msg.location) ? msg.location : null
      const name = loc && typeof loc.name === 'string' ? loc.name : null
      return name ? `[ubicación] ${name}` : '[ubicación]'
    }
    case 'contacts':
      return '[contacto compartido]'
    case 'button':
      return isRecord(msg.button) && typeof msg.button.text === 'string' ? msg.button.text : '[botón]'
    case 'interactive': {
      const interactive = isRecord(msg.interactive) ? msg.interactive : null
      const replyType = interactive && typeof interactive.type === 'string' ? interactive.type : null
      const reply = interactive && replyType && isRecord(interactive[replyType]) ? (interactive[replyType] as Record<string, unknown>) : null
      const title = reply && typeof reply.title === 'string' ? reply.title : null
      return title ? `[respuesta] ${title}` : '[interactivo]'
    }
    case 'reaction': {
      const emoji = isRecord(msg.reaction) && typeof msg.reaction.emoji === 'string' ? msg.reaction.emoji : null
      return emoji ? `[reacción] ${emoji}` : '[reacción]'
    }
    default:
      return `[${type || 'desconocido'}]`
  }
}

function parseMessage(raw: unknown): InboundMessage | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : null
  const from = typeof raw.from === 'string' ? raw.from : null
  const type = typeof raw.type === 'string' ? raw.type : 'unknown'
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : ''
  if (!id || !from) return null

  const bodyPreview =
    type === 'text' && isRecord(raw.text) && typeof raw.text.body === 'string'
      ? raw.text.body.slice(0, 1000)
      : describeNonTextMessage(type, raw)

  return {
    waMessageId: id,
    from,
    contactName: null, // se completa en parseWebhookPayload con contacts[].profile.name
    type: type as InboundMessageType,
    bodyPreview,
    timestamp,
    payload: raw,
  }
}

function parseStatus(raw: unknown): StatusUpdate | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id : null
  const status = typeof raw.status === 'string' ? raw.status : null
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : ''
  if (!id || !status) return null

  const errors = Array.isArray(raw.errors) ? raw.errors : []
  const firstError = errors.length && isRecord(errors[0]) ? (errors[0] as Record<string, unknown>) : null
  const errorCode = firstError && firstError.code != null ? String(firstError.code) : null
  const errorMessage =
    firstError && (typeof firstError.title === 'string' || typeof firstError.message === 'string')
      ? String(firstError.title ?? firstError.message)
      : null

  return { waMessageId: id, status, timestamp, errorCode, errorMessage, payload: raw }
}

/**
 * Parsea el body (ya parseado como JSON) de un POST del webhook. Nunca lanza:
 * cualquier shape inesperado (sin `entry`, `changes` vacío, etc.) devuelve
 * listas vacías en vez de tirar una excepción — la ruta siempre debe poder
 * responder 200.
 */
export function parseWebhookPayload(body: unknown): ParsedWebhookPayload {
  if (!isRecord(body)) return EMPTY
  const entries = Array.isArray(body.entry) ? body.entry : []
  if (!entries.length) return EMPTY

  const inbound: InboundMessage[] = []
  const statuses: StatusUpdate[] = []

  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      if (!isRecord(change)) continue
      const value = isRecord(change.value) ? change.value : null
      if (!value) continue

      // Nombre de contacto: Meta lo manda en value.contacts[], correlacionado
      // por posición con value.messages[] (mismo índice), no por wa_id.
      const contacts = Array.isArray(value.contacts) ? value.contacts : []
      const nameByIndex = (idx: number): string | null => {
        const c = contacts[idx]
        if (!isRecord(c)) return null
        const profile = isRecord(c.profile) ? c.profile : null
        return profile && typeof profile.name === 'string' ? profile.name : null
      }

      const messages = Array.isArray(value.messages) ? value.messages : []
      messages.forEach((raw: unknown, idx: number) => {
        const parsed = parseMessage(raw)
        if (parsed) inbound.push({ ...parsed, contactName: nameByIndex(idx) })
      })

      const rawStatuses = Array.isArray(value.statuses) ? value.statuses : []
      for (const raw of rawStatuses) {
        const parsed = parseStatus(raw)
        if (parsed) statuses.push(parsed)
      }
    }
  }

  return { inbound, statuses }
}

/**
 * Verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo CRUDO con
 * `WHATSAPP_APP_SECRET`), comparación en tiempo constante.
 *
 * Fail closed a propósito: sin `appSecret` configurado devuelve `false` — es
 * preferible perder mensajes entrantes a aceptar payloads no autenticados en
 * un endpoint público que escribe en la base.
 */
export function verifySignature(raw: string, header: string | null, appSecret: string | undefined | null): boolean {
  if (!appSecret) return false
  if (!header) return false

  const prefix = 'sha256='
  const providedHex = header.startsWith(prefix) ? header.slice(prefix.length) : header
  const expectedHex = createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex')

  const providedBuf = Buffer.from(providedHex, 'hex')
  const expectedBuf = Buffer.from(expectedHex, 'hex')
  if (providedBuf.length !== expectedBuf.length || providedBuf.length === 0) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}
