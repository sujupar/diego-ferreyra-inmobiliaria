/**
 * Aplica a UN aviso publicado los cambios comerciales de la ficha (tipo,
 * operación, precio/moneda). Orquesta lectura del aviso vivo → diferencias →
 * envío → base de datos → auditoría.
 *
 * Toda la red y la base entran por `deps` (inyectadas): así el ORDEN de los
 * pasos peligrosos se prueba sin portales reales. Los dos órdenes que importan:
 *  - ML plan B: publicar el nuevo PRIMERO y cerrar el viejo SOLO si publicó.
 *    Al revés, una falla al publicar dejaría la propiedad sin aviso.
 *  - Argenprop por cambio de tipo: pedir el catálogo y armar el aviso ANTES de
 *    eliminar. Cualquier error previo deja el aviso intacto; recién `republicar`
 *    elimina, y si no logra volver a publicar el listing queda `failed`.
 */
import {
  diferenciasMl,
  diferenciasAp,
  type Diferencia,
  type DiferenciasPortal,
  type FichaComercial,
  type PortalSincronizable,
} from './diferencias-con-ficha'
import { resolveCategory, type MlPayloadOptions } from './mercadolibre/mapping'
import { armarCambioDeCategoriaMl, armarCambioDePrecioMl } from './mercadolibre/cambio-categoria'
import type { MlItemVivo } from './mercadolibre/edicion'
import type { MlRawAttribute, AttributeOverride } from './mercadolibre/category-attributes'
import type { ApAvisoVivo } from './argenprop/edicion'
import { apCategoria } from './argenprop/field-schema'
import {
  armarAvisoConOperacionYPrecio,
  armarAvisoRepublicado,
  MENSAJE_ELIMINADO_SIN_REPUBLICAR,
} from './argenprop/cambio-categoria'
import { fotosPublicables } from './fotos-publicables'
import { mensajeYDetalle, type PublishResult } from './types'
import type { AuditEventType } from './audit'

export type FichaSincronizable = FichaComercial & { photos: readonly unknown[] | null }

export interface ListingSincronizable {
  id: string
  /** Estado en la base ('published' | 'paused'): un pausado tiene que seguir pausado. */
  status: string
  external_id: string
  external_url: string | null
  metadata: Record<string, unknown>
}

/**
 * Cambios de metadata como PARCHE, nunca como objeto completo: quien guarda
 * relee la metadata ACTUAL y aplica solo esto (ver `fusionarMetadata`). Así no
 * se pierden marcas que escribió otro mientras tanto (el trigger de la ficha,
 * el worker, la reserva, otra pestaña).
 */
export interface ParcheMetadata {
  poner?: Record<string, unknown>
  quitar?: readonly string[]
}

export interface CambiosListing {
  status?: string
  external_id?: string
  external_url?: string
  last_published_at?: string
  last_error?: string | null
  metadata?: ParcheMetadata
}

/** Puro: aplica el parche sobre la metadata FRESCA; todo lo demás queda como está. */
export function fusionarMetadata(fresca: unknown, parche: ParcheMetadata): Record<string, unknown> {
  const base = esRegistro(fresca) ? fresca : {}
  const quitar = new Set(parche.quitar ?? [])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(base)) if (!quitar.has(k)) out[k] = v
  return { ...out, ...(parche.poner ?? {}) }
}

export interface EventoAuditoria {
  eventType: Extract<AuditEventType, 'updated' | 'published' | 'failed'>
  payload: Record<string, unknown>
  errorMessage?: string
}

/** Escrituras propias de la plataforma (listing, mapa de consultas, auditoría). */
export interface DepsComunes {
  guardarListing: (cambios: CambiosListing) => Promise<void>
  sincronizarMapa: (externalCode: string, externalUrl: string) => Promise<void>
  auditar: (evento: EventoAuditoria) => Promise<void>
  ahora: () => string
  /**
   * Reserva atómica del listing (RPC `reclamar_sync_listing`, que toca SOLO las
   * claves de la reserva). Dos clics o dos pestañas a la vez podrían, si no,
   * republicar dos veces o publicar dos reemplazos. `false` = otro la tiene.
   */
  reclamar: () => Promise<boolean>
  liberar: () => Promise<void>
  /** Relee la fila DESPUÉS de reservar: el resto del pedido trabaja sobre esto. */
  releerListing: () => Promise<ListingSincronizable | null>
}

