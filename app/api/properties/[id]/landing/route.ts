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
  authorizeLanding, getLanding, startCoCreation, updateLanding, unpublishLanding, deleteLanding, setDeliverMedia,
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
      deliverMedia?: 'video_recorrido' | 'tour_3d' | 'video_propio'
    }
    if (
      body.deliverMedia === 'video_recorrido' ||
      body.deliverMedia === 'tour_3d' ||
      body.deliverMedia === 'video_propio'
    ) {
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

    // Las claves del GATE de publicación no se aceptan del cliente (review
    // 2026-08-06): `copyFromAnswers:true` lo setea SOLO la etapa copy del
    // server, y `questions`/`answers` solo el enrich y POST /landing/answers.
    // El cliente legítimo únicamente baja el gate (copyFromAnswers:false) y
    // re-arma la etapa de textos (enrich:'copy') al cambiar avatar/diseño.
    let wizardState = body.wizardState
    if (wizardState) {
      wizardState = { ...wizardState }
      delete wizardState.questions
      delete wizardState.answers
      delete wizardState.avatarCandidates
      delete wizardState.visionSummary
      delete wizardState.descriptionUsed
      if (wizardState.copyFromAnswers !== false) delete wizardState.copyFromAnswers
      if (wizardState.enrich !== 'copy') delete wizardState.enrich
    }

    const landing = await updateLanding(id, {
      wizardState: wizardState as never,
      templateId: body.templateId,
      content: body.content,
      draftContent: body.draftContent,
    })
    return NextResponse.json({ landing })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 400 })
  }
}

/**
 * DELETE /api/properties/[id]/landing
 *  - default: despublica (vuelve a draft, conserva todo).
 *  - `?definitivo=1`: ELIMINA la landing para regenerarla de cero (botón
 *    "Eliminar landing" de la plataforma, 2026-08-07). El enlace público
 *    sobrevive con la landing determinística y se reusa al re-publicar.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const definitivo = new URL(req.url).searchParams.get('definitivo') === '1'
    if (definitivo) {
      await deleteLanding(id)
    } else {
      await unpublishLanding(id)
    }
    return NextResponse.json({ ok: true, eliminada: definitivo })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
