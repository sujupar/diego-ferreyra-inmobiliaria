import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { getVisit, updateVisit } from '@/lib/supabase/visits'

const patchSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  client_name: z.string().min(1).optional(),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'no_show', 'cancelled']).optional(),
  completion_notes: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const visit = await getVisit(id)
  if (!visit) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data: visit })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await updateVisit(id, {
      ...parsed.data,
      ...(parsed.data.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    })
    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[PUT /api/visits/[id]]', err)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}
