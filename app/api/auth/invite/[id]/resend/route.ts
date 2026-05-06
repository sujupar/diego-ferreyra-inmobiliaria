import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import { notifyInvitation } from '@/lib/email/notifications/invitation'

function getAdmin() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

const ROLE_LABELS: Record<string, string> = {
    dueno: 'Dueño',
    coordinador: 'Coordinador',
    asesor: 'Asesor',
    abogado: 'Abogado',
}

const RESEND_EXTENDS_DAYS = 7

/**
 * POST /api/auth/invite/[id]/resend
 *
 * Re-envía el email de invitación usando el TOKEN existente — el link no
 * cambia. Si la invitación expiró, extiende `expires_at` por 7 días más.
 *
 * Útil cuando la invitación se generó pero el email nunca llegó (ej: estaba
 * activo el modo prueba y fue redirigido al admin).
 *
 * Solo admin/dueño.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole('admin', 'dueno')
        const { id } = await params
        const supabase = getAdmin()

        const { data: invitation, error: lookupError } = await supabase
            .from('invitations')
            .select('id, email, role, token, accepted_at, expires_at')
            .eq('id', id)
            .single()

        if (lookupError || !invitation) {
            return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
        }
        if (invitation.accepted_at) {
            return NextResponse.json({ error: 'Esta invitación ya fue aceptada' }, { status: 400 })
        }

        // Si expiró, extendemos. Reenviar un link expirado no tiene sentido.
        const isExpired = new Date(invitation.expires_at) <= new Date()
        if (isExpired) {
            const newExpires = new Date()
            newExpires.setDate(newExpires.getDate() + RESEND_EXTENDS_DAYS)
            const { error: updateError } = await supabase
                .from('invitations')
                .update({ expires_at: newExpires.toISOString() })
                .eq('id', id)
            if (updateError) throw updateError
        }

        // Datos del invitador para el "from name".
        const { data: inviterProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single()

        const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://inmodf.com.ar'
        const acceptUrl = `${baseUrl}/accept-invite?token=${invitation.token}`

        const result = await notifyInvitation({
            inviteeEmail: invitation.email,
            roleLabel: ROLE_LABELS[invitation.role] || invitation.role,
            inviterName: inviterProfile?.full_name || 'Administrador',
            inviterEmail: inviterProfile?.email,
            acceptUrl,
            expiresInDays: RESEND_EXTENDS_DAYS,
        })

        if (!result.ok || result.sent === 0) {
            return NextResponse.json({
                success: true,
                warning: 'Invitación válida, pero el email falló. Compartí este link manualmente:',
                acceptUrl,
                errors: result.errors,
            })
        }

        return NextResponse.json({ success: true, extended: isExpired })
    } catch (error) {
        console.error('POST /api/auth/invite/[id]/resend error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
