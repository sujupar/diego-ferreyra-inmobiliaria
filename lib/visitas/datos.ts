import 'server-only'
/**
 * Lecturas y escrituras de visitas con SERVICE ROLE. Sin lógica de negocio: las
 * decisiones están en los módulos puros de lib/visitas y los permisos en las
 * rutas (que los chequean ANTES de llamar acá).
 *
 * Cliente sin tipar a propósito: types/database.types.ts no tiene las columnas
 * del 2026-10-10. Los tipos de salida son los de ./tipos.ts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { clausulasBusqueda } from '@/lib/filters/busqueda-texto'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import { esAsesorAsignable } from '@/lib/deals/asesor-asignable'
import { decidirComprador, type CompradorExistente } from './comprador'
import { origenDesdeLead, esOrigenVisita, type OrigenDerivado, type OrigenVisita } from './origen'
import { ESTADOS_ACTIVOS, esEstadoVisita, MOTIVOS_NO_REALIZADA, type EstadoVisita, type PatchVisita } from './transiciones'
import { MONEDAS, OPINIONES_PRECIO } from './encuesta/tipos'
import type { ConsultaR, RegistroR, VisitaActivaR, VisitaAgendaR, VisitaDetalle, EventoVisitaR, VisitaListado, VisitaParaRecordar, EncuestaListado } from './tipos'
import type { Alcance } from './acceso'
import type { FiltroOrigen } from './filtros'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `visitasDelDia` mete estos ids CRUDOS dentro de un filtro `or()` de
 * PostgREST (ver el comentario ahí). Un UUID no puede traer comas ni
 * paréntesis, así que validar la forma ACÁ, antes de armar el filtro, cierra
 * esa puerta sin depender de que quien llama ya los haya validado.
 */
function exigirUuid(valor: string, campo: string): void {
  if (!UUID_RE.test(valor)) throw new Error(`${campo} no es un UUID válido`)
}

function primeraFotoUsable(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  const f = photos.find(p => typeof p === 'string' && !p.startsWith('data:'))
  return typeof f === 'string' ? f : null
}

export interface PropiedadParaVisita {
  id: string
  address: string
  neighborhood: string | null
  status: string | null
  commercial_status: string | null
  assigned_to: string | null
  foto: string | null
  asking_price: number | null
  currency: string | null
}

const COLUMNAS_PROPIEDAD = 'id, address, neighborhood, status, commercial_status, assigned_to, photos, asking_price, currency'

