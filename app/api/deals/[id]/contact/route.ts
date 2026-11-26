import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'

function getAdmin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const OPS_ROLES = new Set(['admin', 'dueno', 'coordinador'])

/**
 * PATCH /api/deals/[id]/contact
 *
 * Asocia (o desasocia) un contacto a un deal. Body: { contact_id: string | null }.
 *
 * Permisos, EN ESTE ORDEN (crm-ficha-y-llamadas, D4 y tarea 5.4):
 *   1. rol sin alcance de contactos (abogado, agent, viewer…) → 403;
 *   2. el proceso tiene que ser de quien pide (admin/dueño/coordinador, o el asesor
 *      asignado o creador) → 403 como antes. Va ANTES del chequeo del contacto: si no,
 *      por la diferencia entre 404 y 403 un asesor sabría algo de un contacto ajeno;
 *   3. para vincular (no para desvincular), un asesor tiene que poder ver YA ese
 *      contacto (`canAccessContact`, con los vínculos de antes del cambio) → si no, 404.
 *      Un proceso a su nombre le da acceso al contacto (D2): sin este paso, vincular
 *      cualquier id le abría la ficha de cualquier persona.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
    const user = await requireAuth()
    const alcance = alcanceContactos(user.profile.role)
    if (alcance === 'ninguno') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    try {
        const { id } = await params
        const body = await request.json()
        const contactId = body?.contact_id

        if (contactId !== null && typeof contactId !== 'string') {
            return NextResponse.json({ error: 'contact_id required (string|null)' }, { status: 400 })
        }

        const supabase = getAdmin()

        if (!OPS_ROLES.has(user.profile.role)) {
            const { data: deal, error: lookupError } = await supabase
                .from('deals')
                .select('assigned_to, created_by')
                .eq('id', id)
                .single()
            if (lookupError) throw lookupError
            const isOwner = deal?.assigned_to === user.id || deal?.created_by === user.id
            if (!isOwner) {
                return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
            }
        }

        // OJO: `canAccessContact` mira solo `deals.assigned_to`, no `created_by`. No se
        // unifica con el chequeo de arriba a propósito (D2).
        if (contactId !== null && alcance === 'propios' && !(await canAccessContact(user, contactId))) {
            return NextResponse.json({ error: 'No encontramos este contacto' }, { status: 404 })
        }

        const { error } = await supabase
            .from('deals')
            .update({ contact_id: contactId })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('PATCH /api/deals/[id]/contact error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
