import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { writeAudit } from '@/lib/portals/audit'
import type { Database, Json } from '@/types/database.types'

const cuerpo = z.object({ portal: z.enum(['mercadolibre', 'argenprop']) })

/** `Json` objeto (no array, no primitivo) — sin `as`: typeof + Array.isArray alcanza. */
function esRegistro(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** "Reintentar" un envío automático que falló 3 veces: vuelve a encolarlo con los mismos cambios. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: l } = await supabase.from('property_listings').select('id, status, metadata')
    .eq('property_id', id).eq('portal', p.data.portal).maybeSingle()
  if (!l) return NextResponse.json({ error: 'No hay un envío fallido para reintentar.' }, { status: 409 })
  if (l.status === 'closed') return NextResponse.json({ error: 'Este aviso ya está cerrado.' }, { status: 409 })
  const meta = esRegistro(l.metadata) ? l.metadata : {}
  const fallida = meta.actualizacion_fallida
  if (!esRegistro(fallida)) return NextResponse.json({ error: 'No hay un envío fallido para reintentar.' }, { status: 409 })
  const crudo = fallida.cambios_ficha
  const cambiosFicha = Array.isArray(crudo) ? crudo.filter((x): x is string => typeof x === 'string') : []
  // `delete` en vez de desestructurar y descartar: evita el warning de eslint por variable sin usar.
  const resto: Record<string, Json> = { ...meta }
  delete resto.actualizacion_fallida
  const nuevaMetadata: Record<string, Json> = { ...resto, needs_update: true, intentos_actualizacion: 0, cambios_ficha: cambiosFicha }
  const { error } = await supabase.from('property_listings').update({ metadata: nuevaMetadata }).eq('id', l.id)
  if (error) return NextResponse.json({ error: 'No se pudo reintentar.' }, { status: 500 })
  await writeAudit(supabase, {
    listingId: l.id, propertyId: id, portal: p.data.portal, eventType: 'retried',
    payload: { cambios_ficha: cambiosFicha }, actor: user.profile.full_name ?? user.id,
  })
  return NextResponse.json({ ok: true })
}
