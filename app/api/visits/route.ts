import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { createVisit, listVisits } from '@/lib/supabase/visits'

const createSchema = z.object({
  property_id: z.string().uuid(),
  advisor_id: z.string().uuid().optional(),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_phone: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  try {
    const visits = await listVisits({
      advisorId: sp.get('advisor_id') || undefined,
      propertyId: sp.get('property_id') || undefined,
      status: sp.get('status') || undefined,
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
    })
    return NextResponse.json({ data: visits })
  } catch (err) {
    console.error('[GET /api/visits]', err)
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const visit = await createVisit({
      ...parsed.data,
      advisor_id: parsed.data.advisor_id ?? user.id,
      created_by: user.id,
    })

    // Dispatch email (non-blocking). Module is created in Task 4.4.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailModule = '@/lib/email/notifications/visit-scheduled-client'
    import(emailModule)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((mod: any) => mod.sendVisitScheduledToClient(visit.id))
      .catch((err: unknown) => console.error('[visits] email dispatch failed', err))

    return NextResponse.json({ data: visit }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/visits]', err)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
