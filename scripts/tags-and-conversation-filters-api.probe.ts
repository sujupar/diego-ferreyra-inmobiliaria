/**
 * Probe contra la base REAL (no hay servidor Next local levantado: Turbopack
 * revienta por el acento del path — no se puede invocar el route handler HTTP
 * directamente porque `requireAuth()`/`getUser()` dependen de `next/headers`).
 * Ejercita, contra la base real, las piezas de Task 3 que un `tsc` limpio NO
 * puede probar: las queries nuevas (joins PostgREST vía cliente sin genérico,
 * upsert con onConflict, el fallback de `resolveLeadIdForVisitWithFallback`).
 *
 * Crea leads y una visita de prueba (prefijo "[TEST-TAGS-API]"), los ejercita,
 * y al FINAL deja los leads soft-deleted (nunca un DELETE real) y borra la
 * visita/asignaciones de prueba (no son leads, no hace falta soft-delete). No
 * toca ningún lead ni visita real existente.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/tags-and-conversation-filters-api.probe.ts
 * (ejecutado desde la raíz del repo)
 */
import { createClient } from '@supabase/supabase-js'
import { resolveLeadIdForVisitWithFallback } from '../lib/leads/resolve-crm-visit-lead'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

interface TagJoinRow {
  lead_id: string
  lead_tags: { slug: string; label: string; color: string } | null
}

