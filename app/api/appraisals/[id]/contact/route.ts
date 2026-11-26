import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceTasaciones, puedeEditarTasacion } from '@/lib/auth/appraisal-access'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'

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
    // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
    const user = await requireAuth()
    // crm-ficha-y-llamadas (D4, tarea 5.4): un rol sin alcance de contactos no vincula.
    const alcanceDeContactos = alcanceContactos(user.profile.role)
    if (alcanceDeContactos === 'ninguno') {
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

        // D1: el trío de operaciones que esta ruta ya tenía como `OPS_ROLES`
        // ahora sale de la lista compartida (lib/auth/appraisal-access.ts), la
        // misma que usan el listado, la ficha y el borrado. Cambio real de
        // comportamiento: un rol sin alcance (abogado) antes caía en la rama de
        // pertenencia de abajo — que en la práctica le daba 403, pero por
        // accidente y después de leer la fila; ahora se corta acá.
        //
        // El candado pregunta por la ESCRITURA, no por "¿alcanza algo?": esto
        // reasigna a qué CLIENTE pertenece la tasación, y el alcance
        // `vinculadas` del abogado es de lectura. Con `!== 'ninguna'` el
        // abogado pasaría a la rama de pertenencia y volvería a depender de un
        // accidente (que no sea el asignado) para recibir su 403.
        const alcance = alcanceTasaciones(user.profile.role)
        if (!puedeEditarTasacion(user.profile.role)) {
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

        // Recién después de comprobar que la tasación es suya (si no, por la diferencia
        // entre 404 y 403 sabría algo de un contacto ajeno): para VINCULAR, un asesor
        // tiene que poder ver ya ese contacto. Una tasación a su nombre le da acceso al
        // contacto (D2), así que sin esto vincular cualquier id le abría su ficha.
        if (contactId !== null && alcanceDeContactos === 'propios' && !(await canAccessContact(user, contactId))) {
            return NextResponse.json({ error: 'No encontramos este contacto' }, { status: 404 })
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
