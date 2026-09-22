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

/* -------------------------------------------------------------------------- */
/*  Varias palabras por reel                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Por qué varias: el reel del 20/09 pedía "PARQUE RIVADAVIA" y de 21
 * comentarios solo 3 la usaron; 6 escribieron "doblas" (lo que se dijo en el
 * video), 4 "info" y 4 "precio". Con una sola palabra, a 18 de 21 no se les
 * habría respondido.
 *
 * Se guardan en la MISMA columna de texto, separadas por coma, en vez de pasar
 * a un arreglo: así ningún lector de `palabra_clave` cambia de tipo, y un reel
 * con una sola palabra (sin comas) es una lista de una. El formato vive SOLO
 * acá: todo el que necesite la lista la pide a `separarPalabras`.
 */

export const MAX_PALABRAS = 10
export const MAX_CARACTERES_PALABRAS = 200

/**
 * La lista de palabras de un reel: separadas por coma, sin espacios de más,
 * sin vacías y sin repetidas (comparadas sin tildes ni mayúsculas, quedándose
 * con la primera tal como la escribió el asesor: es la que va en la descripción).
 */
export function separarPalabras(texto: string | null | undefined): string[] {
  if (!texto) return []
  const vistas = new Set<string>()
  const lista: string[] = []
  for (const cruda of texto.split(',')) {
    const palabra = cruda.replace(/\s+/g, ' ').trim()
    if (!palabra) continue
    const clave = normalizarParaComparar(palabra)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    lista.push(palabra)
  }
  return lista
}

export type ResultadoPalabras = { ok: true; valor: string | null } | { ok: false; error: string }

/**
 * Una palabra tiene que tener al menos 2 letras o números. "a" es una
 * preposición y "!" está en "hermoso!!": con una de esas en la lista, un error
 * de tipeo del asesor haría que el sistema le conteste a casi cualquier
 * comentario, a clientes reales. Dos alcanza para palabras cortas de verdad ("sí").
 */
const MIN_LETRAS_O_NUMEROS = 2

export function esPalabraUtil(palabra: string): boolean {
  return (normalizarParaComparar(palabra).match(/[\p{L}\p{N}]/gu) ?? []).length >= MIN_LETRAS_O_NUMEROS
}

/**
 * Lo que se guarda en la base. `null` si no quedó ninguna: "sin palabra" tiene
 * que seguir siendo un estado distinguible, porque sin palabra no se activa.
 * Los topes se miden sobre la lista YA limpia, así una repetida no le quita
 * lugar a una palabra de verdad.
 */
export function limpiarPalabras(texto: string | null | undefined): ResultadoPalabras {
  const lista = separarPalabras(texto)
  if (lista.length === 0) return { ok: true, valor: null }
  const inutil = lista.find((palabra) => !esPalabraUtil(palabra))
  if (inutil !== undefined) {
    return { ok: false, error: `"${inutil}" no sirve como palabra: necesita al menos ${MIN_LETRAS_O_NUMEROS} letras o números.` }
  }
  if (lista.length > MAX_PALABRAS) {
    return { ok: false, error: `Son ${lista.length} palabras: el máximo es ${MAX_PALABRAS} palabras por reel.` }
  }
  const valor = lista.join(', ')
  if (valor.length > MAX_CARACTERES_PALABRAS) {
    return { ok: false, error: `Las palabras suman ${valor.length} caracteres: el máximo es ${MAX_CARACTERES_PALABRAS}.` }
  }
  return { ok: true, valor }
}

/**
 * ¿El comentario contiene alguna de las palabras configuradas?
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
  palabras: string | null | undefined,
): boolean {
  if (!comentario) return false
  // Los espacios se juntan en los dos lados: "parque  rivadavia" (doble espacio,
  // típico del teclado del celular) es la misma frase.
  const pajar = normalizarParaComparar(comentario).replace(/\s+/g, ' ')
  const lista = separarPalabras(palabras)
  // La ruta nunca guarda más del tope. Si llega más, vino por otro camino (una
  // escritura directa a la base): no se sabe qué es, así que no se responde.
  if (lista.length > MAX_PALABRAS) return false
  // Las que no sirven se ignoran aunque estén guardadas, por el mismo motivo.
  return lista
    .filter(esPalabraUtil)
    .some((palabra) => contieneEntera(pajar, normalizarParaComparar(palabra)))
}

function contieneEntera(pajar: string, aguja: string): boolean {
  if (!aguja) return false

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
