import { createClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { textoNotaDeVinculo } from '@/lib/crm/actividades'
import type { DatosFicha, ProcesoDeFicha } from '@/lib/crm/ficha'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface DatosContacto {
  nombre: string
  telefono?: string | null
  email?: string | null
  origen?: string | null
  asesorId?: string | null
}

/**
 * Encuentra el contacto por email o por teléfono, y si no existe lo crea.
 *
 * El teléfono se compara por los ÚLTIMOS 10 DÍGITOS (`phone_norm`), no por
 * igualdad exacta: el mismo número aparece como "11 5555-4444", "+5491155554444"
 * o "+541155554444" según quién lo cargó, y comparar el texto creaba un contacto
 * nuevo por cada formato. Es la misma regla que usa "Coordinar Tasación"
 * (`app/api/deals/route.ts`); si se cambia una, se cambian las dos.
 */
export async function encontrarOCrearContacto(datos: DatosContacto): Promise<string> {
  const supabase = getAdmin()
  const email = (datos.email ?? '').trim().toLowerCase()
  const telefono = (datos.telefono ?? '').trim()

  if (email) {
    // `limit(1)`: el email no es único en la base; con dos contactos iguales,
    // `maybeSingle` sin límite daba error y se creaba un TERCERO.
    const { data } = await supabase.from('contacts').select('id').eq('email', email).limit(1).maybeSingle()
    if (data?.id) return data.id as string
  }

  const clave = ultimos10Digitos(telefono)
  if (clave) {
    const { data } = await supabase
      .from('contacts').select('id').eq('phone_norm', clave)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data?.id) return data.id as string
  }

  const { data: nuevo, error } = await supabase
    .from('contacts')
    .insert({
      full_name: datos.nombre,
      phone: telefono || null,
      email: email || null,
      origin: datos.origen || null,
      assigned_to: datos.asesorId || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return nuevo.id as string
}

/**
 * Guarda nombre, teléfono y email ya validados en UN contacto conocido (coordinar desde
 * la ficha, crm-ficha-y-llamadas D9 paso 5). No busca ni crea a nadie: el contacto es el
 * del proceso (o el que mandó la ficha). LANZA si la base devuelve error.
 */
export async function guardarDatosDeContacto(
  contactId: string,
  datos: { full_name: string; phone: string; email: string },
): Promise<void> {
  const { error } = await getAdmin().from('contacts').update(datos).eq('id', contactId)
  if (error) throw new Error(`guardarDatosDeContacto: ${error.message}`)
}

/**
 * ¿Hay OTRO contacto con ese email (tal cual o en minúsculas) o con ese teléfono (por
 * los últimos 10 dígitos, `phone_norm`)? Es la misma búsqueda de "Coordinar tasación",
 * excluyendo al contacto que se está corrigiendo. Solo se usa para avisar: no se unifica
 * ni se bloquea nada (D9, Risks).
 */
export async function hayOtroContactoCon(
  contactId: string,
  datos: { emails: string[]; telefono: string },
): Promise<boolean> {
  const supabase = getAdmin()
  const emails = [...new Set(datos.emails.map((e) => e.trim()).filter(Boolean))]
  if (emails.length > 0) {
    const { data, error } = await supabase
      .from('contacts').select('id').in('email', emails).neq('id', contactId).limit(1).maybeSingle()
    if (error) throw new Error(`hayOtroContactoCon (email): ${error.message}`)
    if (data) return true
  }
  const clave = ultimos10Digitos(datos.telefono)
  if (!clave) return false
  const { data, error } = await supabase
    .from('contacts').select('id').eq('phone_norm', clave).neq('id', contactId).limit(1).maybeSingle()
  if (error) throw new Error(`hayOtroContactoCon (teléfono): ${error.message}`)
  return !!data
}

/**
 * Deja en la ficha del contacto el rastro de que un asesor lo vinculó a su proceso al
 * completar los datos del cliente, cuando antes no podía ver a esa persona
 * (`PUT /api/deals/[id]/cliente`, crm-ficha-y-llamadas D4). Es la única nota que no
 * escribe una persona: va con `automatic = true`, y por eso el asesor que figura como
 * autor no la puede editar ni borrar. Sin `occurred_at` (lo pone la base) ni
 * `client_token`. LANZA si la base devuelve error: supabase-js no lanza solo.
 */
export async function registrarNotaDeVinculo(datos: {
  contactId: string
  dealId: string
  autorId: string
  direccion: string | null
}): Promise<void> {
  const { error } = await getAdmin()
    .from('contact_activities')
    .insert({
      contact_id: datos.contactId,
      deal_id: datos.dealId,
      created_by: datos.autorId,
      kind: 'note',
      automatic: true,
      body: textoNotaDeVinculo(datos.direccion),
    })
  if (error) throw new Error(`registrarNotaDeVinculo: ${error.message}`)
}

const COLUMNAS_PROCESO_FICHA =
  'id, stage, created_at, assigned_to, scheduled_date, scheduled_time, origin, property_address, ' +
  'neighborhood, property_type, property_type_other, rooms, covered_area, meta_campaign_name, ' +
  'meta_adset_name, meta_ad_name, stage_changed_at, lost_at, visited_at, appraisal_id, property_id'

// Columnas EXPLÍCITAS: `appraisals.property_images` guarda fotos en base64 (215 MB en 67
// filas) y un `select('*')` de muchas tasaciones ya tumbó la base una vez (CLAUDE.md).
const COLUMNAS_TASACION_FICHA = 'id, property_title, property_location, created_at, assigned_to, user_id'
const COLUMNAS_PROPIEDAD_FICHA = 'id, address, neighborhood, created_at, assigned_to'

/** Junta dos listas por `id` (sin repetir) y las deja de la más nueva a la más vieja. */
function unirPorId<T extends { id: string; created_at: string }>(a: T[], b: T[]): T[] {
  const porId = new Map<string, T>()
  for (const x of [...a, ...b]) if (!porId.has(x.id)) porId.set(x.id, x)
  return [...porId.values()].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
}

/** Los ids de `columna` de los procesos que no vinieron ya en `yaEstan`, sin repetir. */
function idsQueFaltan(procesos: Record<string, unknown>[], columna: string, yaEstan: { id: string }[]): string[] {
  const tengo = new Set(yaEstan.map((x) => x.id))
  const ids = procesos.map((p) => p[columna]).filter((v): v is string => typeof v === 'string' && v !== '' && !tengo.has(v))
  return [...new Set(ids)]
}

/**
 * Lo que la ruta `ficha` necesita del contacto (D4), con service role: la ruta ya decidió
 * el permiso y `armarFicha` (lib/crm/ficha.ts) recorta lo que un asesor no ve. `null` si
 * el contacto no existe. Tira ante cualquier error: una lista que no se pudo leer no puede
 * llegar vacía como si no hubiera nada.
 */
export async function leerDatosDeFicha(contactId: string): Promise<DatosFicha | null> {
  const db = getAdmin()
  const [contacto, procesos, tasaciones, propiedades, intento] = await Promise.all([
    db.from('contacts').select('id, full_name, phone, email, origin, notes, assigned_to, created_by').eq('id', contactId).maybeSingle(),
    db.from('deals').select(COLUMNAS_PROCESO_FICHA).eq('contact_id', contactId).order('created_at', { ascending: false }),
    db.from('appraisals').select(COLUMNAS_TASACION_FICHA).eq('contact_id', contactId).order('created_at', { ascending: false }),
    db.from('properties').select(COLUMNAS_PROPIEDAD_FICHA).eq('contact_id', contactId).order('created_at', { ascending: false }),
    // El último contacto es de la PERSONA: NO se filtra por `deal_id` (cuenta el intento
    // de cualquier proceso, abierto o cerrado, y el que no tiene proceso).
    db
      .from('contact_activities')
      .select('occurred_at')
      .eq('contact_id', contactId)
      .in('kind', ['call', 'whatsapp_sent'])
      .is('voided_at', null)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  for (const [nombre, r] of [['contacto', contacto], ['procesos', procesos], ['tasaciones', tasaciones], ['propiedades', propiedades], ['último intento', intento]] as const) {
    if (r.error) throw new Error(`leerDatosDeFicha (${nombre}): ${r.error.message}`)
  }
  if (!contacto.data) return null

  // "Archivos" (ROJO 1 del QA, 2026-11-26): en la base real casi ninguna tasación ni
  // propiedad tiene `contact_id`; cuelgan del PROCESO (`deals.appraisal_id` /
  // `deals.property_id`). Se suman las de los procesos del contacto, sin repetir las que
  // ya vinieron por `contact_id`. Qué ve un asesor lo decide `armarFicha` (D4).
  const filasProcesos = (procesos.data ?? []) as unknown as Record<string, unknown>[]
  const tasacionesDirectas = (tasaciones.data ?? []) as DatosFicha['tasaciones']
  const propiedadesDirectas = (propiedades.data ?? []) as DatosFicha['propiedades']
  const tasacionesQueFaltan = idsQueFaltan(filasProcesos, 'appraisal_id', tasacionesDirectas)
  const propiedadesQueFaltan = idsQueFaltan(filasProcesos, 'property_id', propiedadesDirectas)
  const [tasacionesDeProcesos, propiedadesDeProcesos] = await Promise.all([
    tasacionesQueFaltan.length > 0
      ? db.from('appraisals').select(COLUMNAS_TASACION_FICHA).in('id', tasacionesQueFaltan)
      : Promise.resolve({ data: [], error: null }),
    propiedadesQueFaltan.length > 0
      ? db.from('properties').select(COLUMNAS_PROPIEDAD_FICHA).in('id', propiedadesQueFaltan)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (tasacionesDeProcesos.error) throw new Error(`leerDatosDeFicha (tasaciones de los procesos): ${tasacionesDeProcesos.error.message}`)
  if (propiedadesDeProcesos.error) throw new Error(`leerDatosDeFicha (propiedades de los procesos): ${propiedadesDeProcesos.error.message}`)

  return {
    contacto: contacto.data as DatosFicha['contacto'],
    procesos: filasProcesos as unknown as ProcesoDeFicha[],
    tasaciones: unirPorId(tasacionesDirectas, (tasacionesDeProcesos.data ?? []) as DatosFicha['tasaciones']),
    propiedades: unirPorId(propiedadesDirectas, (propiedadesDeProcesos.data ?? []) as DatosFicha['propiedades']),
    ultimoIntentoEn: (intento.data as { occurred_at: string } | null)?.occurred_at ?? null,
  }
}
