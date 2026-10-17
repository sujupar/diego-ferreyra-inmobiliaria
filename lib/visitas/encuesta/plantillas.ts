/**
 * Las dos plantillas de WhatsApp de la encuesta (spec §11.8), con el cuerpo en UN solo lugar: lo
 * usan el envío y el script que las crea en Meta (scripts/create-whatsapp-templates-encuesta-visita.ts).
 * Si el texto aprobado y el que se manda divergen, el Inbox muestra un mensaje que nadie recibió.
 *
 * Plantilla y botón/encabezado se deciden JUNTOS (incidente 2026-09-17): Meta rechaza el mensaje
 * ENTERO si a una plantilla con botón le falta el dato del botón, o si le sobra a una sin botón.
 * Por eso una plantilla configurada que NO está en este catálogo no se manda: sus datos no se adivinan.
 *
 * SIN alias `@/`: el script de creación importa este archivo con una ruta relativa.
 */
export const IDIOMA_PLANTILLAS = 'es_AR'

export const PLANTILLA_ENCUESTA_V1 = 'encuesta_visita_v1'
/** {{1}} nombre de pila · {{2}} dirección · {{3}} fecha (dd/mm) · {{4}} token. Texto aprobado por el dueño (§4.11). */
export const CUERPO_ENCUESTA_V1 =
  'Hola {{1}}. Registramos tu visita a {{2}} del {{3}}. Para completar la ficha de la visita, entrá acá: https://inmodf.com.ar/encuesta/{{4}}\n\nDiego Ferreyra Inmobiliaria'
/** El botón abre en el celular; el link del cuerpo salva a WhatsApp de computadora (verificado 2026-08-03). */
export const BOTON_ENCUESTA_V1 = { texto: 'Completar ficha', url: 'https://inmodf.com.ar/encuesta/{{1}}' } as const

export const PLANTILLA_REGALO_V1 = 'regalo_visita_v1'
/** {{1}} nombre de pila · {{2}} dirección. Encabezado DOCUMENTO (el PDF). Sin "regalo": Meta lo leería como promoción. */
export const CUERPO_REGALO_V1 = 'Hola {{1}}. Acá tenés el material de {{2}} que pediste.'

/**
 * v2 (2026-10-17): las que hablan de la guía de gastos para compradores, el regalo GENERAL. Textos
 * aprobados por el dueño tal cual. Nombran el dolor (los US$ 7.000) sin vocabulario de venta: la
 * promesa es "te mandamos la guía", nunca "regalo/gratis". Si Meta igual las clasifica como
 * MARKETING, no se configuran: se reescriben (ver CLAUDE.md § agente de tasación).
 * Mismas variables que las v1, así el envío no cambia: solo cambia el nombre en Netlify.
 */
export const PLANTILLA_ENCUESTA_V2 = 'encuesta_visita_v2'
export const CUERPO_ENCUESTA_V2 =
  'Hola {{1}}. Gracias por visitar {{2}} el {{3}}.\n\n' +
  'Un dato que casi nadie tiene en cuenta: además del precio, escriturar cuesta cerca de un 7 %. ' +
  'En un departamento de US$ 100.000 son unos US$ 7.000 que tienen que estar el día de la firma.\n\n' +
  'Contanos en menos de un minuto qué te pareció la propiedad y te mandamos la guía de gastos que usamos con nuestros clientes: ' +
  'https://inmodf.com.ar/encuesta/{{4}}\n\nDiego Ferreyra Inmobiliaria'
export const BOTON_ENCUESTA_V2 = { texto: 'Contar qué me pareció', url: 'https://inmodf.com.ar/encuesta/{{1}}' } as const

export const PLANTILLA_REGALO_V2 = 'regalo_visita_v2'
export const CUERPO_REGALO_V2 =
  'Hola {{1}}, gracias por contarnos qué te pareció {{2}}. Acá tenés la guía de gastos para compradores: ' +
  'en la página 2 está la cuenta completa. Si querés que hagamos la de una propiedad que estés mirando, respondé este mensaje.'

