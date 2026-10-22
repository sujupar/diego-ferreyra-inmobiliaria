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
import { FUENTES, type Capturas, type FuenteGuardada, type Fuentes, type Informe, type NombreCaptura, type NombreFuente, type PropiedadDelInforme } from './tipos'

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
  })
  if (!(await datos.guardarFuente(i.id, nombre, valor as FuenteGuardada<unknown>))) throw new ErrorInforme(409, 'El informe ya está listo')
  return valor as FuenteGuardada<unknown>
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
  const anterior = i.capturas[cual]
  const capturas = { ...i.capturas, [cual]: path }
  if (!(await datos.guardarCapturas(i.id, capturas))) throw new ErrorInforme(409, 'El informe ya está listo')
  if (anterior && anterior !== path) await datos.borrarArchivos([anterior])
  return capturas
}

export async function quitarCaptura(i: Informe, cual: NombreCaptura): Promise<Capturas> {
  exigirBorrador(i)
  const anterior = i.capturas[cual]
  const capturas = { ...i.capturas }
  delete capturas[cual]
  if (!(await datos.guardarCapturas(i.id, capturas))) throw new ErrorInforme(409, 'El informe ya está listo')
  if (anterior) await datos.borrarArchivos([anterior])
  return capturas
}

// ─── PDF y "listo" ───────────────────────────────────────────────────────────

export async function prepararPdf(i: Informe) {
  exigirBorrador(i)
  const pendientes = faltantes(i)
  if (pendientes.length) throw new ErrorInforme(400, `Falta completar: ${pendientes.join(', ')}`)
  return datos.crearSubidaFirmada(pathDelPdf(i.id, randomUUID()))
}

export async function marcarInformeListo(i: Informe, pdfPath: string, userId: string): Promise<void> {
  exigirBorrador(i)
  const pendientes = faltantes(i)
  if (pendientes.length) throw new ErrorInforme(400, `Falta completar: ${pendientes.join(', ')}`)
  if (!esPathDelPdf(pdfPath, i.id)) throw new ErrorInforme(400, 'El PDF no corresponde a este informe')
  const archivo = await datos.primerosBytes(pdfPath, 16)
  if (!archivo) throw new ErrorInforme(503, 'No se pudo revisar el PDF. Probá de nuevo en un momento.')
  if (!esPdf(archivo.bytes) || archivo.tamano > MAX_PDF_BYTES) {
    await datos.borrarArchivos([pdfPath])
    throw new ErrorInforme(400, 'El archivo no es un PDF válido')
  }
  const anterior = i.pdfPath
  if (!(await datos.marcarListo(i.id, pdfPath, userId))) throw new ErrorInforme(409, 'El informe ya estaba listo')
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
    faltantes: faltantes(i), capturasUrl, pdfUrl,
  }
}
