import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessAppraisal } from '@/lib/auth/entity-access'
import { puedeEditarTasacion } from '@/lib/auth/appraisal-access'
import { chatCompletion, hasAiConfigured } from '@/lib/ai/chat-client'
import { correrTasadorIA, TIMEOUT_MS, type ChatTasador } from '@/lib/valuation/tasador-ia'
import { comparablesNormales, filaAPropiedad, type FilaComparable } from '@/lib/valuation/valuacion-activa'
import { guardarValuacionIA } from '@/lib/supabase/appraisals-write'
import type { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface FilaTasacion {
  id: string
  property_title: string | null
  property_location: string
  property_description: string | null
  property_url: string | null
  property_price: number | null
  property_currency: string | null
  property_images: string[] | null
  property_features: ValuationProperty['features'] | null
  valuation_result: ValuationResult | null
}

const COLUMNAS_TASACION =
  'id, property_title, property_location, property_description, property_url, property_price, property_currency, property_images, property_features, valuation_result'
const COLUMNAS_IA = 'ai_valuation_result, ai_valuation_status, ai_valuation_error, valuation_source, updated_at'

/**
 * Genera (o regenera) la valuación del Tasador IA. UNA llamada al modelo por
 * request (regla dura de CLAUDE.md); el techo de tiempo vive en
 * `correrTasadorIA`. Sin `maxDuration`: Netlify lo ignora. Idempotente: llamar
 * de nuevo es "Regenerar".
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Fuera del try: `requireAuth` puede redirigir (NEXT_REDIRECT) y eso tiene
  // que propagar a Next, no volverse un 500.
  const user = await requireAuth()
  try {
    const { id } = await params
    // Dos candados, como el PUT: el rol escribe tasaciones Y esta cae en su alcance.
    if (!puedeEditarTasacion(user.profile.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!(await canAccessAppraisal(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!hasAiConfigured()) {
      return NextResponse.json({ error: 'Tasador IA no configurado (falta la clave del proveedor de IA)' }, { status: 503 })
    }

    const supabase = getAdmin()
    const [tasacionRes, comparablesRes] = await Promise.all([
      supabase.from('appraisals').select(COLUMNAS_TASACION).eq('id', id).single(),
      supabase.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
    ])
    if (tasacionRes.error || !tasacionRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const fila = tasacionRes.data as unknown as FilaTasacion
    const filas = (comparablesRes.data ?? []) as unknown as FilaComparable[]
    const clasico = fila.valuation_result

    const subject: ValuationProperty = {
      title: fila.property_title ?? '',
      location: fila.property_location,
      description: fila.property_description ?? '',
      url: fila.property_url ?? '',
      price: fila.property_price,
      currency: fila.property_currency,
      images: fila.property_images ?? [],
      features: fila.property_features ?? {},
    }
    const comparables = comparablesNormales(filas).map(r => filaAPropiedad(r))

    await guardarValuacionIA(supabase, id, { status: 'pending' })
    try {
      const chat: ChatTasador = (i) => chatCompletion(i)
      const resultado = await correrTasadorIA({
        subject,
        comparables,
        expenseRates: clasico?.expenseRates,
        ownerSharePercent: clasico?.ownerSharePercent ?? 100,
        purchaseScenarios: clasico?.purchaseScenarios ?? [],
        selectedScenarioIds: clasico?.selectedScenarioIds ?? [],
        previousPurchaseResult: clasico?.purchaseResult,
      }, { chat })
      await guardarValuacionIA(supabase, id, { status: 'ready', result: resultado })
    } catch (e) {
      const motivo = e instanceof Error && e.name === 'TimeoutError'
        ? `Tasador IA: el modelo tardó más de ${TIMEOUT_MS / 1000} segundos`
        : e instanceof Error ? e.message : 'Error desconocido del Tasador IA'
      console.error('[ai-valuation] falló', { id, motivo })
      await guardarValuacionIA(supabase, id, { status: 'failed', error: motivo })
      return NextResponse.json({ error: motivo }, { status: 422 })
    }

    const { data } = await supabase.from('appraisals').select(COLUMNAS_IA).eq('id', id).single()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
