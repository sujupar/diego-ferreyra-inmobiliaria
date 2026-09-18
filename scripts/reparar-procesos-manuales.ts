/**
 * Repara los procesos que dejó el camino viejo de tasación/captación manual.
 *
 *   node --env-file=.env.local --import tsx scripts/reparar-procesos-manuales.ts            # informe (no escribe)
 *   node --env-file=.env.local --import tsx scripts/reparar-procesos-manuales.ts --commit   # aplica
 *
 * Qué decide y por qué: `lib/deals/reparacion-procesos.ts` (puro y testeado).
 * Este archivo solo lee, imprime el estado previo de cada fila que va a tocar,
 * y —con `--commit`— escribe y verifica releyendo.
 *
 * Correr SOLO con el OK del dueño y DESPUÉS del deploy del fix: si se repara
 * antes, el camino viejo vuelve a romper lo reparado.
 */
import { createClient } from '@supabase/supabase-js'
import { planificarReparacion, type PropiedadR, type ProcesoR } from '@/lib/deals/reparacion-procesos'
import { linkPropertyToDeal } from '@/lib/supabase/deals'
import { buildStatusPatch, estadoComercialEfectivo, validateStatusChange } from '@/lib/properties/commercial-status'

const COMMIT = process.argv.includes('--commit')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function corto(id: string) { return id.slice(0, 8) }

async function leer() {
  const [props, deals, tasaciones] = await Promise.all([
    db.from('properties')
      .select('id, appraisal_id, created_at, status, commercial_status, address, expensas, portal_data, landing_answers')
      .range(0, 4999),
    db.from('deals')
      .select('id, appraisal_id, property_id, stage, property_address, assigned_to, visit_data, contacts(full_name, phone)')
      .range(0, 4999),
    db.from('appraisals').select('id, property_title, property_location').range(0, 4999),
  ])
  for (const r of [props, deals, tasaciones]) if (r.error) throw new Error(r.error.message)

  const procesos: ProcesoR[] = (deals.data ?? []).map(d => {
    const c = (Array.isArray(d.contacts) ? d.contacts[0] : d.contacts) as { full_name?: string; phone?: string } | null
    return {
      id: d.id, appraisal_id: d.appraisal_id, property_id: d.property_id, stage: d.stage,
      property_address: d.property_address, assigned_to: d.assigned_to, visit_data: d.visit_data,
      contactoNombre: c?.full_name ?? null, contactoTelefono: c?.phone ?? null,
    }
  })
  return {
    propiedades: (props.data ?? []) as PropiedadR[],
    procesos,
    tasaciones: (tasaciones.data ?? []).map(t => ({ id: t.id, titulo: t.property_title || t.property_location || null })),
  }
}

