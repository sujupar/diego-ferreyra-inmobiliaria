import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-role'
import { getNotificationSettings, updateNotificationSettings } from '@/lib/email/settings'

export async function GET() {
  try {
    await requirePermission('settings.manage')
    const settings = await getNotificationSettings()
    return NextResponse.json({ data: settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission('settings.manage')
    const body = await request.json()

    // Only allow known fields.
    const patch: Record<string, unknown> = {}
    if (typeof body.test_mode_enabled === 'boolean') patch.test_mode_enabled = body.test_mode_enabled
    if (typeof body.test_recipient_email === 'string' || body.test_recipient_email === null) {
      const email = body.test_recipient_email
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
      }
      patch.test_recipient_email = email || null
    }
    if (typeof body.alert_admins_on_lawyer_failure === 'boolean') {
      patch.alert_admins_on_lawyer_failure = body.alert_admins_on_lawyer_failure
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
    }

    await updateNotificationSettings(patch as any)
    const settings = await getNotificationSettings()
    return NextResponse.json({ data: settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
