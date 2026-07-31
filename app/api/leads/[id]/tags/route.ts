import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLeadAccess } from '@/lib/leads/authorize-lead-access'

/**
 * POST/DELETE /api/leads/[id]/tags
 *
 * Agrega/quita una etiqueta (`lead_tags`, catálogo en `GET /api/leads/tags`)
 * a un lead puntual. Gate: `authorizeLeadAccess` — operaciones ven cualquier
 * lead, el asesor solo los suyos (mismo criterio que el resto de `/api/leads`
 * y `/api/whatsapp/*`). El abogado nunca llega (no está en `ALLOWED_ROLES`).
 *
 * "Nada se borra": quitar una etiqueta borra la FILA de asignación
 * (`lead_tag_assignments`) — se marca `removed_at`, NO se borra la fila: el
 * catálogo (`lead_tags`) y el historial de estado NO se tocan acá.
 *
 * `lead_tags`/`lead_tag_assignments` no están en `types/database.types.ts`
 * (migración `20260801000001`, CLI de Supabase no conecta — ver CLAUDE.md):
 * cliente SIN el genérico `<Database>` + cast, mismo patrón que
 * `lib/integrations/whatsapp/log.ts` / `lib/leads/tags.ts`.
 *
 * Body (ambos métodos): `{ tagSlug: string }`.
 * Respuesta 200: `{ data: { tags: Array<{slug,label,color}> } }` — el estado
 * RESULTANTE de etiquetas del lead (no solo la que se tocó), para que el
 * cliente pueda pintar el chip list entero de una.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const BodySchema = z.object({
  tagSlug: z.string().trim().min(1),
})

interface TagRow {
  slug: string
  label: string
  color: string
}

/** Etiquetas actuales del lead, ordenadas por `sort_order` del catálogo (mismo orden que el selector). */
async function tagsForLead(supabase: ReturnType<typeof admin>, leadId: string): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from('lead_tag_assignments')
    .select('lead_tags(slug, label, color, sort_order)')
    // Solo las etiquetas VIGENTES: quitar una la MARCA (`removed_at`), no la borra.
    .is('removed_at', null)
    .eq('lead_id', leadId)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<{ lead_tags: (TagRow & { sort_order: number }) | null }>
  return rows
    .map(r => r.lead_tags)
    .filter((t): t is TagRow & { sort_order: number } => Boolean(t))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ slug, label, color }) => ({ slug, label, color }))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const auth = await authorizeLeadAccess(id, user)
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

    const body = await req.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid', detail: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = admin()
    const { data: tag } = await supabase
      .from('lead_tags')
      .select('id')
      .eq('slug', parsed.data.tagSlug)
      .eq('is_active', true)
      .maybeSingle()
    const tagRow = tag as { id: string } | null
    if (!tagRow) return NextResponse.json({ error: 'Etiqueta desconocida' }, { status: 400 })

    // PK compuesta (lead_id, tag_id) → onConflict detecta el duplicado.
    // `ignoreDuplicates: false` a propósito: si la etiqueta se había QUITADO
    // (tiene `removed_at`), volver a ponerla tiene que limpiar esa marca. Con
    // `ignoreDuplicates: true` la fila vieja quedaba con `removed_at` y la
    // etiqueta no reaparecía nunca más.
    const { error: insertError } = await supabase
      .from('lead_tag_assignments')
      .upsert(
        { lead_id: id, tag_id: tagRow.id, assigned_by: user.id, removed_at: null, removed_by: null },
        { onConflict: 'lead_id,tag_id', ignoreDuplicates: false },
      )
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ data: { tags: await tagsForLead(supabase, id) } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const auth = await authorizeLeadAccess(id, user)
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

    const body = await req.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid', detail: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = admin()
    // Buscamos el tag SIN filtrar is_active: si se desactivó una etiqueta que
    // el lead ya tenía, el equipo tiene que poder seguir quitándola.
    const { data: tag } = await supabase
      .from('lead_tags')
      .select('id')
      .eq('slug', parsed.data.tagSlug)
      .maybeSingle()
    const tagRow = tag as { id: string } | null
    if (!tagRow) return NextResponse.json({ error: 'Etiqueta desconocida' }, { status: 400 })

    // Se MARCA como quitada, no se borra. Regla del proyecto: ningún dato se
    // destruye. Y saber que a alguien lo marcaron "Caliente" en julio y se lo
    // sacaron en agosto es información del negocio, no basura.
    const { error: deleteError } = await supabase
      .from('lead_tag_assignments')
      .update({ removed_at: new Date().toISOString(), removed_by: user.id })
      .eq('lead_id', id)
      .eq('tag_id', tagRow.id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    return NextResponse.json({ data: { tags: await tagsForLead(supabase, id) } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
