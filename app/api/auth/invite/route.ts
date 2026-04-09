import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { invitationEmailHtml } from '@/lib/auth/email-templates'
import { Role } from '@/types/auth.types'

function getResend() {
    return new Resend(process.env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        // Verify the requester is an admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo el admin puede enviar invitaciones' }, { status: 403 })
        }

        const { email, role } = await request.json() as { email: string; role: string }

        // Validate role
        if (!['dueno', 'coordinador', 'asesor'].includes(role)) {
            return NextResponse.json({ error: 'Rol invalido' }, { status: 400 })
        }

        // Check if user already exists
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (existingProfile) {
            return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
        }

        // Create invitation
        const { data: invitation, error: invError } = await supabase
            .from('invitations')
            .insert({ email, role, invited_by: user.id })
            .select('token')
            .single()

        if (invError) throw invError

        // Build accept URL
        const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || ''
        const acceptUrl = `${baseUrl}/accept-invite?token=${invitation.token}`

        // Send email
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

        if (emailError) {
            console.error('Resend error:', emailError)
            // Invitation was created even if email fails - admin can share the link manually
            return NextResponse.json({
                success: true,
                warning: 'Invitacion creada pero el email no se pudo enviar. Comparte el link manualmente.',
                acceptUrl,
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Invite error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
