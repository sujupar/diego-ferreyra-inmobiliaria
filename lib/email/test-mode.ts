import 'server-only'
import { getNotificationSettings } from './settings'

export interface TestModeResult {
  to: string[]                   // a dónde va realmente (redirigido si test mode ON)
  subject: string                // con prefix [PRUEBA] si test mode ON
  testModeOn: boolean
  originalTo: string[]           // destinatarios previstos (intacto)
}

/**
 * Si el modo prueba está activo en notification_settings, redirige TODOS los
 * destinatarios al test_recipient_email y antepone [PRUEBA] al subject.
 * Si está apagado, devuelve los destinatarios tal cual.
 */
export async function applyTestMode(to: string | string[], subject: string): Promise<TestModeResult> {
  const originalTo = Array.isArray(to) ? to : [to]
  const settings = await getNotificationSettings()
  if (!settings.test_mode_enabled || !settings.test_recipient_email) {
    return { to: originalTo, subject, testModeOn: false, originalTo }
  }
  return {
    to: [settings.test_recipient_email],
    subject: `[PRUEBA] ${subject}`,
    testModeOn: true,
    originalTo,
  }
}
