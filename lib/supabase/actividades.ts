// Lecturas y escrituras de `contact_activities` (change crm-ficha-y-llamadas, design.md
// D1 y D4). Service role, como el resto de `lib/supabase/`: la RLS de la tabla no deja
// escribir a nadie con sesión propia, así que la ruta que llama es la única barrera.
// Toda función LANZA si la base devuelve error: supabase-js no lanza solo, y un error
// tragado acá se vería como "no hay nada" en la ficha.
import { createClient } from '@supabase/supabase-js'
import type { Actividad, Intento, TareaCreadaPorActividad } from '@/lib/crm/tipos'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type FilaActividad = Actividad & { client_token: string | null }

const COLUMNAS_ACTIVIDAD =
  'id, contact_id, deal_id, kind, call_outcome, body, occurred_at, callback_at, created_at, ' +
  'updated_at, created_by, voided_at, voided_by, client_token, automatic'

/** Lo que hace falta de cada proceso para elegir el activo y decidir permisos (D2). */
export interface ProcesoDelContacto {
  id: string
  stage: string
  created_at: string
  assigned_to: string | null
  scheduled_date: string | null
  origin: string | null
}

/**
 * Si el contacto existe y sus procesos. `existe: false` es la respuesta para un id que
 * no está: la ruta lo convierte en el mismo 404 que un contacto ajeno.
 */
export async function leerProcesosDelContacto(
  contactId: string,
): Promise<{ existe: boolean; procesos: ProcesoDelContacto[] }> {
  const db = getAdmin()
  const { data: contacto, error: errorContacto } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .maybeSingle()
  if (errorContacto) throw new Error(`leerProcesosDelContacto (contacto): ${errorContacto.message}`)
  if (!contacto) return { existe: false, procesos: [] }
  const { data, error } = await db
    .from('deals')
    .select('id, stage, created_at, assigned_to, scheduled_date, origin')
    .eq('contact_id', contactId)
  if (error) throw new Error(`leerProcesosDelContacto (procesos): ${error.message}`)
  return { existe: true, procesos: (data ?? []) as ProcesoDelContacto[] }
}

/** Lo que la ruta inserta. Nunca `occurred_at` ni `automatic` salvo que se diga acá. */
export interface NuevaFilaActividad {
  contact_id: string
  deal_id: string | null
  kind: Actividad['kind']
  body: string | null
  created_by: string
  client_token: string
  call_outcome?: Actividad['call_outcome']
  callback_at?: string | null
  occurred_at?: string
}

/**
 * Inserta y devuelve la fila. Un choque con `uq_contact_activities_client_token` (23505)
 * NO es un error: es el mismo guardado que llegó dos veces, y la ruta decide qué hacer
 * con la fila que ya estaba (D4).
 */
export async function insertarActividad(
  fila: NuevaFilaActividad,
): Promise<{ ok: true; fila: FilaActividad } | { ok: false; motivo: 'token_repetido' }> {
  const { data, error } = await getAdmin()
    .from('contact_activities')
    .insert(fila)
    .select(COLUMNAS_ACTIVIDAD)
    .single()
  if (error?.code === '23505') return { ok: false, motivo: 'token_repetido' }
  if (error) throw new Error(`insertarActividad: ${error.message}`)
  return { ok: true, fila: data as unknown as FilaActividad }
}

/**
 * Un registro POR SU ID Y SU CONTACTO (D4): una actividad de otro contacto da `null`,
 * igual que una que no existe. Trae también las anuladas (anular se puede repetir, D8).
 */
export async function leerActividadDelContacto(contactId: string, activityId: string): Promise<FilaActividad | null> {
  const { data, error } = await getAdmin()
    .from('contact_activities')
    .select(COLUMNAS_ACTIVIDAD)
    .eq('id', activityId)
    .eq('contact_id', contactId)
    .maybeSingle()
  if (error) throw new Error(`leerActividadDelContacto: ${error.message}`)
  return (data as unknown as FilaActividad | null) ?? null
}

