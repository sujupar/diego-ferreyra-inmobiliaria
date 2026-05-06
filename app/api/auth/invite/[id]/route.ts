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
 * DELETE /api/auth/invite/[id]
 *
 * Cancela una invitación pendiente. Si la invitación ya fue aceptada (existe
 * un profile con ese email), no la borramos — solo invitaciones sin
 * `accepted_at` pueden cancelarse.
 *
 * Solo admin/dueño.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireRole('admin', 'dueno')
        const { id } = await params
        const supabase = getAdmin()

        // Validar que la invitación existe y no fue aceptada.
        const { data: existing, error: lookupError } = await supabase
            .from('invitations')
            .select('id, accepted_at')
            .eq('id', id)
            .single()

        if (lookupError) {
            return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
        }
        if (existing.accepted_at) {
            return NextResponse.json({ error: 'No se puede cancelar una invitación ya aceptada' }, { status: 400 })
        }

        const { error } = await supabase.from('invitations').delete().eq('id', id)
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('DELETE /api/auth/invite/[id] error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
