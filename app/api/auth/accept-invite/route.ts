import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS for user creation
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Validate token and return invitation data
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
        return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const { data: invitation, error } = await supabaseAdmin
        .from('invitations')
        .select('email, role, expires_at, accepted_at')
        .eq('token', token)
        .single()

    if (error || !invitation) {
        return NextResponse.json({ error: 'Invitacion no encontrada' }, { status: 404 })
    }

    if (invitation.accepted_at) {
        return NextResponse.json({ error: 'Esta invitacion ya fue utilizada' }, { status: 410 })
    }

    if (new Date(invitation.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Esta invitacion ha expirado' }, { status: 410 })
    }

    return NextResponse.json({
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
    })
}

// POST: Create user account from invitation
export async function POST(request: NextRequest) {
    try {
        const { token, fullName, password } = await request.json()

        if (!token || !fullName || !password) {
            return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
        }

        // Fetch and validate invitation
        const { data: invitation, error: invError } = await supabaseAdmin
            .from('invitations')
            .select('*')
            .eq('token', token)
            .single()

        if (invError || !invitation) {
            return NextResponse.json({ error: 'Invitacion no encontrada' }, { status: 404 })
        }

        if (invitation.accepted_at) {
            return NextResponse.json({ error: 'Esta invitacion ya fue utilizada' }, { status: 410 })
        }

        if (new Date(invitation.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Esta invitacion ha expirado' }, { status: 410 })
        }

        // Create auth user via admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: invitation.email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
        })

        if (authError) {
            if (authError.message?.includes('already been registered')) {
                return NextResponse.json({ error: 'Ya existe una cuenta con este email' }, { status: 409 })
            }
            throw authError
        }

        // The handle_new_user trigger will auto-create the profile and mark invitation as accepted
        // But as a safety net, ensure the profile exists
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', authData.user.id)
            .single()

        if (!existingProfile) {
            // Trigger didn't fire or failed - create profile manually
            await supabaseAdmin
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    email: invitation.email,
                    full_name: fullName,
                    role: invitation.role,
                })

            await supabaseAdmin
                .from('invitations')
                .update({ accepted_at: new Date().toISOString() })
                .eq('id', invitation.id)
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Accept invite error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
