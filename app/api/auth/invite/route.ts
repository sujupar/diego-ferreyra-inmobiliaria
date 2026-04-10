import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { invitationEmailHtml } from '@/lib/auth/email-templates'
import { Role } from '@/types/auth.types'

function getResend() {
    return new Resend(process.env.RESEND_API_KEY)
}

function getAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify the requester is an admin or dueno
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        // Use service_role to bypass RLS for profile lookup
        const adminClient = getAdminClient()

        const { data: profile } = await adminClient
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single()

        if (!profile || !['admin', 'dueno'].includes(profile.role)) {
            return NextResponse.json({ error: 'Solo administradores pueden enviar invitaciones' }, { status: 403 })
        }

        const { email, role } = await request.json() as { email: string; role: string }

        // Validate role
        if (!['dueno', 'coordinador', 'asesor', 'abogado'].includes(role)) {
            return NextResponse.json({ error: 'Rol invalido' }, { status: 400 })
        }

        // Check if user already exists
        const { data: existingProfile } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (existingProfile) {
            return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
        }

        // Create invitation using admin client to bypass RLS
        const { data: invitation, error: invError } = await adminClient
            .from('invitations')
            .insert({ email, role, invited_by: user.id })
            .select('token')
            .single()

        if (invError) throw invError

        // Build accept URL
        const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || ''
        const acceptUrl = `${baseUrl}/accept-invite?token=${invitation.token}`

        // Try to send email (optional - works without Resend API key)
        try {
            if (!process.env.RESEND_API_KEY) throw new Error('No RESEND_API_KEY')
            const resend = getResend()
            const { error: emailError } = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Diego Ferreyra Inmobiliaria <noreply@diegofeinmobiliaria.com>',
                to: email,
                subject: 'Invitacion a Diego Ferreyra Inmobiliaria',
                html: invitationEmailHtml({
                    role: role as Role,
                    inviterName: profile.full_name,
                    acceptUrl,
                }),
            })
            if (emailError) throw emailError
            return NextResponse.json({ success: true })
        } catch (emailErr) {
            console.error('Email send error (non-blocking):', emailErr)
            return NextResponse.json({
                success: true,
                warning: 'Invitacion creada. Comparte este link manualmente:',
                acceptUrl,
            })
        }
    } catch (error: any) {
        console.error('Invite error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
