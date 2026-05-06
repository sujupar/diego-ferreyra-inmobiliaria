import 'server-only'
import { DealStage } from '@/lib/supabase/deals'

/**
 * Verifica el header Authorization del webhook GHL contra GHL_WEBHOOK_SECRET.
 * Acepta tanto "Bearer <secret>" como el secret directo (algunos workflows
 * GHL no permiten escribir "Bearer " literal en el header).
 *
 * Devuelve true si el secret matchea Y la env var está seteada.
 */
export function verifyGhlWebhookSecret(authHeader: string | null): boolean {
    const expected = process.env.GHL_WEBHOOK_SECRET
    if (!expected) {
        console.error('[ghl-webhook] GHL_WEBHOOK_SECRET no está seteado')
        return false
    }
    if (!authHeader) return false
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    return provided.trim() === expected.trim()
}

export interface GhlFormSubmission {
    contactName: string
    contactEmail: string | null
    contactPhone: string | null
    formName: string | null
    formId: string | null
    submittedAt: string
    /** Mensaje libre del lead, si el form lo tiene. */
    message: string | null
    /** Cualquier campo adicional del form para auditar en notes. */
    rawFields: Record<string, unknown>
}

/**
 * Parsea el body que GHL envía en el workflow Webhook action. GHL no tiene un
 * formato fijo — depende de cómo el usuario configuró los campos del workflow.
 * Aceptamos varias formas y normalizamos.
 *
 * Casos soportados:
 * - Workflow con custom JSON: { contact: { name, email, phone }, form: { name, id }, ... }
 * - Workflow con flat fields: { contact_name, contact_email, contact_phone, form_name, form_id, ... }
 * - Workflow con merge tags: { full_name, email, phone, formName, ... }
 */
export function parseGhlFormPayload(body: unknown): GhlFormSubmission | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>

    const contactObj = (b.contact && typeof b.contact === 'object' ? b.contact : null) as Record<string, unknown> | null
    const formObj = (b.form && typeof b.form === 'object' ? b.form : null) as Record<string, unknown> | null

    const str = (v: unknown): string | null => {
        if (typeof v === 'string') {
            const t = v.trim()
            return t.length > 0 ? t : null
        }
        return null
    }

    const contactName =
        str(contactObj?.full_name) ||
        str(contactObj?.name) ||
        [str(contactObj?.first_name), str(contactObj?.last_name)].filter(Boolean).join(' ').trim() ||
        str(b.contact_name) ||
        str(b.full_name) ||
        str(b.name) ||
        ''

    const contactEmail =
        str(contactObj?.email) ||
        str(b.contact_email) ||
        str(b.email) ||
        null

    const contactPhone =
        str(contactObj?.phone) ||
        str(b.contact_phone) ||
        str(b.phone) ||
        null

    const formName =
        str(formObj?.name) ||
        str(b.form_name) ||
        str(b.formName) ||
        null

    const formId =
        str(formObj?.id) ||
        str(b.form_id) ||
        str(b.formId) ||
        null

    const submittedAt =
        str(b.submitted_at) ||
        str(b.submittedAt) ||
        str(b.event_date_time) ||
        str(b.date_added) ||
        new Date().toISOString()

    const message =
        str(b.message) ||
        str(b.notes) ||
        str(contactObj?.notes) ||
        null

    if (!contactName && !contactEmail && !contactPhone) {
        // Sin ningún identificador no podemos crear un lead útil.
        return null
    }

    return {
        contactName: contactName || '(sin nombre)',
        contactEmail,
        contactPhone,
        formName,
        formId,
        submittedAt,
        message,
        rawFields: b,
    }
}

/**
 * Mapea el form GHL al stage destino del CRM.
 *
 * Configurable via env vars (lista coma-separada de nombres y/o IDs):
 * - GHL_FORM_TASACION_DIRECTA_NAMES → 'request' (Solicitud)
 * - GHL_FORM_CLASE_PROPIETARIOS_NAMES → 'clase_gratuita'
 *
 * Default: matching por substring case-insensitive.
 */
export function mapFormToStage(formName: string | null, formId: string | null): DealStage | null {
    const name = (formName || '').toLowerCase().trim()
    const id = (formId || '').toLowerCase().trim()

    const tasacionEnv = (process.env.GHL_FORM_TASACION_DIRECTA_NAMES || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const claseEnv = (process.env.GHL_FORM_CLASE_PROPIETARIOS_NAMES || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

    const matches = (haystack: string, needles: string[]) =>
        needles.some(n => haystack === n || haystack.includes(n))

    // Env-configured matches (exactos o substring)
    if (tasacionEnv.length > 0 && (matches(name, tasacionEnv) || matches(id, tasacionEnv))) {
        return 'request'
    }
    if (claseEnv.length > 0 && (matches(name, claseEnv) || matches(id, claseEnv))) {
        return 'clase_gratuita'
    }

    // Defaults hardcoded por substring (más laxo).
    if (name.includes('tasacion directa') || name.includes('tasación directa')) return 'request'
    if (name.includes('clase propietarios') || name.includes('clase de propietarios')) return 'clase_gratuita'

    return null
}
