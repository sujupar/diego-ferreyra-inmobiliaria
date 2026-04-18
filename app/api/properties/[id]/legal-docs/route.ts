import { NextRequest, NextResponse } from 'next/server'
import { getLegalDocs, setLegalFlags } from '@/lib/supabase/legal-docs'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return NextResponse.json({ data: await getLegalDocs(id) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const { flags } = await req.json()
  return NextResponse.json({ data: await setLegalFlags(id, flags) })
}
