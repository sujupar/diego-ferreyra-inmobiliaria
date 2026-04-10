import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { invitationEmailHtml } from '@/lib/auth/email-templates'
import { Role } from '@/types/auth.types'

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

        const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || ''
        const acceptUrl = `${baseUrl}/accept-invite?token=${invitation.token}`

        // Send email via Gmail SMTP (same as marketing reports)
        const gmailUser = process.env.GMAIL_USER
        const gmailPass = process.env.GMAIL_APP_PASSWORD

        if (!gmailUser || !gmailPass) {
            return NextResponse.json({
                success: true,
                warning: 'Invitacion creada pero no hay Gmail configurado. Comparte este link:',
                acceptUrl,
            })
        }

        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailPass },
            })

            const ROLE_LABELS: Record<string, string> = {
                dueno: 'Dueño', coordinador: 'Coordinador',
                asesor: 'Asesor', abogado: 'Abogado',
            }

            await transporter.sendMail({
                from: `Diego Ferreyra Inmobiliaria <${gmailUser}>`,
                to: email,
                subject: `Invitacion a Diego Ferreyra Inmobiliaria — Rol: ${ROLE_LABELS[role] || role}`,
                html: invitationEmailHtml({
                    role: role as Role,
                    inviterName: profile.full_name,
                    acceptUrl,
                }),
            })

            return NextResponse.json({ success: true })
        } catch (emailErr) {
            console.error('Gmail send error:', emailErr)
            return NextResponse.json({
                success: true,
                warning: 'Invitacion creada pero el email fallo. Comparte este link:',
                acceptUrl,
            })
        }
    } catch (error: any) {
        console.error('Invite error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
