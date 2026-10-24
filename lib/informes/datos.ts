import 'server-only'
/**
 * Acceso a la base y al bucket del informe quincenal. Service role (saltea RLS): los permisos los
 * revisa la ruta con `acceso.ts` ANTES de llamar acá. Cada fila se valida al leerla: una forma
 * inesperada falla ruidoso, nunca se adivina.
 */
import { sb } from './sb'
import { normalizarDisposicion, normalizarEstado } from './competencia/caracteristicas'
import { BUCKET_INFORMES } from './archivos'
import { actualizarFormaVieja } from './forma-vieja'
import { FUENTES, type CandidatasGuardadas, type Capturas, type Competidora, type Fuentes, type FuenteGuardada, type Informe, type Manual, type NombreCaptura, type NombreFuente, type PropiedadDelInforme } from './tipos'
import type { InformeDelPeriodo, PropiedadDelCiclo } from './ciclo-servicio'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import type { CambiosInforme } from './sanear'

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'sin datos'}`)
}

const SELECT = 'id, property_id, desde, hasta, origen, estado, fuentes, manual, competidoras, candidatas, capturas, pdf_path, listo_at, created_at, updated_at'

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function aInforme(r: Record<string, unknown>): Informe {
  const origen = r.origen === 'ciclo' || r.origen === 'manual' ? r.origen : null
  const estado = r.estado === 'borrador' || r.estado === 'listo' ? r.estado : null
  if (!origen || !estado) throw new Error(`informe ${String(r.id)}: origen o estado desconocido`)
  const { fuentes, manual } = actualizarFormaVieja(objeto(r.fuentes) as Fuentes, objeto(r.manual) as Manual)
  return {
    id: String(r.id), propertyId: String(r.property_id), desde: String(r.desde), hasta: String(r.hasta), origen, estado,
    fuentes, manual,
    competidoras: Array.isArray(r.competidoras) ? (r.competidoras as Competidora[]) : [],
    candidatas: { detalles: {}, ...(objeto(r.candidatas) as Partial<CandidatasGuardadas>) },
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

/**
 * Guarda la búsqueda de UN portal (['argenprop'] / ['mercadolibre']) o el detalle de UN aviso (['detalles', url]).
 * Atómico (RPC): búsquedas y aperturas en pedidos paralelos no se pisan. false = el informe ya está "listo".
 */
export async function guardarCandidatas(id: string, camino: string[], valor: unknown): Promise<boolean> {
  const { data, error } = await sb().rpc('informe_guardar_candidatas', { p_id: id, p_camino: camino, p_valor: valor })
  if (error) fallo('guardar candidatas', error)
  return data === true
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

// ─── Ciclo automático (cron del 1 y el 16) ───────────────────────────────────

/** Las captadas, con lo que el ciclo necesita para decidir. El filtro fino (estado comercial, [TEST]) es puro. */
export async function propiedadesParaElCiclo(): Promise<PropiedadDelCiclo[]> {
  const { data, error } = await sb().from('properties')
    .select('id, title, address, status, commercial_status, captured_at').eq('status', 'approved').limit(1000)
  if (error) fallo('leer las propiedades del ciclo', error)
  return (data ?? []).map(r => ({
    id: String(r.id), titulo: r.title ? String(r.title) : null, direccion: String(r.address ?? ''), status: String(r.status),
    commercialStatus: r.commercial_status ? String(r.commercial_status) : null,
    // `captured_at` es un instante: el día que cuenta es el de Argentina (a las 22 h de Buenos Aires ya es mañana en UTC).
    capturadaEl: r.captured_at ? fechaEnArgentina(new Date(String(r.captured_at))) : null,
  }))
}

export async function informesDelPeriodo(hasta: string): Promise<InformeDelPeriodo[]> {
  const { data, error } = await sb().from('property_reports')
    .select('id, property_id, desde, origen, estado, fuentes, created_at, avisado_at').eq('hasta', hasta).limit(1000)
  if (error) fallo('leer los informes del período', error)
  return (data ?? []).map(r => {
    const f = objeto(r.fuentes) as Fuentes
    return {
      id: String(r.id), propertyId: String(r.property_id), desde: String(r.desde),
      origen: r.origen === 'ciclo' ? 'ciclo' : 'manual', estado: r.estado === 'listo' ? 'listo' : 'borrador',
      creadoEn: String(r.created_at), avisadoEn: r.avisado_at ? String(r.avisado_at) : null,
      pendientes: FUENTES.filter(n => !f[n] || f[n]?.estado === 'pendiente'),
    }
  })
}

/** UPDATE condicional: dos corridas a la vez nunca reclaman el mismo informe (no hay dos emails por él). */
export async function reclamarAviso(ids: string[], ahora: Date): Promise<string[]> {
  if (!ids.length) return []
  const { data, error } = await sb().from('property_reports')
    .update({ avisado_at: ahora.toISOString() }).in('id', ids).is('avisado_at', null).select('id')
  if (error) fallo('reclamar el aviso', error)
  return (data ?? []).map(r => String(r.id))
}

/** Deshace un reclamo cuyo aviso no salió entero: la corrida siguiente lo vuelve a intentar. */
export async function liberarAviso(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await sb().from('property_reports').update({ avisado_at: null }).in('id', ids)
  if (error) fallo('liberar el aviso', error)
}

/** ¿Hay una tarea `informe_quincenal` pendiente para la propiedad? (`createTaskForRole` no avisa si no la creó). */
export async function hayTareaDelInforme(propertyId: string): Promise<boolean> {
  const { count, error } = await sb().from('tasks').select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId).eq('type', 'informe_quincenal').eq('status', 'pending')
  if (error) fallo('verificar la tarea del informe', error)
  return (count ?? 0) > 0
}

/**
 * Informes para el listado `/informes`, con la dirección de su propiedad. `propertyIds` null = todos (operaciones);
 * una lista = solo esas (asesor). `estado` y `hasta` filtran. Tope de 300: son 36 propiedades × 2 por mes.
 */
export async function listarParaElListado(f: { propertyIds: string[] | null; estado: 'borrador' | 'listo' | null; hasta: string | null }): Promise<Array<{ informe: Informe; direccion: string }>> {
  if (f.propertyIds && !f.propertyIds.length) return []
  // Borradores primero EN LA CONSULTA ('borrador' < 'listo'): con el tope, uno viejo sin completar no puede quedar
  // afuera por la cantidad de listos más nuevos.
  let q = sb().from('property_reports').select(`${SELECT}, properties(address)`)
    .order('estado', { ascending: true }).order('hasta', { ascending: false }).limit(300)
  if (f.propertyIds) q = q.in('property_id', f.propertyIds)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.hasta) q = q.eq('hasta', f.hasta)
  const { data, error } = await q
  if (error) fallo('listar los informes', error)
  return (data ?? []).map(r => {
    const fila = r as Record<string, unknown>
    const prop = objeto(fila.properties)
    return { informe: aInforme(fila), direccion: String(prop.address ?? '') }
  })
}

/** Las propiedades de un asesor: las que muestra o las que captó (el criterio de `puedeGestionarMedia`). */
export async function propiedadesDelAsesor(userId: string): Promise<string[]> {
  const { data, error } = await sb().from('properties').select('id').or(`assigned_to.eq.${userId},created_by.eq.${userId}`).limit(1000)
  if (error) fallo('leer las propiedades del asesor', error)
  return (data ?? []).map(r => String(r.id))
}

/** Los cierres de período que existen (para el filtro del listado), del más nuevo al más viejo. */
export async function cierresDePeriodo(): Promise<string[]> {
  const { data, error } = await sb().from('property_reports').select('hasta').order('hasta', { ascending: false }).limit(1000)
  if (error) fallo('leer los períodos', error)
  return [...new Set((data ?? []).map(r => String(r.hasta)))]
}

/**
 * Cierra las tareas `informe_quincenal` pendientes de la propiedad, SOLO si no le queda ningún borrador del ciclo:
 * con dos quincenas abiertas, la misma tarea las representa a las dos. Devuelve cuántas cerró.
 */
export async function cerrarTareasDelInforme(propertyId: string): Promise<number> {
  const quedan = await sb().from('property_reports').select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId).eq('origen', 'ciclo').eq('estado', 'borrador')
  if (quedan.error) fallo('contar los borradores del ciclo', quedan.error)
  if ((quedan.count ?? 0) > 0) return 0
  const { data, error } = await sb().from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('property_id', propertyId).eq('type', 'informe_quincenal').eq('status', 'pending').select('id')
  if (error) fallo('cerrar la tarea del informe', error)
  return (data ?? []).length
}

// ─── La propiedad (lo que muestran la pantalla y el PDF) ─────────────────────


function portal(pd: unknown, cual: 'ap' | 'ml', atributo: string): unknown {
  const p = objeto(pd)[cual]
  return p && typeof p === 'object' ? (p as Record<string, unknown>)[atributo] : undefined
}

function numeroONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function leerPropiedad(propertyId: string): Promise<PropiedadDelInforme | null> {
  const { data, error } = await sb().from('properties')
    .select('id, address, neighborhood, city, province, property_type, asking_price, currency, captured_at, photos, total_area, covered_area, rooms, age, portal_data')
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
    provincia: r.province ? String(r.province) : null,
    antiguedad: typeof r.age === 'number' ? r.age : null,
    // Solo 6 de 36 captadas lo tienen (2026-10-22): sin dato no se compara, pero la candidata igual muestra el suyo.
    disposicion: normalizarDisposicion(portal(r.portal_data, 'ap', 'DISPOSICION')) ?? normalizarDisposicion(portal(r.portal_data, 'ml', 'DISPOSITION')),
    estadoConservacion: normalizarEstado(portal(r.portal_data, 'ap', 'ESTADO_PROPIEDAD')),
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
