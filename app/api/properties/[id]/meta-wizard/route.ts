/**
 * Endpoint orchestrador del wizard inteligente de Meta Ads.
 *
 * GET → corre todos los análisis y devuelve un blob con:
 *   - property normalizada
 *   - vision analysis (highlights, features, best photo)
 *   - buyer persona
 *   - geo presets (3 opciones)
 *   - budget recomendado
 *   - copy variations
 *
 * El frontend usa esto en el step 1 y de ahí va navegando pasos.
 * Es relativamente caro (varios LLM calls) — se llama una vez por sesión.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { analyzePropertyPhotos } from '@/lib/marketing/property-vision-analyzer'
import { generateBuyerPersona } from '@/lib/marketing/buyer-persona-generator'
import { buildGeoPresets, recommendPreset } from '@/lib/marketing/geo-targeting-presets'
import { decideBudget } from '@/lib/marketing/budget-rules'
import { generateAdCopyVariations } from '@/lib/marketing/copy-ai-generator'
import { getUsdToArs } from '@/lib/marketing/usd-rate'
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

export async function GET(
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
    if (!property.public_slug) {
      return NextResponse.json(
        { error: 'La propiedad no tiene landing pública asignada todavía.' },
        { status: 412 },
      )
    }
    if (property.latitude == null || property.longitude == null) {
      return NextResponse.json(
        { error: 'Falta geolocalización (lat/lng) en la propiedad.' },
        { status: 412 },
      )
    }

    const landingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'}/p/${property.public_slug}`

    // Corremos los análisis en paralelo donde se puede
    const [vision, { rate: usdToArs }] = await Promise.all([
      analyzePropertyPhotos(property),
      getUsdToArs(),
    ])
    const persona = generateBuyerPersona({ property, vision })
    const presets = buildGeoPresets(property, persona)
    const recommendedPreset = recommendPreset(persona)
    const budget = decideBudget(property.asking_price, property.currency, usdToArs)
    const copy = await generateAdCopyVariations(property, landingUrl)

    return NextResponse.json({
      property,
      landingUrl,
      vision,
      persona,
      presets,
      recommendedPreset,
      budget,
      copy,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