export interface DefinicionPlantilla {
  nombre: string
  cuerpo: string
  variables: number
  conBoton: boolean
  encabezado: 'document' | null
}

export const PLANTILLAS_ENCUESTA: Readonly<Record<string, DefinicionPlantilla>> = {
  [PLANTILLA_ENCUESTA_V1]: { nombre: PLANTILLA_ENCUESTA_V1, cuerpo: CUERPO_ENCUESTA_V1, variables: 4, conBoton: true, encabezado: null },
  [PLANTILLA_ENCUESTA_V2]: { nombre: PLANTILLA_ENCUESTA_V2, cuerpo: CUERPO_ENCUESTA_V2, variables: 4, conBoton: true, encabezado: null },
}

export const PLANTILLAS_REGALO: Readonly<Record<string, DefinicionPlantilla>> = {
  [PLANTILLA_REGALO_V1]: { nombre: PLANTILLA_REGALO_V1, cuerpo: CUERPO_REGALO_V1, variables: 2, conBoton: false, encabezado: 'document' },
  [PLANTILLA_REGALO_V2]: { nombre: PLANTILLA_REGALO_V2, cuerpo: CUERPO_REGALO_V2, variables: 2, conBoton: false, encabezado: 'document' },
}

export interface EnvioArmado {
  templateName: string
  bodyParams: string[]
  /** Solo si la plantilla declara el botón. */
  urlButtonParam: string | null
  /** La plantilla tiene encabezado de documento: mandarla sin el PDF la hace rechazar entera. */
  necesitaDocumento: boolean
  /** El cuerpo ya armado: es lo que se guarda en whatsapp_messages (lo que la persona leyó). */
  bodyText: string
}

export function cantidadDeVariables(cuerpo: string): number {
  return new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size
}

export function rellenar(cuerpo: string, params: readonly string[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_t, n: string) => params[Number(n) - 1] ?? '')
}

/** Meta rechaza datos con saltos de línea, tabulaciones o muchos espacios seguidos. */
export function paramSeguro(v: string | null | undefined, max: number): string {
  let s = ''
  for (const ch of (v ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    s += c < 32 || c === 127 ? ' ' : ch
  }
  return s.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Meta tampoco acepta un dato vacío: sin nombre, "Hola de nuevo." se lee bien. */
export function nombreDePila(nombre: string | null | undefined, siNoHay = 'de nuevo'): string {
  return paramSeguro(nombre, 60).split(' ')[0] || siNoHay
}

/** `Object.hasOwn`: un nombre como "constructor" no puede sacar algo del prototipo. */
export function definicionDe(catalogo: Readonly<Record<string, DefinicionPlantilla>>, nombre: string | null): DefinicionPlantilla | null {
  if (!nombre || !Object.hasOwn(catalogo, nombre)) return null
  return catalogo[nombre]
}

export function armarEnvioEncuesta(
  plantilla: string | null,
  d: { nombre: string | null; direccion: string | null; fecha: string; token: string },
): EnvioArmado | null {
  const def = definicionDe(PLANTILLAS_ENCUESTA, plantilla)
  if (!def) return null
  const params = [nombreDePila(d.nombre), paramSeguro(d.direccion, 120) || 'la propiedad', paramSeguro(d.fecha, 10), d.token]
  return {
    templateName: def.nombre,
    bodyParams: params,
    urlButtonParam: def.conBoton ? d.token : null,
    necesitaDocumento: def.encabezado === 'document',
    bodyText: rellenar(def.cuerpo, params),
  }
}

export function armarEnvioRegalo(
  plantilla: string | null,
  d: { nombre: string | null; direccion: string | null },
): EnvioArmado | null {
  const def = definicionDe(PLANTILLAS_REGALO, plantilla)
  if (!def) return null
  const params = [nombreDePila(d.nombre), paramSeguro(d.direccion, 120) || 'la propiedad']
  return {
    templateName: def.nombre,
    bodyParams: params,
    urlButtonParam: null,
    necesitaDocumento: def.encabezado === 'document',
    bodyText: rellenar(def.cuerpo, params),
  }
}
