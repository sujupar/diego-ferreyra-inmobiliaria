import { NextResponse } from 'next/server'
import { getReportSettings, updateReportSettings } from '@/lib/marketing/send-report'
import { requirePermission } from '@/lib/auth/require-role'

/**
 * GET /api/settings/report-recipients
 * Returns current report settings (recipients, enabled flags)
 */
export async function GET(): Promise<Response> {
  // Config de reportes = territorio admin/dueno (nav solo lo muestra con settings.manage).
  await requirePermission('settings.manage')
  try {
    const settings = await getReportSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Get report settings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/report-recipients
 * Body: { recipients?: string[], daily_enabled?: boolean, weekly_enabled?: boolean, monthly_enabled?: boolean }
 */
export async function PUT(request: Request): Promise<Response> {
  // Solo admin/dueno pueden cambiar a quién se envían los reportes de negocio.
  await requirePermission('settings.manage')
  try {
    const body = await request.json()

    const updates: Record<string, unknown> = {}

    if (Array.isArray(body.recipients)) {
      // Validate emails
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const validEmails = body.recipients.filter((e: string) => emailRegex.test(e))
      updates.recipients = validEmails
    }

    if (typeof body.daily_enabled === 'boolean') {
      updates.daily_enabled = body.daily_enabled
    }
    if (typeof body.weekly_enabled === 'boolean') {
      updates.weekly_enabled = body.weekly_enabled
    }
    if (typeof body.monthly_enabled === 'boolean') {
      updates.monthly_enabled = body.monthly_enabled
    }

    const settings = await updateReportSettings(updates)
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Update report settings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
