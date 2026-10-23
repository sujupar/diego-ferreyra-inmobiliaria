import 'server-only'
/**
 * Lo que hacen las rutas del informe quincenal, sin HTTP. UNA integración lenta por llamada
 * (`refrescarFuente`): la pantalla y el cron piden las fuentes de a una.
 */
import { randomUUID } from 'node:crypto'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import * as datos from './datos'
import { traerFuente } from './fuentes'
import { esImagen, esPathDeCaptura, esPathDelPdf, esPdf, MAX_CAPTURA_BYTES, MAX_PDF_BYTES, nombreDelPdf, pathDeCaptura, pathDelPdf, SEGUNDOS_URL_LECTURA, validarCaptura } from './archivos'
import { validarRango } from './periodo'
import { faltantes, paginasDelInforme, resumenDeMetricas, type Pagina, type Resumen } from './resumen'
import { combinarTextos, datosParaRedactar, entradaDeRedaccion, ESQUEMA_REDACCION, INSTRUCCIONES_REDACCION, validarRedaccion } from './redaccion'
import { respuestaOpenAI } from '@/lib/ai/openai-responses'
import { scrapeProperty } from '@/lib/scraper'
import { urlBusquedaArgenprop, urlBusquedaMercadoLibre } from './competencia/busqueda'
import { parsearListadoArgenprop, parsearListadoMercadoLibre } from './competencia/listados'
import { ordenarCandidatas, type Candidata, type DetalleCandidata } from './competencia/puntaje'
import { traerListado } from './competencia/traer'
import { FUENTES, type Capturas, type FuenteGuardada, type Fuentes, type Informe, type NombreCaptura, type NombreFuente, type PropiedadDelInforme, type BusquedaPortal } from './tipos'

export class ErrorInforme extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 503, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorInforme'
  }
}

export function fuentesPendientes(): Fuentes {
  const f: Fuentes = {}
  for (const n of FUENTES) (f as Record<string, FuenteGuardada<unknown>>)[n] = { estado: 'pendiente', actualizadoEn: null, datos: null, error: null }
  return f
}

export async function crearInformeManual(propertyId: string, desde: string, hasta: string, userId: string, ahora: Date): Promise<{ informe: Informe; nuevo: boolean }> {
  const r = validarRango(desde, hasta, fechaEnArgentina(ahora))
  if (!r.ok) throw new ErrorInforme(400, r.error)
  if (!(await datos.leerPropiedad(propertyId))) throw new ErrorInforme(404, 'No encontramos la propiedad')
  return datos.crearInforme({ propertyId, desde: r.desde, hasta: r.hasta, origen: 'manual', creadoPor: userId, fuentes: fuentesPendientes() })
}

function exigirBorrador(i: Informe): void {
  if (i.estado !== 'borrador') throw new ErrorInforme(409, 'El informe ya está listo. Volvelo a borrador para cambiarlo.')
}

/** Trae UNA fuente y la guarda. La fuente nunca lanza: si falló, queda `error` con su motivo. */
export async function refrescarFuente(i: Informe, nombre: NombreFuente, ahora: Date): Promise<FuenteGuardada<unknown>> {
  exigirBorrador(i)
  const valor = await traerFuente(nombre, {
    propertyId: i.propertyId, desde: i.desde, hasta: i.hasta, ahora, avisoMercadoLibre: i.manual.mercadolibre?.aviso ?? null,
    excluidosMercadoLibre: i.manual.mercadolibre?.excluidos ?? [],
  })
  if (!(await datos.guardarFuente(i.id, nombre, valor as FuenteGuardada<unknown>))) throw new ErrorInforme(409, 'El informe ya está listo')
  return valor as FuenteGuardada<unknown>
}

// ─── Textos escritos por la plataforma ───────────────────────────────────────

/** Modelo de los textos. `gpt-4.1` es el que ya escribe las descripciones de las propiedades. */
const MODELO_TEXTOS = process.env.INFORME_MODELO_TEXTO ?? 'gpt-4.1'
/** Netlify corta a los ~26 s; cortamos antes para responder un error legible (no una página HTML). */
const TOPE_TEXTOS_MS = 22_000

/**
 * Escribe los cinco textos con UNA llamada al modelo. Antes de guardar relee el informe: lo que Paula haya
 * corregido mientras tanto se respeta (salvo `forzar`). Los campos con números que no están en los datos
 * quedan marcados en `redaccion.revisar`.
 */
