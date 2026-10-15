import 'server-only'
/**
 * Lecturas y escrituras de la encuesta con SERVICE ROLE (adenda §11.5). Sin lógica de negocio: las
 * decisiones están en los módulos puros de esta carpeta y los permisos en las rutas (que los chequean
 * ANTES de llamar acá). Las tablas no tienen políticas de escritura: este archivo es la única puerta.
 *
 * Cliente sin tipar (types/database.types.ts no tiene estas tablas): cada fila se arma campo por
 * campo con guardas. Un valor fuera de catálogo falla ruidoso: nunca un dato a medias.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { esEstadoVisita } from '../transiciones'
import { BUCKET_REGALOS, type InfoArchivoSubido } from './regalo'
import {
  COLUMNAS_DE_CANAL, ESTADOS_AVISO, ESTADOS_ENVIO, MONEDAS, MOTIVOS_OMISION, OPINIONES_PRECIO, PASOS_GUARDABLES,
  type AjustesEncuesta, type CanalAviso, type EncuestaConVisita, type EncuestaFila, type EstadoAviso, type EstadoEnvio,
  type EstadoWa, type MotivoOmision, type PropiedadDeEncuesta, type RegaloDeLaPropiedad,
} from './tipos'
import type { PatchPaso, ContactoFinal } from './respuestas'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`)
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}
function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function deCatalogo<T extends string>(v: unknown, catalogo: readonly T[]): T | null {
  return typeof v === 'string' ? catalogo.find(c => c === v) ?? null : null
}
function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

// ───────────────────────────── Ajustes ─────────────────────────────

const SELECT_AJUSTES = 'envio_automatico, solo_con_regalo, regalo_por_whatsapp, telefonos_prueba'

/** NO lanza: ante cualquier problema devuelve null y quien decide lo trata como "apagado". */
export async function leerAjustesEncuesta(): Promise<AjustesEncuesta | null> {
  try {
    const { data, error } = await sb().from('visit_survey_settings').select(SELECT_AJUSTES).eq('id', true).maybeSingle()
    if (error || !data) {
      console.error('[encuesta] no se pudieron leer los ajustes', error?.message ?? 'sin fila')
      return null
    }
    const r = data as Record<string, unknown>
    if (typeof r.envio_automatico !== 'boolean' || typeof r.solo_con_regalo !== 'boolean' || typeof r.regalo_por_whatsapp !== 'boolean') {
      console.error('[encuesta] la fila de ajustes tiene tipos inesperados')
      return null
    }
    return { envio_automatico: r.envio_automatico, solo_con_regalo: r.solo_con_regalo, regalo_por_whatsapp: r.regalo_por_whatsapp, telefonos_prueba: lista(r.telefonos_prueba) }
  } catch (e) {
    console.error('[encuesta] no se pudieron leer los ajustes', e)
    return null
  }
}

export async function guardarAjustesEncuesta(cambios: Partial<AjustesEncuesta>, actorId: string): Promise<AjustesEncuesta> {
  const { error } = await sb().from('visit_survey_settings')
    .update({ ...cambios, updated_at: new Date().toISOString(), updated_by: actorId }).eq('id', true)
  if (error) fallo('guardar ajustes de la encuesta', error)
  const leidos = await leerAjustesEncuesta()
  if (!leidos) throw new Error('guardar ajustes de la encuesta: no se pudieron releer')
  return leidos
}

// ───────────────────────────── Regalo ─────────────────────────────

const SELECT_REGALO = 'property_id, title, file_path, file_name, file_size, cover_path, updated_at'

