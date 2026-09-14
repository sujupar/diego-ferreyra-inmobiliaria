import { NextRequest, NextResponse } from 'next/server'
import { saveVisitData, getVisitData, markVisitCompleted } from '@/lib/supabase/visit-data'
import { sanearSnapshotVisita } from '@/lib/supabase/visit-data-sanear'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const data = await getVisitData(id)
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const body = await req.json()
  const { snapshot, complete } = body
  // Las secciones nuevas (portales, landing) terminan en prefills y prompts:
  // se acotan antes de mezclarlas en el JSONB. sale/purchase pasan como siempre.
  const saved = await saveVisitData(id, sanearSnapshotVisita(snapshot))
  if (complete) await markVisitCompleted(id)
  return NextResponse.json({ data: saved })
}
