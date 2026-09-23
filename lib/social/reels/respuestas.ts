/**
 * Las respuestas públicas al comentario.
 *
 * ## Por qué hay DOS grupos de frases y no uno
 *
 * La respuesta pública y el mensaje privado son dos acciones separadas, y la
 * primera sale aunque la segunda no. Pasa hoy mismo —Meta todavía no destrabó el
 * permiso de mensajes privados— y va a volver a pasar cada vez que el privado
 * falle, que la persona ya haya recibido el suyo, o que se venza el plazo de 7
 * días que impone Instagram.
 *
 * Si en esos casos respondiéramos "ya te lo mandé por privado", le estaríamos
 * mintiendo a la persona delante de todos los que leen los comentarios, y encima
 * quedaría escrito abajo del reel. Por eso el texto depende de lo que REALMENTE
 * pasó: solo se promete el mensaje cuando el mensaje salió.
 *
 * Desde 2026-09-22 las frases son DEL REEL (el asesor las ve y las edita al
 * engancharlo). Las de fábrica quedan como respaldo: si las del reel llegaran
 * vacías, el comentario igual recibe una respuesta con sentido.
 *
 * ## Por qué la elección es determinística
 *
 * Meta reintenta sus avisos cuando no recibe un 200 a tiempo. Con una elección
 * al azar, el reintento elegiría otra frase y quedarían dos respuestas distintas
 * bajo el mismo comentario. Con la semilla atada al identificador del comentario,
 * el reintento vuelve a elegir exactamente la misma.
 */
import { FRASES_CON_PRIVADO, FRASES_SIN_PRIVADO } from './textos-por-defecto'

/** Se mantienen con estos nombres: los catálogos de fábrica. */
export const RESPUESTAS_CON_PRIVADO = FRASES_CON_PRIVADO
export const RESPUESTAS_SIN_PRIVADO = FRASES_SIN_PRIVADO

/**
 * ¿La frase le dice a la persona que se le mandó un mensaje? La pantalla lo usa
 * para avisar si alguien escribe algo así en las frases de respaldo, que son las
 * que salen justamente cuando el privado NO salió.
 */
export function prometePrivado(frase: string): boolean {
  return /privado|\bdm\b|mensaje|bandeja|mand[eé]|envi[eé]|escrib[ií]/i.test(frase)
}

/** Suma de códigos de carácter: estable, barata y sin dependencias. */
function semillaNumerica(semilla: string): number {
  let acumulado = 0
  for (const caracter of semilla) {
    acumulado = (acumulado * 31 + (caracter.codePointAt(0) ?? 0)) >>> 0
  }
  return acumulado
}

/**
 * ¿La persona tiene el privado de este reel? Decide qué grupo de frases va.
 *
 * Sí si salió ahora, y TAMBIÉN si ya lo había recibido antes: no se le manda
 * otro, pero es verdad que lo tiene, así que corresponde "te escribí al
 * privado". Responderle "¡Gracias por comentar!" como si nunca hubiera recibido
 * nada fue el error que marcó el dueño el 2026-09-23. Las de respaldo quedan
 * solo para cuando el privado nunca salió.
 */
export function tienePrivado(a: { privadoEnviado: boolean; motivo: string | null }): boolean {
  return a.privadoEnviado || a.motivo === 'ya_recibio_dm'
}

export interface FrasesDelReel {
  con?: readonly string[] | null
  sin?: readonly string[] | null
}

/**
 * Elige la frase para este comentario.
 *
 * @param semilla identificador del comentario — misma semilla, misma frase.
 * @param privadoEnviado si el mensaje privado salió de verdad.
 * @param frases las frases del reel; vacías o ausentes → las de fábrica.
 */
export function elegirRespuesta(semilla: string, privadoEnviado: boolean, frases: FrasesDelReel = {}): string {
  const delReel = (privadoEnviado ? frases.con : frases.sin) ?? []
  // `typeof` antes de `trim`: si alguien escribió en la base un arreglo de dos
  // dimensiones, acá llegan arreglos y `trim` tiraba una excepción que dejaba el
  // comentario sin respuesta.
  const utiles = (Array.isArray(delReel) ? delReel : [])
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
  const catalogo = utiles.length > 0 ? utiles : privadoEnviado ? FRASES_CON_PRIVADO : FRASES_SIN_PRIVADO
  return catalogo[semillaNumerica(semilla) % catalogo.length]
}