export async function leerRegalo(propertyId: string): Promise<RegaloDeLaPropiedad | null> {
  const { data, error } = await sb().from('property_survey_gifts').select(SELECT_REGALO).eq('property_id', propertyId).maybeSingle()
  if (error) fallo('leer regalo', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const titulo = texto(r.title)
  const archivoPath = texto(r.file_path)
  const archivoNombre = texto(r.file_name)
  const archivoBytes = numero(r.file_size)
  if (!titulo || !archivoPath || !archivoNombre || archivoBytes === null) throw new Error('leer regalo: fila incompleta')
  return { propertyId: String(r.property_id), titulo, archivoPath, archivoNombre, archivoBytes, portadaPath: texto(r.cover_path), actualizadoEl: String(r.updated_at) }
}

export interface RegaloNuevo {
  propertyId: string
  titulo: string
  archivoPath: string
  archivoNombre: string
  archivoBytes: number
  portadaPath: string | null
  actorId: string
}

/** `onConflict: 'property_id'`: es la PK (CLAUDE.md: upsert con onConflict ⇒ UNIQUE en la base). */
export async function guardarRegalo(r: RegaloNuevo): Promise<void> {
  const { error } = await sb().from('property_survey_gifts').upsert({
    property_id: r.propertyId, title: r.titulo, file_path: r.archivoPath, file_name: r.archivoNombre,
    file_size: r.archivoBytes, cover_path: r.portadaPath, updated_at: new Date().toISOString(), updated_by: r.actorId,
  }, { onConflict: 'property_id' })
  if (error) fallo('guardar regalo', error)
}

export async function borrarRegalo(propertyId: string): Promise<void> {
  const { error } = await sb().from('property_survey_gifts').delete().eq('property_id', propertyId)
  if (error) fallo('borrar regalo', error)
}

// ───────────────────────────── Storage (bucket privado) ─────────────────────────────

export async function crearSubidaFirmada(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS).createSignedUploadUrl(path)
  if (error || !data) fallo('preparar la subida', error)
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function existeArchivo(path: string): Promise<boolean> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS).createSignedUrl(path, 60)
  return !error && !!data?.signedUrl
}

/**
 * Tamaño y `mimetype` REALES del objeto ya subido (ronda 1 de revisión, 2026-10-15): nunca lo que
 * declaró el navegador al pedir la URL firmada. `null` si el objeto no existe (la subida no
 * terminó) o si Storage no pudo listarlo.
 */
export async function infoArchivo(path: string): Promise<InfoArchivoSubido | null> {
  const i = path.lastIndexOf('/')
  const carpeta = i === -1 ? '' : path.slice(0, i)
  const nombreArchivo = i === -1 ? path : path.slice(i + 1)
  const { data, error } = await sb().storage.from(BUCKET_REGALOS).list(carpeta, { search: nombreArchivo })
  if (error || !data) return null
  const fila = (data as Array<{ name: string; metadata?: Record<string, unknown> | null }>).find(f => f.name === nombreArchivo)
  if (!fila) return null
  const bytes = numero(fila.metadata?.size)
  if (bytes === null) return null
  const mimetype = fila.metadata?.mimetype
  return { bytes, mimetype: typeof mimetype === 'string' ? mimetype : null }
}

/** NO lanza: sin URL, quien llama responde 503 o deja el canal pendiente. */
export async function urlFirmada(path: string, segundos: number, descarga?: string): Promise<string | null> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS)
    .createSignedUrl(path, segundos, descarga ? { download: descarga } : undefined)
  if (error || !data?.signedUrl) {
    console.error('[encuesta] no se pudo firmar', path, error?.message ?? 'sin url')
    return null
  }
  return data.signedUrl
}

/** Best-effort: un archivo viejo que no se pudo borrar es costo, no un error para la persona. */
export async function borrarArchivos(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await sb().storage.from(BUCKET_REGALOS).remove(paths)
  if (error) console.error('[encuesta] no se pudieron borrar archivos viejos del regalo', paths, error.message)
}

// ───────────────────────────── Encuesta ─────────────────────────────

const SELECT_ENCUESTA = `id, visit_id, token, expires_at, created_at, updated_at, send_status, send_skip_reason,
  send_error, sent_at, sent_to, wa_message_id, opened_at, open_count, last_step, completed_at, liked,
  most_liked_tags, most_liked_other, least_liked_tags, least_liked_other, price_opinion, offer_amount,
  offer_currency, offer_declined, contact_phone, contact_email, wants_similar, team_notice_status,
  gift_whatsapp_status, gift_email_status, gift_wa_message_id, notice_attempts, notice_error, gift_downloaded_at`

