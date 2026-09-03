/**
 * Buscador de texto libre sobre varias columnas, para los listados paginados
 * (Historial de Tasaciones y Propiedades).
 *
 * Módulo PURO a propósito: no toca la red ni Supabase. Arma las cláusulas y
 * las devuelve; quien consulta es la ruta de API. Así se puede probar la parte
 * delicada —el escapado— sin base de datos de por medio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ `imatch` (regex) Y NO `ilike`
 *
 * `ilike` ignora mayúsculas pero NO ignora tildes, y los datos reales las
 * mezclan: el título guardado dice "Diaz Velez 3841" (sin tildes) mientras la
 * ubicación dice "Ciudad Autónoma de Buenos Aires" (con tilde). Con `ilike`,
 * buscar "autonoma" no encuentra nada.
 *
 * La salida canónica sería la extensión `unaccent`, pero NO está instalada en
 * esta base (verificado: `select extname from pg_extension` no la trae) e
 * instalarla es tocar infraestructura compartida. Y aunque estuviera, PostgREST
 * no sabe llamar funciones sobre columnas dentro de un `or()`.
 *
 * La salida sin tocar nada es `imatch` (el operador `~*` de Postgres, o sea
 * expresión regular sin distinguir mayúsculas) con cada vocal convertida en una
 * clase de caracteres: "diaz" viaja como `d[iíìîï][aáàâäã]z`, que encuentra
 * tanto "Diaz" como "Díaz". Verificado contra la API real el 2026-09-03.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS DOS TRAMPAS, LAS DOS VERIFICADAS CONTRA LA API (no deducidas)
 *
 * 1. Lo que escribe el usuario es texto, no una expresión regular. Sin escapar,
 *    buscar `2*D` devolvía 17 fichas en vez de 1 (el `*` actuaba de
 *    cuantificador) y un paréntesis suelto hacía que la base respondiera
 *    `400 — invalid regular expression: parentheses () not balanced`.
 *
 * 2. El escape hay que DUPLICARLO al meterlo entre comillas. PostgREST usa la
 *    barra invertida como su propio escape dentro de un valor entrecomillado y
 *    se come una: mandando `"2\*D"` llegaba a Postgres como `2*D` (otra vez las
 *    17 fichas). Con `"2\\*D"` llega como `2\*D` y devuelve 1.
 *
 * Y las comillas no son opcionales: una coma cruda parte el árbol lógico de
 * PostgREST (`PGRST100 — failed to parse logic tree`), y una coma es algo que
 * cualquiera puede escribir en un buscador.
 */

/**
 * Tope de largo del término. No es una restricción de producto: es que el
 * término viaja en la barra de direcciones y termina en una expresión regular
 * que corre en la base. Un tope hace que las dos cosas tengan techo.
 */
export const MAX_LARGO_BUSQUEDA = 80

/**
 * Letras que se consideran la misma con y sin tilde. Cada grupo se vuelve una
 * clase de caracteres, y CADA letra del grupo apunta a ella — por eso la
 * equivalencia vale en las dos direcciones: "diaz" encuentra "Díaz" y "díaz"
 * encuentra "Diaz".
 *
 * No hace falta repetir las mayúsculas: `imatch` no distingue may/min, y eso
 * alcanza también adentro de la clase (verificado: `b[ií]ll[ií]nghurst`
 * encuentra "BILLINGHURST").
 */
const GRUPOS_EQUIVALENTES = ['aáàâäã', 'eéèêë', 'iíìîï', 'oóòôöõ', 'uúùûü', 'nñ', 'cç']

const CLASE_POR_LETRA: Record<string, string> = {}
for (const grupo of GRUPOS_EQUIVALENTES) {
    const clase = `[${grupo}]`
    for (const letra of grupo) CLASE_POR_LETRA[letra] = clase
}

/** Caracteres con significado propio en una expresión regular de Postgres. */
const METACARACTERES = new Set([...'\\^$.[]|()*+?{}'])

/**
 * Deja el término en forma canónica: sin espacios de sobra y con un largo
 * máximo.
 *
 * Es la función `normalizar` que recibe `use-filtros-url`, así que TIENE que
 * ser pura e idempotente (`n(n(x)) === n(x)`) o el espejo optimista de los
 * controles nunca converge y el filtro queda trabado. De ahí el segundo
 * `trim()`: recortar al tope puede dejar un espacio final ("…a b" cortado en
 * "…a "), y ese espacio haría que la segunda pasada devolviera algo distinto
 * de la primera.
 */
export function normalizarBusqueda(crudo: string): string {
    return crudo.replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO_BUSQUEDA).trim()
}

/** Parte el término en palabras. Todas tienen que aparecer (ver más abajo). */
export function palabrasDeBusqueda(termino: string): string[] {
    const normalizado = normalizarBusqueda(termino)
    return normalizado ? normalizado.split(' ') : []
}

/**
 * Convierte UNA palabra escrita por una persona en una expresión regular que
 * busca esa palabra tal cual, sin distinguir tildes ni mayúsculas.
 *
 * Devuelve el patrón con barras invertidas SIMPLES. El duplicado que pide
 * PostgREST lo agrega `valorPostgrest` — son dos capas distintas y mezclarlas
 * es exactamente el error que hacía que el escapado no llegara a la base.
 */
export function patronRegex(palabra: string): string {
    let patron = ''
    for (const caracter of palabra) {
        const minuscula = caracter.toLowerCase()
        // El `length === 1` no es paranoia: hay letras cuyo pasaje a minúscula
        // devuelve DOS caracteres (la İ del turco), y ahí el índice no aplica.
        const clase = minuscula.length === 1 ? CLASE_POR_LETRA[minuscula] : undefined
        if (clase) patron += clase
        else if (METACARACTERES.has(caracter)) patron += '\\' + caracter
        else patron += caracter
    }
    return patron
}

/**
 * Envuelve el patrón como valor de PostgREST: entre comillas dobles, con las
 * barras invertidas duplicadas y las comillas escapadas.
 *
 * El orden importa: primero las barras, después las comillas. Al revés, la
 * barra que se agrega para escapar una comilla se volvería a duplicar y el
 * valor quedaría roto.
 */
export function valorPostgrest(patron: string): string {
    const escapado = patron.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escapado}"`
}

/**
 * Arma una cláusula `or()` de PostgREST POR PALABRA.
 *
 * La forma es "Y de O": cada palabra tiene que aparecer en ALGUNA de las
 * columnas, y todas las palabras tienen que aparecer. Buscar "almagro 3841"
 * trae la ficha donde "Almagro" está en la ubicación y "3841" en el título.
 *
 * Quien consume esto encadena un `.or()` por cláusula, y varios `.or()` sobre
 * la misma consulta se combinan con Y (verificado contra la API: "almagro
 * palermo" devuelve 0 fichas, "almagro 3841" devuelve 1). Agregar palabras
 * siempre achica el resultado, que es lo que cualquiera espera de un buscador.
 */
export function clausulasBusqueda(columnas: readonly string[], termino: string): string[] {
    if (columnas.length === 0) return []
    return palabrasDeBusqueda(termino).map(palabra => {
        const valor = valorPostgrest(patronRegex(palabra))
        return columnas.map(columna => `${columna}.imatch.${valor}`).join(',')
    })
}
