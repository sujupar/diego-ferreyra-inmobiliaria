import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLeadAccess } from '@/lib/leads/authorize-lead-access'
import { PIPELINE_STATES, setPipelineStateManually } from '@/lib/leads/pipeline-state'

/**
 * PATCH /api/leads/[id]/state
 *
 * Cambia el estado del embudo A MANO — la ÚNICA vía para retroceder un
 * estado o saltar directo a `negociando`/`cerrado`/`perdido` (Task 1+2,
 * `lib/leads/pipeline-state.ts` § `setPipelineStateManually`). Sin esta
 * ruta esa función quedaba sin ningún caller — hueco #1 señalado en el
 * brief de Task 3.
 *
 * Gate: `authorizeLeadAccess` — operaciones ven cualquier lead, el asesor
 * solo los suyos. El abogado no llega.
 *
 * Body: `{ state: PipelineState, reason: string }`. `reason` es OBLIGATORIO
 * (no vacío tras trim): es la única forma de bajar un estado a mano y tiene
 * que quedar registrado por qué (`lead_state_history.reason`,
 * `changed_by = user.id`).
 *
 * `setPipelineStateManually` SÍ lanza en error (a diferencia de
 * `advancePipelineState`, que es best-effort) — es una acción deliberada de
 * una persona, así que acá los errores esperables (motivo vacío, estado
 * inválido, lead no encontrado/borrado) se traducen a 400/404 en vez de
 * dejarlos caer como 500 genérico.
 *
 * Respuesta 200: `{ data: { changed: boolean, from: PipelineState|null, to: PipelineState|null } }`.
 */
const StateSchema = z.object({
  state: z.enum(PIPELINE_STATES),
  reason: z.string().trim().min(1, 'El motivo es obligatorio'),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const auth = await authorizeLeadAccess(id, user)
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

    const body = await req.json().catch(() => null)
    const parsed = StateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid', detail: parsed.error.flatten() }, { status: 400 })
    }

    try {
      const result = await setPipelineStateManually(id, parsed.data.state, user.id, parsed.data.reason)
      return NextResponse.json({ data: result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      const status = message === 'Lead no encontrado' ? 404 : 400
      return NextResponse.json({ error: message }, { status })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
