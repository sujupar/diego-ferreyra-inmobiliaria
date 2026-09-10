/**
 * Corre el Tasador IA sobre una tasación REAL y compara con la clásica. No
 * escribe nada. Mide latencia y tokens: si la latencia pasa de ~15 s hay que
 * achicar el prompt antes de deployar (la función de Netlify se corta antes).
 *
 * Uso: node --env-file=../../../.env.local --import tsx scripts/probar-tasador-ia.ts <appraisalId>
 *      (sin id: lista las últimas 5 tasaciones con 3+ comparables)
 */
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '../lib/ai/chat-client'
import { correrTasadorIA } from '../lib/valuation/tasador-ia'
import { comparablesNormales, filaAPropiedad, type FilaComparable } from '../lib/valuation/valuacion-activa'
import type { ValuationProperty, ValuationResult } from '../lib/valuation/calculator'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const id = process.argv[2]
  if (!id) {
    const { data } = await sb.from('appraisals')
      .select('id, property_title, property_location, comparable_count, created_at')
      .gte('comparable_count', 3).order('created_at', { ascending: false }).limit(5)
    console.log('Tasaciones con 3+ comparables (pasá un id):')
    for (const t of data ?? []) console.log(`  ${t.id}  ${t.comparable_count} comp  ${t.property_title ?? t.property_location}`)
    return
  }
  const [{ data: t }, { data: comps }] = await Promise.all([
    sb.from('appraisals').select('*').eq('id', id).single(),
    sb.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
  ])
  if (!t) throw new Error('tasación no encontrada')
  const fila = t as Record<string, unknown>
  const clasico = fila.valuation_result as ValuationResult
  const subject: ValuationProperty = {
    title: String(fila.property_title ?? ''),
    location: String(fila.property_location ?? ''),
    description: String(fila.property_description ?? ''),
    price: (fila.property_price as number | null) ?? null,
    currency: (fila.property_currency as string | null) ?? null,
    features: (fila.property_features ?? {}) as ValuationProperty['features'],
  }
  const comparables = comparablesNormales((comps ?? []) as unknown as FilaComparable[]).map(r => filaAPropiedad(r))
  console.log(`Tasación: ${subject.title} · ${subject.location} · ${comparables.length} comparables`)

  const t0 = Date.now()
  const ia = await correrTasadorIA({
    subject, comparables,
    expenseRates: clasico.expenseRates,
    ownerSharePercent: clasico.ownerSharePercent ?? 100,
    purchaseScenarios: clasico.purchaseScenarios ?? [],
    selectedScenarioIds: clasico.selectedScenarioIds ?? [],
    previousPurchaseResult: clasico.purchaseResult,
  }, { chat: (i) => chatCompletion(i) })
  const ms = Date.now() - t0

  const f = (n: number) => `USD ${Math.round(n).toLocaleString('es-AR')}`
  const u = ia.ai.usage
  console.log(`\nLatencia: ${(ms / 1000).toFixed(1)} s · modelo ${ia.ai.provider}/${ia.ai.model} · tokens ${u?.totalTokens ?? '?'} (entrada ${u?.promptTokens ?? '?'} / salida ${u?.completionTokens ?? '?'})`)
  console.log(`Confianza: ${ia.ai.confidence}\nResumen: ${ia.ai.summary}\n`)
  console.log(`${''.padEnd(22)}${'Clásico'.padStart(16)}${'IA'.padStart(16)}`)
  const filas: Array<[keyof ValuationResult, string]> = [
    ['publicationPrice', 'Publicación'], ['saleValue', 'Venta'], ['moneyInHand', 'Dinero en mano'],
    ['subjectPriceM2', 'USD/m² subject'], ['averagePriceM2', 'Promedio USD/m²'],
  ]
  for (const [k, l] of filas) {
    console.log(`${l.padEnd(22)}${f(Number(clasico[k])).padStart(16)}${f(Number(ia[k])).padStart(16)}`)
  }
  const s = ia.ai.subject.features
  console.log(`\nSubject: ${s.quality} ${s.conservationState} ${s.disposition} J=${s.locationCoefficient} — ${ia.ai.subject.reasoning}`)
  ia.ai.comparables.forEach((c, i) => {
    const x = c.features
    console.log(`Comp ${i + 1}: ${x.quality} ${x.conservationState} ${x.disposition} J=${x.locationCoefficient} — ${c.reasoning}`)
  })
  if (ms > 15_000) console.warn('\n⚠️ latencia alta: achicar prompt/maxTokens antes de deployar')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
