// Cliente de Supabase del radar (service role). Lee el entorno del proceso:
// el radar real carga ~/.radar-referencias/.env; en desarrollo, `--env-file=.env.local`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cliente) return cliente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del radar')
  }
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cliente
}
