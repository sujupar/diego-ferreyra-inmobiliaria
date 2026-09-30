import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import type { Database } from '@/types/database.types'

const cuerpo = z.object({ portal: z.enum(['mercadolibre', 'argenprop']) })

/** "Reintentar" un envío automático que falló 3 veces: vuelve a encolarlo con los mismos cambios. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: l } = await supabase.from('property_listings').select('id, metadata').eq('property_id', id).eq('portal', p.data.portal).maybeSingle()
  const meta = (l?.metadata ?? {}) as Record<string, unknown>
  const fallida = meta.actualizacion_fallida as { cambios_ficha?: string[] } | undefined
  if (!l || !fallida) return NextResponse.json({ error: 'No hay un envío fallido para reintentar.' }, { status: 409 })
  // `delete` en vez de desestructurar y descartar: evita el warning de eslint por variable sin usar.
  const resto = { ...meta }
  delete resto.actualizacion_fallida
  await supabase.from('property_listings').update({
    metadata: { ...resto, needs_update: true, intentos_actualizacion: 0, cambios_ficha: fallida.cambios_ficha ?? [] } as never,
  }).eq('id', l.id)
  return NextResponse.json({ ok: true })
}
