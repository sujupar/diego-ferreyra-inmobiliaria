import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Profile, UserWithProfile } from '@/types/auth.types'

const IMPERSONATE_COOKIE = 'impersonate_user_id'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Server-side helper to get the current authenticated user with their profile.
 * Supports admin impersonation: if `impersonate_user_id` cookie is set and
 * the real user is admin/dueno, returns the impersonated user's profile instead.
 */
export async function getUser(): Promise<UserWithProfile | null> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const adminClient = getAdminClient()

  // Check for impersonation
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
  if (impersonateId && impersonateId !== user.id) {
    // Verify real user is admin/dueno
    const { data: realProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (realProfile && ['admin', 'dueno'].includes(realProfile.role)) {
      // Return impersonated user's profile
      const { data: impersonatedProfile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', impersonateId)
        .single()

      if (impersonatedProfile) {
        return {
          id: impersonateId,
          email: impersonatedProfile.email,
          profile: impersonatedProfile as Profile,
          _impersonatedBy: user.id, // Track who is impersonating
        } as UserWithProfile
      }
    }
  }

  // Normal flow: return real user's profile
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

/**
 * Check if the current session is impersonating another user.
 */
export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get(IMPERSONATE_COOKIE)?.value
}
