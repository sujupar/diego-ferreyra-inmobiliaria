/**
 * QA end-to-end del flujo de landing v2 (plan 2026-08-06-landing-alta-conversion)
 * contra la BASE REAL, sobre una propiedad de prueba con guard duro `[TEST`.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-landing-flow.ts <setup|flow|teardown|all>
 *
 * `flow` ejercita el pipeline COMPLETO con llamadas reales (ScraperAPI para la
 * zona; OpenAI/DeepSeek según env para preguntas/avatares/copy; Gemini cae a
 * fallback si no hay key local — igual que en el diagnóstico de CLAUDE.md):
 *   crear → enrich (vision/location/description/avatars) → publicar SIN responder
 *   (debe RECHAZAR) → responder → etapa copy re-armada → publicar (debe pasar).
 */
import { createClient } from '@supabase/supabase-js'
import {
  startCoCreation, runEnrichStage, publishLanding, updateLanding, getLanding,
} from '../lib/landing/landing-service'
import { nextEnrichStage } from '../lib/landing/enrich'
import { GATE_RESPUESTAS_MSG } from '../lib/landing/answers-gate'
import { deterministicConversionCopy } from '../lib/landing/conversion-copy'
import { generateEmpathyAvatars } from '../lib/marketing/empathy-avatar-generator'

const MARK = '[TEST QA Landing]'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

/** Todas las filas de prueba (con 2+ residuos, maybeSingle() devolvía null y
 *  el teardown "no encontraba nada" — hallazgo del review 2026-08-06). */
async function findTestProperties(): Promise<{ id: string }[]> {
  const { data, error } = await admin().from('properties').select('id, address').like('address', `${MARK}%`)
  if (error) throw new Error(`findTestProperties: ${error.message}`)
  return (data ?? []) as { id: string }[]
}

async function findTestProperty(): Promise<{ id: string } | null> {
  return (await findTestProperties())[0] ?? null
}

async function setup(): Promise<string> {
  const existing = await findTestProperty()
  if (existing) { console.log('setup: reuso', existing.id); return existing.id }
  const { data, error } = await admin().from('properties').insert({
    address: `${MARK} Av. Santa Fe 3200`,
    neighborhood: 'Palermo', city: 'CABA',
    property_type: 'departamento', operation_type: 'venta',
    asking_price: 180000, currency: 'USD',
    rooms: 3, bedrooms: 2, bathrooms: 1,
    covered_area: 70, total_area: 82,
    latitude: -34.5889, longitude: -58.4108,
    // Entregable para el gate del recorrido (video "de marketing" cuenta desde 2026-08-02).
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    photos: ['https://picsum.photos/seed/qa1/1200/800', 'https://picsum.photos/seed/qa2/1200/800',
      'https://picsum.photos/seed/qa3/1200/800', 'https://picsum.photos/seed/qa4/1200/800'],
    status: 'approved',
    description: 'Depto de prueba QA.',
  }).select('id').single()
  if (error) throw new Error(`setup: ${error.message}`)
  const id = (data as { id: string }).id
  console.log('setup: creada', id)
  return id
}

