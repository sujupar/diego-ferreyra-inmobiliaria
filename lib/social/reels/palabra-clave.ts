/**
 * Reconocer la palabra del llamado a la acción dentro de un comentario.
 *
 * Módulo PURO: sin red, sin base, sin `process.env`. Es lo que permite probar
 * los casos borde sin tocar Instagram ni mandarle un mensaje a nadie.
 *
 * ## Por qué se normaliza a NFC antes que nada
 *
 * macOS entrega el texto DESCOMPUESTO: la "ó" de "tasación" copiada del Finder,
 * de un PDF o de la terminal son DOS caracteres ('o' + U+0301), no uno. En
 * pantalla se ven idénticas. Sin normalizar, comparar una contra otra devuelve
 * `false` SIN NINGÚN ERROR — el sistema simplemente no reacciona y parece
 * apagado. Ya mordió al buscador de los listados (ver CLAUDE.md).
 *
 * ## Por qué la ñ se conserva
 *
 * Sacar tildes es correcto para á/é/í/ó/ú, pero la ñ NO es una "n con tilde":
 * es otra letra. Aplastarla convierte "año" en "ano" y "cabaña" en "cabana".
 * Por eso se la aparta antes de descomponer y se la devuelve después.
 */

/** Carácter de uso privado: no aparece en texto escrito por una persona. */
const MARCA_ENIE = ''

export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize('NFC')
    .toLocaleLowerCase('es-AR')
    .replaceAll('ñ', MARCA_ENIE)
    .normalize('NFD')
    // Los signos diacríticos ya separados por la descomposición.
    .replace(/[̀-ͯ]/g, '')
    .replaceAll(MARCA_ENIE, 'ñ')
    .trim()
}

/**
 * Límite de palabra. NO se usa `\b` de las expresiones regulares: está definido
 * sobre el alfabeto ASCII, así que trata la ñ y las vocales con tilde como
 * separadores y partiría las palabras en el peor lugar posible.
 */
const NO_ES_LETRA = /[^\p{L}\p{N}]/u

/**
 * ¿El comentario contiene la palabra configurada?
 *
 * Contiene, no es igual: el dueño lo pidió así ("que comente la palabra o que
 * la contenga"). Pero la palabra tiene que estar ENTERA — "impropiedades" no
 * cuenta como "propiedad", porque la persona no la escribió y recibir un
 * mensaje automático por eso se ve como un error.
 *
 * FALLA CERRADO: sin comentario o sin palabra configurada devuelve `false`. Si
 * devolviera `true`, un reel al que se le olvidó poner la palabra le mandaría un
 * mensaje privado a cualquiera que comentara cualquier cosa.
 *
 * El texto de la persona NUNCA se usa como expresión regular: se busca con
 * `indexOf`. Un comentario con un paréntesis o un asterisco tiraría una
 * excepción adentro del webhook, y ahí se caen TODOS los comentarios del lote.
 */
export function comentarioCoincide(
  comentario: string | null | undefined,
  palabra: string | null | undefined,
): boolean {
  if (!comentario || !palabra) return false

  const aguja = normalizarParaComparar(palabra)
  if (!aguja) return false
  const pajar = normalizarParaComparar(comentario)

  let desde = 0
  for (;;) {
    const i = pajar.indexOf(aguja, desde)
    if (i === -1) return false

    const antes = i === 0 ? '' : pajar[i - 1]
    const despues = pajar[i + aguja.length] ?? ''
    if ((!antes || NO_ES_LETRA.test(antes)) && (!despues || NO_ES_LETRA.test(despues))) {
      return true
    }
    // Calce pegado a otra palabra: seguir buscando. Rendirse acá haría que
    // "impropiedades y propiedad" no coincidiera.
    desde = i + 1
  }
}
