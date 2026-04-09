import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Profile, UserWithProfile } from '@/types/auth.types'

/**
 * Server-side helper to get the current authenticated user with their profile.
 * Returns null if not authenticated or profile not found.
 */
export async function getUser(): Promise<UserWithProfile | null> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: profile, error: profileError } = await supabase
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
