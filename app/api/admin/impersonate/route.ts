import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const COOKIE_NAME = 'impersonate_user_id'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/admin/impersonate — Start impersonating a user
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Verify real user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const adminClient = getAdminClient()
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'dueno'].includes(profile.role)) {
      return NextResponse.json({ error: 'Solo admin/dueno puede impersonar' }, { status: 403 })
    }

    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Verify target user exists
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single()

    if (!targetProfile) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Set impersonation cookie
    const response = NextResponse.json({
      success: true,
      impersonating: { id: targetProfile.id, name: targetProfile.full_name, role: targetProfile.role },
    })

    response.cookies.set(COOKIE_NAME, userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 4, // 4 hours max
    })

    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/impersonate — Stop impersonating
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
