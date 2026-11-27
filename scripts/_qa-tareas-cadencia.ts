/**
 * Prueba contra la BASE REAL de las cinco funciones de tareas de la cadencia
 * (crm-ficha-y-llamadas, tarea 4.2): crear, repetir (no duplica), cerrar, leer, deshacer.
 *
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts crear solicitud
 *   node --env-file=.env.local --import tsx scripts/_qa-tareas-cadencia.ts
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *
 * Trabaja SOLO sobre los datos de la receta 2.5 (contacto "[TEST] Ficha QA", situación
 * `solicitud`): si no los encuentra, corta sin tocar nada. Inserta UNA actividad de
 * prueba (la tarea de la cadencia necesita un `source_activity_id` real por la FK) y
 * todas las tareas van a la cuenta "Claude · pruebas". No pasa por ninguna ruta: no sale
 * ningún email ni WhatsApp. Lo que crea lo limpia `borrar` (busca por contacto y proceso).
 * Tira ante el primer resultado que no coincide.
 */
import { createClient } from '@supabase/supabase-js'
import {
  getPendingTasksForContact,
  createCadenceTask,
  closeTasksByActivity,
  undoTasksOfActivity,
  getTasksOfActivity,
} from '../lib/supabase/tasks'

const NOMBRE = '[TEST] Ficha QA'
const CLAUDE_QA = 'claude.qa@inmodf.com.ar'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, clave)
}

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`FALLA: ${mensaje}`)
  console.log(`  ✓ ${mensaje}`)
}

interface EstadoTarea { id: string; status: string; completed_at: string | null; closed_by_activity_id: string | null; source_activity_id: string | null }

async function estado(ids: string[]): Promise<Map<string, EstadoTarea>> {
  const { data, error } = await admin()
    .from('tasks')
    .select('id, status, completed_at, closed_by_activity_id, source_activity_id')
    .in('id', ids)
  if (error) throw new Error(`select tasks: ${error.message}`)
  return new Map(((data ?? []) as EstadoTarea[]).map((t) => [t.id, t]))
}

