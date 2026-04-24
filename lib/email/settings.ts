import 'server-only'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface NotificationSettings {
  id: string
  test_mode_enabled: boolean
  test_recipient_email: string | null
  alert_admins_on_lawyer_failure: boolean
  updated_at: string
}

const CACHE_TTL_MS = 5_000
let cache: { value: NotificationSettings; expiresAt: number } | null = null

export function invalidateSettingsCache() {
  cache = null
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  const { data, error } = await getAdmin()
    .from('notification_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw error
  const value: NotificationSettings = data ?? {
    id: 'default',
    test_mode_enabled: false,
    test_recipient_email: null,
    alert_admins_on_lawyer_failure: true,
    updated_at: new Date().toISOString(),
  }
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function updateNotificationSettings(patch: Partial<Pick<NotificationSettings,
  'test_mode_enabled' | 'test_recipient_email' | 'alert_admins_on_lawyer_failure'>>) {
  // Upsert en vez de update para cubrir el caso donde la migration aún no corrió
  // o el row 'default' no fue insertado. Sin esto, un PATCH devolvía success
  // pero afectaba 0 rows y el GET posterior mostraba los defaults en memoria —
  // el usuario pensaba que guardó la config pero no.
  const { error } = await getAdmin()
    .from('notification_settings')
    .upsert({ id: 'default', ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  invalidateSettingsCache()
}
