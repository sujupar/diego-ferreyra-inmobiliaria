import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { notifyInvitation } from '@/lib/email/notifications/invitation'

function getAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

const ROLE_LABELS: Record<string, string> = {
    dueno: 'Dueño',
    coordinador: 'Coordinador',
    asesor: 'Asesor',
    abogado: 'Abogado',
}

const INVITE_EXPIRES_IN_DAYS = 7

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify the requester is an admin or dueno
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        const adminClient = getAdminClient()

        const { data: profile } = await adminClient
            .from('profiles')
            .select('role, full_name, email')
            .eq('id', user.id)
            .single()

        if (!profile || !['admin', 'dueno'].includes(profile.role)) {
            return NextResponse.json({ error: 'Solo administradores pueden enviar invitaciones' }, { status: 403 })
        }

        const { email, role } = await request.json() as { email: string; role: string }

        if (!['dueno', 'coordinador', 'asesor', 'abogado'].includes(role)) {
            return NextResponse.json({ error: 'Rol invalido' }, { status: 400 })
        }

        const { data: existingProfile } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (existingProfile) {
            return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
        }

        // Create invitation
        const { data: invitation, error: invError } = await adminClient
            .from('invitations')
            .insert({ email, role, invited_by: user.id })
            .select('token')
            .single()

        if (invError) throw invError

        const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://inmodf.com.ar'
        const acceptUrl = `${baseUrl}/accept-invite?token=${invitation.token}`

        // Send invitation email via Resend. notifyInvitation never throws — it returns
        // { ok, errors } so we can report the exact failure reason to the UI and fall
        // back to showing the accept URL if Resend is misconfigured (DNS still
        // propagating, missing API key, etc.).
        const result = await notifyInvitation({
            inviteeEmail: email,
            roleLabel: ROLE_LABELS[role] || role,
            inviterName: profile.full_name || 'Administrador',
            inviterEmail: profile.email,
            acceptUrl,
            expiresInDays: INVITE_EXPIRES_IN_DAYS,
        })

        if (!result.ok || result.sent === 0) {
            return NextResponse.json({
                success: true,
                warning: 'Invitación creada pero el email falló. Compartí este link manualmente:',
                acceptUrl,
                errors: result.errors,
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Invite error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