export interface DepsMl extends DepsComunes {
  leerAviso: (externalId: string) => Promise<MlItemVivo>
  /** getRawAttributes de la categoría (para los atributos fijos de la nueva). */
  atributosDeCategoria: (categoria: string) => Promise<readonly MlRawAttribute[]>
  /** Ids que acepta la categoría (required + recommended), para el plan B. */
  idsAceptados: (categoria: string) => Promise<ReadonlySet<string>>
  cambiarEnElLugar: (externalId: string, body: Record<string, unknown>) => Promise<void>
  /** La propiedad la cierra quien arma las deps: acá solo viajan las opciones. */
  publicarReemplazo: (opts: MlPayloadOptions) => Promise<PublishResult>
  cerrar: (externalId: string) => Promise<void>
}

export interface DepsAp extends DepsComunes {
  leerAviso: (codigo: string) => Promise<ApAvisoVivo>
  idAnunciante: () => number
  caracteristicasDeCategoria: (tipo: string) => Promise<ReadonlySet<string>>
  republicar: (codigo: string, dto: Record<string, unknown>) => Promise<{ avisoId: number }>
  enviarAviso: (dto: Record<string, unknown>) => Promise<void>
  /** setEstado(codigo, 'suspendido'): un aviso pausado republicado vuelve a quedar pausado. */
  suspender: (codigo: string) => Promise<void>
  /** apPublicUrl(property, avisoId). */
  urlPublica: (avisoId: number) => string
}

export interface EntradaSincronizar {
  ficha: FichaSincronizable
  listing: ListingSincronizable
  planB?: boolean
}

export type AccionHecha = 'nada' | 'actualizado' | 'republicado' | 'reemplazado'

export type ResultadoSincronizar =
  | { ok: true; portal: PortalSincronizable; accion: AccionHecha; externalUrl: string | null; mensaje: string }
  | { ok: false; portal: PortalSincronizable; error: string; status: number; planBDisponible?: boolean }

const OPERACIONES_TEXTO: Record<string, string> = {
  venta: 'venta',
  alquiler: 'alquiler',
  temporario: 'alquiler temporario',
}

// ─── Reserva del listing ──────────────────────────────────────────────────

/** Una sincronización tarda segundos; pasado esto la reserva se da por abandonada (proceso cortado). */
export const RECLAMO_TTL_MS = 3 * 60 * 1000
export const MENSAJE_EN_CURSO = 'Ya se está actualizando este aviso; esperá un momento.'
export const MENSAJE_AVISO_CAMBIO = 'El aviso cambió mientras tanto; volvé a revisar.'
const ESTADOS_SINCRONIZABLES = new Set(['published', 'paused'])

/** Reservas anteriores a este instante (ISO) están vencidas: es el límite del UPDATE condicional. */
export function limiteReclamo(ahora: Date): string {
  return new Date(ahora.getTime() - RECLAMO_TTL_MS).toISOString()
}

async function conReclamo(
  deps: DepsComunes,
  portal: PortalSincronizable,
  entrada: EntradaSincronizar,
  trabajo: (entrada: EntradaSincronizar) => Promise<ResultadoSincronizar>,
): Promise<ResultadoSincronizar> {
  let reclamado: boolean
  try {
    reclamado = await deps.reclamar()
  } catch (err) {
    return fallo(portal, mensajeYDetalle(err).mensaje, 502)
  }
  if (!reclamado) return fallo(portal, MENSAJE_EN_CURSO, 409)
  try {
    // Lo leído antes de reservar puede estar viejo (otra pestaña terminó un plan B,
    // el worker escribió marcas): se trabaja sobre la fila releída.
    const fresco = await deps.releerListing()
    if (!fresco || fresco.external_id !== entrada.listing.external_id || !ESTADOS_SINCRONIZABLES.has(fresco.status)) {
      return fallo(portal, MENSAJE_AVISO_CAMBIO, 409)
    }
    return await trabajo({ ...entrada, listing: fresco })
  } catch (err) {
    return fallo(portal, mensajeYDetalle(err).mensaje, 502)
  } finally {
    try { await deps.liberar() } catch (e) { console.warn('[sincronizar] no se pudo liberar la reserva (vence sola en 3 min)', e) }
  }
}

