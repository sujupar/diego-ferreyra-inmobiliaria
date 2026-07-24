/**
 * E1.4 — POST /api/properties/[id]/landing/publish
 *
 * Publica la landing: valida el diseño (1 formulario), asigna slug, congela
 * utm_base + funnel_type, persiste el avatar elegido y escribe revisión.
 * Idempotente. Este es el HITO que desbloquea la campaña Meta (el gate de E2.1
 * exige status='published').
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, publishLanding } from '@/lib/landing/landing-service'

export const maxDuration = 60

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { slug, url } = await publishLanding(id, getAppUrl(), user.id)
    return NextResponse.json({ ok: true, slug, url })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 400 })
  }
}
