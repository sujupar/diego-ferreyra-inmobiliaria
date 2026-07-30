/**
 * Registro de TODOS los mensajes de WhatsApp salientes en `whatsapp_messages`.
 *
 * Hasta esta tarea (2026-07-30), `sendWhatsappTemplate` descartaba la respuesta
 * de Meta entera: nadie podía saber si un mensaje salió, a qué número (Meta
 * corrige el `to` en `contacts[].wa_id`, típicamente agregando el `9` a los
 * móviles argentinos), ni por qué falló. Este módulo cierra ese agujero.
 *
 * SIN 'server-only': lo importa `./core.ts`, que a su vez se reutiliza desde
 * scripts de prueba (`npx tsx`), no solo desde la app Next.js.
 *
 * `whatsapp_messages` NO está en `types/database.types.ts` (el CLI de Supabase
 * no conecta en este proyecto, ver CLAUDE.md § Supabase — los types no se
 * pueden regenerar). Mismo patrón que `lib/landing/landing-service.ts` (función
 * `admin()`): cliente SIN el genérico `<Database>` + cast manual de los datos
 * que le pasamos. Cuando el CLI vuelva a conectar y se regeneren los types,
 * este archivo puede migrar a `adminTyped()`.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Traduce un `status` de Meta al vocabulario de `whatsapp_messages.status`
 * (texto libre a propósito — ver COMMENT de la migración). Los estados
 * documentados por Meta (`sent`, `delivered`, `read`, `failed`) se normalizan
 * (trim + minúsculas); cualquier otro valor se deja pasar TAL CUAL, sin
 * inventar ni descartar nada — Meta agrega estados nuevos sin avisar, y un
 * mapeo cerrado los perdería.
 */
const KNOWN_META_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

export function mapMetaStatus(status: string): string {
  const normalized = status?.trim().toLowerCase() ?? ''
  return KNOWN_META_STATUSES.has(normalized) ? normalized : status
}

export interface LogOutboundInput {
  /** Teléfono E.164 sin '+' al que se INTENTÓ mandar (nuestro `to`, no el de Meta). */
  phone: string
  /** `contacts[0].wa_id` de la respuesta de Meta — el número REAL al que llegó. */
  waId?: string | null
  /** `messages[0].id` de la respuesta de Meta — clave para el webhook de estados. */
  waMessageId?: string | null
  templateName?: string | null
  bodyPreview?: string | null
  /** Payload crudo relevante del intento (request armado o respuesta de Meta) para debug. */
  payload?: unknown
  status: string
  errorCode?: string | null
  errorMessage?: string | null
  leadId?: string | null
  propertyId?: string | null
  sentBy?: string | null
}

/**
 * Inserta una fila en `whatsapp_messages`. NUNCA lanza: si la tabla no existe
 * todavía (la migración la aplica el usuario a mano) o cualquier otra cosa
 * falla, solo hace `console.warn` — el envío real de WhatsApp ya pasó y no
 * puede depender de que el log funcione.
 */
export async function logOutbound(input: LogOutboundInput): Promise<void> {
  try {
    const { error } = await admin()
      .from('whatsapp_messages')
      .insert({
        direction: 'out',
        phone_e164: input.phone,
        wa_id: input.waId ?? null,
        wa_message_id: input.waMessageId ?? null,
        template_name: input.templateName ?? null,
        body_preview: input.bodyPreview ?? null,
        payload: (input.payload ?? null) as never,
        status: input.status,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        lead_id: input.leadId ?? null,
        property_id: input.propertyId ?? null,
        sent_by: input.sentBy ?? null,
      })
    if (error) {
      console.warn('[whatsapp-log] no se pudo registrar el envío (continuando):', error.message)
    }
  } catch (err) {
    console.warn('[whatsapp-log] excepción registrando el envío (continuando):', err)
  }
}
