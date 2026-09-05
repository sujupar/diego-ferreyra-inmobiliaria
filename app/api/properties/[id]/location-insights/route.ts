import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getOrCreateLocationInsights } from '@/lib/marketing/location-insights'
import type { Database } from '@/types/database.types'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'

export const maxDuration = 60

/**
 * POST /api/properties/[id]/location-insights
 *
 * Investiga la zona de la propiedad (Google vía ScraperAPI + datos de mercado,
 * SIN IA) y cachea el resultado en `properties.location_insights`. Idempotente:
 * si ya hay cache lo devuelve al toque. Body opcional: { refresh: true } para
 * re-investigar. Lo llaman el paso Descripción de los wizards ML/Argenprop y
 * la etapa 'location' del enrich de la landing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const allowed = ['admin', 'dueno', 'coordinador', 'asesor']
    if (!allowed.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    // La política de difusión vive en UNA tabla: `lib/properties/difusion-access.ts`.
    if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir'))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { refresh?: boolean }
    const insights = await getOrCreateLocationInsights(id, { refresh: body.refresh === true })
    return NextResponse.json({ insights })
  } catch (err) {
    console.error('[location-insights]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
