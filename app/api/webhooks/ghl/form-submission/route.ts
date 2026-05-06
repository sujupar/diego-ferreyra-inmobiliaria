import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createDeal } from '@/lib/supabase/deals'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { verifyGhlWebhookSecret, parseGhlFormPayload, mapFormToStage } from '@/lib/ghl/webhook'

export const dynamic = 'force-dynamic'

function getAdmin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const STAGE_LABELS: Record<string, string> = {
    request: 'Solicitud de tasación',
    clase_gratuita: 'Clase Gratuita',
}

/**
 * POST /api/webhooks/ghl/form-submission
 *
 * Recibe submissions de formularios GHL (workflow Webhook action) y las
 * convierte en deals en nuestro CRM. Authentication via Authorization header
 * con `GHL_WEBHOOK_SECRET`.
 *
 * Mapping form → stage:
 *  - "Form - [TASACIÓN DIRECTA]" → stage 'request'
 *  - "Form - [CLASE PROPIETARIOS]" → stage 'clase_gratuita'
 *
 * Configurable via env (ver lib/ghl/webhook.ts).
 *
 * Idempotencia: dedup de contactos por email/phone. Si el lead se reenvía,
 * encuentra el mismo contact pero CREA un deal nuevo cada vez (un mismo
 * contacto puede llenar el form múltiples veces).
 */
export async function POST(request: NextRequest) {
    try {
        if (!verifyGhlWebhookSecret(request.headers.get('authorization'))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => null)
        const submission = parseGhlFormPayload(body)
        if (!submission) {
            return NextResponse.json({ error: 'Payload inválido o sin identificador de contacto' }, { status: 400 })
        }

        const stage = mapFormToStage(submission.formName, submission.formId)
        if (!stage) {
            console.warn('[ghl-webhook] form no mapeado:', submission.formName, submission.formId)
            return NextResponse.json({
                error: 'Form no reconocido',
                formName: submission.formName,
                formId: submission.formId,
            }, { status: 400 })
        }

        const supabase = getAdmin()

        // Dedup contact: email → phone → crear nuevo.
        let contactId: string | null = null
        if (submission.contactEmail) {
            const { data: existing } = await supabase
                .from('contacts')
                .select('id')
                .ilike('email', submission.contactEmail)
                .maybeSingle()
            if (existing) contactId = existing.id
        }
        if (!contactId && submission.contactPhone) {
            const { data: existing } = await supabase
                .from('contacts')
                .select('id')
                .eq('phone', submission.contactPhone)
                .maybeSingle()
            if (existing) contactId = existing.id
        }
        if (!contactId) {
            const { data: newContact, error: cErr } = await supabase
                .from('contacts')
                .insert({
                    full_name: submission.contactName,
                    email: submission.contactEmail,
                    phone: submission.contactPhone,
                    origin: stage === 'clase_gratuita' ? 'clase_gratuita' : 'embudo',
                    notes: submission.message,
                })
                .select('id')
                .single()
            if (cErr) throw cErr
            contactId = newContact.id
        }

        if (!contactId) {
            return NextResponse.json({ error: 'No se pudo crear/encontrar el contacto' }, { status: 500 })
        }

        // Notas con auditoría del origen para el coordinador.
        const noteParts: string[] = [
            `Origen: GHL form "${submission.formName || submission.formId || 'desconocido'}"`,
            `Recibido: ${submission.submittedAt}`,
        ]
        if (submission.message) noteParts.push(`Mensaje: ${submission.message}`)
        const notes = noteParts.join('\n')

        const dealId = await createDeal({
            contact_id: contactId,
            property_address: '',
            origin: stage === 'clase_gratuita' ? 'clase_gratuita' : 'embudo',
            notes,
            stage,
        })

        // Tarea para coordinadores: contactar y avanzar al lead.
        try {
            await createTaskForRole('coordinador', {
                type: 'update_contact',
                title: `Nuevo lead (${STAGE_LABELS[stage]}): ${submission.contactName}`,
                description: `${submission.contactEmail || submission.contactPhone || 'Sin contacto'} — Form: ${submission.formName || submission.formId || '?'}`,
                deal_id: dealId,
                contact_id: contactId,
            })
        } catch (err) {
            console.error('[ghl-webhook] task creation failed:', err)
            // No bloqueamos el webhook por una falla de tarea.
        }

        // Notificación a coordinador+admins (mismo flow que form interno).
        await notifyWithEscalation(
            () => notifyDealCreated({ dealId }),
            { failedNotificationType: 'deal_created', entityType: 'deal', entityId: dealId },
        )

        return NextResponse.json({
            success: true,
            dealId,
            contactId,
            stage,
        })
    } catch (error) {
        console.error('[ghl-webhook] error:', error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Error',
        }, { status: 500 })
    }
}

/**
 * GET para health check / verificación rápida del endpoint y del secret.
 * Devuelve 200 si secret válido, 401 si no. Sin secret → 401.
 */
export async function GET(request: NextRequest) {
    if (!verifyGhlWebhookSecret(request.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ ok: true, endpoint: 'ghl/form-submission' })
}
