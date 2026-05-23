/**
 * Endpoint de lanzamiento de campaña desde el wizard.
 *
 * POST → crea Campaign + AdSet + Ad en Meta con los inputs del wizard.
 *
 * Filosofía del producto: SIEMPRE deja la campaña en PAUSED.
 * El asesor revisa, ajusta lo que quiera en Ads Manager y la activa
 * manualmente cuando esté conforme. Esto es intencional — el sistema
 * hace el 99% del trabajo creativo pero NO se activa solo.
 *
 * Por eso siempre pasamos `dryRun: true` al builder (lo que skipea el
 * auto-activate post smoke-test). En el futuro podemos exponer un toggle
 * "Lanzar activa" para casos avanzados.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { createCampaignForProperty } from '@/lib/marketing/meta-campaign-builder'
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
  return ['admin', 'dueno', 'coordinador'].includes(role)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    // Overrides desde el wizard (presupuesto, geo preset, copy variant, hero foto).
    // Si el asesor editó el budget o eligió un preset distinto al recomendado,
    // esos valores llegan acá y se pasan al builder.
    const body = (await req.json().catch(() => ({}))) as {
      dailyBudgetArs?: number
      copyVariantIdx?: number
      targetingOverride?: Record<string, unknown>
      heroPhotoUrl?: string
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

    try {
      // Siempre dryRun: true — la campaña queda PAUSED para que el asesor la
      // active manualmente desde Ads Manager después de auditar.
      const result = await createCampaignForProperty(property, {
        dryRun: true,
        overrides: {
          dailyBudgetArs: body.dailyBudgetArs,
          copyVariantIdx: body.copyVariantIdx,
          targetingOverride: body.targetingOverride,
          heroPhotoUrl: body.heroPhotoUrl,
        },
      })
      const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${(process.env.META_AD_ACCOUNT_ID ?? '').replace('act_', '')}&selected_campaign_ids=${result.campaignId}`
      return NextResponse.json({ ok: true, ...result, adsManagerUrl })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
