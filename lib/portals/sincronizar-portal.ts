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
  external_id: string
  external_url: string | null
  metadata: Record<string, unknown>
}

export interface CambiosListing {
  status?: string
  external_id?: string
  external_url?: string
  last_published_at?: string
  last_error?: string | null
  metadata?: Record<string, unknown>
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

function fallo(portal: PortalSincronizable, error: string, status: number, extra: { planBDisponible?: boolean } = {}): ResultadoSincronizar {
  return { ok: false, portal, error, status, ...extra }
}

function precioDeFicha(ficha: FichaComercial): { monto: number; moneda: string } {
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
  const { ficha, listing } = entrada
  const portal = 'mercadolibre'
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
    const dif = diferenciasMl(ficha, { category_id: item.category_id, price: item.price, currency_id: item.currency_id ?? '' })
    campos = dif.diferencias
    const urlActual = listing.external_url ?? item.permalink ?? null
    if (dif.accion === 'nada') {
      return { ok: true, portal, accion: 'nada', externalUrl: urlActual, mensaje: 'El aviso ya coincide con la ficha.' }
    }
    const cambiaCategoria = campos.some(d => d.campo === 'tipo' || d.campo === 'operacion')
    const precio = campos.some(d => d.campo === 'precio') ? precioDeFicha(ficha) : null

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

    const avisoGuardado = await guardarTrasExito(deps, { last_error: null })
    await auditarSeguro(deps, { eventType: 'updated', payload: { origen: 'sincronizar', campos, accion } })
    return { ok: true, portal, accion: 'actualizado', externalUrl: urlActual, mensaje: 'Listo: el aviso de MercadoLibre quedó actualizado.' + (avisoGuardado ?? '') }
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
  // Mismas opciones que arma ml-publish desde el borrador, filtradas a la categoría NUEVA.
  const opts: MlPayloadOptions = {
    attributeOverrides: overridesAceptados(meta, aceptados),
    mediaChoice: mediaChoice(meta.media_choice),
    listingType: typeof meta.listing_type === 'string' ? meta.listing_type : 'free',
    allowedAttributeIds: new Set(aceptados),
  }
  // Si esto falla, el catch de sincronizarMl responde el error: el viejo NO se cerró.
  const nuevo = await deps.publicarReemplazo(opts)

  let errorAlCerrar: string | null = null
  try {
    await deps.cerrar(listing.external_id)
  } catch (err) {
    errorAlCerrar = mensajeYDetalle(err).paraElLog
  }

  const usado = nuevo.metadata?.listingTypeUsed
  const avisoGuardado = await guardarTrasExito(deps, {
    status: 'published',
    external_id: nuevo.externalId,
    external_url: nuevo.externalUrl,
    last_published_at: deps.ahora(),
    last_error: errorAlCerrar ? `No se pudo cerrar el aviso anterior ${listing.external_id}: ${errorAlCerrar}` : null,
    metadata: {
      ...meta,
      ...(typeof usado === 'string' ? { listing_type: usado } : {}),
      reemplaza_a: listing.external_id,
      // Igual que ml-publish: el worker verifica que ML haya bajado las fotos.
      needs_picture_check: true,
    },
  })
  await mapaSeguro(deps, nuevo.externalId, nuevo.externalUrl)
  await auditarSeguro(deps, {
    eventType: 'published',
    payload: { origen: 'sincronizar', campos, accion: 'reemplazar', planB: true, reemplaza_a: listing.external_id, externalId: nuevo.externalId },
    ...(errorAlCerrar ? { errorMessage: errorAlCerrar } : {}),
  })
  const mensaje = (errorAlCerrar
    ? `Se publicó el aviso nuevo, pero no se pudo cerrar el anterior (${listing.external_id}): cerralo desde MercadoLibre.`
    : 'Listo: se publicó el aviso nuevo y se cerró el anterior.') + (avisoGuardado ?? '')
  return { ok: true, portal: 'mercadolibre', accion: 'reemplazado', externalUrl: nuevo.externalUrl, mensaje }
}

// ─── Argenprop ─────────────────────────────────────────────────────────────

const eliminado = (estado: string | undefined) => (estado ?? '').trim().toUpperCase() === 'ELIMINADO'

export async function sincronizarAp(deps: DepsAp, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
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
      await deps.guardarListing({ status: 'failed', last_error: paraElLog })
    }
    await auditarSeguro(deps, { eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'sincronizar', campos, accion: 'republicar' } })
    return fallo('argenprop', mensaje, 502)
  }

  const externalUrl = deps.urlPublica(avisoId)
  const avisoGuardado = await guardarTrasExito(deps, {
    external_url: externalUrl,
    last_published_at: deps.ahora(),
    last_error: null,
    metadata: { ...listing.metadata, aviso_id: avisoId, codigo: listing.external_id },
  })
  // external_code = IdAviso numérico, como en ap-publish (es lo que trae el email de consulta).
  await mapaSeguro(deps, String(avisoId), externalUrl)
  await auditarSeguro(deps, {
    eventType: 'published',
    payload: { origen: 'sincronizar', campos, accion: 'republicar', avisoAnterior: aviso.IdAviso, avisoId },
  })
  return {
    ok: true, portal: 'argenprop', accion: 'republicado', externalUrl,
    mensaje: 'Listo: el aviso de Argenprop se volvió a publicar con el tipo correcto (cambió de número).' + (avisoGuardado ?? ''),
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
