import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Profile, UserWithProfile } from '@/types/auth.types'

/**
 * Server-side helper to get the current authenticated user with their profile.
 * Returns null if not authenticated or profile not found.
 * Uses service_role key for profile query to bypass RLS.
 */
export async function getUser(): Promise<UserWithProfile | null> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  // Use service_role to bypass RLS for profile lookup
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  return {
    id: user.id,
    email: user.email!,
    profile: profile as Profile,
  }
}