// ─── Reemplazo de ML a medio hacer ────────────────────────────────────────

export interface ReemplazoPendiente { nuevo: string; url: string; desde: string; listingType?: string }

/** metadata.reemplazo_pendiente: el plan B publicó el nuevo pero no terminó de cerrar/guardar. */
export function reemplazoPendiente(meta: Record<string, unknown>): ReemplazoPendiente | null {
  const v = meta.reemplazo_pendiente
  if (!esRegistro(v)) return null
  const { nuevo, url, desde, listingType } = v
  if (typeof nuevo !== 'string' || typeof url !== 'string' || typeof desde !== 'string') return null
  return { nuevo, url, desde, ...(typeof listingType === 'string' ? { listingType } : {}) }
}

function fallo(portal: PortalSincronizable, error: string, status: number, extra: { planBDisponible?: boolean } = {}): ResultadoSincronizar {
  return { ok: false, portal, error, status, ...extra }
}

export const MENSAJE_ML_PROCESANDO =
  'MercadoLibre todavía está procesando el aviso recién publicado (tarda 1 a 3 minutos) y mientras tanto no deja cambiar el tipo. Probá de nuevo en un par de minutos.'
export const MENSAJE_PRECIO_INVALIDO ='El precio de la ficha no es válido; corregilo antes de actualizar los avisos.'

/** null = el precio de la ficha no sirve (NaN, ≤0 o ausente): no se manda a ningún portal. */
export function precioDeFicha(ficha: FichaComercial): { monto: number; moneda: string } | null {
  if (typeof ficha.asking_price !== 'number' || !Number.isFinite(ficha.asking_price) || ficha.asking_price <= 0) return null
  return { monto: ficha.asking_price, moneda: (ficha.currency || 'USD').toUpperCase() }
}

function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function esOverride(v: unknown): v is AttributeOverride {
  if (!esRegistro(v)) return false
  const { value_name, value_id } = v
  return (value_name === undefined || typeof value_name === 'string')
    && (value_id === undefined || typeof value_id === 'string')
}

/** metadata.ml_attributes del borrador, solo con los ids que acepta la categoría nueva. */
function overridesAceptados(meta: Record<string, unknown>, aceptados: ReadonlySet<string>): Record<string, AttributeOverride> {
  const crudo = meta.ml_attributes
  if (!esRegistro(crudo)) return {}
  const out: Record<string, AttributeOverride> = {}
  for (const [id, v] of Object.entries(crudo)) {
    if (aceptados.has(id) && esOverride(v)) out[id] = v
  }
  return out
}

function mediaChoice(v: unknown): 'video' | 'tour' | 'none' {
  return v === 'video' || v === 'tour' ? v : 'none'
}

/** Auditoría best-effort: que no se pueda escribir el evento no cambia lo que pasó en el portal. */
async function auditarSeguro(deps: DepsComunes, evento: EventoAuditoria): Promise<void> {
  try { await deps.auditar(evento) } catch (e) { console.warn('[sincronizar] no se pudo auditar', e) }
}

/**
 * Guardar en la base DESPUÉS de que el portal ya cambió. Si falla, el cambio en
 * el portal igual ocurrió: se responde éxito con aviso, nunca "falló" (eso
 * invitaría a reintentar un plan B o una republicación que ya se hizo).
 */
async function guardarTrasExito(deps: DepsComunes, cambios: CambiosListing): Promise<string | null> {
  try {
    await deps.guardarListing(cambios)
    return null
  } catch (e) {
    console.error('[sincronizar] el portal cambió pero no se pudo guardar el listing', e)
    return ' Ojo: no se pudo guardar el dato nuevo en la plataforma; avisale a sistemas.'
  }
}

async function mapaSeguro(deps: DepsComunes, code: string, url: string): Promise<void> {
  // Igual que en ml-publish/ap-publish: el mapa de consultas no puede tumbar una publicación hecha.
  try { await deps.sincronizarMapa(code, url) } catch (e) { console.warn('[sincronizar] no se pudo sincronizar portal_property_map', e) }
}

// ─── MercadoLibre ──────────────────────────────────────────────────────────

export async function sincronizarMl(deps: DepsMl, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
  return conReclamo(deps, 'mercadolibre', entrada, e => sincronizarMlReservado(deps, e))
}

