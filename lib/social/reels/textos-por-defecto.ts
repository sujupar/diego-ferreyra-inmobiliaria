/**
 * Los textos de fábrica de un reel: lo que el sistema dice si el asesor no
 * escribe otra cosa.
 *
 * Viven en UN solo lugar porque los usan dos lados que tienen que coincidir: la
 * pantalla de revisión (que los muestra precargados) y el procesador (que los
 * manda). Si cada uno tuviera su copia, el asesor aprobaría un texto y a la
 * gente le llegaría otro. Las frases públicas además son el default de las
 * columnas en la migración 20260922000005; una prueba compara las dos.
 *
 * Módulo PURO: sin red, sin base, se puede importar desde una pantalla.
 */

/** Respuesta pública cuando el privado SÍ salió: avisa que lo mire. */
export const FRASES_CON_PRIVADO: readonly string[] = [
  '¡Listo! Te escribí al privado 📩',
  'Gracias por comentar 🙌 Te dejé todo en el privado',
  '¡Gracias! Te mandé la info al privado 📲',
]

/**
 * Respuesta pública cuando el privado NO salió: agradece y nada más. Cualquier
 * promesa acá sería algo que el sistema no puede garantizar, dicho delante de
 * todos. Hoy son las que se usan: los privados esperan el permiso de Meta.
 */
export const FRASES_SIN_PRIVADO: readonly string[] = [
  '¡Gracias por comentar! 🙌',
  '¡Gracias por el interés! ✨',
  'Gracias por pasar 👋',
]

export const PRIVADO_POR_DEFECTO =
  'Hola! Vi que comentaste en el reel. Te armé la ficha completa de la propiedad, con fotos y todos los detalles. ¿Te la paso?'

/** Instagram rechaza el mensaje ENTERO si el botón pasa de 20 caracteres. */
export const BOTON_POR_DEFECTO = 'Sí, pasámela'

export const SEGUIMIENTO_POR_DEFECTO = 'Acá la tenés 👇'