/**
 * Cambia el texto de una nota no anulada y marca `updated_at`. Filtra por contacto,
 * tipo y no anulada en el mismo `update`: si entre la lectura y la escritura la anularon,
 * no se reescribe. Devuelve la fila nueva, o `null` si no cambió nada.
 */
export async function editarNota(contactId: string, activityId: string, body: string): Promise<FilaActividad | null> {
  const { data, error } = await getAdmin()
    .from('contact_activities')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', activityId)
    .eq('contact_id', contactId)
    .eq('kind', 'note')
    .is('voided_at', null)
    .select(COLUMNAS_ACTIVIDAD)
    .maybeSingle()
  if (error) throw new Error(`editarNota: ${error.message}`)
  return (data as unknown as FilaActividad | null) ?? null
}

/**
 * Pone `voided_at`/`voided_by` solo si todavía no estaba anulada: anular dos veces no
 * reescribe quién ni cuándo (D8). No borra nada.
 */
export async function anularActividad(contactId: string, activityId: string, usuarioId: string): Promise<void> {
  const { error } = await getAdmin()
    .from('contact_activities')
    .update({ voided_at: new Date().toISOString(), voided_by: usuarioId })
    .eq('id', activityId)
    .eq('contact_id', contactId)
    .is('voided_at', null)
  if (error) throw new Error(`anularActividad: ${error.message}`)
}

/**
 * Intentos (llamadas y WhatsApp marcados) no anulados de un proceso del contacto; con
 * `dealId` vacío, los del contacto sin proceso (se numeran y se ordenan aparte, D2).
 */
export async function intentosNoAnulados(contactId: string, dealId: string | null): Promise<Intento[]> {
  let query = getAdmin()
    .from('contact_activities')
    .select('id, deal_id, kind, call_outcome, occurred_at, created_at')
    .eq('contact_id', contactId)
    .in('kind', ['call', 'whatsapp_sent'])
    .is('voided_at', null)
  query = dealId ? query.eq('deal_id', dealId) : query.is('deal_id', null)
  const { data, error } = await query
  if (error) throw new Error(`intentosNoAnulados: ${error.message}`)
  return (data ?? []) as Intento[]
}

export async function existeContacto(contactId: string): Promise<boolean> {
  const { data, error } = await getAdmin().from('contacts').select('id').eq('id', contactId).maybeSingle()
  if (error) throw new Error(`existeContacto: ${error.message}`)
  return !!data
}

export type FiltroActividad = 'todo' | 'llamadas' | 'notas' | 'actividad'

// `actividad` = lo que no es llamada ni nota: hoy, el WhatsApp marcado (D4).
const TIPOS_POR_FILTRO: Record<FiltroActividad, Actividad['kind'][]> = {
  todo: ['note', 'call', 'whatsapp_sent'],
  llamadas: ['call'],
  notas: ['note'],
  actividad: ['whatsapp_sent'],
}

/**
 * Una página de la actividad, sin anuladas, la más nueva primero. `antes` es el
 * `occurred_at` del último registro de la página anterior. Límite conocido: dos registros
 * con el MISMO `occurred_at` justo en el corte de página harían que el segundo no
 * aparezca; con hora de servidor en milisegundos es prácticamente imposible.
 */
export async function listarActividades(
  contactId: string,
  filtro: FiltroActividad,
  antes: string | null,
  limite: number,
): Promise<FilaActividad[]> {
  let query = getAdmin()
    .from('contact_activities')
    .select(COLUMNAS_ACTIVIDAD)
    .eq('contact_id', contactId)
    .is('voided_at', null)
    .in('kind', TIPOS_POR_FILTRO[filtro])
  if (antes) query = query.lt('occurred_at', antes)
  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw new Error(`listarActividades: ${error.message}`)
  return (data ?? []) as unknown as FilaActividad[]
}

