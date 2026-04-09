import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/setup
 * Temporary endpoint to create the initial admin user.
 * Body: { email, password, full_name }
 *
 * DELETE THIS FILE after creating your admin user.
 */
export async function POST(request: Request) {
  try {
    const { email, password, full_name } = await request.json()

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Missing email, password, or full_name' }, { status: 400 })
    }

    // Use service_role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email === email)
    if (existing) {
      // User exists, just ensure profile exists
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: existing.id,
          email,
          full_name,
          role: 'admin',
        }, { onConflict: 'id' })

      return NextResponse.json({
        success: true,
        message: 'User already exists, profile ensured',
        user_id: existing.id,
        profile_error: profileError?.message,
      })
    }

    // Create new user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role: 'admin',
      })

    return NextResponse.json({
      success: true,
      user_id: authData.user.id,
      profile_error: profileError?.message,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
