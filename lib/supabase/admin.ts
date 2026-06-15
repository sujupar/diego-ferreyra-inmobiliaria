import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

/**
 * Cliente service-role para Server Components / rutas públicas (sin sesión de usuario).
 * Bypassa RLS — usar SOLO en el servidor, nunca en el cliente.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
