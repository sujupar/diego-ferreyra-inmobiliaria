import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { initPortals, getAdapter } from '@/lib/portals'
import { MercadoLibreAdapter } from '@/lib/portals/mercadolibre/adapter'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase
      .from('properties')
      .select('assigned_to')
      .eq('id', propertyId)
      .single()
    return data?.assigned_to === userId
  }
  // abogado queda excluido explícitamente
  return ['admin', 'dueno', 'coordinador'].includes(role)
}

type PropertyRow = Database['public']['Tables']['properties']['Row']

// Cliente "suelto" para escribir en portal_property_map, tabla del sistema de
// consultas (WIP, no tipada en database.types aún). Best-effort.
type LooseQuery = {
  delete: () => LooseQuery
  insert: (row: Record<string, unknown>) => Promise<unknown>
  eq: (column: string, value: unknown) => LooseQuery & Promise<unknown>
}

/**
 * BRIDGE publicación → routing de consultas. Registra el aviso recién publicado en
 * portal_property_map (external_code = id del aviso ML, external_url = permalink,
 * + dirección/título para fallback fuzzy, + assigned_to de la propiedad). Así, cuando
 * llega una consulta de ESTE aviso, el matcher la rutea al asesor correcto.
 * Idempotente por propiedad vía `notes` ("property:<id>"): borra la fila anterior de
 * esta propiedad antes de insertar la nueva (re-publicaciones generan nuevo id de aviso).
 */
async function syncPortalPropertyMap(
  supabase: ReturnType<typeof getAdmin>,
  property: PropertyRow,
  externalId: string,
  externalUrl: string,
) {
  const noteKey = `property:${property.id}`
  const db = supabase as unknown as { from: (table: string) => LooseQuery }
  await db.from('portal_property_map').delete().eq('portal', 'mercadolibre').eq('notes', noteKey)
  await db.from('portal_property_map').insert({
    portal: 'mercadolibre',
    external_code: externalId,
    external_url: externalUrl,
    address: property.address,
    neighborhood: property.neighborhood,
    title: property.title ?? property.address,
    assigned_to: property.assigned_to,
    property_id: property.id,
    active: true,
    notes: noteKey,
  })
}