/** Todas las llamadas no anuladas del contacto: el número de intento sale de acá, no de la página. */
export async function llamadasNoAnuladasDelContacto(contactId: string): Promise<Intento[]> {
  const { data, error } = await getAdmin()
    .from('contact_activities')
    .select('id, deal_id, kind, call_outcome, occurred_at, created_at')
    .eq('contact_id', contactId)
    .eq('kind', 'call')
    .is('voided_at', null)
  if (error) throw new Error(`llamadasNoAnuladasDelContacto: ${error.message}`)
  return (data ?? []) as Intento[]
}

/** Nombre de cada perfil. Un id sin perfil no figura en el mapa. */
export async function nombresDePerfiles(ids: string[]): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  if (ids.length === 0) return nombres
  const { data, error } = await getAdmin().from('profiles').select('id, full_name').in('id', ids)
  if (error) throw new Error(`nombresDePerfiles: ${error.message}`)
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) nombres.set(p.id, p.full_name ?? '')
  return nombres
}

/**
 * La tarea que creó cada actividad ("tarea agendada sola"). Una descartada (porque se
 * anuló la actividad) no cuenta, igual que en `getTasksOfActivity`.
 */
export async function tareasCreadasPor(activityIds: string[]): Promise<Map<string, TareaCreadaPorActividad>> {
  const tareas = new Map<string, TareaCreadaPorActividad>()
  if (activityIds.length === 0) return tareas
  const { data, error } = await getAdmin()
    .from('tasks')
    .select('id, title, due_date, due_time, source_activity_id')
    .in('source_activity_id', activityIds)
    .neq('status', 'dismissed')
  if (error) throw new Error(`tareasCreadasPor: ${error.message}`)
  for (const t of (data ?? []) as (TareaCreadaPorActividad & { source_activity_id: string })[]) {
    tareas.set(t.source_activity_id, { id: t.id, title: t.title, due_date: t.due_date, due_time: t.due_time })
  }
  return tareas
}

/** La fila que ya usó ese identificador de guardado, de cualquier contacto y autor. */
export async function leerActividadPorToken(clientToken: string): Promise<FilaActividad | null> {
  const { data, error } = await getAdmin()
    .from('contact_activities')
    .select(COLUMNAS_ACTIVIDAD)
    .eq('client_token', clientToken)
    .maybeSingle()
  if (error) throw new Error(`leerActividadPorToken: ${error.message}`)
  return (data as unknown as FilaActividad | null) ?? null
}

/** Lo que la cadencia necesita del proceso de la actividad (D4, paso 3a). */
export interface ProcesoParaCadencia {
  id: string
  stage: string
  assigned_to: string | null
  scheduled_date: string | null
  origin: string | null
}

/** El proceso por id; `null` si ya no existe (la cadencia lo trata como sin proceso). */
export async function leerProcesoParaCadencia(dealId: string): Promise<ProcesoParaCadencia | null> {
  const { data, error } = await getAdmin()
    .from('deals')
    .select('id, stage, assigned_to, scheduled_date, origin')
    .eq('id', dealId)
    .maybeSingle()
  if (error) throw new Error(`leerProcesoParaCadencia: ${error.message}`)
  return (data as ProcesoParaCadencia | null) ?? null
}

/** Nombre del contacto para el título de la tarea ("Llamada 2 a {nombre}"). */
export async function nombreDelContacto(contactId: string): Promise<string> {
  const { data, error } = await getAdmin().from('contacts').select('full_name').eq('id', contactId).maybeSingle()
  if (error) throw new Error(`nombreDelContacto: ${error.message}`)
  if (!data) throw new Error(`nombreDelContacto: el contacto ${contactId} no existe`)
  return (data as { full_name: string | null }).full_name ?? ''
}

/** Rol del perfil, o `null` si ese usuario ya no existe (D4, paso 3b). */
export async function rolDePerfil(userId: string): Promise<string | null> {
  const { data, error } = await getAdmin().from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error) throw new Error(`rolDePerfil: ${error.message}`)
  return (data as { role: string | null } | null)?.role ?? null
}
