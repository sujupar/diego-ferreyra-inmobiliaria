/**
 * El registro de los correos de portal que NO eran consultas.
 *
 * Es la contracara del filtro (`./es-consulta.ts`): lo que se descarta queda
 * anotado con su motivo. Sin esto, el día que un portal estrene un formato de
 * consulta nuevo el correo desaparecería sin dejar rastro y el síntoma sería
 * "dejaron de llegar consultas", sin nada para mirar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Portal } from './types'

export interface CorreoDescartado {
  gmailMessageId: string
  portal: Portal
  remitente: string | null
  asunto: string | null
  motivo: string
}

/**
 * Anota un correo descartado. NUNCA lanza: el cron no puede caerse por no poder
 * escribir una fila de auditoría.
 *
 * Idempotente por `gmail_message_id`: el cron vuelve a ver el mismo mensaje en
 * cada corrida mientras siga dentro de su ventana de búsqueda (2 días).
 */
export async function anotarDescartado(
  supabase: SupabaseClient,
  correo: CorreoDescartado,
): Promise<void> {
  try {
    await supabase
      .from('portal_emails_descartados')
      .upsert(
        {
          gmail_message_id: correo.gmailMessageId,
          portal: correo.portal,
          remitente: correo.remitente,
          asunto: correo.asunto,
          motivo: correo.motivo,
        },
        { onConflict: 'gmail_message_id', ignoreDuplicates: true },
      )
  } catch (err) {
    console.warn('[portal-inquiries] no se pudo anotar el correo descartado (continuando):', err)
  }
}

/**
 * ¿Este correo ya se había descartado?
 *
 * Se consulta SOLO cuando el mensaje no está entre las consultas, así que el
 * caso normal (una consulta ya procesada) sigue costando una sola consulta a la
 * base. Sirve para no volver a bajar de Gmail el mismo correo publicitario cada
 * cinco minutos durante dos días.
 */
export async function yaFueDescartado(
  supabase: SupabaseClient,
  gmailMessageId: string,
): Promise<boolean> {
  try {
    const { count } = await supabase
      .from('portal_emails_descartados')
      .select('gmail_message_id', { count: 'exact', head: true })
      .eq('gmail_message_id', gmailMessageId)
    return (count ?? 0) > 0
  } catch {
    // Ante la duda, NO se asume descartado: se vuelve a evaluar el correo.
    return false
  }
}
