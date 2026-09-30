import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { initPortals, getAdapter } from '@/lib/portals'
import { ArgenpropAdapter } from '@/lib/portals/argenprop/adapter'
import { valoresDesdeAviso, armarAvisoActualizado } from '@/lib/portals/argenprop/edicion'
import { getApSchema, derivedPrefill } from '@/lib/portals/argenprop/field-schema'
import { sugeridosPara, type Valores } from '@/lib/portals/edicion-comun'
import { esquemaCambios, validarIds, expensasDesdeCambio } from '@/lib/portals/edicion-validacion'
import { writeAudit } from '@/lib/portals/audit'
import { mensajeYDetalle } from '@/lib/portals/types'
import { TITULO_MAX_AP } from '@/lib/portals/titulo-sugerido'
import type { Database } from '@/types/database.types'

const admin = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Estos tres se derivan de la propiedad al publicar y no se editan desde acá.
const NO_EDITABLES = new Set(['TIPO_OPERACION', 'MONEDA', 'SUBTIPO'])
const sinNoEditables = <T extends { id: string }>(campos: readonly T[]) => campos.filter(c => !NO_EDITABLES.has(c.id))
const valoresSinNoEditables = (v: Valores): Valores =>
  Object.fromEntries(Object.entries(v).filter(([id]) => !NO_EDITABLES.has(id)))

/** Auth + propiedad + listing publicado + adapter. Devuelve Response si algo falla. */
async function contexto(id: string) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const supabase = admin()
  const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!property) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir', property))) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  const { data: listing } = await supabase.from('property_listings').select('id, status, external_id, external_url')
    .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id || listing.status === 'closed') {
    return { error: NextResponse.json({ error: 'Este aviso no está publicado en Argenprop o ya se cerró.' }, { status: 409 }) }
  }
  const externalId = listing.external_id
  await initPortals()
  const ap = getAdapter('argenprop')
  if (!(ap instanceof ArgenpropAdapter) || !ap.enabled) {
    return { error: NextResponse.json({ error: 'Argenprop no está conectado.' }, { status: 412 }) }
  }
  return { user, supabase, property, listing: { id: listing.id, external_id: externalId, external_url: listing.external_url }, ap }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await contexto(id)
    if ('error' in ctx) return ctx.error
    const aviso = await ctx.ap.leerAviso(ctx.listing.external_id)
    if (aviso.Publicacion.EstadoPublicacion === 'ELIMINADO') {
      return NextResponse.json({ error: 'El aviso fue eliminado en Argenprop' }, { status: 409 })
    }
    const s = getApSchema(ctx.property)
    const schema = [...s.required, ...s.recommended]
    const valoresCompletos = valoresDesdeAviso(aviso, schema)
    const valores = valoresSinNoEditables(valoresCompletos)
    const conocidos = { ...derivedPrefill(ctx.property), ...(((ctx.property.portal_data ?? {}) as { ap?: Valores }).ap ?? {}) }
    const sugeridos = valoresSinNoEditables(
      sugeridosPara(valoresCompletos, conocidos, new Set(schema.map(f => f.id))),
    )
    const { data: otro } = await ctx.supabase.from('property_listings').select('external_id')
      .eq('property_id', id).eq('portal', 'mercadolibre').eq('status', 'published').maybeSingle()
    return NextResponse.json({
      portal: 'argenprop', titulo: aviso.Titulo, descripcion: aviso.Descripcion, descripcionFicha: ctx.property.description,
      tituloMax: TITULO_MAX_AP, valores, sugeridos,
      required: sinNoEditables(s.required), recommended: sinNoEditables(s.recommended),
      estado: aviso.Publicacion.EstadoPublicacion ?? '', externalUrl: ctx.listing.external_url, permiteVaciar: true,
      otroPortal: otro?.external_id ? 'MercadoLibre' : null,
    })
  } catch (err) {
    return NextResponse.json({ error: mensajeYDetalle(err).mensaje }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(id)
  if ('error' in ctx) return ctx.error
  const parsed = esquemaCambios(TITULO_MAX_AP).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const { cambios } = parsed.data
  try {
    const aviso = await ctx.ap.leerAviso(ctx.listing.external_id)
    if (aviso.Publicacion.EstadoPublicacion === 'ELIMINADO') {
      return NextResponse.json({ error: 'El aviso fue eliminado en Argenprop' }, { status: 409 })
    }
    const s = getApSchema(ctx.property)
    const schema = [...s.required, ...s.recommended]
    const aceptados = new Set([...schema.map(f => f.id)].filter(fid => !NO_EDITABLES.has(fid)))
    const errorIds = validarIds(cambios.valores, aceptados, true)
    if (errorIds) return NextResponse.json({ error: errorIds }, { status: 400 })
    const { dto, cambiados } = armarAvisoActualizado(aviso, cambios, schema, ctx.ap.idAnunciante())
    if (cambiados.length === 0) return NextResponse.json({ ok: true, cambiados: [], expensasEnFicha: false })
    await ctx.ap.enviarAviso(dto)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'argenprop', eventType: 'updated',
      payload: { origen: 'edicion', cambiados }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    // DESPUÉS del éxito en el portal: las expensas pasan a la ficha (y el trigger las lleva al otro portal).
    const expensas = expensasDesdeCambio(cambios.valores.EXPENSAS)
    let expensasEnFicha = false
    if (expensas !== undefined && cambiados.includes('EXPENSAS')) {
      const { error } = await ctx.supabase.from('properties').update({ expensas }).eq('id', id)
      expensasEnFicha = !error
    }
    return NextResponse.json({ ok: true, cambiados, expensasEnFicha })
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'argenprop', eventType: 'failed',
      errorMessage: paraElLog, payload: { origen: 'edicion' }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    return NextResponse.json({ error: mensaje }, { status: 502 })
  }
}
