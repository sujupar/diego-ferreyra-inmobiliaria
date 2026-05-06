import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

function getAdmin() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

/**
 * PATCH /api/users/[id]
 *
 * Por ahora solo soporta `is_active` (activar / desactivar usuario). Un usuario
 * desactivado no puede iniciar sesión (ver requireAuth en require-role.ts) y
 * tampoco aparece en consultas con `is_active=true`, pero sus datos históricos
 * (deals, tasaciones, propiedades) quedan intactos.
 *
 * Solo admin/dueño. No permitido desactivarse a uno mismo.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole('admin', 'dueno')
        const { id } = await params
        const body = await request.json()

        if (id === user.id) {
            return NextResponse.json({ error: 'No puedes modificar tu propio estado' }, { status: 400 })
        }

        const patch: Record<string, unknown> = {}
        if (typeof body.is_active === 'boolean') patch.is_active = body.is_active

        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
        }

        const supabase = getAdmin()
        const { error } = await supabase
            .from('profiles')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('PATCH /api/users/[id] error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}

/**
 * DELETE /api/users/[id]
 *
 * Borra el usuario de auth.users (esto elimina también el row de profiles via
 * CASCADE). Sus deals/tasaciones/propiedades quedan en DB con `assigned_to`
 * apuntando a un id inexistente — la app los muestra como "Sin asignar".
 *
 * Para uso excepcional. Lo recomendado es desactivar (PATCH is_active=false).
 *
 * Solo admin/dueño. No permitido borrarse a uno mismo.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole('admin', 'dueno')
        const { id } = await params

        if (id === user.id) {
            return NextResponse.json({ error: 'No puedes borrarte a ti mismo' }, { status: 400 })
        }

        const supabase = getAdmin()
        const { error } = await supabase.auth.admin.deleteUser(id)
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('DELETE /api/users/[id] error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
