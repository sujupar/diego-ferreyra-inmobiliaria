import 'server-only'
/**
 * Acceso a la base y al bucket del informe quincenal. Service role (saltea RLS): los permisos los
 * revisa la ruta con `acceso.ts` ANTES de llamar acá. Cada fila se valida al leerla: una forma
 * inesperada falla ruidoso, nunca se adivina.
 */
import { sb } from './sb'
import { BUCKET_INFORMES } from './archivos'
import type { Capturas, Competidora, Fuentes, FuenteGuardada, Informe, Manual, NombreCaptura, NombreFuente, PropiedadDelInforme } from './tipos'
import type { CambiosInforme } from './sanear'

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'sin datos'}`)
}

const SELECT = 'id, property_id, desde, hasta, origen, estado, fuentes, manual, competidoras, capturas, pdf_path, listo_at, created_at, updated_at'

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function aInforme(r: Record<string, unknown>): Informe {
  const origen = r.origen === 'ciclo' || r.origen === 'manual' ? r.origen : null
  const estado = r.estado === 'borrador' || r.estado === 'listo' ? r.estado : null
  if (!origen || !estado) throw new Error(`informe ${String(r.id)}: origen o estado desconocido`)
  return {
    id: String(r.id), propertyId: String(r.property_id), desde: String(r.desde), hasta: String(r.hasta), origen, estado,
    fuentes: objeto(r.fuentes) as Fuentes, manual: objeto(r.manual) as Manual,
    competidoras: Array.isArray(r.competidoras) ? (r.competidoras as Competidora[]) : [],
    capturas: objeto(r.capturas) as Capturas, pdfPath: r.pdf_path ? String(r.pdf_path) : null,
    listoAt: r.listo_at ? String(r.listo_at) : null, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  }
}

export async function leerInforme(id: string): Promise<Informe | null> {
  const { data, error } = await sb().from('property_reports').select(SELECT).eq('id', id).maybeSingle()
  if (error) fallo('leer informe', error)
  return data ? aInforme(data as Record<string, unknown>) : null
}

export async function listarInformes(propertyId: string): Promise<Informe[]> {
  const { data, error } = await sb().from('property_reports').select(SELECT).eq('property_id', propertyId)
    .order('hasta', { ascending: false }).limit(100)
  if (error) fallo('listar informes', error)
  return (data ?? []).map(r => aInforme(r as Record<string, unknown>))
}

/**
 * Crea el borrador con todas las fuentes en `pendiente`. Si ya existe uno para ese período
 * (UNIQUE), devuelve ESE: el cron y "Nuevo informe" pueden pedir el mismo período.
 */
export async function crearInforme(f: { propertyId: string; desde: string; hasta: string; origen: 'ciclo' | 'manual'; creadoPor: string | null; fuentes: Fuentes }): Promise<{ informe: Informe; nuevo: boolean }> {
  const { data, error } = await sb().from('property_reports').insert({
    property_id: f.propertyId, desde: f.desde, hasta: f.hasta, origen: f.origen, created_by: f.creadoPor, fuentes: f.fuentes,
  }).select(SELECT).maybeSingle()
  if (!error && data) return { informe: aInforme(data as Record<string, unknown>), nuevo: true }
  if (error && error.code !== '23505') fallo('crear informe', error)
  const existente = await sb().from('property_reports').select(SELECT).eq('property_id', f.propertyId)
    .eq('desde', f.desde).eq('hasta', f.hasta).maybeSingle()
  if (existente.error || !existente.data) fallo('leer el informe existente', existente.error)
  return { informe: aInforme(existente.data as Record<string, unknown>), nuevo: false }
}

/** El informe más reciente de la propiedad que terminó antes de que empiece este (para mostrar la evolución). */
export async function leerInformeAnterior(propertyId: string, desde: string): Promise<Informe | null> {
  const { data, error } = await sb().from('property_reports').select(SELECT).eq('property_id', propertyId)
    .lt('hasta', desde).order('hasta', { ascending: false }).limit(1).maybeSingle()
  if (error) fallo('leer el informe anterior', error)
  return data ? aInforme(data as Record<string, unknown>) : null
}

/** Atómico (RPC): no pisa otra fuente guardada a la vez. false = el informe ya está "listo". */
export async function guardarFuente(id: string, nombre: NombreFuente, valor: FuenteGuardada<unknown>): Promise<boolean> {
  const { data, error } = await sb().rpc('informe_guardar_fuente', { p_id: id, p_fuente: nombre, p_valor: valor })
  if (error) fallo('guardar fuente del informe', error)
  return data === true
}

/** Solo borradores: un informe "listo" ya tiene su PDF y no se toca. */
export async function guardarCambios(id: string, c: CambiosInforme): Promise<boolean> {
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (c.manual) cambios.manual = c.manual
  if (c.competidoras) cambios.competidoras = c.competidoras
  const { data, error } = await sb().from('property_reports').update(cambios).eq('id', id).eq('estado', 'borrador').select('id')
  if (error) fallo('guardar el informe', error)
  return (data ?? []).length > 0
}

/**
 * Guarda (o quita, con `path` null) UNA captura de forma atómica en la base: dos subidas a la vez
 * ya no se pisan. Devuelve las capturas que quedaron y la anterior de esa clave (para borrar el
 * archivo viejo). null = el informe ya está "listo".
 */
export async function guardarCaptura(id: string, cual: NombreCaptura, path: string | null): Promise<{ capturas: Capturas; anterior: string | null } | null> {
  const { data, error } = await sb().rpc('informe_guardar_captura', { p_id: id, p_cual: cual, p_path: path })
  if (error) fallo('guardar captura', error)
  if (data === null) return null
  const r = objeto(data)
  return { capturas: objeto(r.capturas) as Capturas, anterior: typeof r.anterior === 'string' ? r.anterior : null }
}

/**
 * Condicionado a la VERSIÓN (`updated_at`) con la que se armó el PDF: si algo cambió mientras el
 * navegador lo generaba (un campo, una fuente, otra pestaña), no se marca y el PDF no queda
 * distinto de los datos guardados. La versión se compara como la devolvió la base, sin re-serializar.
 */
export async function marcarListo(id: string, pdfPath: string, userId: string, version: string): Promise<boolean> {
  const ahora = new Date().toISOString()
  const { data, error } = await sb().from('property_reports')
    .update({ estado: 'listo', pdf_path: pdfPath, listo_at: ahora, listo_by: userId, updated_at: ahora })
    .eq('id', id).eq('estado', 'borrador').eq('updated_at', version).select('id')
  if (error) fallo('marcar listo', error)
  return (data ?? []).length > 0
}

/** "Volver a borrador": para corregir un informe ya listo (el PDF viejo queda, se reemplaza al volver a marcarlo). */
export async function volverABorrador(id: string): Promise<boolean> {
  const { data, error } = await sb().from('property_reports')
    .update({ estado: 'borrador', listo_at: null, listo_by: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('estado', 'listo').select('id')
  if (error) fallo('volver a borrador', error)
  return (data ?? []).length > 0
}

// ─── La propiedad (lo que muestran la pantalla y el PDF) ─────────────────────


function numeroONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function leerPropiedad(propertyId: string): Promise<PropiedadDelInforme | null> {
  const { data, error } = await sb().from('properties')
    .select('id, address, neighborhood, city, property_type, asking_price, currency, captured_at, photos, total_area, covered_area, rooms')
    .eq('id', propertyId).maybeSingle()
  if (error) fallo('leer la propiedad', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const fotos = Array.isArray(r.photos) ? (r.photos as unknown[]).filter((f): f is string => typeof f === 'string' && f.startsWith('https://')) : []
  return {
    id: String(r.id), direccion: String(r.address ?? ''), barrio: r.neighborhood ? String(r.neighborhood) : null,
    ciudad: r.city ? String(r.city) : null, tipo: r.property_type ? String(r.property_type) : null,
    precio: typeof r.asking_price === 'number' ? r.asking_price : r.asking_price ? Number(r.asking_price) : null,
    moneda: r.currency ? String(r.currency) : null, capturadaEl: r.captured_at ? String(r.captured_at) : null,
    foto: fotos[0] ?? null,
    m2: numeroONull(r.total_area) ?? numeroONull(r.covered_area),
    ambientes: numeroONull(r.rooms),
  }
}

// ─── Bucket privado ──────────────────────────────────────────────────────────

export async function crearSubidaFirmada(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await sb().storage.from(BUCKET_INFORMES).createSignedUploadUrl(path)
  if (error || !data) fallo('preparar la subida', error)
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

/** Primeros bytes del objeto subido (la firma real del archivo). null = no existe o Storage no respondió. */
export async function primerosBytes(path: string, n: number): Promise<{ bytes: Uint8Array; tamano: number } | null> {
  const { data, error } = await sb().storage.from(BUCKET_INFORMES).download(path)
  if (error || !data) return null
  const buf = await data.arrayBuffer()
  return { bytes: new Uint8Array(buf.slice(0, n)), tamano: buf.byteLength }
}

export async function urlFirmada(path: string, segundos: number, descarga?: string): Promise<string | null> {
  const { data, error } = await sb().storage.from(BUCKET_INFORMES).createSignedUrl(path, segundos, descarga ? { download: descarga } : undefined)
  if (error || !data?.signedUrl) {
    console.error('[informes] no se pudo firmar', path, error?.message ?? 'sin url')
    return null
  }
  return data.signedUrl
}

export async function borrarArchivos(paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await sb().storage.from(BUCKET_INFORMES).remove(paths)
  if (error) console.error('[informes] no se pudieron borrar archivos viejos', paths, error.message)
}
