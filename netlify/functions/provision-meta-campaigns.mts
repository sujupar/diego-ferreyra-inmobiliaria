import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import {
  createCampaignForProperty,
  pauseCampaign,
  archiveCampaign,
} from '@/lib/marketing/meta-campaign-builder'
import { nextBackoff, isoFromNow } from '@/lib/portals/backoff'
import { ensurePublicSlug } from '@/lib/landing/assign-slug'

/**
 * Worker que procesa la cola de jobs Meta cada 2 min.
 *
 * Acciones soportadas:
 *  - create_campaign: dispara createCampaignForProperty
 *  - pause_campaign: pausa todas las campañas activas de la propiedad
 *  - archive_campaign: archiva (no se usa todavía)
 *
 * Retry exponencial usando el mismo backoff que los portales (1m, 5m, 25m, 2h, 12h).
 */
export default async () => {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: jobs, error } = await supabase
    .from('meta_provision_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(5)

  if (error) {
    console.error('[provision-meta-campaigns] fetch error', error)
    return new Response('error', { status: 500 })
  }
  if (!jobs || jobs.length === 0) {
    return new Response('no pending', { status: 200 })
  }

  for (const job of jobs) {
    // Lock atomic: pasar a in_progress solo si sigue pending
    const { data: locked } = await supabase
      .from('meta_provision_jobs')
      .update({ status: 'in_progress' })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()
    if (!locked) continue

    try {
      await runJob(supabase, locked)
      await supabase
        .from('meta_provision_jobs')
        .update({ status: 'done', last_error: null })
        .eq('id', locked.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const attempts = (locked.attempts ?? 0) + 1
      const backoff = nextBackoff(attempts - 1)
      if (backoff !== null) {
        await supabase
          .from('meta_provision_jobs')
          .update({
            status: 'pending',
            attempts,
            next_attempt_at: isoFromNow(backoff),
            last_error: message,
          })
          .eq('id', locked.id)
      } else {
        await supabase
          .from('meta_provision_jobs')
          .update({ status: 'failed', attempts, last_error: message })
          .eq('id', locked.id)
      }
      console.error(`[provision-meta-campaigns] job ${locked.id} (${locked.action})`, err)
    }
  }

  return new Response('ok', { status: 200 })
}

async function runJob(
  supabase: ReturnType<typeof createClient<Database>>,
  job: Database['public']['Tables']['meta_provision_jobs']['Row'],
): Promise<void> {
  // Cargar la property completa
  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', job.property_id)
    .single()
  if (!property) throw new Error(`Property ${job.property_id} no encontrada`)

  switch (job.action) {
    case 'create_campaign': {
      // Asegurar public_slug just-in-time: la campaign necesita una landing URL
      // pero no dependemos de que un portal haya publicado primero.
      const slug = property.public_slug ?? (await ensurePublicSlug(supabase, property.id))
      const enrichedProperty = { ...property, public_slug: slug }
      await createCampaignForProperty(enrichedProperty)
      return
    }

    case 'pause_campaign': {
      const { data: camps } = await supabase
        .from('property_meta_campaigns')
        .select('campaign_id')
        .eq('property_id', property.id)
        .eq('status', 'active')
      for (const c of camps ?? []) {
        await pauseCampaign(c.campaign_id)
      }
      return
    }

    case 'archive_campaign': {
      const { data: camps } = await supabase
        .from('property_meta_campaigns')
        .select('campaign_id')
        .eq('property_id', property.id)
        .in('status', ['active', 'paused'])
      for (const c of camps ?? []) {
        await archiveCampaign(c.campaign_id)
      }
      return
    }

    default:
      throw new Error(`Acción desconocida: ${job.action}`)
  }
}

export const config: Config = {
  schedule: '*/2 * * * *', // cada 2 min
}
