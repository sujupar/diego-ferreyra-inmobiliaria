import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { updateVisit } from '@/lib/supabase/visits'

const schema = z.object({
  outcome: z.enum(['completed', 'no_show']),
  completion_notes: z.string().optional(),
  internal_answers: z
    .object({
      liked: z.boolean().nullable(),
      most_liked: z.string().nullable(),
      least_liked: z.string().nullable(),
      in_price: z.boolean().nullable(),
      hypothetical_offer: z.number().nullable(),
    })
    .optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await updateVisit(id, {
      status: parsed.data.outcome,
      completion_notes: parsed.data.completion_notes,
      completed_at: new Date().toISOString(),
    })

    if (parsed.data.outcome === 'completed' && parsed.data.internal_answers) {
      const cookieStore = await cookies()
      const supabase = createClient(cookieStore)
      // visit_questionnaires table will be created by Task 6.1; this insert
      // will fail at runtime until then. The migration is applied manually.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: qErr } = await (supabase as any)
        .from('visit_questionnaires')
        .insert({
          visit_id: id,
          response_source: 'advisor',
          ...parsed.data.internal_answers,
          responded_at: new Date().toISOString(),
        })
      if (qErr) {
        console.warn(
          '[visits/complete] questionnaire insert failed (Task 6.1 migration not applied yet?):',
          qErr.message,
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/visits/[id]/complete]', err)
    return NextResponse.json({ error: 'complete_failed' }, { status: 500 })
  }
}
