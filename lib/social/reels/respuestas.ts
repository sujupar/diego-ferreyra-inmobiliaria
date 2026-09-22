/**
 * Las respuestas públicas al comentario.
 *
 * ## Por qué hay DOS catálogos y no uno
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
 * ## Por qué la elección es determinística
 *
 * Meta reintenta sus avisos cuando no recibe un 200 a tiempo. Con una elección
 * al azar, el reintento elegiría otra frase y quedarían dos respuestas distintas
 * bajo el mismo comentario. Con la semilla atada al identificador del comentario,
 * el reintento vuelve a elegir exactamente la misma.
 */

/** Cuando el privado SÍ salió: se le avisa que lo mire. */
export const RESPUESTAS_CON_PRIVADO: readonly string[] = [
  '¡Listo! Te escribí al privado 📩',
  'Gracias por comentar 🙌 Te dejé todo en el privado',
  'Hecho, fijate tu bandeja 👀',
  'Te acabo de escribir por privado ✅',
  '¡Gracias! Te mandé la info al privado 📲',
]

/**
 * Cuando el privado NO salió: se agradece y nada más.
 *
 * Es deliberadamente sobrio. Cualquier promesa acá ("en breve te contactamos")
 * sería otra vez algo que el sistema no puede garantizar. Agradecer es verdad,
 * cuesta cero, y además mueve el reel — que es la mitad del valor de responder.
 */
export const RESPUESTAS_SIN_PRIVADO: readonly string[] = [
  '¡Gracias por comentar! 🙌',
  '¡Gracias! 🙏',
  'Gracias por pasar 👋',
  '¡Gracias por el interés! ✨',
  'Gracias 🙌',
]

/** Suma de códigos de carácter: estable, barata y sin dependencias. */
function semillaNumerica(semilla: string): number {
  let acumulado = 0
  for (const caracter of semilla) {
    acumulado = (acumulado * 31 + (caracter.codePointAt(0) ?? 0)) >>> 0
  }
  return acumulado
}

/**
 * Elige la frase para este comentario.
 *
 * @param semilla identificador del comentario — misma semilla, misma frase.
 * @param privadoEnviado si el mensaje privado salió de verdad.
 */
export function elegirRespuesta(semilla: string, privadoEnviado: boolean): string {
  const catalogo = privadoEnviado ? RESPUESTAS_CON_PRIVADO : RESPUESTAS_SIN_PRIVADO
  return catalogo[semillaNumerica(semilla) % catalogo.length]
}