async function main() {
  const { data: anyProp } = await supabase.from('properties').select('id').limit(1).maybeSingle()
  if (!anyProp) {
    console.error('No hay ninguna propiedad en la base para usar de FK — probe abortado.')
    process.exit(1)
  }
  const propertyId = (anyProp as { id: string }).id

  const { data: anyProfile } = await supabase.from('profiles').select('id').limit(1).maybeSingle()
  if (!anyProfile) {
    console.error('No hay ningún profile en la base para usar de assigned_by — probe abortado.')
    process.exit(1)
  }
  const profileId = (anyProfile as { id: string }).id

  // 2 leads de prueba propios, para probar el join "sin N+1" con más de uno.
  const { data: leadA } = await supabase
    .from('property_leads')
    .insert({ property_id: propertyId, name: '[TEST-TAGS-API] Lead A', email: 'test-tags-api-a@example.com', phone: '5491100000001', source: 'landing', status: 'new' })
    .select('id')
    .single()
  const { data: leadB } = await supabase
    .from('property_leads')
    .insert({ property_id: propertyId, name: '[TEST-TAGS-API] Lead B', email: 'test-tags-api-b@example.com', source: 'landing', status: 'new' })
    .select('id')
    .single()
  if (!leadA || !leadB) {
    console.error('No se pudieron crear los leads de prueba')
    process.exit(1)
  }
  const leadIdA = (leadA as { id: string }).id
  const leadIdB = (leadB as { id: string }).id
  console.log(`Leads de prueba: A=${leadIdA} B=${leadIdB}`)

  try {
    // 1. Catálogo (lo que sirve GET /api/leads/tags).
    const { data: catalog, error: catErr } = await supabase
      .from('lead_tags')
      .select('slug, label, color, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    check('catálogo de etiquetas activo tiene 12 filas', !catErr && (catalog ?? []).length === 12, `${(catalog ?? []).length}, err=${catErr?.message}`)
    const calienteTag = (catalog ?? []).find((t: { slug: string }) => t.slug === 'caliente') as { slug: string; label: string; color: string } | undefined
    const tibioTag = (catalog ?? []).find((t: { slug: string }) => t.slug === 'tibio') as { slug: string; label: string; color: string } | undefined
    check("el catálogo trae 'caliente' y 'tibio'", !!calienteTag && !!tibioTag)
    if (!calienteTag || !tibioTag) throw new Error('catálogo incompleto, abortando')

    // 2. Asignar 'caliente' a A (equivalente al POST /api/leads/[id]/tags).
    const { data: tagRowCaliente } = await supabase.from('lead_tags').select('id').eq('slug', 'caliente').maybeSingle()
    const { data: tagRowTibio } = await supabase.from('lead_tags').select('id').eq('slug', 'tibio').maybeSingle()
    const tagIdCaliente = (tagRowCaliente as { id: string }).id
    const tagIdTibio = (tagRowTibio as { id: string }).id

    const { error: assignErr } = await supabase
      .from('lead_tag_assignments')
      .upsert({ lead_id: leadIdA, tag_id: tagIdCaliente, assigned_by: profileId }, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true })
    check('asignar caliente a A sin error', !assignErr, assignErr?.message)

    // 2b. Asignar la MISMA etiqueta dos veces no debe romper (idempotencia del POST).
    const { error: dupErr } = await supabase
      .from('lead_tag_assignments')
      .upsert({ lead_id: leadIdA, tag_id: tagIdCaliente, assigned_by: profileId }, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true })
    check('re-asignar la misma etiqueta (upsert ignoreDuplicates) no rompe', !dupErr, dupErr?.message)

    await supabase.from('lead_tag_assignments').insert({ lead_id: leadIdB, tag_id: tagIdTibio, assigned_by: profileId })

    // 3. El join "sin N+1" (mismo patrón que usan whatsapp/conversations y leads/route):
    //    UNA query .in('lead_id', [A,B]) trae las etiquetas de AMBOS leads.
    const { data: joinRows, error: joinErr } = await supabase
      .from('lead_tag_assignments')
      .select('lead_id, lead_tags(slug, label, color)')
      .in('lead_id', [leadIdA, leadIdB])
    check('el join lead_tag_assignments→lead_tags no da error', !joinErr, joinErr?.message)
    const rows = (joinRows ?? []) as unknown as TagJoinRow[]
    check('el join trae exactamente 2 filas (1 por lead)', rows.length === 2, `${rows.length}`)
    const rowA = rows.find(r => r.lead_id === leadIdA)
    const rowB = rows.find(r => r.lead_id === leadIdB)
    check("A quedó con la etiqueta 'caliente' embebida (slug/label/color)", rowA?.lead_tags?.slug === 'caliente' && rowA?.lead_tags?.label === calienteTag.label && rowA?.lead_tags?.color === calienteTag.color, JSON.stringify(rowA))
    check("B quedó con la etiqueta 'tibio' embebida", rowB?.lead_tags?.slug === 'tibio', JSON.stringify(rowB))

    // 4. Quitar la etiqueta de A (equivalente al DELETE) y confirmar que desaparece del join.
    const { error: delErr } = await supabase.from('lead_tag_assignments').delete().eq('lead_id', leadIdA).eq('tag_id', tagIdCaliente)
    check('quitar la etiqueta de A sin error', !delErr, delErr?.message)
    const { data: afterDel } = await supabase.from('lead_tag_assignments').select('lead_id').eq('lead_id', leadIdA)
    check('A quedó sin asignaciones tras el DELETE', (afterDel ?? []).length === 0, `${(afterDel ?? []).length}`)
    const { data: catalogStillThere } = await supabase.from('lead_tags').select('id').eq('slug', 'caliente').maybeSingle()
    check("el catálogo ('lead_tags') no se tocó — 'nada se borra' aplica a la asignación, no al catálogo", !!catalogStillThere)

    // 5. resolveLeadIdForVisitWithFallback — vía token (mismo camino que ya
    //    probó Task 1+2, re-verificado acá porque este wrapper es NUEVO código).
    const { data: visitToken } = await supabase
      .from('property_visits')
      .insert({ property_id: propertyId, client_name: '[TEST-TAGS-API] visita con token', scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: 'pending_confirmation' })
      .select('id')
      .single()
    const visitTokenId = (visitToken as { id: string }).id
    await supabase.from('lead_access_tokens').insert({ token: `test-tags-api-${leadIdB.slice(0, 8)}`, property_id: propertyId, lead_id: leadIdB, name: '[TEST-TAGS-API] Lead B', visit_id: visitTokenId })
    const viaToken = await resolveLeadIdForVisitWithFallback(visitTokenId)
    check('resolveLeadIdForVisitWithFallback resuelve vía token cuando existe', viaToken === leadIdB, `resolved=${viaToken}`)

    // 6. resolveLeadIdForVisitWithFallback — SIN token (visita cargada a mano
    //    desde el CRM), matcheando por email dentro de la MISMA propiedad. Este
    //    es el hueco #2 del brief: antes de esta tarea, esto siempre daba null.
    const { data: visitCrm } = await supabase
      .from('property_visits')
      .insert({ property_id: propertyId, client_name: 'Cliente cargado a mano', client_email: 'test-tags-api-a@example.com', scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: 'scheduled' })
      .select('id')
      .single()
    const visitCrmId = (visitCrm as { id: string }).id
    const viaFallback = await resolveLeadIdForVisitWithFallback(visitCrmId)
    check('resolveLeadIdForVisitWithFallback resuelve por email cuando NO hay token (visita cargada a mano)', viaFallback === leadIdA, `resolved=${viaFallback}`)

    // 6b. Sin match posible → null, nunca lanza.
    const { data: visitNoMatch } = await supabase
      .from('property_visits')
      .insert({ property_id: propertyId, client_name: 'Sin lead asociado', client_email: 'nadie-matchea-esto@example.com', scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: 'scheduled' })
      .select('id')
      .single()
    const visitNoMatchId = (visitNoMatch as { id: string }).id
    const viaNoMatch = await resolveLeadIdForVisitWithFallback(visitNoMatchId)
    check('sin match posible, devuelve null (no rompe el flujo de agendar/completar)', viaNoMatch === null, `resolved=${viaNoMatch}`)

    // Limpieza de visitas/tokens de prueba (no son leads, no hace falta soft-delete).
    await supabase.from('property_visits').delete().in('id', [visitTokenId, visitCrmId, visitNoMatchId])
    await supabase.from('lead_access_tokens').delete().eq('token', `test-tags-api-${leadIdB.slice(0, 8)}`)
  } finally {
    const { error: cleanupErr } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [leadIdA, leadIdB])
    if (cleanupErr) {
      console.warn('No se pudieron dejar los leads de prueba soft-deleted al final:', cleanupErr.message)
    } else {
      console.log('Limpieza: los leads de prueba quedaron soft-deleted (deleted_at != null).')
    }
  }

  console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
