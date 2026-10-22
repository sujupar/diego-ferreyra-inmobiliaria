import 'server-only'
/**
 * Cliente service-role SIN tipos generados: `property_reports` todavía no está en
 * `types/database.types.ts`, y las lecturas se validan a mano en `datos.ts` (mismo criterio que
 * `lib/visitas/encuesta/datos.ts`). Solo servidor: saltea RLS.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | null = null

export function sb(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    cliente = createClient(url, key, { auth: { persistSession: false } })
  }
  return cliente
}
