/**
 * Lo que un video de Publicaciones responde a los comentarios: la misma
 * configuración que un reel de la ficha (palabra, frases públicas, privado y
 * modo), validada con LAS MISMAS reglas (`lib/social/reels`). Cuando el video
 * sale, esto se copia tal cual a su fila de `property_reels`.
 *
 * Módulo PURO.
 */
import { z } from 'zod'
import { validarMensajes } from '@/lib/social/reels/mensajes'
import type { ModoReel } from '@/lib/social/reels/modo'
import { limpiarPalabras, normalizarParaComparar, separarPalabras } from '@/lib/social/reels/palabra-clave'
import {
  BOTON_POR_DEFECTO,
  FRASES_CON_PRIVADO,
  FRASES_SIN_PRIVADO,
  PRIVADO_POR_DEFECTO,
  SEGUIMIENTO_POR_DEFECTO,
} from '@/lib/social/reels/textos-por-defecto'
import { LIMITES } from './textos'

export type TipoAutomatizacion = 'propiedad' | 'personalizado'

export interface AutomatizacionVideo {
  /** De una propiedad (el botón lleva a su landing) o personalizado (lleva a `enlace`). */
  tipo: TipoAutomatizacion
  /** Solo en personalizado: a dónde lleva el botón del privado (https). */
  enlace: string | null
  /** La persona tocó "Confirmar": sin esto no se programa ni se conecta. */
  confirmada: boolean
  palabras: string
  respuestas_con_privado: string[]
  respuestas_sin_privado: string[]
  dm_texto: string | null
  dm_boton: string
  dm_seguimiento: string | null
  modo: ModoReel
}

/** Lo que aparece al conectar una propiedad: los textos de fábrica de la ficha, en Modo prueba (decisión del spec). */
export function automatizacionPorDefecto(): AutomatizacionVideo {
  return {
    tipo: 'propiedad',
    enlace: null,
    confirmada: false,
    palabras: '',
    respuestas_con_privado: [...FRASES_CON_PRIVADO],
    respuestas_sin_privado: [...FRASES_SIN_PRIVADO],
    dm_texto: PRIVADO_POR_DEFECTO,
    dm_boton: BOTON_POR_DEFECTO,
    dm_seguimiento: SEGUIMIENTO_POR_DEFECTO,
    modo: 'prueba',
  }
}

/**
 * El privado de fábrica dice "Te dejo la ficha completa de la propiedad" y el botón "Ver la
 * propiedad": en un personalizado (una landing de tasación, un WhatsApp) eso le miente a la
 * persona. Si el texto sigue siendo el de fábrica, cada tipo arranca con el suyo. Lo que
 * alguien escribió a mano no se toca.
 */
export const PRIVADO_PERSONALIZADO = '¡Hola! Gracias por comentar 🙌 Te dejo toda la info acá 👇'
export const BOTON_PERSONALIZADO = 'Ver más'

export function privadoParaTipo(
  m: { dm_texto: string; dm_boton: string },
  tipo: TipoAutomatizacion,
): { dm_texto: string; dm_boton: string } {
  const [desdeTexto, desdeBoton, aTexto, aBoton] =
    tipo === 'personalizado'
      ? [PRIVADO_POR_DEFECTO, BOTON_POR_DEFECTO, PRIVADO_PERSONALIZADO, BOTON_PERSONALIZADO]
      : [PRIVADO_PERSONALIZADO, BOTON_PERSONALIZADO, PRIVADO_POR_DEFECTO, BOTON_POR_DEFECTO]
  return {
    dm_texto: m.dm_texto.trim() === desdeTexto ? aTexto : m.dm_texto,
    dm_boton: m.dm_boton.trim() === desdeBoton ? aBoton : m.dm_boton,
  }
}

const forma = z
  .object({
    // Opcionales con valor por defecto: las configuraciones guardadas antes no los tenían.
    tipo: z.enum(['propiedad', 'personalizado']).default('propiedad'),
    enlace: z.string().max(600).nullable().default(null),
    confirmada: z.boolean().default(false),
    palabras: z.string().max(400),
    respuestas_con_privado: z.array(z.string().max(1000)).max(10),
    respuestas_sin_privado: z.array(z.string().max(1000)).max(10),
    dm_texto: z.string().max(2000).nullable(),
    dm_boton: z.string().max(200),
    dm_seguimiento: z.string().max(2000).nullable(),
    modo: z.enum(['apagado', 'prueba', 'en_vivo']),
  })
  .strict()

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