async function flow() {
  const prop = await findTestProperty()
  assert(prop, 'no hay propiedad [TEST — corré setup primero')
  const id = prop.id

  // 1) Crear (sin IA) — nace con copy determinístico y enrich='vision'.
  const landing = await startCoCreation(id, null)
  console.log('flow: landing', landing.id, 'enrich =', landing.wizard_state?.enrich)

  // 2) Loop de enrich (vision → location → description → avatars). Máx 8 vueltas.
  let current = landing
  for (let i = 0; i < 8; i++) {
    const stage = nextEnrichStage(current.wizard_state ?? {})
    if (stage === 'done') break
    console.log(`flow: etapa ${stage}…`)
    current = await runEnrichStage(id)
  }
  assert(nextEnrichStage(current.wizard_state ?? {}) === 'done', 'el enrich no terminó')
  const questions = current.wizard_state?.questions ?? []
  console.log('flow: preguntas =', questions.length, '| copyFromAnswers =', current.wizard_state?.copyFromAnswers)
  assert(questions.length >= 3, `esperaba >=3 preguntas, hay ${questions.length}`)
  assert(current.wizard_state?.copyFromAnswers !== true, 'copyFromAnswers no debería estar true antes de responder')

  // 3) Publicar SIN responder → el server debe RECHAZAR con el mensaje del gate.
  let rechazo = ''
  try {
    await publishLanding(id, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000', null)
  } catch (e) { rechazo = e instanceof Error ? e.message : String(e) }
  assert(rechazo === GATE_RESPUESTAS_MSG, `esperaba el rechazo del gate, obtuve: "${rechazo || 'PUBLICÓ (mal)'}"`)
  console.log('flow: publicar sin responder → RECHAZADO ✓')

  // 4) Responder todas las preguntas (lo que hace POST /landing/answers).
  const answers: Record<string, string> = {}
  for (const q of questions) {
    answers[q.id] = q.id === questions[0].id
      ? 'Una pareja joven que busca su primer departamento con balcón y luz'
      : 'El balcón con sol de la tarde y estar a 3 cuadras del subte'
  }
  const { avatars } = await generateEmpathyAvatars({
    property: (await admin().from('properties').select('*').eq('id', id).single()).data as never,
    count: 3,
    visionSummary: current.wizard_state?.visionSummary,
    description: current.wizard_state?.descriptionUsed,
    answers,
  })
  await updateLanding(id, {
    wizardState: { answers, avatarCandidates: avatars, selectedAvatarIndex: 0, step: 'avatar', enrich: 'copy', copyFromAnswers: false },
  })

  // 5) Etapa copy re-armada → textos con las respuestas.
  const after = await runEnrichStage(id)
  assert(after.wizard_state?.copyFromAnswers === true, 'copyFromAnswers debería ser true tras la etapa copy')
  const content = after.content as { blocks: Array<Record<string, unknown>> }
  const hero = content.blocks.find(b => b.id === 'hero')
  const closing = content.blocks.find(b => b.id === 'closing')
  const location = content.blocks.find(b => b.id === 'location')
  assert(hero, 'sin bloque hero')
  assert(closing?.eyebrow === 'Vení a recorrerla', `closing.eyebrow = ${String(closing?.eyebrow)}`)
  assert(location?.showMap === true, 'location.showMap debería ser true')
  const det = deterministicConversionCopy(
    (await admin().from('properties').select('*').eq('id', id).single()).data as never,
  )
  console.log('flow: titular generado =', JSON.stringify(hero.titleOverride))
  if (hero.titleOverride === det.titular) {
    console.warn('flow: AVISO — el titular quedó igual al determinístico (¿la IA falló y cayó al fallback?)')
  }

  // 6) Insights persistidos.
  const { data: pRow } = await admin().from('properties').select('location_insights').eq('id', id).single()
  const ins = (pRow as { location_insights?: { fuente?: string } | null })?.location_insights
  assert(ins, 'location_insights no se persistió')
  console.log('flow: insights.fuente =', ins?.fuente)

  // 7) Publicar con todo listo → debe pasar.
  const pub = await publishLanding(id, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000', null)
  console.log('flow: publicada ✓ slug =', pub.slug)

  const final = await getLanding(id)
  assert(final?.status === 'published', 'la landing no quedó published')
  console.log('\n✅ E2E OK — gate rechaza sin respuestas, copy v2 con respuestas, mapa, insights y publicación')
}

async function teardown() {
  const props = await findTestProperties()
  if (!props.length) { console.log('teardown: nada que borrar'); return }
  const sb = admin()
  for (const prop of props) {
    // Orden: hijos sin CASCADE primero; property_landings cascadea por FK.
    await sb.from('property_avatars').delete().eq('property_id', prop.id)
    await sb.from('property_landing_revisions').delete().in(
      'landing_id',
      ((await sb.from('property_landings').select('id').eq('property_id', prop.id)).data ?? []).map(r => (r as { id: string }).id),
    )
    await sb.from('property_landings').delete().eq('property_id', prop.id)
    const { error } = await sb.from('properties').delete().eq('id', prop.id)
    if (error) throw new Error(`teardown: ${error.message}`)
    console.log('teardown: borrada', prop.id)
  }
}

async function main() {
  const cmd = process.argv[2] ?? 'all'
  if (cmd === 'setup') return void await setup()
  if (cmd === 'flow') return void await flow()
  if (cmd === 'teardown') return void await teardown()
  if (cmd === 'all') { await setup(); try { await flow() } finally { await teardown() } ; return }
  throw new Error(`comando desconocido: ${cmd}`)
}
main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
