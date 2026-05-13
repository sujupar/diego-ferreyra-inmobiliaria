import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendReminderForVisit } from '@/lib/email/notifications/visit-reminder-advisor'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: due } = await supabase
    .from('property_visits')
    .select('id')
    .eq('status', 'scheduled')
    .lt('scheduled_at', new Date().toISOString())
    .is('reminder_sent_at', null)

  let sent = 0
  for (const v of due ?? []) {
    try {
      await sendReminderForVisit(v.id)
      sent++
    } catch (e) {
      console.error('[cron/visit-reminders]', v.id, e)
    }
  }

  return NextResponse.json({ checked: due?.length ?? 0, sent })
}