/**
 * El enlace del botón en un personalizado: solo https, sin espacios, con un dominio de verdad.
 * Va en un mensaje a un cliente: un `javascript:` o un http sin cifrar no pueden pasar.
 */
export function limpiarEnlace(texto: string | null): string | null {
  let t = (texto ?? '').trim()
  if (!t) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || /\s/.test(t) || t.length > 500) return null
  return u.toString()
}

export function validarAutomatizacion(entrada: unknown): Resultado<AutomatizacionVideo> {
  const f = forma.safeParse(entrada)
  if (!f.success) return { ok: false, error: 'La configuración de comentarios no es válida.' }
  const palabras = limpiarPalabras(f.data.palabras)
  if (!palabras.ok) return { ok: false, error: palabras.error }
  // Sin palabra, prendido le respondería a cualquiera que comente cualquier cosa.
  if (!palabras.valor && f.data.modo !== 'apagado') {
    return { ok: false, error: 'Poné la palabra que la gente tiene que comentar (o dejalo Apagado).' }
  }
  const mensajes = validarMensajes(f.data)
  if (!mensajes.ok) return mensajes
  const m = mensajes.valor
  const enlace = f.data.tipo === 'personalizado' ? limpiarEnlace(f.data.enlace) : null
  if (f.data.tipo === 'personalizado' && !enlace) {
    return { ok: false, error: 'Poné a dónde lleva el botón del privado: un enlace que empiece con https:// (por ejemplo, un WhatsApp).' }
  }
  return {
    ok: true,
    valor: {
      tipo: f.data.tipo,
      enlace,
      confirmada: f.data.confirmada,
      palabras: palabras.valor ?? '',
      respuestas_con_privado: m.respuestas_con_privado ?? [],
      respuestas_sin_privado: m.respuestas_sin_privado ?? [],
      dm_texto: m.dm_texto ?? null,
      dm_boton: m.dm_boton ?? BOTON_POR_DEFECTO,
      dm_seguimiento: m.dm_seguimiento ?? null,
      modo: f.data.modo,
    },
  }
}

// ------------------------------------------------- La línea de la descripción

const LINEA_RE = /^Comentá «[^»\n]*» y te mando toda la info\.$/

export function lineaDePalabra(palabras: string): string | null {
  const primera = separarPalabras(palabras)[0]
  return primera ? `Comentá «${primera.toLocaleUpperCase('es-AR')}» y te mando toda la info.` : null
}

/**
 * La descripción con UNA línea de palabra al final: si ya había una nuestra, se
 * reemplaza; sin palabra, se saca. Lo demás del texto no se toca. Si se pasa
 * del límite de Instagram se recorta el TEXTO, nunca la línea: sin ella nadie
 * sabe qué comentar.
 */
export function conLineaDePalabra(descripcion: string, palabras: string): string {
  const lineas = descripcion.split('\n').filter((l) => !LINEA_RE.test(l.trim()))
  const cuerpo = lineas.join('\n').trimEnd()
  const linea = lineaDePalabra(palabras)
  if (!linea) return cuerpo
  if (!cuerpo) return linea
  const separador = '\n\n'
  const lugar = LIMITES.descripcion - linea.length - separador.length
  const recortado = cuerpo.length > lugar ? cuerpo.slice(0, lugar).trimEnd() : cuerpo
  return `${recortado}${separador}${linea}`
}

/** ¿La descripción le dice a la gente qué comentar? Sin palabra no hay nada que decir. */
export function mencionaPalabra(descripcion: string, palabras: string): boolean {
  const primera = separarPalabras(palabras)[0]
  if (!primera) return true
  return normalizarParaComparar(descripcion).includes(normalizarParaComparar(primera))
}

/**
 * Los videos que tienen comentarios configurados pero NO confirmados. Mientras haya
 * alguno, no se programa la tanda: lo que va a responder lo aprueba una persona.
 * Una configuración ilegible cuenta como sin confirmar (ante la duda, frena).
 */
export function sinConfirmar<V extends { nombre_archivo: string; automatizacion: unknown }>(videos: V[]): string[] {
  return videos
    .filter((v) => {
      if (v.automatizacion === null || v.automatizacion === undefined) return false
      const c = validarAutomatizacion(v.automatizacion)
      return !c.ok || !c.valor.confirmada
    })
    .map((v) => v.nombre_archivo)
}