async function sincronizarMlReservado(deps: DepsMl, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
  const { ficha, listing } = entrada
  const portal = 'mercadolibre'
  // Un plan B anterior publicó el nuevo y se cortó: se TERMINA ese, nunca se publica un tercero.
  const pendiente = reemplazoPendiente(listing.metadata)
  if (pendiente && pendiente.desde === listing.external_id) {
    try {
      return await finalizarReemplazo(deps, listing, pendiente, [], true)
    } catch (err) {
      const { mensaje, paraElLog } = mensajeYDetalle(err)
      await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos: [], accion: 'terminar_reemplazo', planB: true } })
      return fallo(portal, mensaje, 502)
    }
  }
  // resolveCategory ya trata vacío como departamento/venta; acá solo se adapta el null de la ficha.
  const categoriaNueva = resolveCategory({ property_type: ficha.property_type ?? '', operation_type: ficha.operation_type ?? '' })
  if (!categoriaNueva) {
    // Nunca se manda category_id null: ML lo tomaría como un error opaco o, peor, otra categoría.
    const tipo = (ficha.property_type || 'sin tipo').trim().toLowerCase()
    const op = (ficha.operation_type || 'venta').trim().toLowerCase()
    return fallo(portal, `MercadoLibre no tiene una categoría para ${tipo} en ${OPERACIONES_TEXTO[op] ?? op} — revisá el tipo y la operación de la ficha.`, 422)
  }

  let campos: Diferencia[] = []
  let accion = 'leer'
  try {
    const item = await deps.leerAviso(listing.external_id)
    if (item.status === 'closed') {
      return fallo(portal, 'El aviso de MercadoLibre está cerrado: no se puede actualizar.', 409)
    }
    const dif = diferenciasMl(ficha, { category_id: item.category_id, price: item.price, currency_id: item.currency_id ?? null })
    campos = dif.diferencias
    const urlActual = listing.external_url ?? item.permalink ?? null
    if (dif.accion === 'nada') {
      return { ok: true, portal, accion: 'nada', externalUrl: urlActual, mensaje: 'El aviso ya coincide con la ficha.' }
    }
    const cambiaCategoria = campos.some(d => d.campo === 'tipo' || d.campo === 'operacion')
    const precio = campos.some(d => d.campo === 'precio') ? precioDeFicha(ficha) : null
    if (campos.some(d => d.campo === 'precio') && !precio) return fallo(portal, MENSAJE_PRECIO_INVALIDO, 422)

    // Recién publicado (`not_yet_active`, 1-3 min): ML responde
    // `item.category_id.not_modifiable` al cambio de categoría (verificado en el
    // QA del 2026-11-11), y el plan B tampoco sirve: el viejo no se puede cerrar
    // desde ese estado. No es un rechazo de verdad → esperar, sin plan B.
    if (cambiaCategoria && item.status === 'not_yet_active') {
      return fallo(portal, MENSAJE_ML_PROCESANDO, 409)
    }

    if (entrada.planB) {
      if (!cambiaCategoria) return fallo(portal, 'El plan B solo aplica cuando cambia el tipo o la operación.', 400)
      accion = 'reemplazar'
      return await planBMl(deps, entrada, categoriaNueva, campos)
    }

    if (cambiaCategoria) {
      accion = 'categoria'
      const raw = await deps.atributosDeCategoria(categoriaNueva)
      if (raw.length === 0) {
        // Sin los fijos de la nueva (PROPERTY_TYPE/OPERATION) el PUT cambiaría la
        // categoría y dejaría el tipo viejo: mejor no tocar nada.
        throw new Error(`MercadoLibre no devolvió los datos de la categoría ${categoriaNueva}; no se tocó el aviso.`)
      }
      const { body } = armarCambioDeCategoriaMl(item, raw, categoriaNueva, precio)
      try {
        await deps.cambiarEnElLugar(listing.external_id, body)
      } catch (err) {
        // ML rechazó el cambio en el lugar: el aviso sigue como estaba y se ofrece el plan B.
        const { mensaje, paraElLog } = mensajeYDetalle(err)
        await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos, accion } })
        return fallo(portal, mensaje, 409, { planBDisponible: true })
      }
    } else if (precio) {
      accion = 'precio'
      // Precio y moneda SIEMPRE juntos: solo currency_id da item.price.invalid.
      await deps.cambiarEnElLugar(listing.external_id, armarCambioDePrecioMl(precio))
    }

    // Al cambiar de categoría ML cambia el permalink (departamento.mercadolibre…
    // → casa.mercadolibre…, mismo id; verificado en el QA). El viejo redirige,
    // pero se guarda el nuevo. Si la relectura falla, el cambio ya está hecho.
    let urlFinal = urlActual
    if (cambiaCategoria) {
      const releido = await deps.leerAviso(listing.external_id).catch(() => null)
      if (releido?.permalink) urlFinal = releido.permalink
    }
    const cambiaUrl = !!urlFinal && urlFinal !== listing.external_url
    const avisoGuardado = await guardarTrasExito(deps, { last_error: null, ...(cambiaUrl ? { external_url: urlFinal! } : {}) })
    if (cambiaUrl) await mapaSeguro(deps, listing.external_id, urlFinal!)
    await auditarSeguro(deps, { eventType: 'updated', payload: { origen: 'sincronizar', campos, accion } })
    return { ok: true, portal, accion: 'actualizado', externalUrl: urlFinal, mensaje: 'Listo: el aviso de MercadoLibre quedó actualizado.' + (avisoGuardado ?? '') }
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos, accion, ...(entrada.planB ? { planB: true } : {}) } })
    return fallo(portal, mensaje, 502)
  }
}