const SELECT_CON_VISITA = `${SELECT_ENCUESTA},
  visita:property_visits!visit_surveys_visit_id_fkey(id, property_id, client_name, client_phone, scheduled_at,
    status, advisor_id, lead_id,
    propiedad:properties(id, address, neighborhood, photos, asking_price, currency, property_type, amenities,
      garages, floor, expensas))`

function aviso(v: unknown, campo: string): EstadoAviso {
  const e = deCatalogo(v, ESTADOS_AVISO)
  if (!e) throw new Error(`encuesta: ${campo} desconocido "${String(v)}"`)
  return e
}

function aEncuesta(r: Record<string, unknown>): EncuestaFila {
  const send_status: EstadoEnvio | null = deCatalogo(r.send_status, ESTADOS_ENVIO)
  if (!send_status) throw new Error(`encuesta: estado de envío desconocido "${String(r.send_status)}"`)
  const motivo: MotivoOmision | null = deCatalogo(r.send_skip_reason, MOTIVOS_OMISION)
  return {
    id: String(r.id),
    visit_id: String(r.visit_id),
    token: String(r.token),
    expires_at: String(r.expires_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    send_status,
    send_skip_reason: motivo,
    send_error: texto(r.send_error),
    sent_at: texto(r.sent_at),
    sent_to: texto(r.sent_to),
    wa_message_id: texto(r.wa_message_id),
    opened_at: texto(r.opened_at),
    open_count: numero(r.open_count) ?? 0,
    last_step: deCatalogo(r.last_step, PASOS_GUARDABLES),
    completed_at: texto(r.completed_at),
    liked: booleano(r.liked),
    most_liked_tags: lista(r.most_liked_tags),
    most_liked_other: texto(r.most_liked_other),
    least_liked_tags: lista(r.least_liked_tags),
    least_liked_other: texto(r.least_liked_other),
    price_opinion: deCatalogo(r.price_opinion, OPINIONES_PRECIO),
    offer_amount: numero(r.offer_amount),
    offer_currency: deCatalogo(r.offer_currency, MONEDAS),
    offer_declined: booleano(r.offer_declined),
    contact_phone: texto(r.contact_phone),
    contact_email: texto(r.contact_email),
    wants_similar: booleano(r.wants_similar),
    team_notice_status: aviso(r.team_notice_status, 'team_notice_status'),
    gift_whatsapp_status: aviso(r.gift_whatsapp_status, 'gift_whatsapp_status'),
    gift_email_status: aviso(r.gift_email_status, 'gift_email_status'),
    gift_wa_message_id: texto(r.gift_wa_message_id),
    notice_attempts: numero(r.notice_attempts) ?? 0,
    notice_error: texto(r.notice_error),
    gift_downloaded_at: texto(r.gift_downloaded_at),
  }
}

function aPropiedad(p: Record<string, unknown>): PropiedadDeEncuesta {
  return {
    id: String(p.id),
    address: String(p.address ?? ''),
    neighborhood: texto(p.neighborhood),
    photos: p.photos ?? [],
    asking_price: numero(p.asking_price),
    currency: texto(p.currency),
    property_type: texto(p.property_type),
    amenities: p.amenities ?? [],
    garages: numero(p.garages),
    floor: numero(p.floor),
    expensas: numero(p.expensas),
  }
}

export async function asegurarEncuesta(f: { visitId: string; token: string; expiresAt: string; actorId: string | null }): Promise<EncuestaFila> {
  // UNIQUE(visit_id) existe: si ya hay encuesta no se pisa nada (el link es UNO por visita).
  const { error } = await sb().from('visit_surveys')
    .upsert({ visit_id: f.visitId, token: f.token, expires_at: f.expiresAt, created_by: f.actorId }, { onConflict: 'visit_id', ignoreDuplicates: true })
  if (error) fallo('crear encuesta', error)
  const fila = await leerEncuestaDeVisita(f.visitId)
  if (!fila) throw new Error('crear encuesta: la fila no quedó')
  return fila
}

export async function leerEncuestaDeVisita(visitId: string): Promise<EncuestaFila | null> {
  const { data, error } = await sb().from('visit_surveys').select(SELECT_ENCUESTA).eq('visit_id', visitId).maybeSingle()
  if (error) fallo('leer encuesta', error)
  return data ? aEncuesta(data as Record<string, unknown>) : null
}

export async function leerEncuestaConVisita(por: { token: string } | { id: string } | { visitId: string }): Promise<EncuestaConVisita | null> {
  let q = sb().from('visit_surveys').select(SELECT_CON_VISITA)
  if ('token' in por) q = q.eq('token', por.token)
  else if ('id' in por) q = q.eq('id', por.id)
  else q = q.eq('visit_id', por.visitId)
  const { data, error } = await q.maybeSingle()
  if (error) fallo('leer encuesta', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const v = uno(r.visita as Record<string, unknown> | Record<string, unknown>[] | null)
  if (!v) return null
  if (!esEstadoVisita(v.status)) throw new Error(`leer encuesta: estado de visita desconocido "${String(v.status)}"`)
  const p = uno(v.propiedad as Record<string, unknown> | Record<string, unknown>[] | null)
  return {
    encuesta: aEncuesta(r),
    visita: {
      id: String(v.id),
      property_id: String(v.property_id),
      client_name: String(v.client_name ?? ''),
      client_phone: texto(v.client_phone),
      scheduled_at: String(v.scheduled_at),
      status: v.status,
      advisor_id: texto(v.advisor_id),
      lead_id: texto(v.lead_id),
      propiedad: p ? aPropiedad(p) : null,
    },
  }
}

export interface CamposEnvio {
  send_status: EstadoEnvio
  send_skip_reason: MotivoOmision | null
  send_error: string | null
  sent_at?: string | null
  sent_to?: string | null
  wa_message_id?: string | null
}

export async function registrarEnvio(id: string, c: CamposEnvio): Promise<void> {
  const cambios = { ...c, send_error: c.send_error ? c.send_error.slice(0, 500) : null }
  const { error } = await sb().from('visit_surveys').update(cambios).eq('id', id)
  if (error) fallo('registrar envío de la encuesta', error)
}

/**
 * Candado de corta duración (ronda 1 de revisión, Tarea 8): un doble toque de "Reenviar", o dos
 * personas haciéndolo casi al mismo tiempo, disparaban DOS llamadas a Meta en paralelo —las dos
 * ven la misma decisión porque todavía no hay nada escrito que la frene. UPDATE condicional,
 * atómico en Postgres (mismo patrón que `reservarCelda` de `lib/mapa/actualizar-celda.ts`): solo
 * quien encuentra el candado libre (NULL o vencido) lo toma. Liberar con `liberarEnvio`; si la
 * función muere a mitad, el candado vence solo.
 */
export async function reservarEnvio(id: string, segundos: number): Promise<boolean> {
  const ahora = new Date()
  const { data, error } = await sb().from('visit_surveys')
    .update({ send_lock_until: new Date(ahora.getTime() + segundos * 1000).toISOString() })
    .eq('id', id).or(`send_lock_until.is.null,send_lock_until.lt."${ahora.toISOString()}"`).select('id')
  if (error) fallo('reservar el envío de la encuesta', error)
  return ((data ?? []) as Array<{ id: unknown }>).length > 0
}

/** Best-effort: si no se pudo liberar, el candado igual vence solo a los `segundos` de reservado. */
export async function liberarEnvio(id: string): Promise<void> {
  const { error } = await sb().from('visit_surveys').update({ send_lock_until: null }).eq('id', id)
  if (error) console.error('[encuesta] no se pudo liberar el candado de envío (vence solo)', id, error.message)
}

/** NO lanza: sin estado del webhook, la ficha dice "Enviada" (lo último que se sabe con certeza). */
export async function estadoDelMensaje(waMessageId: string): Promise<EstadoWa | null> {
  const { data, error } = await sb().from('whatsapp_messages').select('status, error_code, error_message')
    .eq('wa_message_id', waMessageId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) {
    if (error) console.error('[encuesta] no se pudo leer el estado del mensaje', error.message)
    return null
  }
  const r = data as Record<string, unknown>
  return { status: String(r.status ?? ''), error_code: texto(r.error_code), error_message: texto(r.error_message) }
}

/** Tope de escrituras por link (spec §4.10 "límite por token"): sobra para 5 preguntas con idas y vueltas. */
export const MAX_ESCRITURAS_POR_LINK = 200

export async function registrarUso(token: string, tipo: 'abierta' | 'escritura'): Promise<boolean> {
  const { data, error } = await sb().rpc('visit_survey_registrar', { p_token: token, p_tipo: tipo, p_max: MAX_ESCRITURAS_POR_LINK })
  if (error) fallo('registrar uso de la encuesta', error)
  return data === true
}

export async function guardarPaso(id: string, patch: PatchPaso, ahora: Date): Promise<boolean> {
  const { data, error } = await sb().from('visit_surveys').update(patch)
    .eq('id', id).is('completed_at', null).gt('expires_at', ahora.toISOString())
    .select('id').maybeSingle()
  if (error) fallo('guardar respuesta', error)
  return !!data
}

/** Reserva ATÓMICA del final: solo la primera llamada encuentra `completed_at IS NULL`. */
export async function completarEncuesta(id: string, contacto: ContactoFinal, ahora: Date): Promise<EncuestaFila | null> {
  const { data, error } = await sb().from('visit_surveys')
    .update({ ...contacto, completed_at: ahora.toISOString() })
    .eq('id', id).is('completed_at', null).gt('expires_at', ahora.toISOString())
    .select(SELECT_ENCUESTA).maybeSingle()
  if (error) fallo('completar encuesta', error)
  return data ? aEncuesta(data as Record<string, unknown>) : null
}

export async function reservarAviso(id: string, canal: CanalAviso): Promise<boolean> {
  const col = COLUMNAS_DE_CANAL[canal]
  const { data, error } = await sb().from('visit_surveys')
    .update({ [col.estado]: 'enviando', [col.momento]: new Date().toISOString() })
    .eq('id', id).eq(col.estado, 'pendiente').not('completed_at', 'is', null)
    .select('id').maybeSingle()
  if (error) fallo('reservar aviso', error)
  return !!data
}

export async function cerrarAviso(
  id: string,
  canal: CanalAviso,
  estado: 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente',
  extra: { error?: string | null; waMessageId?: string | null; intentos?: number } = {},
): Promise<void> {
  const col = COLUMNAS_DE_CANAL[canal]
  const cambios: Record<string, unknown> = { [col.estado]: estado }
  if (extra.error !== undefined) cambios.notice_error = extra.error ? extra.error.slice(0, 500) : null
  if (extra.waMessageId !== undefined) cambios.gift_wa_message_id = extra.waMessageId
  if (extra.intentos !== undefined) cambios.notice_attempts = extra.intentos
  const { error } = await sb().from('visit_surveys').update(cambios).eq('id', id).eq(col.estado, 'enviando')
  if (error) fallo('cerrar aviso', error)
}

export async function encuestasConAvisosPendientes(
  rango: { desde: string; hasta: string }, maxIntentos: number, limite = 20,
): Promise<string[]> {
  const { data, error } = await sb().from('visit_surveys').select('id')
    .gte('completed_at', rango.desde).lte('completed_at', rango.hasta).lt('notice_attempts', maxIntentos)
    .or('team_notice_status.eq.pendiente,gift_whatsapp_status.eq.pendiente,gift_email_status.eq.pendiente')
    .order('completed_at', { ascending: true }).limit(limite)
  if (error) fallo('buscar avisos pendientes', error)
  return ((data ?? []) as Array<{ id: unknown }>).map(r => String(r.id))
}

export async function marcarRegaloDescargado(id: string): Promise<void> {
  const { error } = await sb().from('visit_surveys').update({ gift_downloaded_at: new Date().toISOString() })
    .eq('id', id).is('gift_downloaded_at', null)
  if (error) console.error('[encuesta] no se pudo marcar la descarga del regalo', id, error.message)
}
