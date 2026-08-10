import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceTasaciones } from '@/lib/auth/appraisal-access'

function getAdmin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * PATCH /api/appraisals/[id]/contact
 *
 * Asocia (o desasocia) un contacto a una tasación. Body: { contact_id: string | null }.
 * Usado por ContactEditor cuando se crea un contacto desde una tasación huérfana.
 *
 * Permisos: admin/dueño/coordinador, o el asesor dueño/asignado a la tasación.
 * Mismo criterio que las RLS policies sobre `appraisals` (ver
 * 20260505000001_rls_per_role_safe.sql).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireAuth()
        const { id } = await params
        const body = await request.json()
        const contactId = body?.contact_id

        if (contactId !== null && typeof contactId !== 'string') {
            return NextResponse.json({ error: 'contact_id required (string|null)' }, { status: 400 })
        }

        const supabase = getAdmin()

        // D1: el trío de operaciones que esta ruta ya tenía como `OPS_ROLES`
        // ahora sale de la lista compartida (lib/auth/appraisal-access.ts), la
        // misma que usan el listado, la ficha y el borrado. Cambio real de
        // comportamiento: un rol sin alcance (abogado) antes caía en la rama de
        // pertenencia de abajo — que en la práctica le daba 403, pero por
        // accidente y después de leer la fila; ahora se corta acá.
        const alcance = alcanceTasaciones(user.profile.role)
        if (alcance === 'ninguna') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }

        if (alcance !== 'todas') {
            const { data: appraisal, error: lookupError } = await supabase
                .from('appraisals')
                .select('assigned_to, user_id')
                .eq('id', id)
                .single()
            if (lookupError) throw lookupError
            const isOwner = appraisal?.assigned_to === user.id || appraisal?.user_id === user.id
            if (!isOwner) {
                return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
            }
        }

        const { error } = await supabase
            .from('appraisals')
            .update({ contact_id: contactId })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('PATCH /api/appraisals/[id]/contact error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