async function planBMl(deps: DepsMl, entrada: EntradaSincronizar, categoriaNueva: string, campos: Diferencia[]): Promise<ResultadoSincronizar> {
  const { listing } = entrada
  const meta = listing.metadata
  const aceptados = await deps.idsAceptados(categoriaNueva)
  if (aceptados.size === 0) {
    throw new Error(`MercadoLibre no devolvió los campos de la categoría ${categoriaNueva}; no se publicó nada y el aviso actual sigue igual.`)
  }
  // Mismas opciones que arma ml-publish desde el borrador, filtradas a la categoría NUEVA.
  const opts: MlPayloadOptions = {
    attributeOverrides: overridesAceptados(meta, aceptados),
    mediaChoice: mediaChoice(meta.media_choice),
    listingType: typeof meta.listing_type === 'string' ? meta.listing_type : 'free',
    allowedAttributeIds: new Set(aceptados),
  }
  // Si esto falla, el catch de sincronizarMl responde el error: el viejo NO se cerró.
  const nuevo = await deps.publicarReemplazo(opts)
  const usado = nuevo.metadata?.listingTypeUsed
  const pendiente: ReemplazoPendiente = {
    nuevo: nuevo.externalId, url: nuevo.externalUrl, desde: listing.external_id,
    ...(typeof usado === 'string' ? { listingType: usado } : {}),
  }
  // Se anota ANTES de cerrar el viejo: si el proceso se corta entre publicar y
  // guardar, el próximo intento termina este reemplazo en vez de publicar otro.
  try {
    await deps.guardarListing({ metadata: { poner: { reemplazo_pendiente: pendiente } } })
  } catch (e) {
    console.error('[sincronizar] no se pudo anotar el reemplazo pendiente', e)
  }
  return finalizarReemplazo(deps, listing, pendiente, campos, false)
}

/**
 * Cierra el viejo (si sigue abierto) y apunta listing + mapa al nuevo. Lo usa el
 * plan B recién publicado y también la reanudación de uno que quedó a medias.
 */