export async function escribirTextos(i: Informe, ahora: Date, forzar: boolean): Promise<Informe> {
  exigirBorrador(i)
  if (Object.values(i.fuentes).some(f => !f || f.estado === 'pendiente')) {
    throw new ErrorInforme(409, 'Todavía están llegando los datos del período. Esperá a que terminen.')
  }
  const propiedad = await datos.leerPropiedad(i.propertyId)
  if (!propiedad) throw new ErrorInforme(404, 'No encontramos la propiedad del informe')
  const previo = await datos.leerInformeAnterior(i.propertyId, i.desde)
  const rPrevio = previo ? resumenDeMetricas(previo.fuentes, previo.manual) : null
  const d = datosParaRedactar({
    informe: i, propiedad, resumen: resumenDeMetricas(i.fuentes, i.manual),
    anterior: previo && rPrevio ? {
      desde: previo.desde, hasta: previo.hasta, vieron: rPrevio.vieron.valor, entraron: rPrevio.entraron.valor,
      consultas: rPrevio.consultas, visitas: rPrevio.visitas,
    } : null,
  })
  let crudo: string
  try {
    crudo = (await respuestaOpenAI({
      modelo: MODELO_TEXTOS, instrucciones: INSTRUCCIONES_REDACCION, entrada: [{ tipo: 'texto', texto: entradaDeRedaccion(d) }],
      esquema: ESQUEMA_REDACCION, temperatura: 0.4, timeoutMs: TOPE_TEXTOS_MS,
    })).texto
  } catch (e) {
    const tardo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new ErrorInforme(503, tardo ? 'La redacción tardó demasiado. Probá de nuevo.' : 'No se pudieron escribir los textos. Probá de nuevo en un momento.')
  }
  const v = validarRedaccion(crudo, d)
  if (!v.ok) throw new ErrorInforme(503, `No se pudieron escribir los textos (${v.error}). Probá de nuevo.`)
  const fresco = await datos.leerInforme(i.id)
  if (!fresco) throw new ErrorInforme(404, 'No encontramos el informe')
  exigirBorrador(fresco)
  const textos = combinarTextos({ actuales: fresco.manual.textos ?? {}, original: fresco.manual.redaccion?.original ?? {}, nuevos: v.textos, forzar })
  const manual = { ...fresco.manual, textos, redaccion: { generadoEn: ahora.toISOString(), original: v.textos, revisar: v.revisar } }
  if (!(await datos.guardarCambios(i.id, { manual }))) throw new ErrorInforme(409, 'El informe ya está listo')
  return { ...fresco, manual }
}

// ─── Competidoras que busca la plataforma ────────────────────────────────────

export type PortalDeBusqueda = 'argenprop' | 'mercadolibre'

const esCapital = (p: PropiedadDelInforme) => /^(caba|capital federal|ciudad aut[oó]noma)/i.test((p.provincia ?? p.ciudad ?? '').trim())

/**
 * Busca candidatas en UN portal (una integración lenta por pedido). Nunca lanza por el portal: un portal caído o un
 * HTML que cambió queda guardado como `error` con su motivo, para que la pantalla lo diga y ofrezca reintentar.
 */
export async function buscarCompetencia(i: Informe, portal: PortalDeBusqueda, ahora: Date): Promise<BusquedaPortal> {
  exigirBorrador(i)
  const p = await datos.leerPropiedad(i.propertyId)
  if (!p) throw new ErrorInforme(404, 'No encontramos la propiedad del informe')
  const url = portal === 'argenprop'
    ? urlBusquedaArgenprop({ tipo: p.tipo, barrio: p.barrio, ambientes: p.ambientes ?? null })
    : urlBusquedaMercadoLibre({ tipo: p.tipo, barrio: p.barrio, ambientes: p.ambientes ?? null, esCapital: esCapital(p) })
  let valor: BusquedaPortal
  if (!url) {
    const motivo = !p.barrio ? 'La propiedad no tiene barrio cargado'
      : portal === 'mercadolibre' && !esCapital(p) ? 'En MercadoLibre la búsqueda por barrio solo se puede armar en Capital'
      : 'Ese tipo de propiedad no se puede buscar en este portal'
    valor = { estado: 'sin_busqueda', error: motivo, buscadoEn: ahora.toISOString(), url: null, avisos: [] }
  } else {
    try {
      const html = await traerListado(url)
      const avisos = portal === 'argenprop' ? parsearListadoArgenprop(html) : parsearListadoMercadoLibre(html)
      valor = { estado: 'ok', error: null, buscadoEn: ahora.toISOString(), url, avisos }
    } catch (e) {
      console.error(`[informes] búsqueda de competidoras en ${portal} falló`, url, e instanceof Error ? e.message : e)
      valor = { estado: 'error', error: (e instanceof Error ? e.message : 'No se pudo buscar').slice(0, 300), buscadoEn: ahora.toISOString(), url, avisos: [] }
    }
  }
  if (!(await datos.guardarCandidatas(i.id, [portal], valor))) throw new ErrorInforme(409, 'El informe ya está listo')
  return valor
}

