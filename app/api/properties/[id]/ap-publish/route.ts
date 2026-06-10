import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { initPortals, getAdapter } from '@/lib/portals'
import { ArgenpropAdapter } from '@/lib/portals/argenprop/adapter'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).single()
    return data?.assigned_to === userId
  }
  return ['admin', 'dueno', 'coordinador'].includes(role)
}

type PropertyRow = Database['public']['Tables']['properties']['Row']
type LooseQuery = {
  delete: () => LooseQuery
  insert: (row: Record<string, unknown>) => Promise<unknown>
  eq: (column: string, value: unknown) => LooseQuery & Promise<unknown>
}

/** BRIDGE publicación → routing de consultas (espejo del de ML, portal='argenprop'). */
async function syncPortalPropertyMap(
  supabase: ReturnType<typeof getAdmin>, property: PropertyRow, externalId: string, externalUrl: string,
) {
  const noteKey = `property:${property.id}`
  const db = supabase as unknown as { from: (table: string) => LooseQuery }
  await db.from('portal_property_map').delete().eq('portal', 'argenprop').eq('notes', noteKey)
  await db.from('portal_property_map').insert({
    portal: 'argenprop', external_code: externalId, external_url: externalUrl,
    address: property.address, neighborhood: property.neighborhood,
    title: property.title ?? property.address, assigned_to: property.assigned_to,
    active: true, notes: noteKey,
  })
}

/** POST → publica la propiedad en Argenprop (síncrono). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error } = await supabase.from('properties').select('*').eq('id', id).single()
    if (error || !property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    await initPortals(true)
    const ap = getAdapter('argenprop')
    if (!ap?.enabled) {
      return NextResponse.json(
        { error: 'Argenprop no está conectado. Faltan las env vars ARGENPROP_* en el entorno.' },
        { status: 412 },
      )
    }

    const { data: listingDraft } = await supabase
      .from('property_listings').select('metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listingDraft?.metadata ?? {}) as Record<string, unknown>

    let pub: { externalId: string; externalUrl: string; metadata?: Record<string, unknown> }
    try {
      pub = await (ap as ArgenpropAdapter).publish(property, {
        attributeOverrides: (meta.ap_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('property_listings').upsert(
        { property_id: id, portal: 'argenprop', status: 'failed', last_error: msg, attempts: 1 },
        { onConflict: 'property_id,portal' },
      )
      await supabase.from('property_publish_events').insert({
        property_id: id, portal: 'argenprop', event_type: 'failed', error_message: msg,
        actor: user.profile.full_name ?? user.id,
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const mergedMeta = { ...meta, aviso_id: pub.metadata?.avisoId ?? null, codigo: pub.metadata?.codigo ?? pub.externalId }
    await supabase.from('property_listings').upsert(
      {
        property_id: id, portal: 'argenprop', status: 'published',
        external_id: pub.externalId, external_url: pub.externalUrl,
        last_published_at: new Date().toISOString(), attempts: 1, last_error: null,
        metadata: mergedMeta as never,
      },
      { onConflict: 'property_id,portal' },
    )
    await supabase.from('property_publish_events').insert({
      property_id: id, portal: 'argenprop', event_type: 'published',
      payload: { externalId: pub.externalId, externalUrl: pub.externalUrl, avisoId: (pub.metadata?.avisoId ?? null) as number | null },
      actor: user.profile.full_name ?? user.id,
    })

    try {
      await syncPortalPropertyMap(supabase, property, pub.externalId, pub.externalUrl)
    } catch (bridgeErr) {
      console.warn('[ap-publish] no se pudo sincronizar portal_property_map', bridgeErr)
    }

    return NextResponse.json({ ok: true, externalId: pub.externalId, externalUrl: pub.externalUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

/**
 * PATCH → { action: 'baja' | 'republish' }
 *  - 'baja'      → PUT estado/suspendido (reversible). status DB = 'paused'.
 *  - 'republish' → PUT estado/publicado (vuelve a Vigente). status DB = 'published'.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action
    if (action !== 'baja' && action !== 'republish') {
      return NextResponse.json({ error: 'action debe ser "baja" o "republish"' }, { status: 400 })
    }
    const supabase = getAdmin()
    const { data: listing } = await supabase
      .from('property_listings').select('external_id, metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    if (!listing?.external_id) return NextResponse.json({ error: 'no listing to modify' }, { status: 404 })

    await initPortals(true)
    const ap = getAdapter('argenprop')
    if (!ap?.enabled) return NextResponse.json({ error: 'Argenprop not connected' }, { status: 412 })
    const adapter = ap as ArgenpropAdapter

    try {
      if (action === 'baja') {
        await adapter.unpublish(listing.external_id) // suspende (reversible)
      } else {
        await adapter.republicar(listing.external_id) // vuelve a Vigente
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `${action} falló: ${msg}` }, { status: 502 })
    }

    const newStatus = action === 'baja' ? 'paused' : 'published'
    await supabase.from('property_listings')
      .update({ status: newStatus, last_error: null })
      .eq('property_id', id).eq('portal', 'argenprop')
    await supabase.from('property_publish_events').insert({
      property_id: id, portal: 'argenprop',
      event_type: action === 'baja' ? 'unpublished' : 'updated',
      payload: { action, status: newStatus }, actor: user.profile.full_name ?? user.id,
    })
    return NextResponse.json({ ok: true, status: newStatus })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