async function finalizarReemplazo(
  deps: DepsMl,
  listing: ListingSincronizable,
  p: ReemplazoPendiente,
  campos: Diferencia[],
  reanudando: boolean,
): Promise<ResultadoSincronizar> {
  let errorAlCerrar: string | null = null
  try {
    const cerrado = reanudando && (await deps.leerAviso(p.desde)).status === 'closed'
    if (!cerrado) await deps.cerrar(p.desde)
  } catch (err) {
    errorAlCerrar = mensajeYDetalle(err).paraElLog
  }

  const pausado = listing.status === 'paused'
  const avisoGuardado = await guardarTrasExito(deps, {
    // Un aviso pausado sigue pausado: el worker pausa el nuevo cuando ML lo active.
    status: pausado ? 'paused' : 'published',
    external_id: p.nuevo,
    external_url: p.url,
    last_published_at: deps.ahora(),
    last_error: errorAlCerrar ? `No se pudo cerrar el aviso anterior ${p.desde}: ${errorAlCerrar}` : null,
    metadata: {
      poner: {
        ...(p.listingType ? { listing_type: p.listingType } : {}),
        reemplaza_a: p.desde,
        // Igual que ml-publish: el worker verifica que ML haya bajado las fotos.
        needs_picture_check: true,
        ...(pausado ? { needs_pause_after_active: true } : {}),
      },
      quitar: ['reemplazo_pendiente'],
    },
  })
  await mapaSeguro(deps, p.nuevo, p.url)
  await auditarSeguro(deps, {
    eventType: 'published',
    payload: {
      origen: 'sincronizar', campos, accion: reanudando ? 'terminar_reemplazo' : 'reemplazar', planB: true,
      reemplaza_a: p.desde, externalId: p.nuevo,
    },
    ...(errorAlCerrar ? { errorMessage: errorAlCerrar } : {}),
  })
  const mensaje = (errorAlCerrar
    ? `Se publicó el aviso nuevo, pero no se pudo cerrar el anterior (${p.desde}): cerralo desde MercadoLibre.`
    : 'Listo: se publicó el aviso nuevo y se cerró el anterior.') + (avisoGuardado ?? '')
  return { ok: true, portal: 'mercadolibre', accion: 'reemplazado', externalUrl: p.url, mensaje }
}

// ─── Argenprop ─────────────────────────────────────────────────────────────

const eliminado = (estado: string | undefined) => (estado ?? '').trim().toUpperCase() === 'ELIMINADO'

export async function sincronizarAp(deps: DepsAp, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
  return conReclamo(deps, 'argenprop', entrada, e => sincronizarApReservado(deps, e))
}

async function sincronizarApReservado(deps: DepsAp, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
  const { ficha, listing } = entrada
  const portal = 'argenprop'
  let campos: Diferencia[] = []
  let accion = 'leer'
  try {
    const aviso = await deps.leerAviso(listing.external_id)
    if (eliminado(aviso.Publicacion.EstadoPublicacion)) {
      return fallo(portal, 'El aviso fue eliminado en Argenprop: publicalo desde el asistente de Argenprop.', 409)
    }
    const dif = diferenciasAp(ficha, {
      tipo: aviso.Categoria.Tipo,
      subtipo: aviso.Categoria.SubTipo ?? null,
      operacion: aviso.Precio.Operacion,
      monto: aviso.Precio.Monto,
      moneda: aviso.Precio.Moneda,
    })
    campos = dif.diferencias
    if (dif.accion === 'nada') {
      return { ok: true, portal, accion: 'nada', externalUrl: listing.external_url, mensaje: 'El aviso ya coincide con la ficha.' }
    }
    const cambios: { operacion?: string; monto?: number; moneda?: string } = {}
    if (campos.some(d => d.campo === 'operacion')) cambios.operacion = ficha.operation_type || 'venta'
    if (campos.some(d => d.campo === 'precio')) {
      const p = precioDeFicha(ficha)
      if (!p) return fallo(portal, MENSAJE_PRECIO_INVALIDO, 422)
      cambios.monto = p.monto
      cambios.moneda = p.moneda
    }

    if (dif.accion === 'republicar') {
      accion = 'republicar'
      return await republicarAp(deps, entrada, aviso, cambios, campos)
    }

    accion = 'actualizar'
    await deps.enviarAviso(armarAvisoConOperacionYPrecio(aviso, cambios, [], deps.idAnunciante()))
    // Con otra operación cambia el slug de la URL ("en-venta" → "en-alquiler"); el portal
    // resuelve por IdAviso, pero se guarda la forma correcta.
    const externalUrl = cambios.operacion ? deps.urlPublica(aviso.IdAviso) : listing.external_url
    const avisoGuardado = await guardarTrasExito(deps, { last_error: null, ...(cambios.operacion && externalUrl ? { external_url: externalUrl } : {}) })
    await auditarSeguro(deps, { eventType: 'updated', payload: { origen: 'sincronizar', campos, accion } })
    return { ok: true, portal, accion: 'actualizado', externalUrl, mensaje: 'Listo: el aviso de Argenprop quedó actualizado.' + (avisoGuardado ?? '') }
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos, accion } })
    return fallo(portal, mensaje, 502)
  }
}

