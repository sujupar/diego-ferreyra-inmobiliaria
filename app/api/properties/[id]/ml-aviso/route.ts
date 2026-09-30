import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { initPortals, getAdapter } from '@/lib/portals'
import { MercadoLibreAdapter } from '@/lib/portals/mercadolibre/adapter'
import { fetchCategoryAttributes, getRawAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { valoresDesdeItem, armarActualizacionMl, ML_VALOR_VACIO } from '@/lib/portals/mercadolibre/edicion'
import { derivedPrefill } from '@/lib/portals/mercadolibre/prefill'
import { resolverIdsDeLista } from '@/lib/portals/datos-visita'
import { sugeridosPara, type Valores } from '@/lib/portals/edicion-comun'
import { esquemaCambios, validarIds, expensasDesdeCambio, expensasMlValidas } from '@/lib/portals/edicion-validacion'
import { writeAudit } from '@/lib/portals/audit'
import { mensajeYDetalle } from '@/lib/portals/types'
import { TITULO_MAX_ML } from '@/lib/portals/titulo-sugerido'
import type { Database } from '@/types/database.types'

const admin = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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
    .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
  if (!listing?.external_id || listing.status === 'closed') {
    return { error: NextResponse.json({ error: 'Este aviso no está publicado en MercadoLibre o ya se cerró.' }, { status: 409 }) }
  }
  const externalId = listing.external_id
  await initPortals()
  const ml = getAdapter('mercadolibre')
  if (!(ml instanceof MercadoLibreAdapter) || !ml.enabled) {
    return { error: NextResponse.json({ error: 'MercadoLibre no está conectado.' }, { status: 412 }) }
  }
  return { user, supabase, property, listing: { id: listing.id, external_id: externalId, external_url: listing.external_url }, ml }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(id)
  if ('error' in ctx) return ctx.error
  try {
    const { item, descripcion } = await ctx.ml.leerAviso(ctx.listing.external_id)
    if (item.status === 'closed') return NextResponse.json({ error: 'El aviso está cerrado en MercadoLibre.' }, { status: 409 })
    const { required, recommended } = await fetchCategoryAttributes(item.category_id)
    const schema = [...required, ...recommended]
    const valores = valoresDesdeItem(item, schema)
    const deLaVisita = resolverIdsDeLista((((ctx.property.portal_data ?? {}) as { ml?: Valores }).ml ?? {}), schema)
    const sugeridos = sugeridosPara(valores, { ...derivedPrefill(ctx.property), ...deLaVisita }, new Set(schema.map(a => a.id)))
    const { data: otro } = await ctx.supabase.from('property_listings').select('external_id')
      .eq('property_id', id).eq('portal', 'argenprop').eq('status', 'published').maybeSingle()
    return NextResponse.json({
      portal: 'mercadolibre', titulo: item.title, descripcion, descripcionFicha: ctx.property.description,
      tituloMax: TITULO_MAX_ML, valores, sugeridos, required, recommended, estado: item.status,
      externalUrl: item.permalink ?? ctx.listing.external_url, permiteVaciar: ML_VALOR_VACIO !== null,
      otroPortal: otro?.external_id ? 'Argenprop' : null,
    })
  } catch (err) {
    return NextResponse.json({ error: mensajeYDetalle(err).mensaje }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(id)
  if ('error' in ctx) return ctx.error
  const parsed = esquemaCambios(TITULO_MAX_ML).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const { cambios } = parsed.data
  try {
    // Se RE-lee el aviso: si alguien lo tocó en ML mientras la pantalla estaba abierta, se respeta.
    const { item, descripcion } = await ctx.ml.leerAviso(ctx.listing.external_id)
    if (item.status === 'closed') return NextResponse.json({ error: 'El aviso está cerrado en MercadoLibre.' }, { status: 409 })
    const raw = await getRawAttributes(item.category_id)
    const { required, recommended } = await fetchCategoryAttributes(item.category_id)
    const errorIds = validarIds(cambios.valores, new Set([...required, ...recommended].map(a => a.id)), ML_VALOR_VACIO !== null)
    if (errorIds) return NextResponse.json({ error: errorIds }, { status: 400 })
    // Defensa en profundidad: un texto que normalizeUnit no sabe convertir (ej. "$345.678"
    // antes del fix, o cualquier otro formato raro) hace que ML acepte el POST pero
    // descarte el atributo en silencio — sin esto, la pantalla diría "Listo" y la
    // expensa jamás llegaría al aviso.
    if (!expensasMlValidas(cambios.valores.MAINTENANCE_FEE)) {
      return NextResponse.json({ error: 'Las expensas tienen que ser un número, por ejemplo 150000.' }, { status: 400 })
    }
    const { body, cambiados } = armarActualizacionMl(item, { titulo: cambios.titulo, valores: cambios.valores }, raw)
    const nuevaDescripcion = cambios.descripcion !== undefined && cambios.descripcion !== descripcion ? cambios.descripcion : undefined
    // Si lo ÚNICO que cambió es la descripción, el ítem no tiene nada que decirle a ML:
    // se manda `{}` para que enviarEdicion se salte el PUT del ítem.
    const soloDescripcion = cambiados.length === 0 && nuevaDescripcion !== undefined
    if (nuevaDescripcion !== undefined) cambiados.push('descripcion')
    if (cambiados.length === 0) return NextResponse.json({ ok: true, cambiados: [], expensasEnFicha: false })
    await ctx.ml.enviarEdicion(ctx.listing.external_id, soloDescripcion ? {} : body, nuevaDescripcion)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'mercadolibre', eventType: 'updated',
      payload: { origen: 'edicion', cambiados }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    // DESPUÉS del éxito en el portal: las expensas pasan a la ficha (y el trigger las lleva al otro portal).
    const expensas = expensasDesdeCambio(cambios.valores.MAINTENANCE_FEE)
    let expensasEnFicha = false
    if (expensas !== undefined && cambiados.includes('MAINTENANCE_FEE')) {
      const { error } = await ctx.supabase.from('properties').update({ expensas }).eq('id', id)
      expensasEnFicha = !error
    }
    return NextResponse.json({ ok: true, cambiados, expensasEnFicha })
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'mercadolibre', eventType: 'failed',
      errorMessage: paraElLog, payload: { origen: 'edicion' }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    return NextResponse.json({ error: mensaje }, { status: 502 })
  }
}