/**
 * Abre UN aviso candidato para leer disposición y estado (el listado no los muestra). Solo avisos que la propia
 * búsqueda encontró: la ruta no abre cualquier URL que le manden.
 */
export async function abrirCandidata(i: Informe, url: string): Promise<DetalleCandidata> {
  exigirBorrador(i)
  const conocidas = [...(i.candidatas.argenprop?.avisos ?? []), ...(i.candidatas.mercadolibre?.avisos ?? [])].map(a => a.url)
  if (!conocidas.includes(url)) throw new ErrorInforme(400, 'Ese aviso no está entre las candidatas del informe')
  const r = await scrapeProperty(url)
  const f = r.data?.features
  const detalle: DetalleCandidata = r.success && f ? {
    disposicion: typeof f.disposal === 'string' ? f.disposal : null,
    estado: typeof f.condition === 'string' ? f.condition : null,
    orientacion: typeof f.orientation === 'string' ? f.orientation : null,
    vistas: typeof f.views === 'number' ? f.views : null,
    publicadoHace: typeof f.publishedDate === 'string' ? f.publishedDate.slice(0, 80) : null,
    antiguedad: typeof f.age === 'number' ? f.age : null,
    cocheras: typeof f.garages === 'number' ? f.garages : null,
  } : { disposicion: null, estado: null, orientacion: null, vistas: null, publicadoHace: null, antiguedad: null, cocheras: null, error: (r.error ?? 'No se pudo abrir el aviso').slice(0, 300) }
  if (!(await datos.guardarCandidatas(i.id, ['detalles', url], detalle))) throw new ErrorInforme(409, 'El informe ya está listo')
  return detalle
}

/** Las candidatas ordenadas por parecido a la propiedad (lo que muestra la pantalla). */
export function candidatasOrdenadas(i: Informe, p: PropiedadDelInforme): Candidata[] {
  const avisos = [...(i.candidatas.argenprop?.avisos ?? []), ...(i.candidatas.mercadolibre?.avisos ?? [])]
  return ordenarCandidatas({
    direccion: p.direccion, ambientes: p.ambientes ?? null, m2: p.m2 ?? null, precio: p.precio, antiguedad: p.antiguedad ?? null,
    disposicion: p.disposicion ?? null, estado: p.estadoConservacion ?? null,
  }, avisos, i.candidatas.detalles)
}

// ─── Capturas ────────────────────────────────────────────────────────────────

export async function prepararCaptura(i: Informe, cual: NombreCaptura, meta: { nombre: string; bytes: number }) {
  exigirBorrador(i)
  const e = validarCaptura(meta)
  if (e) throw new ErrorInforme(400, e)
  return datos.crearSubidaFirmada(pathDeCaptura(i.id, cual, randomUUID(), meta.nombre))
}

/** Revisa la captura por sus BYTES (el tipo que guarda Storage lo declara el navegador). */
export async function confirmarCaptura(i: Informe, cual: NombreCaptura, path: string): Promise<Capturas> {
  exigirBorrador(i)
  if (!esPathDeCaptura(path, i.id, cual)) throw new ErrorInforme(400, 'La captura no corresponde a este informe')
  const archivo = await datos.primerosBytes(path, 16)
  if (!archivo) throw new ErrorInforme(503, 'No se pudo revisar la captura. Probá de nuevo en un momento.')
  if (!esImagen(archivo.bytes) || archivo.tamano > MAX_CAPTURA_BYTES) {
    await datos.borrarArchivos([path])
    throw new ErrorInforme(400, 'La captura no es una imagen válida de hasta 5 MB')
  }
  // Atómico en la base (solo esta clave): subir dos capturas a la vez ya no deja una afuera.
  const r = await datos.guardarCaptura(i.id, cual, path)
  if (!r) {
    await datos.borrarArchivos([path])
    throw new ErrorInforme(409, 'El informe ya está listo')
  }
  if (r.anterior && r.anterior !== path) await datos.borrarArchivos([r.anterior])
  return r.capturas
}

