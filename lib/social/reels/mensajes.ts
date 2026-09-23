/**
 * Validación de los mensajes de un reel: las frases públicas, el privado, su
 * botón y el mensaje que acompaña al enlace.
 *
 * Módulo PURO: lo usan la ruta (que es la que manda) y la pantalla (para apagar
 * "Guardar" con la misma regla y no aprobar algo que el servidor rechaza).
 *
 * Se normaliza a NFC antes de contar: macOS entrega la tilde suelta (NFD), que
 * son DOS caracteres, y una frase de 300 "visibles" podía medir 310.
 */

export const MAX_FRASES = 3
export const MAX_CARACTERES_FRASE = 300
/** Instagram rechaza el mensaje ENTERO si el botón pasa de 20. */
export const MAX_CARACTERES_BOTON = 20
export const MAX_CARACTERES_MENSAJE = 1000
/** El privado va con un botón con enlace, y ahí Instagram corta en 640. */
export const MAX_CARACTERES_PRIVADO = 640

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

/**
 * Los únicos dominios que pueden aparecer en un texto que sale desde la cuenta.
 * El enlace de la landing lo agrega el sistema solo; no hay motivo legítimo para
 * que el asesor escriba otro, y un enlace ajeno en un privado de una cuenta de
 * 26.000 seguidores es un phishing con nuestra credibilidad (revisión de
 * seguridad, 2026-09-22). Se compara el HOST exacto o sus subdominios, nunca con
 * `includes`: "inmodf.com.ar.evil.com" pasaría cualquier comparación floja.
 */
const DOMINIOS_PROPIOS = ['inmodf.com.ar', 'inmobiliariadiegoferreyra.com']

/** Algo con forma de dominio: letras/números, un punto y un final de 2+ letras. */
const PARECE_DOMINIO = /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[\/\s?#:),.!]|$)/gi

/** El primer dominio ajeno que aparece en el texto, o `null`. */
export function enlaceAjeno(texto: string): string | null {
  for (const m of texto.matchAll(PARECE_DOMINIO)) {
    const host = m[1].toLowerCase().replace(/^www\./, '')
    const propio = DOMINIOS_PROPIOS.some((d) => host === d || host.endsWith(`.${d}`))
    if (!propio) return m[1]
  }
  return null
}

function rechazoPorEnlace(texto: string): string | null {
  const ajeno = enlaceAjeno(texto)
  return ajeno
    ? `No se puede poner un enlace a otro sitio (${ajeno}): el de la landing lo agrega el sistema solo.`
    : null
}

function limpio(texto: string): string {
  return texto.normalize('NFC').trim()
}

export function limpiarFrases(frases: readonly string[]): Resultado<string[]> {
  const utiles = frases.map(limpio).filter((f) => f.length > 0)
  if (utiles.length === 0) {
    return { ok: false, error: 'Hace falta al menos una frase: si no, el comentario queda sin respuesta.' }
  }
  if (utiles.length > MAX_FRASES) {
    return { ok: false, error: `Son ${utiles.length} frases: el máximo es ${MAX_FRASES} frases.` }
  }
  const larga = utiles.find((f) => f.length > MAX_CARACTERES_FRASE)
  if (larga) {
    return { ok: false, error: `Una frase tiene ${larga.length} caracteres: el máximo es ${MAX_CARACTERES_FRASE}.` }
  }
  for (const f of utiles) {
    const rechazo = rechazoPorEnlace(f)
    if (rechazo) return { ok: false, error: rechazo }
  }
  return { ok: true, valor: utiles }
}

export interface MensajesDelReel {
  respuestas_con_privado?: readonly string[]
  respuestas_sin_privado?: readonly string[]
  dm_texto?: string | null
  dm_boton?: string
  dm_seguimiento?: string | null
}

export interface MensajesLimpios {
  respuestas_con_privado?: string[]
  respuestas_sin_privado?: string[]
  dm_texto?: string | null
  dm_boton?: string
  dm_seguimiento?: string | null
}

/**
 * Valida SOLO lo que vino: un PATCH que cambia el botón no tiene por qué
 * mandar las frases. Un privado o un seguimiento vacío se guarda como null, que
 * significa "usar el de fábrica" (el procesador lo resuelve así).
 */
export function validarMensajes(m: MensajesDelReel): Resultado<MensajesLimpios> {
  const salida: MensajesLimpios = {}

  for (const [clave, grupo] of [
    ['respuestas_con_privado', 'cuando el privado sale'],
    ['respuestas_sin_privado', 'si el privado no sale'],
  ] as const) {
    const frases = m[clave]
    if (frases === undefined) continue
    const r = limpiarFrases(frases)
    if (!r.ok) return { ok: false, error: `Frases ${grupo}: ${r.error}` }
    salida[clave] = r.valor
  }

  if (m.dm_boton !== undefined) {
    const boton = limpio(m.dm_boton)
    if (boton.length === 0) return { ok: false, error: 'El botón necesita un texto.' }
    if (boton.length > MAX_CARACTERES_BOTON) {
      return { ok: false, error: `El texto del botón tiene ${boton.length} caracteres: el máximo es ${MAX_CARACTERES_BOTON}.` }
    }
    const rechazo = rechazoPorEnlace(boton)
    if (rechazo) return { ok: false, error: rechazo }
    salida.dm_boton = boton
  }

  for (const clave of ['dm_texto', 'dm_seguimiento'] as const) {
    const valor = m[clave]
    if (valor === undefined) continue
    const texto = valor === null ? '' : limpio(valor)
    const maximo = clave === 'dm_texto' ? MAX_CARACTERES_PRIVADO : MAX_CARACTERES_MENSAJE
    if (texto.length > maximo) {
      return { ok: false, error: `El mensaje tiene ${texto.length} caracteres: el máximo es ${maximo}.` }
    }
    const rechazo = rechazoPorEnlace(texto)
    if (rechazo) return { ok: false, error: rechazo }
    salida[clave] = texto.length > 0 ? texto : null
  }

  return { ok: true, valor: salida }
}
