import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import { initPortals, getAdapter } from '@/lib/portals'
import { ensurePublicSlug } from '@/lib/landing/assign-slug'
import {
  createCampaignForProperty,
  archiveCampaign,
} from '@/lib/marketing/meta-campaign-builder'
import { mlFetch } from '@/lib/portals/mercadolibre/client'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Endpoint de auditoría: ejecuta el pipeline completo en modo prueba.
 *
 * POST → crea propiedad de test, publica en MercadoLibre como PAUSADO
 *         (no visible al público), crea campaña Meta en PAUSED (no
 *         gasta dinero). Devuelve IDs + URLs para auditar manualmente.
 *
 * DELETE → recibe propertyId y limpia todo: borra el item de ML,
 *          archiva la campaign de Meta, borra la propiedad (cascade
 *          borra listings, métricas, campaigns, leads, events).
 *
 * Solo admin/dueño.
 */

interface TestRunResult {
  propertyId: string
  testPrefix: string
  steps: {
    propertyCreated: boolean
    slugAssigned: { ok: boolean; slug?: string }
    mercadolibre: {
      attempted: boolean
      ok: boolean
      externalId?: string
      externalUrl?: string
      status?: string
      error?: string
    }
    meta: {
      attempted: boolean
      ok: boolean
      campaignId?: string
      adsetId?: string
      adIds?: string[]
      adsManagerUrl?: string
      error?: string
    }
    landingUrl?: string
  }
}

const TEST_PHOTO_1 = 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1920'
const TEST_PHOTO_2 = 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1920'
const TEST_PHOTO_3 = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920'

