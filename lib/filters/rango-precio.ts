/**
 * Rango de precio de los listados (Historial de Tasaciones y Propiedades).
 *
 * Módulo PURO: convierte lo que escribe una persona en un número que se le
 * puede pedir a la base, y nada más.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON `Number()`
 *
 * Acá nadie escribe "150000": se escribe **150.000**, con el punto de miles.
 * `Number('150.000')` devuelve **150**, así que un "desde 150.000" filtraría
 * desde ciento cincuenta dólares — el listado entero pasaría el filtro y
 * parecería que el buscador no anda. Por eso la regla es **quedarse solo con
 * los dígitos**: sirve igual para `150.000`, `150,000` y `US$ 150.000`, y de
 * paso vuelve imposible que llegue un negativo, un `NaN` o un `1e999` (el
 * signo, la letra y el punto no son dígitos).
 *
 * Los precios de este sistema son montos enteros en dólares, así que descartar
 * los centavos no pierde nada. La contra, documentada: quien escriba "1.5"
 * pensando en un millón y medio obtiene 15, no 1.500.000.
 */

/**
 * Techo del rango. No hay precio real cerca de esto (el más caro cargado son
 * US$ 1.190.000): es un tope de cordura para que un número absurdo pegado en
 * la barra de direcciones no llegue a la base tal cual.
 */
export const MAX_PRECIO = 999_999_999

function soloDigitos(texto: string): string {
    return texto.replace(/\D+/g, '')
}

/**
 * Forma canónica del precio para la barra de direcciones: solo dígitos, sin
 * ceros a la izquierda y recortado al tope.
 *
 * Es la que usa `normalizarFiltros` de cada pantalla, así que TIENE que ser
 * pura e idempotente (`n(n(x)) === n(x)`) o el espejo optimista de
 * `use-filtros-url` no converge y el control queda trabado.
 */
export function normalizarPrecioTexto(texto: string): string {
    const digitos = soloDigitos(texto)
    if (!digitos) return ''
    return String(Math.min(Number(digitos), MAX_PRECIO))
}

/** El precio como número para la consulta, o `null` si no hay ninguno. */
export function parsearPrecio(texto: string | null | undefined): number | null {
    if (texto == null) return null
    const normalizado = normalizarPrecioTexto(texto)
    return normalizado === '' ? null : Number(normalizado)
}

/**
 * ¿El "desde" es mayor que el "hasta"?
 *
 * A propósito NO se corrige dando vuelta los valores: eso sería aplicar un
 * filtro distinto del que la persona escribió, sin decírselo. La pantalla usa
 * esto para explicar por qué no hay resultados, que es la pregunta real.
 */
export function rangoInvertido(min: string, max: string): boolean {
    const desde = parsearPrecio(min)
    const hasta = parsearPrecio(max)
    return desde !== null && hasta !== null && desde > hasta
}
