/**
 * Probe contra la base REAL (no hay servidor Next local levantado: Turbopack
 * revienta por el acento del path). Ejercita las mismas queries que
 * `app/api/leads/route.ts` (GET normal / GET trashed / DELETE lógico) y
 * `app/api/leads/restore/route.ts` (restore) directamente contra Supabase,
 * para confirmar que la columna `deleted_at` y los filtros funcionan tal
 * como el código de las rutas los usa.
 *
 * Crea 2 leads de prueba propios (título/nombre con prefijo "[TEST-PAPELERA]"),
 * los ejercita, y al FINAL los deja soft-deleted (deleted_at = now()) — nunca
 * un DELETE real. No toca ningún lead real existente ("John Doe" / "Julian TEST").
 *
 * Uso: node --env-file=.env.local --import tsx scripts/leads-papelera.probe.ts
 * (ejecutado desde la raíz del repo)
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

async function main() {
  // 1. Encontrar una propiedad existente cualquiera para el FK (no importa cuál).
  const { data: anyProp, error: propErr } = await supabase
    .from('properties')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (propErr || !anyProp) {
    console.error('No hay ninguna propiedad en la base para usar de FK — probe abortado.', propErr)
    process.exit(1)
  }
  const propertyId = anyProp.id as string

  // 2. Crear 2 leads de prueba propios.
  const { data: created, error: insErr } = await supabase
    .from('property_leads')
    .insert([
      { property_id: propertyId, name: '[TEST-PAPELERA] Lead A', email: 'test-papelera-a@example.com', source: 'landing', status: 'new' },
      { property_id: propertyId, name: '[TEST-PAPELERA] Lead B', email: 'test-papelera-b@example.com', source: 'landing', status: 'new' },
    ])
    .select('id, name')
  if (insErr || !created || created.length !== 2) {
    console.error('No se pudieron crear los leads de prueba', insErr)
    process.exit(1)
  }
  const [leadA, leadB] = created as Array<{ id: string; name: string }>
  console.log(`Leads de prueba creados: ${leadA.id}, ${leadB.id}`)

  try {
    // 3. GET normal (deleted_at IS NULL) debe incluirlos ANTES de borrar.
    const { data: beforeDelete } = await supabase
      .from('property_leads')
      .select('id')
      .is('deleted_at', null)
      .in('id', [leadA.id, leadB.id])
    check('listado normal incluye los 2 leads recién creados (deleted_at IS NULL)', (beforeDelete ?? []).length === 2, `encontrados ${(beforeDelete ?? []).length}`)

    // 4. DELETE lógico (mismo query que la ruta DELETE /api/leads).
    const { data: deleted, error: delErr } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [leadA.id, leadB.id])
      .is('deleted_at', null)
      .select('id')
    check('DELETE lógico marca deleted_at en los 2 leads', !delErr && (deleted ?? []).length === 2, delErr?.message)

    // 5. GET normal ahora debe EXCLUIRLOS.
    const { data: afterDelete } = await supabase
      .from('property_leads')
      .select('id')
      .is('deleted_at', null)
      .in('id', [leadA.id, leadB.id])
    check('listado normal ya NO incluye los leads borrados', (afterDelete ?? []).length === 0, `quedaron ${(afterDelete ?? []).length}`)

    // 6. GET trashed (deleted_at IS NOT NULL) debe incluirlos.
    const { data: trashList } = await supabase
      .from('property_leads')
      .select('id, deleted_at')
      .not('deleted_at', 'is', null)
      .in('id', [leadA.id, leadB.id])
    check('listado de papelera incluye los 2 leads borrados', (trashList ?? []).length === 2, `encontrados ${(trashList ?? []).length}`)
    check('deleted_at quedó seteado (no null)', (trashList ?? []).every(r => r.deleted_at != null))

    // 7. Idempotencia: re-aplicar DELETE sobre uno ya borrado no debe "reafectar" nada.
    const { data: reDeleted } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [leadA.id])
      .is('deleted_at', null)
      .select('id')
    check('DELETE sobre un lead ya borrado es no-op (0 filas afectadas)', (reDeleted ?? []).length === 0, `afectó ${(reDeleted ?? []).length}`)

    // 8. RESTORE (mismo query que POST /api/leads/restore) sobre Lead A.
    const { data: restored, error: restErr } = await supabase
      .from('property_leads')
      .update({ deleted_at: null })
      .in('id', [leadA.id])
      .not('deleted_at', 'is', null)
      .select('id')
    check('RESTORE vuelve a poner deleted_at en NULL', !restErr && (restored ?? []).length === 1, restErr?.message)

    const { data: afterRestore } = await supabase
      .from('property_leads')
      .select('id, deleted_at')
      .eq('id', leadA.id)
      .maybeSingle()
    check('Lead A vuelve a aparecer en el listado normal tras restaurar', afterRestore?.deleted_at === null)

    // 9. Badge count (mismo query que /api/leads/count): un lead status='new' pero
    //    BORRADO no debe sumar. Lead B sigue borrado y status='new'.
    const { count: newCountExcludingTrash } = await supabase
      .from('property_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('id', leadB.id)
      .is('deleted_at', null)
    check('el conteo del badge (status=new + deleted_at IS NULL) excluye a Lead B (borrado)', (newCountExcludingTrash ?? 0) === 0, `count=${newCountExcludingTrash}`)

    const { count: newCountIncludingLeadA } = await supabase
      .from('property_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('id', leadA.id)
      .is('deleted_at', null)
    check('el conteo del badge SÍ incluye a Lead A (restaurado, status=new)', (newCountIncludingLeadA ?? 0) === 1, `count=${newCountIncludingLeadA}`)
  } finally {
    // 10. Limpieza: dejar AMBOS soft-deleted (nunca un DELETE real).
    const { error: cleanupErr } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [leadA.id, leadB.id])
    if (cleanupErr) {
      console.warn('No se pudo dejar los leads de prueba soft-deleted al final:', cleanupErr.message)
    } else {
      console.log('Limpieza: ambos leads de prueba quedaron soft-deleted (deleted_at != null).')
    }
  }

  console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
