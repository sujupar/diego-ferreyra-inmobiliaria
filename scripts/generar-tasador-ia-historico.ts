/**
 * Genera la valuación del Tasador IA para las tasaciones que todavía no la tienen,
 * SIN cambiar el tasador en uso de ninguna (todas siguen en `calculator`; la IA
 * queda lista para verla con un clic). Pedido del dueño, 2026-09-10.
 *
 * Una llamada al modelo por tasación, en serie. Las que no se pueden valuar
 * (menos de 3 comparables, comparables sin precio/superficie) quedan en
 * `failed` con el motivo, que es lo que muestra la tarjeta.
 *
 * Uso: node --env-file=../../../.env.local --import tsx scripts/generar-tasador-ia-historico.ts [--solo-listar]
 */
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '../lib/ai/chat-client'
import { correrTasadorIA } from '../lib/valuation/tasador-ia'
import { comparablesNormales, filaAPropiedad, type FilaComparable } from '../lib/valuation/valuacion-activa'
import { guardarValuacionIA } from '../lib/supabase/appraisals-write'
import type { ValuationProperty, ValuationResult } from '../lib/valuation/calculator'

async function main() {
  const soloListar = process.argv.includes('--solo-listar')
  // `--todas`: regenera también las que ya estaban listas (p. ej. cuando cambia
  // la regla del tasador, como el 2026-09-12 al pasar a respetar los datos del
  // asesor). Sigue sin tocar `valuation_source`.
  const todas = process.argv.includes('--todas')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let consulta = sb.from('appraisals')
    .select('id, property_title, property_location, valuation_source, ai_valuation_status')
    .order('created_at', { ascending: true })
  if (!todas) consulta = consulta.or('ai_valuation_status.is.null,ai_valuation_status.eq.failed')
  const { data: pendientes, error } = await consulta
  if (error) throw error
  const lista = pendientes ?? []
  console.log(`Tasaciones a generar${todas ? ' (todas, regenerando las listas)' : ' (sin valuación IA)'}: ${lista.length}`)
  if (soloListar) { for (const t of lista) console.log(`  ${t.id}  ${t.property_title ?? t.property_location}`); return }

  let ok = 0, fallidas = 0
  const t0 = Date.now()
  for (const [i, t] of lista.entries()) {
    const etiqueta = `[${i + 1}/${lista.length}] ${t.property_title ?? t.property_location}`
    if (t.valuation_source !== 'calculator') { console.log(`${etiqueta} → SALTEADA (tasador en uso: ${t.valuation_source})`); continue }
    const [{ data: fila }, { data: comps }] = await Promise.all([
      sb.from('appraisals').select('*').eq('id', t.id).single(),
      sb.from('appraisal_comparables').select('*').eq('appraisal_id', t.id).order('sort_order'),
    ])
    if (!fila) { console.log(`${etiqueta} → no encontrada`); continue }
    const f = fila as Record<string, unknown>
    const clasico = f.valuation_result as ValuationResult | null
    const subject: ValuationProperty = {
      title: String(f.property_title ?? ''), location: String(f.property_location ?? ''),
      description: String(f.property_description ?? ''), url: String(f.property_url ?? ''),
      price: (f.property_price as number | null) ?? null, currency: (f.property_currency as string | null) ?? null,
      images: (f.property_images as string[] | null) ?? [], features: (f.property_features ?? {}) as ValuationProperty['features'],
    }
    const comparables = comparablesNormales((comps ?? []) as unknown as FilaComparable[]).map(r => filaAPropiedad(r))
    try {
      await guardarValuacionIA(sb, t.id, { status: 'pending' })
      const inicio = Date.now()
      const resultado = await correrTasadorIA({
        subject, comparables,
        expenseRates: clasico?.expenseRates,
        ownerSharePercent: clasico?.ownerSharePercent ?? 100,
        purchaseScenarios: clasico?.purchaseScenarios ?? [],
        selectedScenarioIds: clasico?.selectedScenarioIds ?? [],
        previousPurchaseResult: clasico?.purchaseResult,
      }, { chat: (x) => chatCompletion(x) })
      await guardarValuacionIA(sb, t.id, { status: 'ready', result: resultado })
      ok++
      console.log(`${etiqueta} → OK en ${((Date.now() - inicio) / 1000).toFixed(1)}s · clásico ${clasico?.publicationPrice} / IA ${resultado.publicationPrice} (${resultado.ai.confidence})`)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'Error desconocido'
      await guardarValuacionIA(sb, t.id, { status: 'failed', error: motivo })
      fallidas++
      console.log(`${etiqueta} → FALLIDA: ${motivo}`)
    }
  }
  // Verificación final: ninguna tasación cambió de tasador en uso.
  const { count } = await sb.from('appraisals').select('id', { count: 'exact', head: true }).eq('valuation_source', 'ai')
  console.log(`\nListas: ${ok} · fallidas: ${fallidas} · ${((Date.now() - t0) / 1000).toFixed(0)}s · tasaciones con IA en uso: ${count ?? '?'} (debe ser 0 salvo las elegidas a mano)`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
