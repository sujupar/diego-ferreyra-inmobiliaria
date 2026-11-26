/**
 * Prueba contra la BASE REAL de la cadencia de llamadas (crm-ficha-y-llamadas, tarea 6.6):
 * no atendió → no atendió → WhatsApp → no atendió, y deshacer el último.
 *
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts crear solicitud
 *   node --env-file=.env.local --import tsx scripts/_qa-actividad.ts
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *
 * El script no tiene sesión: inserta cada actividad con `insertarActividad` (lo mismo que
 * hace la ruta) y llama DIRECTO a `aplicarCadencia`, con el id y el rol de la cuenta
 * "Claude · pruebas". No pasa por ninguna ruta: no sale ningún email ni WhatsApp. Trabaja
 * SOLO sobre el contacto "[TEST] Ficha QA" en la situación `solicitud`; si no lo encuentra,
 * corta sin tocar nada. Tira ante el primer resultado que no coincide.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { esUltimoIntento } from '../lib/crm/actividades'
import { anularActividad, insertarActividad, intentosNoAnulados, type FilaActividad } from '../lib/supabase/actividades'
import { aplicarCadencia, type ResultadoCadencia } from '../lib/supabase/cadencia'
import { undoTasksOfActivity } from '../lib/supabase/tasks'
import type { Role } from '../types/auth.types'

const NOMBRE = '[TEST] Ficha QA'
const CLAUDE_QA = 'claude.qa@inmodf.com.ar'
// Teléfono de la receta (`+5491199990017`); `whatsapp_messages` lo guarda sin '+'.
const ULTIMOS_DIGITOS_TELEFONO = '1199990017'

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

interface FilaTarea {
  id: string
  title: string
  status: string
  channel: string | null
  type: string
  source_activity_id: string | null
  closed_by_activity_id: string | null
}

async function main(): Promise<void> {
  const db = admin()

  // ── Datos de la receta ──────────────────────────────────────────────────────────
  const { data: contactos, error: eC } = await db.from('contacts').select('id').eq('full_name', NOMBRE)
  if (eC) throw new Error(eC.message)
  if (!contactos || contactos.length !== 1) {
    throw new Error(`se esperaba 1 contacto «${NOMBRE}» y hay ${contactos?.length ?? 0}: correr \`_qa-ficha-datos.ts crear solicitud\``)
  }
  const contactId = (contactos[0] as { id: string }).id
  const { data: procesos, error: eP } = await db.from('deals').select('id, stage, origin').eq('contact_id', contactId)
  if (eP) throw new Error(eP.message)
  const proc = (procesos ?? []) as { id: string; stage: string; origin: string | null }[]
  if (proc.length !== 1 || proc[0].stage !== 'request' || proc[0].origin !== null) {
    throw new Error('la receta tiene que estar en la situación `solicitud` (un proceso en request con origin vacío)')
  }
  const dealId = proc[0].id
  const { data: qa, error: eQ } = await db.from('profiles').select('id, role').eq('email', CLAUDE_QA).single()
  if (eQ || !qa) throw new Error(`no se encontró la cuenta ${CLAUDE_QA}`)
  const claude = qa as { id: string; role: Role }
  console.log(`Contacto ${contactId} · proceso ${dealId} · Claude · pruebas (${claude.role})`)

  const { count: actividadesPrevias } = await db
    .from('contact_activities')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
  if (actividadesPrevias !== 0) throw new Error(`el contacto ya tiene ${actividadesPrevias} actividades: correr borrar y crear solicitud`)

  // ── Línea de base: lo que NO tiene que cambiar ──────────────────────────────────
  const historial = async () => {
    const { count, error } = await db.from('deal_stage_history').select('id', { count: 'exact', head: true }).eq('deal_id', dealId)
    if (error) throw new Error(`deal_stage_history: ${error.message}`)
    return count ?? 0
  }
  const mensajes = async () => {
    const { count, error } = await db
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .or(`phone_e164.ilike.%${ULTIMOS_DIGITOS_TELEFONO},wa_id.ilike.%${ULTIMOS_DIGITOS_TELEFONO}`)
    if (error) throw new Error(`whatsapp_messages: ${error.message}`)
    return count ?? 0
  }
  const historialAntes = await historial()
  const mensajesAntes = await mensajes()
  console.log(`  línea de base: ${historialAntes} filas en deal_stage_history · ${mensajesAntes} whatsapp_messages con ese teléfono`)

  const tareas = async (): Promise<FilaTarea[]> => {
    const { data, error } = await db
      .from('tasks')
      .select('id, title, status, channel, type, source_activity_id, closed_by_activity_id')
      .or(`contact_id.eq.${contactId},deal_id.eq.${dealId}`)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`tasks: ${error.message}`)
    return (data ?? []) as FilaTarea[]
  }
  const mostrarTareas = (ts: FilaTarea[]) => {
    for (const t of ts) {
      console.log(`     · ${t.status.padEnd(9)} ${t.title}${t.closed_by_activity_id ? ` (cerrada por ${t.closed_by_activity_id.slice(0, 8)})` : ''}`)
    }
  }
  const entrada = (await tareas()).filter((t) => t.type === 'update_contact').map((t) => t.id)
  esperar(entrada.length === 2, 'la receta dejó 2 tareas de entrada pendientes')

  // Lo mismo que hace `POST /api/contacts/[id]/activities` después de validar.
  async function registrar(kind: 'call' | 'whatsapp_sent', paso: string): Promise<{ fila: FilaActividad; r: ResultadoCadencia }> {
    console.log(`\n${paso}`)
    const ins = await insertarActividad({
      contact_id: contactId,
      deal_id: dealId,
      kind,
      body: `[TEST] qa-actividad · ${paso}`,
      created_by: claude.id,
      client_token: randomUUID(),
      ...(kind === 'call' ? { call_outcome: 'no_atendio' as const, callback_at: null } : {}),
    })
    if (!ins.ok) throw new Error('token repetido: no debería pasar con un uuid nuevo')
    const r = await aplicarCadencia(ins.fila, { id: claude.id, role: claude.role })
    console.log(`   respuesta: intento ${r.intento} · motivo ${r.cadencia.motivoSinTarea} · creada «${r.cadencia.tareaCreada?.title ?? '—'}» · cerradas ${r.cadencia.tareasCerradas.length} · pendiente ${r.pendiente}`)
    const { data: filas, error } = await db
      .from('contact_activities')
      .select('id, kind, call_outcome, deal_id, voided_at, created_by')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`contact_activities: ${error.message}`)
    console.log(`   contact_activities (${filas?.length ?? 0}):`)
    for (const f of (filas ?? []) as { id: string; kind: string; call_outcome: string | null; voided_at: string | null }[]) {
      console.log(`     · ${f.id.slice(0, 8)} ${f.kind} ${f.call_outcome ?? ''}${f.voided_at ? ' (anulada)' : ''}`)
    }
    console.log('   tasks:')
    mostrarTareas(await tareas())
    esperar(!r.pendiente, 'sin pendientes (cerrar y crear funcionaron)')
    return { fila: ins.fila, r }
  }

  // 1) No atendió
  const p1 = await registrar('call', '1) No atendió')
  esperar(p1.r.intento === 1, 'es la Llamada 1')
  esperar(p1.r.cadencia.tareaCreada?.title === `Llamada 2 a ${NOMBRE}`, 'crea «Llamada 2 a …»')
  esperar(p1.r.cadencia.tareasCerradas.length === 2 && p1.r.cadencia.tareasCerradas.every((t) => entrada.includes(t.id)), 'cierra las 2 de entrada')
  let ts = await tareas()
  const llamada2 = ts.find((t) => t.source_activity_id === p1.fila.id)
  esperar(!!llamada2 && llamada2.status === 'pending' && llamada2.channel === 'call', 'en la base: «Llamada 2» pendiente, canal llamada, con source_activity_id')
  esperar(entrada.every((id) => ts.find((t) => t.id === id)?.closed_by_activity_id === p1.fila.id), 'en la base: las de entrada cerradas por la Llamada 1')

  // 2) No atendió otra vez → WhatsApp
  const p2 = await registrar('call', '2) No atendió')
  esperar(p2.r.intento === 2, 'es la Llamada 2')
  esperar(p2.r.cadencia.tareaCreada?.title === `Enviar WhatsApp a ${NOMBRE}`, 'crea «Enviar WhatsApp a …»')
  ts = await tareas()
  esperar(ts.find((t) => t.id === llamada2?.id)?.closed_by_activity_id === p2.fila.id, 'en la base: «Llamada 2» cerrada por la segunda llamada')
  const enviarWa = ts.find((t) => t.source_activity_id === p2.fila.id)
  esperar(!!enviarWa && enviarWa.status === 'pending' && enviarWa.channel === 'message', 'en la base: «Enviar WhatsApp» pendiente, canal mensaje')

  // 2b) El mismo guardado otra vez (guardado repetido / Reintentar): no duplica.
  console.log('\n2b) aplicarCadencia otra vez sobre la segunda llamada')
  const otraVez = await aplicarCadencia(p2.fila, { id: claude.id, role: claude.role })
  esperar(otraVez.cadencia.tareaCreada?.id === enviarWa?.id && otraVez.cadencia.motivoSinTarea === null, 'devuelve la misma «Enviar WhatsApp», motivo en null')
  const { count: deLaSegunda } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('source_activity_id', p2.fila.id)
  esperar(deLaSegunda === 1, 'sigue habiendo UNA tarea creada por la segunda llamada')

  // 3) WhatsApp marcado
  const p3 = await registrar('whatsapp_sent', '3) WhatsApp marcado')
  esperar(p3.r.intento === null && p3.r.cadencia.motivoSinTarea === 'secuencia_terminada' && p3.r.cadencia.tareaCreada === null, 'no crea tarea: secuencia terminada')
  ts = await tareas()
  esperar(ts.find((t) => t.id === enviarWa?.id)?.closed_by_activity_id === p3.fila.id, 'en la base: «Enviar WhatsApp» cerrada por el WhatsApp marcado')
  esperar(ts.filter((t) => t.status === 'pending').length === 0, 'en la base: ninguna tarea pendiente')

  // 4) No atendió después del WhatsApp
  const p4 = await registrar('call', '4) No atendió')
  esperar(p4.r.intento === 3, 'es la Llamada 3')
  esperar(p4.r.cadencia.motivoSinTarea === 'whatsapp_ya_enviado' && p4.r.cadencia.tareaCreada === null, 'no crea tarea: ya se le mandó WhatsApp')
  const antesDeDeshacer = JSON.stringify(await tareas())

  // 5) Deshacer el último (lo que hace PATCH { accion: 'anular' })
  console.log('\n5) Deshacer la última llamada')
  await anularActividad(contactId, p4.fila.id, claude.id)
  const vivos = await intentosNoAnulados(contactId, dealId)
  esperar(esUltimoIntento(p4.fila, [...vivos, p4.fila]), 'era el último intento: se deshacen sus tareas')
  const deshecho = await undoTasksOfActivity(p4.fila.id)
  esperar(deshecho.descartadas === 0 && deshecho.reabiertas === 0, 'no había creado ni cerrado nada: no cambia ninguna tarea')
  esperar(JSON.stringify(await tareas()) === antesDeDeshacer, 'en la base: las tareas quedan igual')
  const { data: anulada } = await db.from('contact_activities').select('voided_at, voided_by').eq('id', p4.fila.id).single()
  const a = anulada as { voided_at: string | null; voided_by: string | null } | null
  esperar(!!a?.voided_at && a.voided_by === claude.id, 'en la base: la llamada queda anulada, con quién y cuándo')

  // 6) Deshacer también el WhatsApp, que ahora es el último: reabre «Enviar WhatsApp».
  console.log('\n6) Deshacer el WhatsApp marcado (ahora es el último)')
  await anularActividad(contactId, p3.fila.id, claude.id)
  const vivos2 = await intentosNoAnulados(contactId, dealId)
  esperar(esUltimoIntento(p3.fila, [...vivos2, p3.fila]), 'el WhatsApp es el último no anulado')
  const deshecho2 = await undoTasksOfActivity(p3.fila.id)
  esperar(deshecho2.descartadas === 0 && deshecho2.reabiertas === 1, 'reabre la tarea que había cerrado')
  ts = await tareas()
  mostrarTareas(ts)
  const reabierta = ts.find((t) => t.id === enviarWa?.id)
  esperar(reabierta?.status === 'pending' && reabierta.closed_by_activity_id === null, 'en la base: «Enviar WhatsApp» vuelve a pendiente, sin closed_by_activity_id')

  // ── Lo que NO cambió ───────────────────────────────────────────────────────────
  console.log('\nControles finales')
  const { data: deal } = await db.from('deals').select('stage').eq('id', dealId).single()
  esperar((deal as { stage: string } | null)?.stage === 'request', 'deals.stage sigue en request')
  esperar((await historial()) === historialAntes, 'ninguna fila nueva en deal_stage_history de ese proceso')
  esperar((await mensajes()) === mensajesAntes, 'ninguna fila nueva en whatsapp_messages con el teléfono de prueba')

  console.log('\n✓ la cadencia se comporta contra la base real. Ahora: `_qa-ficha-datos.ts borrar` y `verificar`.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