async function main(): Promise<void> {
  const db = admin()

  // ── Datos de la receta ────────────────────────────────────────────────────────────
  const { data: contactos, error: eC } = await db.from('contacts').select('id').eq('full_name', NOMBRE)
  if (eC) throw new Error(eC.message)
  if (!contactos || contactos.length !== 1) throw new Error(`se esperaba 1 contacto «${NOMBRE}» y hay ${contactos?.length ?? 0}: correr \`_qa-ficha-datos.ts crear solicitud\``)
  const contactId = (contactos[0] as { id: string }).id
  const { data: procesos, error: eP } = await db.from('deals').select('id, stage, origin').eq('contact_id', contactId)
  if (eP) throw new Error(eP.message)
  const proceso = (procesos ?? []) as { id: string; stage: string; origin: string | null }[]
  if (proceso.length !== 1 || proceso[0].stage !== 'request' || proceso[0].origin !== null) {
    throw new Error('la receta tiene que estar en la situación `solicitud` (un proceso en request con origin vacío)')
  }
  const dealId = proceso[0].id
  const { data: qa, error: eQ } = await db.from('profiles').select('id').eq('email', CLAUDE_QA).single()
  if (eQ || !qa) throw new Error(`no se encontró la cuenta ${CLAUDE_QA}`)
  const claude = (qa as { id: string }).id
  console.log(`Contacto ${contactId} · proceso ${dealId}`)

  // ── Leer ──────────────────────────────────────────────────────────────────────────
  console.log('\n1) getPendingTasksForContact')
  const pendientes = await getPendingTasksForContact(contactId, [dealId])
  for (const t of pendientes) console.log(`   · ${t.title} → ${t.assigned_name} (${t.assigned_role})`)
  esperar(pendientes.length === 2, 'trae las 2 tareas de entrada de la receta')
  esperar(pendientes.every((t) => t.title.startsWith('[TEST]')), 'todas son de prueba')
  esperar(pendientes.every((t) => t.assigned_role !== null && t.assigned_name !== null), 'cada una trae nombre y rol del asignado (segunda consulta a profiles)')
  esperar(pendientes.some((t) => t.assigned_role === 'coordinador'), 'la de "Julian Coordinador" viene con rol coordinador')
  const deEntrada = pendientes.map((t) => t.id)

  // Actividad de prueba (la FK de source_activity_id / closed_by_activity_id lo exige).
  const { data: act, error: eA } = await db
    .from('contact_activities')
    .insert({ contact_id: contactId, deal_id: dealId, kind: 'call', call_outcome: 'no_atendio', created_by: claude, body: '[TEST] qa-tareas-cadencia' })
    .select('id')
    .single()
  if (eA || !act) throw new Error(`insert actividad: ${eA?.message}`)
  const activityId = (act as { id: string }).id
  console.log(`   actividad de prueba ${activityId}`)

  // ── Crear ─────────────────────────────────────────────────────────────────────────
  console.log('\n2) createCadenceTask')
  const entrada = {
    type: 'follow_up' as const, channel: 'call' as const, title: `[TEST] Llamada 2 a ${NOMBRE}`,
    description: 'Creada sola por la cadencia de llamadas.', assigned_to: claude, created_by: claude,
    deal_id: dealId, contact_id: contactId, due_date: '2026-12-01', due_time: '09:00', all_day: false,
    source_activity_id: activityId,
  }
  const creada = await createCadenceTask(entrada)
  esperar(!creada.yaExistia, 'la primera vez la crea')
  let e = await estado([creada.id])
  esperar(e.get(creada.id)?.status === 'pending' && e.get(creada.id)?.source_activity_id === activityId, 'en la base queda pendiente y apuntando a la actividad')

  console.log('\n3) createCadenceTask repetido')
  const repetida = await createCadenceTask(entrada)
  esperar(repetida.yaExistia && repetida.id === creada.id, 'el segundo pedido devuelve la misma tarea (23505 → existente)')
  const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('source_activity_id', activityId)
  esperar(count === 1, 'hay UNA sola tarea con ese source_activity_id')

  // ── Cerrar ────────────────────────────────────────────────────────────────────────
  console.log('\n4) closeTasksByActivity')
  const cerradas = await closeTasksByActivity(deEntrada, activityId, null)
  esperar(cerradas.length === 2, 'cierra las 2 tareas de entrada')
  e = await estado(deEntrada)
  esperar(deEntrada.every((id) => e.get(id)?.status === 'completed' && e.get(id)?.closed_by_activity_id === activityId && !!e.get(id)?.completed_at),
    'en la base quedan completadas, con completed_at y closed_by_activity_id')
  const otraVez = await closeTasksByActivity(deEntrada, activityId, null)
  esperar(otraVez.length === 0, 'cerrar de nuevo no toca nada (solo cierra pendientes)')

  // ── Leer lo que hizo la actividad ────────────────────────────────────────────────
  console.log('\n5) getTasksOfActivity')
  const hizo = await getTasksOfActivity(activityId)
  console.log(`   creada: ${JSON.stringify(hizo.creada)}`)
  esperar(hizo.creada?.id === creada.id, 'devuelve la tarea creada')
  esperar(hizo.creada?.due_time === '09:00:00', 'due_time llega con segundos ("09:00:00"), como dice D3')
  esperar(hizo.cerradas.length === 2 && hizo.cerradas.every((t) => deEntrada.includes(t.id)), 'devuelve las 2 cerradas')

  // ── Deshacer ──────────────────────────────────────────────────────────────────────
  console.log('\n6) undoTasksOfActivity')
  const deshecho = await undoTasksOfActivity(activityId)
  esperar(deshecho.descartadas === 1 && deshecho.reabiertas === 2, `descarta 1 y reabre 2 (${JSON.stringify(deshecho)})`)
  e = await estado([creada.id, ...deEntrada])
  esperar(e.get(creada.id)?.status === 'dismissed', 'la creada queda descartada (no se borra)')
  esperar(deEntrada.every((id) => e.get(id)?.status === 'pending' && e.get(id)?.completed_at === null && e.get(id)?.closed_by_activity_id === null),
    'las reabiertas quedan pendientes con completed_at y closed_by_activity_id vacíos')

  console.log('\n7) undoTasksOfActivity por segunda vez')
  const deNuevo = await undoTasksOfActivity(activityId)
  esperar(deNuevo.descartadas === 0 && deNuevo.reabiertas === 0, 'la segunda vez no cambia nada')
  const despues = await getTasksOfActivity(activityId)
  esperar(despues.creada === null && despues.cerradas.length === 0, 'getTasksOfActivity ya no devuelve la descartada ni las reabiertas')

  console.log('\n✓ las cinco funciones se comportan como dice D3. Ahora: `_qa-ficha-datos.ts borrar` y `verificar`.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