export async function quitarCaptura(i: Informe, cual: NombreCaptura): Promise<Capturas> {
  exigirBorrador(i)
  const r = await datos.guardarCaptura(i.id, cual, null)
  if (!r) throw new ErrorInforme(409, 'El informe ya está listo')
  if (r.anterior) await datos.borrarArchivos([r.anterior])
  return r.capturas
}

// ─── PDF y "listo" ───────────────────────────────────────────────────────────

export async function prepararPdf(i: Informe) {
  exigirBorrador(i)
  const pendientes = faltantes(i)
  if (pendientes.length) throw new ErrorInforme(400, `Falta completar: ${pendientes.join(', ')}`)
  return datos.crearSubidaFirmada(pathDelPdf(i.id, randomUUID()))
}

const CAMBIO_MIENTRAS_SE_ARMABA = 'El informe cambió mientras se armaba el PDF. Volvé a tocar "Marcar como listo".'

/**
 * `version` = el `updated_at` del informe con el que el navegador armó el PDF. Si no coincide con el
 * actual, el PDF no refleja lo guardado (se editó algo, llegó una fuente, otra pestaña): no se marca.
 */
export async function marcarInformeListo(i: Informe, pdfPath: string, userId: string, version: string): Promise<void> {
  exigirBorrador(i)
  if (!esPathDelPdf(pdfPath, i.id)) throw new ErrorInforme(400, 'El PDF no corresponde a este informe')
  if (i.updatedAt !== version) {
    await datos.borrarArchivos([pdfPath])
    throw new ErrorInforme(409, CAMBIO_MIENTRAS_SE_ARMABA)
  }
  const pendientes = faltantes(i)
  if (pendientes.length) throw new ErrorInforme(400, `Falta completar: ${pendientes.join(', ')}`)
  const archivo = await datos.primerosBytes(pdfPath, 16)
  if (!archivo) throw new ErrorInforme(503, 'No se pudo revisar el PDF. Probá de nuevo en un momento.')
  if (!esPdf(archivo.bytes) || archivo.tamano > MAX_PDF_BYTES) {
    await datos.borrarArchivos([pdfPath])
    throw new ErrorInforme(400, 'El archivo no es un PDF válido')
  }
  const anterior = i.pdfPath
  if (!(await datos.marcarListo(i.id, pdfPath, userId, version))) {
    await datos.borrarArchivos([pdfPath])
    throw new ErrorInforme(409, CAMBIO_MIENTRAS_SE_ARMABA)
  }
  if (anterior && anterior !== pdfPath) await datos.borrarArchivos([anterior])
}

// ─── Lo que ve la pantalla (y con lo que se arma el PDF) ─────────────────────

export interface VistaInforme {
  informe: Informe
  propiedad: PropiedadDelInforme
  resumen: Resumen
  paginas: Pagina[]
  faltantes: string[]
  capturasUrl: Partial<Record<NombreCaptura, string>>
  pdfUrl: string | null
  candidatas: Candidata[]
}

export async function vistaDelInforme(i: Informe): Promise<VistaInforme> {
  const propiedad = await datos.leerPropiedad(i.propertyId)
  if (!propiedad) throw new ErrorInforme(404, 'No encontramos la propiedad del informe')
  const capturasUrl: Partial<Record<NombreCaptura, string>> = {}
  for (const [cual, path] of Object.entries(i.capturas) as Array<[NombreCaptura, string]>) {
    const url = await datos.urlFirmada(path, SEGUNDOS_URL_LECTURA)
    if (url) capturasUrl[cual] = url
  }
  const pdfUrl = i.pdfPath ? await datos.urlFirmada(i.pdfPath, SEGUNDOS_URL_LECTURA, nombreDelPdf(propiedad.direccion, i.desde, i.hasta)) : null
  return {
    informe: i, propiedad, resumen: resumenDeMetricas(i.fuentes, i.manual), paginas: paginasDelInforme(i),
    faltantes: faltantes(i), capturasUrl, pdfUrl, candidatas: candidatasOrdenadas(i, propiedad),
  }
}
