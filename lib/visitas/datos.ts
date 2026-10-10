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
import { origenDesdeLead, type OrigenDerivado, type OrigenVisita } from './origen'
import { ESTADOS_ACTIVOS, type EstadoVisita, type PatchVisita } from './transiciones'
import type { ConsultaR, RegistroR, VisitaActivaR, VisitaAgendaR, VisitaDetalle, EventoVisitaR } from './tipos'

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

/** Captadas y disponibles/reservadas. `asesorId` acota (rol asesor). */
export async function buscarPropiedadesParaVisita(f: { q?: string; id?: string; asesorId?: string }): Promise<PropiedadParaVisita[]> {
  let q = sb().from('properties').select(COLUMNAS_PROPIEDAD)
    .eq('status', 'approved').in('commercial_status', ['disponible', 'reservada'])
    .order('address').limit(20)
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
  /**
   * Estado con el que queda el comprador. La ventana de agendar manda 'scheduled': una
   * persona que ya tiene visita NO es una "consulta sin responder", y GET /api/leads/count
   * cuenta `status='new'` para el globito del Inbox y la tarjeta de /inicio. Default 'new'
   * (responder-consulta: ahí sí es una consulta nueva).
   */
  estado?: EstadoComprador
}

/** Los dos estados que este módulo escribe en `property_leads.status`. */
export type EstadoComprador = 'new' | 'scheduled'

/**
 * Pasa un comprador a 'scheduled' SOLO si hoy está 'new' (`.eq('status','new')` como
 * guarda en el mismo UPDATE): uno 'discarded' o 'contacted' lo decidió una persona y no
 * se pisa. Si no está en 'new', el UPDATE no encuentra fila y no hace nada.
 */
export async function marcarCompradorAgendado(leadId: string): Promise<void> {
  const { error } = await sb().from('property_leads').update({ status: 'scheduled' })
    .eq('id', leadId).eq('status', 'new')
  if (error) fallo('marcar comprador como agendado', error)
}

export async function asegurarComprador(e: EntradaComprador): Promise<string> {
  const estado: EstadoComprador = e.estado ?? 'new'
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
    if (estado === 'scheduled') {
      // Misma guarda que marcarCompradorAgendado: solo 'new' → 'scheduled'.
      const { error } = await db.from('property_leads').update({ status: 'scheduled' })
        .eq('id', decision.leadId).eq('status', 'new')
      if (error) fallo('marcar comprador como agendado', error)
    }
    return decision.leadId
  }
  const { data, error } = await db.from('property_leads').insert({
    property_id: e.propertyId, name: e.nombre, phone: e.telefono, email: emailNorm,
    message: e.mensaje, source: e.source, assigned_to: e.asignadoA, status: estado,
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
