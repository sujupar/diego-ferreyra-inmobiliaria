import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * `property_leads.deleted_at` (papelera, migración
 * `20260730000001_whatsapp_messages_y_leads_papelera.sql`) todavía no está en
 * `types/database.types.ts` — el CLI de Supabase no conecta en este proyecto
 * (ver CLAUDE.md § Supabase), así que los types no se pueden regenerar. Mismo
 * patrón que `lib/integrations/whatsapp/log.ts`: cliente SIN el genérico
 * `<Database>` + cast manual de los datos que le pasamos.
 */
function getAdminRaw() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const OPS_ROLES = ['admin', 'dueno', 'coordinador'] as const

const RestoreLeadsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * POST /api/leads/restore
 * Papelera → restaurar: `deleted_at = null`. Nunca hay un DELETE de SQL en
 * ningún camino de este archivo — restaurar es simplemente volver a poner la
 * columna en NULL (regla dura del usuario: nada se borra de verdad).
 * Solo roles de operaciones (mismo criterio que `DELETE /api/leads`); el
 * asesor no puede restaurar leads.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    if (!OPS_ROLES.includes(user.profile.role as (typeof OPS_ROLES)[number])) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = RestoreLeadsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', detail: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const supabase = getAdminRaw()
    const { data, error } = await supabase
      .from('property_leads')
      .update({ deleted_at: null })
      .in('id', parsed.data.ids)
      .not('deleted_at', 'is', null) // idempotente: no toca lo que ya está visible
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, restored: (data ?? []).length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
