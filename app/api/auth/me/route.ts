import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // Check impersonation
    const impersonateId = cookieStore.get('impersonate_user_id')?.value

    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let targetId = user.id
    if (impersonateId) {
      // Verify real user is admin/dueno
      const { data: realProfile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
      if (realProfile && ['admin', 'dueno'].includes(realProfile.role)) {
        targetId = impersonateId
      }
    }

    const { data: profile } = await adminClient.from('profiles').select('id, role, full_name').eq('id', targetId).single()
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    return NextResponse.json({ id: profile.id, role: profile.role, full_name: profile.full_name })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