async function main() {
  console.log(COMMIT ? '=== MODO COMMIT: se va a escribir ===' : '=== MODO INFORME: no se escribe nada ===')
  const datos = await leer()
  const plan = planificarReparacion(datos)

  console.log(`\n## Vincular captación ↔ proceso (${plan.vincular.length})`)
  for (const v of plan.vincular) {
    const heredar = Object.keys(v.heredar)
    console.log(`- ${v.direccion} · proceso ${corto(v.dealId)} (${v.etapaAntes} → captured) ↔ ficha ${corto(v.propertyId)}` +
      (heredar.length ? ` · hereda: ${heredar.join(', ')}` : ''))
  }

  console.log(`\n## Descartar fichas duplicadas (${plan.descartar.length})`)
  for (const d of plan.descartar) {
    console.log(`- ${d.direccion} · ficha ${corto(d.propertyId)} (se queda ${corto(d.conservaId)})`)
    // La landing y los avisos cuelgan de la ficha: si la vieja los tiene, la
    // que queda arranca sin ellos. Se avisa; no se mueve nada solo.
    const [landing, avisos] = await Promise.all([
      db.from('property_landings').select('slug, status').eq('property_id', d.propertyId),
      db.from('property_listings').select('portal, status, external_id').eq('property_id', d.propertyId),
    ])
    for (const l of landing.data ?? []) console.log(`    ⚠ tiene landing /p/${l.slug} (${l.status}) — la ficha que queda necesita la suya`)
    for (const a of avisos.data ?? []) {
      if (a.status !== 'draft') console.log(`    ⚠ tiene aviso en ${a.portal} (${a.status}${a.external_id ? `, ${a.external_id}` : ''}) — revisar antes de publicar la otra`)
    }
  }

  console.log(`\n## Conflictos — los decide una persona (${plan.conflictos.length})`)
  for (const c of plan.conflictos) console.log(`- [${c.tipo}] ${c.detalle}`)

  console.log(`\n## Procesos a medias (${plan.incompletos.length}) — completar desde la ficha`)
  for (const i of plan.incompletos) console.log(`- ${i.direccion} · ${i.etapa} · proceso ${corto(i.dealId)} · falta ${i.faltan.join(', ')}`)

  console.log(`\n## Tasaciones sin proceso (${plan.tasacionesSinProceso.length})`)
  for (const t of plan.tasacionesSinProceso) console.log(`- ${t.titulo ?? '(sin título)'} · ${corto(t.appraisalId)}`)

  console.log(`\n## Misma dirección con más de un proceso abierto (${plan.direccionesDuplicadas.length})`)
  for (const g of plan.direccionesDuplicadas) console.log(`- ${g.direccion}: ${g.dealIds.map(corto).join(', ')}`)

  if (!COMMIT) {
    console.log('\nNada escrito. Para aplicar: agregar --commit.')
    return
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  let fallas = 0
  for (const v of plan.vincular) {
    // Se relee justo antes de escribir: si alguien lo vinculó o lo movió
    // mientras tanto, no se pisa.
    const { data: ahora } = await db.from('deals').select('property_id, stage').eq('id', v.dealId).maybeSingle()
    if (!ahora || ahora.property_id || ahora.stage !== v.etapaAntes) {
      console.log(`  ↷ salteado ${corto(v.dealId)}: cambió desde el informe (${JSON.stringify(ahora)})`)
      continue
    }
    try {
      await linkPropertyToDeal(v.dealId, v.propertyId)
      if (Object.keys(v.heredar).length > 0) {
        const { error } = await db.from('properties')
          .update({ ...v.heredar, updated_at: new Date().toISOString() }).eq('id', v.propertyId)
        if (error) throw new Error(error.message)
      }
      console.log(`  ✓ vinculado ${corto(v.dealId)} ↔ ${corto(v.propertyId)}`)
    } catch (e) {
      fallas++
      console.error(`  ✗ ${corto(v.dealId)}: ${e instanceof Error ? e.message : e}`)
    }
  }

  for (const d of plan.descartar) {
    const { data: prop } = await db.from('properties').select('status, commercial_status').eq('id', d.propertyId).maybeSingle()
    if (!prop) { console.log(`  ↷ ${corto(d.propertyId)} ya no existe`); continue }
    const input = {
      from: estadoComercialEfectivo({ commercialStatus: prop.commercial_status, status: prop.status }),
      to: 'descartada' as const,
      reason: d.motivo,
    }
    const check = validateStatusChange(input)
    if (!check.ok) { console.log(`  ↷ ${corto(d.propertyId)}: ${check.error}`); continue }
    const { error } = await db.from('properties')
      .update({ ...buildStatusPatch(input), updated_at: new Date().toISOString() }).eq('id', d.propertyId)
    if (error) { fallas++; console.error(`  ✗ ${corto(d.propertyId)}: ${error.message}`); continue }
    // Mismo registro que deja el botón de la pantalla, con el motivo escrito.
    const ev = await db.from('property_status_events').insert({
      property_id: d.propertyId, from_status: input.from, to_status: 'descartada', reason: d.motivo,
      sold_price: null, sold_currency: null, sold_at: null, changed_by: null,
    })
    if (ev.error) console.warn(`  ! ${corto(d.propertyId)} descartada, pero el historial no se registró: ${ev.error.message}`)
    console.log(`  ✓ descartada ${corto(d.propertyId)} (queda ${corto(d.conservaId)})`)
  }

  // ── Verificación: se relee, no se confía en que "no dio error" ─────────────
  console.log('\n## Verificación')
  for (const v of plan.vincular) {
    const { data } = await db.from('deals').select('property_id, stage').eq('id', v.dealId).maybeSingle()
    const ok = data?.property_id === v.propertyId && data?.stage === 'captured'
    console.log(`  ${ok ? '✓' : '✗'} proceso ${corto(v.dealId)}: ${JSON.stringify(data)}`)
    if (!ok) fallas++
  }
  for (const d of plan.descartar) {
    const { data } = await db.from('properties').select('status, commercial_status').eq('id', d.propertyId).maybeSingle()
    const ok = data?.commercial_status === 'descartada' && data?.status === 'descartada'
    console.log(`  ${ok ? '✓' : '✗'} ficha ${corto(d.propertyId)}: ${JSON.stringify(data)}`)
    if (!ok) fallas++
  }
  if (fallas > 0) { console.error(`\n${fallas} problema(s).`); process.exitCode = 1 }
}

main().catch(e => { console.error(e); process.exitCode = 1 })