/**
 * POST → publica la propiedad en MercadoLibre desde el wizard.
 *
 * Lee la propiedad fresca, construye el payload con propertyToMlPayload, llama
 * a adapter.publish, persiste en property_listings y audita en
 * property_publish_events.
 *
 * NO pausa automáticamente. La propiedad queda en el estado que ML le asigne
 * (typicamente `not_yet_active` → `active` después de la validación interna).
 * Si el usuario quiere pausarla después, el wizard tiene su propio botón.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }

    await initPortals(true)
    const ml = getAdapter('mercadolibre')
    if (!ml?.enabled) {
      return NextResponse.json(
        {
          error:
            'MercadoLibre no está conectado. Andá a Settings → Portales y completá el OAuth.',
        },
        { status: 412 },
      )
    }

    // Leer el draft de publicación (atributos/medios/listingType) y resolver
    // qué atributos acepta la categoría para filtrar antes de publicar.
    const { data: listingDraft } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
    const meta = (listingDraft?.metadata ?? {}) as Record<string, unknown>
    let allowedAttributeIds: Set<string> | undefined
    try {
      const { resolveCategory } = await import('@/lib/portals/mercadolibre/mapping')
      const { fetchCategoryAttributes } = await import('@/lib/portals/mercadolibre/category-attributes')
      const { required, recommended } = await fetchCategoryAttributes(resolveCategory(property))
      allowedAttributeIds = new Set([...required, ...recommended].map(a => a.id))
    } catch {
      allowedAttributeIds = undefined
    }

    let pubResult: { externalId: string; externalUrl: string; metadata?: Record<string, unknown> }
    try {
      pubResult = await (ml as MercadoLibreAdapter).publish(property, {
        attributeOverrides: (meta.ml_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
        mediaChoice: (meta.media_choice as 'video' | 'tour' | 'none') ?? 'none',
        listingType: (meta.listing_type as string) ?? 'free',
        allowedAttributeIds,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase
        .from('property_listings')
        .upsert(
          {
            property_id: id,
            portal: 'mercadolibre',
            status: 'failed',
            last_error: msg,
            attempts: 1,
          },
          { onConflict: 'property_id,portal' },
        )
      await supabase.from('property_publish_events').insert({
        property_id: id,
        portal: 'mercadolibre',
        event_type: 'failed',
        error_message: msg,
        actor: user.profile.full_name ?? user.id,
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Persistir el tier REALMENTE usado (el adapter degrada gold_premium → silver/free
    // si la cuenta no tiene cupo). Sin esto, metadata.listing_type quedaría con el
    // tier pedido y el update() del worker reintentaría con un tier sin cupo.
    const usedTier = (pubResult.metadata?.listingTypeUsed as string | undefined)
    // needs_picture_check: el worker pg_cron verifica, cuando el item pase a 'active',
    // que ML haya descargado las fotos OK (procesa async ~1-2 min). Si alguna falla,
    // marca metadata.picture_issues.
    const mergedMeta = { ...meta, ...(usedTier ? { listing_type: usedTier } : {}), needs_picture_check: true }
    await supabase
      .from('property_listings')
      .upsert(
        {
          property_id: id,
          portal: 'mercadolibre',
          status: 'published',
          external_id: pubResult.externalId,
          external_url: pubResult.externalUrl,
          last_published_at: new Date().toISOString(),
          attempts: 1,
          last_error: null,
          metadata: mergedMeta as never,
        },
        { onConflict: 'property_id,portal' },
      )

    await supabase.from('property_publish_events').insert({
      property_id: id,
      portal: 'mercadolibre',
      event_type: 'published',
      payload: { externalId: pubResult.externalId, externalUrl: pubResult.externalUrl },
      actor: user.profile.full_name ?? user.id,
    })

    // BRIDGE publicación → routing de consultas: registrar el aviso en
    // portal_property_map para que las consultas de ESTE aviso (matcheadas por
    // external_code/url) ruteen al asesor de la propiedad. Best-effort: si la tabla
    // del sistema de consultas no existe todavía, no rompemos el publish.
    try {
      await syncPortalPropertyMap(supabase, property, pubResult.externalId, pubResult.externalUrl)
    } catch (bridgeErr) {
      console.warn('[ml-publish] no se pudo sincronizar portal_property_map', bridgeErr)
    }

    return NextResponse.json({
      ok: true,
      externalId: pubResult.externalId,
      externalUrl: pubResult.externalUrl,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH → cambia el estado del aviso ML.
 *   body: { action: 'pause' | 'close' | 'activate' }
 *
 * - 'pause'    → status: paused (reversible, no visible al público)
 * - 'close'    → status: closed (definitivo, NO se puede reactivar)
 * - 'activate' → status: active (volver a publicar tras un pause)
 *
 * Si el item está en not_yet_active, ML rechaza la transición — marcamos
 * `needs_pause_after_active` para que el worker termine el trabajo.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action
    if (action !== 'pause' && action !== 'close' && action !== 'activate') {
      return NextResponse.json(
        { error: 'action debe ser "pause", "close" o "activate"' },
        { status: 400 },
      )
    }

    const supabase = getAdmin()
    const { data: listing } = await supabase
      .from('property_listings')
      .select('external_id, metadata')
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')
      .maybeSingle()
    if (!listing?.external_id) {
      return NextResponse.json({ error: 'no listing to modify' }, { status: 404 })
    }

    await initPortals(true)
    const ml = getAdapter('mercadolibre')
    if (!ml?.enabled) {
      return NextResponse.json({ error: 'ML not connected' }, { status: 412 })
    }
    const adapter = ml as MercadoLibreAdapter

    const newMlStatus = action === 'pause'
      ? 'paused'
      : action === 'close'
        ? 'closed'
        : 'active'

    try {
      if (action === 'pause') await adapter.pause(listing.external_id)
      else if (action === 'close') await adapter.unpublish(listing.external_id)
      else {
        // 'activate' — usamos mlFetch directo porque el adapter no expone activate
        const { mlFetch } = await import('@/lib/portals/mercadolibre/client')
        await mlFetch(`/items/${listing.external_id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'active' }),
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // ML solo permite pausar/cerrar desde 'active'. Si el item está en
      // 'not_yet_active' (validación interna, ~1-2 min), marcamos un flag y el
      // worker pg_cron lo pausa/cierra automáticamente cuando ML lo active.
      if ((action === 'pause' || action === 'close') && /not_yet_active/i.test(msg)) {
        const flag = action === 'pause' ? 'needs_pause_after_active' : 'needs_close_after_active'
        const verbo = action === 'pause' ? 'pausará' : 'cerrará'
        await supabase
          .from('property_listings')
          .update({
            metadata: {
              ...(listing.metadata as Record<string, unknown> ?? {}),
              [flag]: true,
            } as never,
            last_error: `ML está validando el aviso. Se ${verbo} automáticamente cuando se active (1-2 min).`,
          })
          .eq('property_id', id)
          .eq('portal', 'mercadolibre')
        return NextResponse.json({
          ok: true,
          status: 'published',
          needs_retry: true,
          message: `ML está validando el aviso. Se ${verbo} automáticamente en 1-2 minutos.`,
        })
      }
      return NextResponse.json({ error: `${action} falló: ${msg}` }, { status: 502 })
    }

    await supabase
      .from('property_listings')
      .update({
        status: newMlStatus,
        last_error: null,
      })
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')

    await supabase.from('property_publish_events').insert({
      property_id: id,
      portal: 'mercadolibre',
      event_type: action === 'close' ? 'unpublished' : 'updated',
      payload: { action, status: newMlStatus },
      actor: user.profile.full_name ?? user.id,
    })

    return NextResponse.json({ ok: true, status: newMlStatus })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE → equivalente a PATCH action='pause' (legacy alias).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: listing } = await supabase
      .from('property_listings')
      .select('external_id, metadata')
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')
      .maybeSingle()
    if (!listing?.external_id) {
      return NextResponse.json({ error: 'no published listing to pause' }, { status: 404 })
    }

    await initPortals(true)
    const ml = getAdapter('mercadolibre')
    if (!ml?.enabled) {
      return NextResponse.json({ error: 'ML not connected' }, { status: 412 })
    }
    let finalDbStatus: 'paused' | 'published' = 'paused'
    let needsRetry = false
    try {
      // ml.pause hace status: paused. Si el item está en not_yet_active,
      // ML responde 400 — manejamos abajo.
      const adapter = ml as MercadoLibreAdapter
      await adapter.pause(listing.external_id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/not_yet_active/i.test(msg)) {
        // No es un error fatal — el worker termina el job cuando ML active el item.
        finalDbStatus = 'published' // sigue público hasta que el worker lo pause
        needsRetry = true
      } else {
        return NextResponse.json({ error: 'pause falló: ' + msg }, { status: 502 })
      }
    }

    const newMetadata = needsRetry
      ? { ...(listing.metadata as Record<string, unknown> ?? {}), needs_pause_after_active: true }
      : listing.metadata

    await supabase
      .from('property_listings')
      .update({
        status: finalDbStatus,
        metadata: newMetadata as never,
      })
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')

    await supabase.from('property_publish_events').insert({
      property_id: id,
      portal: 'mercadolibre',
      event_type: needsRetry ? 'retried' : 'unpublished',
      payload: { action: 'pause', status: finalDbStatus, needs_retry: needsRetry },
      actor: user.profile.full_name ?? user.id,
    })

    return NextResponse.json({
      ok: true,
      status: finalDbStatus,
      needs_retry: needsRetry,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
