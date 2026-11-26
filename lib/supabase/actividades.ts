// Lecturas y escrituras de `contact_activities` (change crm-ficha-y-llamadas, design.md
// D1 y D4). Service role, como el resto de `lib/supabase/`: la RLS de la tabla no deja
// escribir a nadie con sesión propia, así que la ruta que llama es la única barrera.
// Toda función LANZA si la base devuelve error: supabase-js no lanza solo, y un error
// tragado acá se vería como "no hay nada" en la ficha.
import { createClient } from '@supabase/supabase-js'
import type { Actividad, Intento } from '@/lib/crm/tipos'

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
