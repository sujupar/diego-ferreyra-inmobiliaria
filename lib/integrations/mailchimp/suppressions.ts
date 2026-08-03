import 'server-only'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Parsea el payload form-encoded de un webhook de Mailchimp. Puro. */
export function parseWebhook(form: URLSearchParams): { type: string; email: string | null } {
  return { type: form.get('type') || '', email: form.get('data[email]') || null }
}

/** true si el email está suprimido (baja/rebote). Nunca tira: ante error, false. */
export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const { data } = await admin().from('mailchimp_suppressions').select('email').eq('email', email.trim().toLowerCase()).maybeSingle()
    return !!data
  } catch (e) {
    console.warn('[mailchimp] isSuppressed check failed (asumo no suprimido):', e)
    return false
  }
}

/** Registra una supresión (idempotente por PK email). Nunca tira. */
export async function recordSuppression(email: string, reason: string): Promise<void> {
  try {
    await admin().from('mailchimp_suppressions').upsert(
      { email: email.trim().toLowerCase(), reason, created_at: new Date().toISOString() },
      { onConflict: 'email' },
    )
  } catch (e) {
    console.warn('[mailchimp] recordSuppression failed:', e)
  }
}