async function republicarAp(
  deps: DepsAp,
  entrada: EntradaSincronizar,
  aviso: ApAvisoVivo,
  cambios: { operacion?: string; monto?: number; moneda?: string },
  campos: Diferencia[],
): Promise<ResultadoSincronizar> {
  const { ficha, listing } = entrada
  // TODO lo que puede fallar sin red destructiva va ANTES de republicar (que elimina).
  const nueva = apCategoria({ property_type: (ficha.property_type || 'departamento').trim().toLowerCase() })
  const aceptadas = await deps.caracteristicasDeCategoria(nueva.tipo)
  const dto = armarAvisoRepublicado(
    aviso, nueva, aceptadas, fotosPublicables(ficha.photos).validas, deps.idAnunciante(), cambios,
  )

  let avisoId: number
  try {
    ;({ avisoId } = await deps.republicar(listing.external_id, dto))
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    // Solo este mensaje significa "ya se eliminó": si falló el paso de eliminar,
    // el aviso sigue vivo y el listing no se marca failed.
    if (mensaje === MENSAJE_ELIMINADO_SIN_REPUBLICAR) {
      // Que la base no responda no cambia lo que hay que decirle a la persona.
      try {
        await deps.guardarListing({ status: 'failed', last_error: paraElLog })
      } catch (e) {
        console.error('[sincronizar] Argenprop eliminado sin republicar y no se pudo marcar failed', e)
      }
    }
    await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos, accion: 'republicar' } })
    return fallo('argenprop', mensaje, 502)
  }

  const externalUrl = deps.urlPublica(avisoId)
  // El POST deja el aviso vigente: si estaba pausado, se vuelve a suspender. El
  // status de la base no se toca (sigue 'paused').
  let errorAlSuspender: string | null = null
  if (listing.status === 'paused') {
    try {
      await deps.suspender(listing.external_id)
    } catch (err) {
      errorAlSuspender = mensajeYDetalle(err).paraElLog
    }
  }
  const avisoGuardado = await guardarTrasExito(deps, {
    external_url: externalUrl,
    last_published_at: deps.ahora(),
    last_error: errorAlSuspender ? `Se republicó pero no se pudo volver a pausar: ${errorAlSuspender}` : null,
    metadata: { poner: { aviso_id: avisoId, codigo: listing.external_id } },
  })
  // external_code = IdAviso numérico, como en ap-publish (es lo que trae el email de consulta).
  await mapaSeguro(deps, String(avisoId), externalUrl)
  await auditarSeguro(deps, {
    eventType: 'published',
    payload: { origen: 'sincronizar', campos, accion: 'republicar', avisoAnterior: aviso.IdAviso, avisoId },
    ...(errorAlSuspender ? { errorMessage: errorAlSuspender } : {}),
  })
  return {
    ok: true, portal: 'argenprop', accion: 'republicado', externalUrl,
    mensaje: 'Listo: el aviso de Argenprop se volvió a publicar con el tipo correcto (cambió de número).'
      + (errorAlSuspender ? ' Ojo: quedó visible; pausalo desde la pantalla de Argenprop.' : '')
      + (avisoGuardado ?? ''),
  }
}

// ─── Diferencias de varios portales a la vez ──────────────────────────────

export type FilaDiferencias =
  | (DiferenciasPortal & { externalUrl: string | null; estado: string })
  | { portal: PortalSincronizable; error: string }

/**
 * Lee las diferencias de cada aviso EN PARALELO y por separado: un portal que no
 * responde vuelve con su error (en castellano) y no tumba al otro.
 */
export async function diferenciasDePortales<L extends { portal: PortalSincronizable; external_url: string | null; status: string }>(
  listings: readonly L[],
  leer: (listing: L) => Promise<DiferenciasPortal>,
): Promise<FilaDiferencias[]> {
  const lecturas = await Promise.allSettled(listings.map(l => leer(l)))
  return lecturas.map((r, i) => {
    const l = listings[i]
    return r.status === 'fulfilled'
      ? { ...r.value, externalUrl: l.external_url, estado: l.status }
      : { portal: l.portal, error: mensajeYDetalle(r.reason).mensaje }
  })
}
