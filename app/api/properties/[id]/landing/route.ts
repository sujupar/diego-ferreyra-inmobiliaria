/**
 * E1.4 — Landing de la propiedad (co-creación).
 *   GET    → estado actual (landing + templates disponibles).
 *   POST   → arranca la co-creación (crea el draft con IA). Idempotente.
 *   PATCH  → actualiza wizard_state / template / content del draft.
 *   DELETE → despublica (vuelve a draft).
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import {
  authorizeLanding, getLanding, startCoCreation, updateLanding, unpublishLanding, setDeliverMedia,
} from '@/lib/landing/landing-service'
import { TEMPLATES } from '@/lib/landing/templates'

export const maxDuration = 60

const templatesMeta = () => TEMPLATES.map(t => ({
  id: t.id, label: t.label, description: t.description, bestFor: t.bestFor,
}))

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const landing = await getLanding(id)
    return NextResponse.json({ landing, templates: templatesMeta() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const landing = await startCoCreation(id, user.id)
    return NextResponse.json({ landing, templates: templatesMeta() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as {
      wizardState?: Record<string, unknown>
      templateId?: string
      content?: unknown
      draftContent?: unknown
      deliverMedia?: 'video_recorrido' | 'tour_3d'
    }
    if (body.deliverMedia === 'video_recorrido' || body.deliverMedia === 'tour_3d') {
      await setDeliverMedia(id, body.deliverMedia)
    }

    // `deliverMedia` vive en `properties`, no en la landing. Si el PATCH trae SOLO
    // eso, llamar a updateLanding armaría un `.update({})` → 0 filas → PGRST116 →
    // 400, y la UI mostraría "error al guardar" con el dato YA persistido.
    const touchesLanding =
      body.wizardState !== undefined ||
      body.templateId !== undefined ||
      body.content !== undefined ||
      body.draftContent !== undefined
    if (!touchesLanding) {
      return NextResponse.json({ landing: await getLanding(id) })
    }

    const landing = await updateLanding(id, {
      wizardState: body.wizardState as never,
      templateId: body.templateId,
      content: body.content,
      draftContent: body.draftContent,
    })
    return NextResponse.json({ landing })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    await unpublishLanding(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
