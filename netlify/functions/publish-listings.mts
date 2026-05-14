import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { initPortals, getAdapter } from '@/lib/portals'
import { writeAudit } from '@/lib/portals/audit'
import type { PortalName } from '@/lib/portals/types'
import { nextStateAfterError, stripFlag, swapFlag } from '@/lib/portals/worker-logic'
import { ensurePublicSlug } from '@/lib/landing/assign-slug'

/**
 * Worker que corre cada 1 minuto.
 *
 * Procesa en orden:
 *   1. Listings con metadata.needs_unpublish = true → adapter.unpublish
 *   2. Listings con metadata.needs_update = true → adapter.update
 *   3. Listings status='pending' cuyo next_attempt_at <= NOW → adapter.publish
 *
 * Retry exponencial usando backoff (60s, 5m, 25m, 2h, 12h) — total 15h
 * antes de fail definitivo. Errores con retryable=false fallan inmediato.
 */
export default async () => {
  await initPortals()
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  await processUnpublishes(supabase)
  await processUpdates(supabase)
  await processPublishes(supabase)

  return new Response('ok', { status: 200 })
}

async function processUnpublishes(supabase: ReturnType<typeof createClient<Database>>) {
  const { data: listings } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'published')
    .contains('metadata', { needs_unpublish: true })
    .limit(10)

  for (const listing of listings ?? []) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter || !adapter.enabled || !listing.external_id) continue

    // Lock atomic: consumir el flag needs_unpublish antes de llamar al portal.
    // Si otro worker corrió primero, el WHERE no matchea y skipeamos.
    const metaWithProgress = swapFlag(listing.metadata, 'needs_unpublish', 'unpublish_in_progress')
    const { data: locked } = await supabase
      .from('property_listings')
      .update({ metadata: metaWithProgress as never })
      .eq('id', listing.id)
      .contains('metadata', { needs_unpublish: true })
      .select()
      .maybeSingle()
    if (!locked) continue

    try {
      await adapter.unpublish(listing.external_id)
      const meta = stripFlag(locked.metadata, 'unpublish_in_progress')
      await supabase.from('property_listings').update({
        status: 'paused',
        metadata: meta as never,
      }).eq('id', listing.id)
      await writeAudit(supabase, {
        listingId: listing.id,
        propertyId: listing.property_id,
        portal: listing.portal as PortalName,
        eventType: 'unpublished',
      })
    } catch (err) {
      // Restaurar el flag para reintento en próximo tick (drop in_progress)
      const meta = stripFlag(locked.metadata, 'unpublish_in_progress')
      ;(meta as Record<string, unknown>).needs_unpublish = true
      await supabase.from('property_listings').update({ metadata: meta as never }).eq('id', listing.id)
      console.error(`[unpublish-listing] ${listing.portal} ${listing.id}`, err)
    }
  }
}

async function processUpdates(supabase: ReturnType<typeof createClient<Database>>) {
  const { data: listings } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'published')
    .contains('metadata', { needs_update: true })
    .limit(10)

  for (const listing of listings ?? []) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter || !adapter.enabled || !listing.external_id) continue

    // Lock atomic: consumir el flag needs_update antes de llamar al portal
    const metaWithProgress = swapFlag(listing.metadata, 'needs_update', 'update_in_progress')
    const { data: locked } = await supabase
      .from('property_listings')
      .update({ metadata: metaWithProgress as never })
      .eq('id', listing.id)
      .contains('metadata', { needs_update: true })
      .select()
      .maybeSingle()
    if (!locked) continue

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', listing.property_id)
      .single()
    if (!property) {
      const meta = stripFlag(locked.metadata, 'update_in_progress')
      await supabase.from('property_listings').update({ metadata: meta as never }).eq('id', listing.id)
      continue
    }

    try {
      await adapter.update(property, listing.external_id)
      const meta = stripFlag(locked.metadata, 'update_in_progress')
      await supabase.from('property_listings').update({ metadata: meta as never }).eq('id', listing.id)
      await writeAudit(supabase, {
        listingId: listing.id,
        propertyId: listing.property_id,
        portal: listing.portal as PortalName,
        eventType: 'updated',
      })
    } catch (err) {
      // Restaurar needs_update para reintento
      const meta = stripFlag(locked.metadata, 'update_in_progress')
      ;(meta as Record<string, unknown>).needs_update = true
      await supabase.from('property_listings').update({ metadata: meta as never }).eq('id', listing.id)
      console.error(`[update-listing] ${listing.portal} ${listing.id}`, err)
    }
  }
}

async function processPublishes(supabase: ReturnType<typeof createClient<Database>>) {
  const { data: listings, error } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[publish-listings] fetch error', error)
    return
  }
  if (!listings || listings.length === 0) return

  for (const listing of listings) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter) {
      console.warn(`[publish-listings] no adapter for ${listing.portal}`)
      continue
    }
    if (!adapter.enabled) {
      await writeAudit(supabase, {
        listingId: listing.id,
        propertyId: listing.property_id,
        portal: listing.portal as PortalName,
        eventType: 'skipped_disabled',
      })
      continue
    }

    // Lock atomic: marca publishing solo si sigue pending
    const { data: locked } = await supabase
      .from('property_listings')
      .update({ status: 'publishing' })
      .eq('id', listing.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()
    if (!locked) continue

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', listing.property_id)
      .single()

    if (!property) {
      await supabase.from('property_listings').update({
        status: 'failed',
        last_error: 'Property not found',
      }).eq('id', listing.id)
      continue
    }

    try {
      const result = await adapter.publish(property)
      await supabase.from('property_listings').update({
        status: 'published',
        external_id: result.externalId,
        external_url: result.externalUrl,
        last_published_at: new Date().toISOString(),
        last_error: null,
        attempts: (listing.attempts ?? 0) + 1,
      }).eq('id', listing.id)
      await writeAudit(supabase, {
        listingId: listing.id,
        propertyId: listing.property_id,
        portal: listing.portal as PortalName,
        eventType: 'published',
        payload: { externalId: result.externalId, externalUrl: result.externalUrl },
      })
      // Asegurar public_slug para landing page (idempotente)
      try {
        await ensurePublicSlug(supabase, listing.property_id)
      } catch (slugErr) {
        console.warn('[publish-listings] ensurePublicSlug failed', slugErr)
      }
    } catch (err) {
      const state = nextStateAfterError(listing.attempts ?? 0, err)
      await supabase.from('property_listings').update({
        status: state.status,
        attempts: state.attempts,
        next_attempt_at: state.next_attempt_at,
        last_error: state.last_error,
      }).eq('id', listing.id)
      await writeAudit(supabase, {
        listingId: listing.id,
        propertyId: listing.property_id,
        portal: listing.portal as PortalName,
        eventType: state.status === 'pending' ? 'retried' : 'failed',
        errorMessage: state.last_error,
        payload: state.status === 'pending'
          ? { attempts: state.attempts, next_attempt_at: state.next_attempt_at }
          : undefined,
      })
    }
  }
}

export const config: Config = {
  schedule: '* * * * *',
}