function aPropiedad(r: Record<string, unknown>): PropiedadParaVisita {
  return {
    id: String(r.id), address: String(r.address ?? ''),
    neighborhood: (r.neighborhood as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    commercial_status: (r.commercial_status as string | null) ?? null,
    assigned_to: (r.assigned_to as string | null) ?? null,
    foto: primeraFotoUsable(r.photos),
    asking_price: r.asking_price === null || r.asking_price === undefined ? null : Number(r.asking_price),
    currency: (r.currency as string | null) ?? null,
  }
}

export async function leerPropiedadParaVisita(id: string): Promise<PropiedadParaVisita | null> {
  const { data, error } = await sb().from('properties').select(COLUMNAS_PROPIEDAD).eq('id', id).maybeSingle()
  if (error) fallo('leer propiedad', error)
  return data ? aPropiedad(data as Record<string, unknown>) : null
}

/**
 * Captadas y disponibles/reservadas. `asesorId` acota (rol asesor). `limite`
 * (default 20, lo que usa la ventana de visitas): Consultas pide el inventario
 * entero para ordenar primero las del barrio del aviso, y con 20 cortadas por
 * dirección la del barrio podía no estar en la lista.
 */
export async function buscarPropiedadesParaVisita(f: { q?: string; id?: string; asesorId?: string; limite?: number }): Promise<PropiedadParaVisita[]> {
  let q = sb().from('properties').select(COLUMNAS_PROPIEDAD)
    .eq('status', 'approved').in('commercial_status', ['disponible', 'reservada'])
    .order('address').limit(f.limite ?? 20)
  if (f.id) q = q.eq('id', f.id)
  if (f.asesorId) q = q.eq('assigned_to', f.asesorId)
  for (const clausula of clausulasBusqueda(['address', 'neighborhood'], f.q ?? '')) q = q.or(clausula)
  const { data, error } = await q
  if (error) fallo('buscar propiedades', error)
  return ((data ?? []) as Record<string, unknown>[]).map(aPropiedad)
}

const COLUMNAS_CONSULTA = 'id, lead_name, lead_phone, lead_email, portal, received_at, created_at'

export async function leerConsulta(id: string): Promise<(ConsultaR & { property_id: string | null; lead_message: string | null }) | null> {
  const { data, error } = await sb().from('portal_inquiries')
    .select(`${COLUMNAS_CONSULTA}, property_id, lead_message`).eq('id', id).maybeSingle()
  if (error) fallo('leer consulta', error)
  return (data as (ConsultaR & { property_id: string | null; lead_message: string | null }) | null) ?? null
}

export async function listarConsultasDeLaPropiedad(propertyId: string): Promise<ConsultaR[]> {
  const { data, error } = await sb().from('portal_inquiries').select(COLUMNAS_CONSULTA)
    .eq('property_id', propertyId)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(300)
  if (error) fallo('listar consultas', error)
  return (data ?? []) as ConsultaR[]
}

const COLUMNAS_REGISTRO = 'id, name, phone, email, source, utm, created_at, suspected_bot, deleted_at'

export async function leerRegistro(id: string): Promise<(RegistroR & { property_id: string }) | null> {
  const { data, error } = await sb().from('property_leads').select(`${COLUMNAS_REGISTRO}, property_id`).eq('id', id).maybeSingle()
  if (error) fallo('leer registro', error)
  return (data as (RegistroR & { property_id: string }) | null) ?? null
}

export async function listarRegistrosDeLaPropiedad(propertyId: string): Promise<RegistroR[]> {
  const { data, error } = await sb().from('property_leads').select(COLUMNAS_REGISTRO)
    .eq('property_id', propertyId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(300)
  if (error) fallo('listar registros', error)
  return (data ?? []) as RegistroR[]
}

export async function visitasActivasDeLaPropiedad(propertyId: string): Promise<VisitaActivaR[]> {
  const { data, error } = await sb().from('property_visits')
    .select('id, lead_id, client_phone, scheduled_at, status')
    .eq('property_id', propertyId).in('status', [...ESTADOS_ACTIVOS])
  if (error) fallo('visitas activas', error)
  return (data ?? []) as VisitaActivaR[]
}

export interface EntradaComprador {
  propertyId: string
  nombre: string
  telefono: string | null
  email: string | null
  mensaje: string | null
  source: string
  asignadoA: string | null
}

/**
 * Pasa un comprador a 'scheduled' SOLO si hoy está 'new' (`.eq('status','new')` como
 * guarda en el mismo UPDATE): uno 'discarded' o 'contacted' lo decidió una persona y no
 * se pisa. Si no está en 'new', el UPDATE no encuentra fila y no hace nada.
 *
 * Lo llama POST /api/visits DESPUÉS de crear la visita, para los tres caminos: una
 * persona con visita no es una "consulta sin responder" (GET /api/leads/count cuenta
 * `status='new'`). No va dentro de `asegurarComprador` a propósito: ahí todavía puede
 * cortar el duplicado (409) o fallar el alta, y la persona quedaría "agendada" sin visita.
 */
export async function marcarCompradorAgendado(leadId: string): Promise<void> {
  const { error } = await sb().from('property_leads').update({ status: 'scheduled' })
    .eq('id', leadId).eq('status', 'new')
  if (error) fallo('marcar comprador como agendado', error)
}

export async function asegurarComprador(e: EntradaComprador): Promise<string> {
  const db = sb()
  const norm = ultimos10Digitos(e.telefono)
  // Normalizado UNA vez: se usa igual para buscar y para crear, así los dos
  // caminos ven exactamente el mismo valor (si no, "Ana@Mail.com" podría
  // buscar distinto de cómo queda guardado).
  const emailNorm = e.email?.trim().toLowerCase() || null
  const candidatos: CompradorExistente[] = []
  if (norm) {
    const { data, error } = await db.from('property_leads').select('id, phone, email, created_at')
      .eq('property_id', e.propertyId).eq('phone_norm', norm).is('deleted_at', null)
    if (error) fallo('buscar comprador por teléfono', error)
    candidatos.push(...((data ?? []) as CompradorExistente[]))
  }
  if (emailNorm) {
    const { data, error } = await db.from('property_leads').select('id, phone, email, created_at')
      .eq('property_id', e.propertyId).ilike('email', emailNorm.replace(/[%_\\]/g, '\\$&')).is('deleted_at', null)
    if (error) fallo('buscar comprador por email', error)
    candidatos.push(...((data ?? []) as CompradorExistente[]))
  }
  const decision = decidirComprador(candidatos, { telefono: e.telefono, email: emailNorm })
  if (decision.accion === 'reusar') {
    // Un UPDATE por campo, cada uno con su propia guarda `.is('<campo>', null)`:
    // si dos pedidos llegan a la vez y los dos quieren completar el mismo
    // hueco, el segundo UPDATE no encuentra fila (ya no es null) y no pisa lo
    // que acaba de escribir el primero.
    if (decision.completar.phone) {
      const { error } = await db.from('property_leads').update({ phone: decision.completar.phone })
        .eq('id', decision.leadId).is('phone', null)
      if (error) fallo('completar teléfono del comprador', error)
    }
    if (decision.completar.email) {
      const { error } = await db.from('property_leads').update({ email: decision.completar.email })
        .eq('id', decision.leadId).is('email', null)
      if (error) fallo('completar email del comprador', error)
    }
    return decision.leadId
  }
  // Nace 'new' siempre; si después se le crea una visita, marcarCompradorAgendado la pasa
  // a 'scheduled' (ver ahí por qué no se hace acá).
  const { data, error } = await db.from('property_leads').insert({
    property_id: e.propertyId, name: e.nombre, phone: e.telefono, email: emailNorm,
    message: e.mensaje, source: e.source, assigned_to: e.asignadoA, status: 'new',
  }).select('id').single()
  if (error || !data) fallo('crear comprador', error)
  return String((data as { id: string }).id)
}

export async function completarTelefonoDelRegistro(leadId: string, telefono: string): Promise<void> {
  const { error } = await sb().from('property_leads').update({ phone: telefono }).eq('id', leadId).is('phone', null)
  if (error) fallo('completar teléfono', error)
}

export interface FilaVisitaNueva {
  property_id: string
  advisor_id: string
  client_name: string
  client_email: string | null
  client_phone: string
  scheduled_at: string
  status: Extract<EstadoVisita, 'pending_confirmation' | 'scheduled'>
  notes: string | null
  origin: OrigenVisita
  origin_detail: string | null
  lead_id: string
  portal_inquiry_id: string | null
  created_by: string
  changed_by: string
}

export async function insertarVisita(fila: FilaVisitaNueva): Promise<string> {
  const { data, error } = await sb().from('property_visits').insert(fila).select('id').single()
  if (error || !data) fallo('crear visita', error)
  return String((data as { id: string }).id)
}

const SELECT_VISITA = `
  id, property_id, advisor_id, created_by, lead_id, portal_inquiry_id, client_name, client_email,
  client_phone, scheduled_at, status, origin, origin_detail, notes, completion_notes, outcome_reason,
  advisor_interest, confirmed_at, outcome_at, reschedule_count, created_at, updated_at, created_by_ai,
  property:properties(id, address, neighborhood, photos),
  advisor:profiles!property_visits_advisor_id_fkey(id, full_name),
  lead:property_leads!property_visits_lead_id_fkey(id, name, lead_number),
  consulta:portal_inquiries!property_visits_portal_inquiry_id_fkey(id, portal, received_at)`

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export async function leerVisita(id: string): Promise<VisitaDetalle | null> {
  const { data, error } = await sb().from('property_visits').select(SELECT_VISITA).eq('id', id).maybeSingle()
  if (error) fallo('leer visita', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const p = uno<Record<string, unknown>>(r.property as Record<string, unknown> | null)
  // Armado EXPLÍCITO campo por campo: ni la fila cruda (con `property`/`advisor`/
  // `lead`/`consulta` tal como los devuelve PostgREST) ni un `as unknown as`
  // viajan afuera de esta función — solo lo que `VisitaDetalle` declara.
  return {
    id: String(r.id),
    property_id: String(r.property_id),
    advisor_id: (r.advisor_id as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    lead_id: (r.lead_id as string | null) ?? null,
    portal_inquiry_id: (r.portal_inquiry_id as string | null) ?? null,
    client_name: String(r.client_name ?? ''),
    client_email: (r.client_email as string | null) ?? null,
    client_phone: (r.client_phone as string | null) ?? null,
    scheduled_at: String(r.scheduled_at),
    status: r.status as VisitaDetalle['status'],
    origin: (r.origin as VisitaDetalle['origin']) ?? null,
    origin_detail: (r.origin_detail as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    completion_notes: (r.completion_notes as string | null) ?? null,
    outcome_reason: (r.outcome_reason as VisitaDetalle['outcome_reason']) ?? null,
    advisor_interest: (r.advisor_interest as VisitaDetalle['advisor_interest']) ?? null,
    confirmed_at: (r.confirmed_at as string | null) ?? null,
    outcome_at: (r.outcome_at as string | null) ?? null,
    reschedule_count: Number(r.reschedule_count ?? 0),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    created_by_ai: Boolean(r.created_by_ai),
    propiedad: p ? { id: String(p.id), address: String(p.address ?? ''), neighborhood: (p.neighborhood as string | null) ?? null, foto: primeraFotoUsable(p.photos) } : null,
    asesor: uno(r.advisor as VisitaDetalle['asesor']),
    comprador: uno(r.lead as VisitaDetalle['comprador']),
    consulta: uno(r.consulta as VisitaDetalle['consulta']),
  }
}

export async function eventosDeLaVisita(id: string): Promise<EventoVisitaR[]> {
  const { data, error } = await sb().from('property_visit_events')
    .select(`id, kind, from_status, to_status, from_scheduled_at, to_scheduled_at, reason, note, created_at,
      actor:profiles!property_visit_events_actor_id_fkey(full_name),
      desde:profiles!property_visit_events_from_advisor_id_fkey(full_name),
      hacia:profiles!property_visit_events_to_advisor_id_fkey(full_name)`)
    .eq('visit_id', id).order('created_at', { ascending: true })
  if (error) fallo('leer historial', error)
  return ((data ?? []) as Record<string, unknown>[]).map(e => ({
    id: String(e.id), kind: String(e.kind),
    from_status: (e.from_status as string | null) ?? null, to_status: (e.to_status as string | null) ?? null,
    from_scheduled_at: (e.from_scheduled_at as string | null) ?? null, to_scheduled_at: (e.to_scheduled_at as string | null) ?? null,
    reason: (e.reason as string | null) ?? null, note: (e.note as string | null) ?? null,
    created_at: String(e.created_at),
    actor: uno(e.actor as { full_name: string } | null)?.full_name ?? null,
    desde_asesor: uno(e.desde as { full_name: string } | null)?.full_name ?? null,
    hacia_asesor: uno(e.hacia as { full_name: string } | null)?.full_name ?? null,
  }))
}

/**
 * Concurrencia optimista POR VERSIÓN: la fila se actualiza SOLO si su
 * `updated_at` sigue siendo exactamente el que se leyó. `updated_at` lo
 * mantiene el trigger `trg_property_visits_updated_at` (se toca en CUALQUIER
 * UPDATE, no solo cuando cambia `status`), así que es una versión real de la
 * fila — comparar contra el `status` leído no alcanzaría: dos acciones que no
 * tocan el status (p. ej. reprogramar dos veces seguidas, o cambiar el asesor
 * mientras alguien más reprograma) podrían pisarse sin que esa guarda lo note.
 * Si otra persona cambió la fila en el medio —tocando CUALQUIER columna—,
 * `updated_at` ya no coincide y no se pisa nada.
 */
export async function actualizarVisita(
  id: string, versionLeida: string, patch: PatchVisita, actorId: string,
): Promise<{ ok: true } | { ok: false; motivo: 'cambio_concurrente' }> {
  const { data, error } = await sb().from('property_visits')
    .update({ ...patch, changed_by: actorId })
    .eq('id', id).eq('updated_at', versionLeida)
    .select('id').maybeSingle()
  if (error) fallo('actualizar visita', error)
  return data ? { ok: true } : { ok: false, motivo: 'cambio_concurrente' }
}

export async function visitasDelDia(f: { fecha: string; asesorId: string | null; propiedadId: string }): Promise<VisitaAgendaR[]> {
  exigirUuid(f.propiedadId, 'propiedadId')
  if (f.asesorId) exigirUuid(f.asesorId, 'asesorId')
  const desde = inicioDelDiaArgentina(f.fecha)
  const hasta = finDelDiaArgentina(f.fecha)
  const filtroDuenio = f.asesorId ? `advisor_id.eq.${f.asesorId},property_id.eq.${f.propiedadId}` : `property_id.eq.${f.propiedadId}`
  const { data, error } = await sb().from('property_visits')
    .select('id, scheduled_at, property_id, advisor_id, property:properties(address)')
    .in('status', [...ESTADOS_ACTIVOS]).gte('scheduled_at', desde).lte('scheduled_at', hasta)
    .or(filtroDuenio)
  if (error) fallo('visitas del día', error)
  return ((data ?? []) as Record<string, unknown>[]).map(v => ({
    id: String(v.id), scheduled_at: String(v.scheduled_at), property_id: String(v.property_id),
    advisor_id: (v.advisor_id as string | null) ?? null,
    address: uno(v.property as { address: string } | null)?.address ?? null,
  }))
}

export async function origenDeLead(leadId: string): Promise<OrigenDerivado | null> {
  const { data, error } = await sb().from('property_leads').select('source, utm').eq('id', leadId).maybeSingle()
  if (error) fallo('leer origen del comprador', error)
  if (!data) return null
  return origenDesdeLead(data as { source: string | null; utm: unknown })
}

export async function asesorAsignable(id: string): Promise<boolean> {
  return esAsesorAsignable(sb(), id)
}

// ───────────────────────── Listado de la sección Visitas (Entrega 2) ─────────────────────────

export interface FiltroConsultaVisitas {
  alcance: Alcance
  asesorId?: string | null
  propiedadId?: string | null
  origen?: FiltroOrigen | null
  estados?: readonly EstadoVisita[] | null
  /** Instantes ISO inclusivos sobre `scheduled_at`. */
  desde?: string | null
  hasta?: string | null
}

/** PostgREST corta TODA respuesta en 1000 filas sin avisar (CLAUDE.md § tope de 1000 filas). */
export const TAMANO_PAGINA_BASE = 1000
/** 20.000 visitas: muy por encima de cualquier período de un año de esta inmobiliaria. */
export const MAX_PAGINAS_BASE = 20

const SELECT_LISTADO = `
  id, property_id, advisor_id, created_by, client_name, client_phone, status, origin, origin_detail,
  outcome_reason, scheduled_at, created_at, updated_at, confirmed_at, outcome_at,
  property:properties(address, neighborhood, asking_price, currency),
  advisor:profiles!property_visits_advisor_id_fkey(full_name),
  lead:property_leads!property_visits_lead_id_fkey(created_at),
  consulta:portal_inquiries!property_visits_portal_inquiry_id_fkey(received_at, created_at),
  encuesta:visit_surveys!visit_surveys_visit_id_fkey(sent_at, completed_at, expires_at, liked, price_opinion,
    offer_amount, offer_currency, offer_declined, most_liked_tags, least_liked_tags, most_liked_other, least_liked_other)`

function textoONulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function motivoONulo(v: unknown): VisitaListado['outcome_reason'] {
  return typeof v === 'string' && (MOTIVOS_NO_REALIZADA as readonly string[]).includes(v)
    ? MOTIVOS_NO_REALIZADA.find(m => m === v) ?? null
    : null
}

function numeroPositivo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** La encuesta embebida (1 a 1 por UNIQUE visit_id; PostgREST puede mandarla como objeto o lista). */
function aEncuestaListado(e: Record<string, unknown> | null): EncuestaListado | null {
  if (!e) return null
  return {
    sent_at: textoONulo(e.sent_at),
    completed_at: textoONulo(e.completed_at),
    expires_at: String(e.expires_at ?? ''),
    liked: typeof e.liked === 'boolean' ? e.liked : null,
    price_opinion: OPINIONES_PRECIO.find(p => p === e.price_opinion) ?? null,
    offer_amount: numeroPositivo(e.offer_amount),
    offer_currency: MONEDAS.find(m => m === e.offer_currency) ?? null,
    offer_declined: typeof e.offer_declined === 'boolean' ? e.offer_declined : null,
    most_liked_tags: listaDeTextos(e.most_liked_tags),
    least_liked_tags: listaDeTextos(e.least_liked_tags),
    most_liked_other: textoONulo(e.most_liked_other),
    least_liked_other: textoONulo(e.least_liked_other),
  }
}

/** Campo por campo: la fila cruda de PostgREST (con sus joins anidados) no sale de acá. */
function aListado(r: Record<string, unknown>): VisitaListado {
  const p = uno<Record<string, unknown>>(r.property as Record<string, unknown> | null)
  const a = uno(r.advisor as { full_name?: unknown } | null)
  const l = uno(r.lead as { created_at?: unknown } | null)
  const c = uno(r.consulta as { received_at?: unknown; created_at?: unknown } | null)
  if (!esEstadoVisita(r.status)) throw new Error(`listar visitas: estado desconocido "${String(r.status)}"`)
  return {
    id: String(r.id),
    property_id: String(r.property_id),
    direccion: textoONulo(p?.address),
    barrio: textoONulo(p?.neighborhood),
    advisor_id: textoONulo(r.advisor_id),
    asesor_nombre: textoONulo(a?.full_name),
    created_by: textoONulo(r.created_by),
    client_name: String(r.client_name ?? ''),
    client_phone: textoONulo(r.client_phone),
    status: r.status,
    origin: esOrigenVisita(r.origin) ? r.origin : null,
    origin_detail: textoONulo(r.origin_detail),
    outcome_reason: motivoONulo(r.outcome_reason),
    scheduled_at: String(r.scheduled_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    confirmed_at: textoONulo(r.confirmed_at),
    outcome_at: textoONulo(r.outcome_at),
    consulta_recibida_at: textoONulo(c?.received_at) ?? textoONulo(c?.created_at),
    registro_creado_at: textoONulo(l?.created_at),
    precio_publicado: numeroPositivo(p?.asking_price),
    moneda_publicada: MONEDAS.find(m => m === p?.currency) ?? null,
    encuesta: aEncuestaListado(uno(r.encuesta as Record<string, unknown> | Record<string, unknown>[] | null)),
  }
}

function consultaDeVisitas(f: FiltroConsultaVisitas, conConteo: boolean) {
  let q = sb().from('property_visits').select(SELECT_LISTADO, conConteo ? { count: 'exact' } : undefined)
  if (f.alcance.tipo === 'propio') {
    // El id va CRUDO dentro del or(): validar la forma ANTES (ver exigirUuid).
    exigirUuid(f.alcance.usuarioId, 'usuarioId')
    q = q.or(`advisor_id.eq.${f.alcance.usuarioId},created_by.eq.${f.alcance.usuarioId}`)
  }
  if (f.asesorId) q = q.eq('advisor_id', f.asesorId)
  if (f.propiedadId) q = q.eq('property_id', f.propiedadId)
  if (f.origen === 'sin_origen') q = q.is('origin', null)
  else if (f.origen) q = q.eq('origin', f.origen)
  if (f.estados && f.estados.length > 0) q = q.in('status', [...f.estados])
  if (f.desde) q = q.gte('scheduled_at', f.desde)
  if (f.hasta) q = q.lte('scheduled_at', f.hasta)
  return q
}

/** Una página de la lista "Ver todas" (y de la pestaña de la ficha), con el total exacto. */
export async function listarVisitas(
  f: FiltroConsultaVisitas,
  rango: { desde: number; hasta: number },
  orden: 'asc' | 'desc',
): Promise<{ filas: VisitaListado[]; total: number }> {
  const ascending = orden === 'asc'
  const { data, error, count } = await consultaDeVisitas(f, true)
    .order('scheduled_at', { ascending }).order('id', { ascending })
    .range(rango.desde, rango.hasta)
  if (error) fallo('listar visitas', error)
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(aListado), total: count ?? 0 }
}

/**
 * TODAS las filas del filtro, de a 1000, con orden fijo y único (`scheduled_at`, `id`):
 * paginar sin orden repite o saltea filas. Para el resumen de un período largo.
 */
export async function todasLasVisitas(
  f: FiltroConsultaVisitas,
  orden: 'asc' | 'desc' = 'asc',
): Promise<{ filas: VisitaListado[]; truncado: boolean }> {
  const ascending = orden === 'asc'
  const filas: VisitaListado[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS_BASE; pagina++) {
    const desde = pagina * TAMANO_PAGINA_BASE
    const { data, error } = await consultaDeVisitas(f, false)
      .order('scheduled_at', { ascending }).order('id', { ascending })
      .range(desde, desde + TAMANO_PAGINA_BASE - 1)
    if (error) fallo('listar visitas', error)
    const lote = (data ?? []) as Record<string, unknown>[]
    filas.push(...lote.map(aListado))
    if (lote.length < TAMANO_PAGINA_BASE) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

// ───────────────────────── Recordatorio "¿se realizó?" (Entrega 2) ─────────────────────────

/** Confirmadas, sin aviso, con horario dentro de la ventana. 200 por corrida alcanza y sobra (cada hora). */
export async function visitasParaRecordar(ventana: { desde: string; hasta: string }): Promise<VisitaParaRecordar[]> {
  const { data, error } = await sb().from('property_visits')
    .select(`id, scheduled_at, status, reminder_sent_at, client_name,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(full_name, email, is_active)`)
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', ventana.desde)
    .lte('scheduled_at', ventana.hasta)
    .order('scheduled_at', { ascending: true })
    .limit(200)
  if (error) fallo('visitas para recordar', error)
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    if (!esEstadoVisita(r.status)) throw new Error(`visitas para recordar: estado desconocido "${String(r.status)}"`)
    const p = uno(r.property as { address?: unknown } | null)
    const a = uno(r.advisor as { full_name?: unknown; email?: unknown; is_active?: unknown } | null)
    return {
      id: String(r.id),
      scheduled_at: String(r.scheduled_at),
      status: r.status,
      reminder_sent_at: textoONulo(r.reminder_sent_at),
      client_name: String(r.client_name ?? ''),
      direccion: textoONulo(p?.address),
      // `is_active` ausente (perfil viejo sin la columna, join fallido) cuenta como inactivo:
      // ante la duda, no se manda. Solo `true` explícito habilita el aviso.
      asesor: a ? { nombre: textoONulo(a.full_name) ?? '', email: textoONulo(a.email), activo: a.is_active === true } : null,
    }
  })
}

/**
 * Reserva ATÓMICA: escribe la marca solo si nadie la escribió antes y la visita sigue
 * confirmada. Devuelve la marca (para poder liberarla) o `null` si otra corrida ganó.
 * No toca status/scheduled_at/advisor_id: no deja evento en el historial.
 */
export async function reservarRecordatorio(id: string, ahora: Date): Promise<string | null> {
  const marca = ahora.toISOString()
  const { data, error } = await sb().from('property_visits')
    .update({ reminder_sent_at: marca })
    .eq('id', id).is('reminder_sent_at', null).eq('status', 'scheduled')
    .select('id').maybeSingle()
  if (error) fallo('reservar recordatorio', error)
  return data ? marca : null
}

/** El email no salió: se devuelve la visita a "sin aviso" para que la próxima hora reintente. Solo si sigue con SU marca. */
export async function liberarRecordatorio(id: string, marca: string): Promise<void> {
  const { error } = await sb().from('property_visits')
    .update({ reminder_sent_at: null })
    .eq('id', id).eq('reminder_sent_at', marca)
  if (error) fallo('liberar recordatorio', error)
}