export async function POST() {
  try {
    await requireRole('admin', 'dueno')

    const supabase = getAdmin()
    const testPrefix = `[TEST ${new Date().toISOString().slice(0, 16)}]`

    const result: TestRunResult = {
      propertyId: '',
      testPrefix,
      steps: {
        propertyCreated: false,
        slugAssigned: { ok: false },
        mercadolibre: { attempted: false, ok: false },
        meta: { attempted: false, ok: false },
      },
    }

    // 1. Crear propiedad de prueba completa
    const { data: property, error: createErr } = await supabase
      .from('properties')
      .insert({
        address: `${testPrefix} Av Test 1234`,
        neighborhood: 'Palermo',
        city: 'CABA',
        property_type: 'departamento',
        rooms: 3,
        bedrooms: 2,
        bathrooms: 1,
        garages: 1,
        covered_area: 70,
        total_area: 75,
        floor: 5,
        age: 10,
        asking_price: 180000,
        currency: 'USD',
        commission_percentage: 3,
        status: 'approved',
        legal_status: 'approved',
        photos: [TEST_PHOTO_1, TEST_PHOTO_2, TEST_PHOTO_3],
        latitude: -34.58,
        longitude: -58.43,
        description:
          'PROPIEDAD DE PRUEBA INTERNA. Departamento luminoso de 3 ambientes con balcón aterrazado, vista despejada y excelente luminosidad natural durante todo el día. Este aviso es solo para pruebas técnicas internas — será eliminado.',
        amenities: ['pileta', 'parrilla', 'sum'],
        operation_type: 'venta',
        title: `${testPrefix} Depto 3 amb Palermo`,
        expensas: 50000,
      })
      .select()
      .single()

    if (createErr || !property) {
      return NextResponse.json(
        { error: 'No se pudo crear propiedad de prueba', detail: createErr?.message },
        { status: 500 },
      )
    }
    result.propertyId = property.id
    result.steps.propertyCreated = true

    // 2. Asignar slug público
    try {
      const slug = await ensurePublicSlug(supabase, property.id)
      result.steps.slugAssigned = { ok: true, slug }
      result.steps.landingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'}/p/${slug}`
    } catch (err) {
      result.steps.slugAssigned = { ok: false }
    }

    // 3. Publicar en MercadoLibre como PAUSADO
    await initPortals()
    const ml = getAdapter('mercadolibre')
    if (ml?.enabled) {
      result.steps.mercadolibre.attempted = true
      try {
        // Refrescar property con slug
        const { data: fresh } = await supabase
          .from('properties')
          .select('*')
          .eq('id', property.id)
          .single()
        if (!fresh) throw new Error('No se encontró property fresca')

        const pubResult = await ml.publish(fresh)
        // Inmediatamente pausarlo para que NO sea visible público
        await mlFetch(`/items/${pubResult.externalId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'paused' }),
        })

        // Persistir en property_listings
        await supabase.from('property_listings').upsert({
          property_id: property.id,
          portal: 'mercadolibre',
          status: 'published',
          external_id: pubResult.externalId,
          external_url: pubResult.externalUrl,
          last_published_at: new Date().toISOString(),
          attempts: 1,
        })

        result.steps.mercadolibre = {
          attempted: true,
          ok: true,
          externalId: pubResult.externalId,
          externalUrl: pubResult.externalUrl,
          status: 'paused',
        }
      } catch (err) {
        result.steps.mercadolibre = {
          attempted: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    // 4. Crear campaña Meta en modo dryRun (queda PAUSED, no se activa,
    //    no gasta presupuesto)
    if (
      process.env.META_AD_ACCOUNT_ID &&
      process.env.META_ACCESS_TOKEN &&
      process.env.META_PAGE_ID
    ) {
      result.steps.meta.attempted = true
      try {
        const { data: fresh } = await supabase
          .from('properties')
          .select('*')
          .eq('id', property.id)
          .single()
        if (!fresh) throw new Error('No se encontró property fresca')

        const camp = await createCampaignForProperty(fresh, { dryRun: true })
        const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${process.env.META_AD_ACCOUNT_ID!.replace('act_', '')}&selected_campaign_ids=${camp.campaignId}`

        result.steps.meta = {
          attempted: true,
          ok: true,
          campaignId: camp.campaignId,
          adsetId: camp.adsetId,
          adIds: camp.adIds,
          adsManagerUrl,
        }
      } catch (err) {
        result.steps.meta = {
          attempted: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole('admin', 'dueno')
    const url = new URL(req.url)
    const propertyId = url.searchParams.get('propertyId')
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId requerido' }, { status: 400 })
    }

    const supabase = getAdmin()
    const cleanup = {
      mercadolibre: { attempted: false, ok: false, error: undefined as string | undefined },
      meta: { attempted: false, ok: false, error: undefined as string | undefined },
      property: { ok: false, error: undefined as string | undefined },
    }

    // 1. Despublicar (closed) item de MercadoLibre si existe
    const { data: listings } = await supabase
      .from('property_listings')
      .select('*')
      .eq('property_id', propertyId)
      .eq('portal', 'mercadolibre')

    if (listings && listings.length > 0 && listings[0].external_id) {
      cleanup.mercadolibre.attempted = true
      try {
        await mlFetch(`/items/${listings[0].external_id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'closed' }),
        })
        cleanup.mercadolibre.ok = true
      } catch (err) {
        cleanup.mercadolibre.error = err instanceof Error ? err.message : String(err)
      }
    }

    // 2. Archivar campañas Meta de esta property
    const { data: campaigns } = await supabase
      .from('property_meta_campaigns')
      .select('campaign_id')
      .eq('property_id', propertyId)

    if (campaigns && campaigns.length > 0) {
      cleanup.meta.attempted = true
      try {
        for (const c of campaigns) {
          await archiveCampaign(c.campaign_id)
        }
        cleanup.meta.ok = true
      } catch (err) {
        cleanup.meta.error = err instanceof Error ? err.message : String(err)
      }
    }

    // 3. Borrar la propiedad (ON DELETE CASCADE borra listings, metrics,
    //    campaigns, jobs, events, leads).
    const { error: delErr } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyId)
    if (delErr) {
      cleanup.property.error = delErr.message
    } else {
      cleanup.property.ok = true
    }

    return NextResponse.json({ ok: true, cleanup })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
