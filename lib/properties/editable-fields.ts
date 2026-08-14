/**
 * Lista blanca de lo que se puede editar desde la ficha de la propiedad, con su
 * validación y saneo.
 *
 * Por qué NO se usa el `PUT /api/properties/[id]` genérico: ese toma el body
 * entero y lo manda al UPDATE. Desde el navegador eso significa que quien edita
 * un precio podría mandar de paso `legal_status`, `assigned_to`, `status` o
 * `commercial_status`. Acá, lo que no está en la lista simplemente no viaja.
 *
 * Módulo PURO (sin Supabase ni Next): la ruta queda fina y esto se testea sin
 * mocks. Mismo criterio que `lib/properties/commercial-status.ts`.
 */

const MONEDAS = ['USD', 'ARS'] as const
type Moneda = (typeof MONEDAS)[number]

/**
 * Techo defensivo del precio, POR MONEDA. No es una regla de negocio: es la red
 * contra el cero de más al tipear.
 *
 * Tiene que depender de la moneda: en pesos, una propiedad real de 2026 pasa
 * los 100 millones sin despeinarse (US$ 110.000 ≈ ARS 150.000.000). Con un
 * techo único de 100M, una propiedad publicada en pesos quedaba imposible de
 * editar — ni siquiera para BAJARLE el precio — y encima con un mensaje que
 * mentía ("parece tener un cero de más") sobre un precio correcto.
 */
const TECHO_PRECIO: Record<string, number> = {
  USD: 100_000_000,
  ARS: 200_000_000_000,
}
const TECHO_POR_DEFECTO = 100_000_000

/**
 * Características numéricas: rango y etiqueta para el mensaje de error.
 *
 * `entero: true` rechaza 2,5 dormitorios; los metros sí admiten decimales.
 * Los techos son redes contra el tipeo, no reglas del negocio.
 */
const NUMERICOS: Record<string, { etiqueta: string; min: number; max: number; entero: boolean }> = {
  rooms:        { etiqueta: 'Los ambientes',   min: 0, max: 50,      entero: true },
  bedrooms:     { etiqueta: 'Los dormitorios', min: 0, max: 50,      entero: true },
  bathrooms:    { etiqueta: 'Los baños',       min: 0, max: 50,      entero: true },
  garages:      { etiqueta: 'Las cocheras',    min: 0, max: 50,      entero: true },
  age:          { etiqueta: 'La antigüedad',   min: 0, max: 300,     entero: true },
  // PB es 0 y los subsuelos son negativos: por eso el mínimo no es 0.
  floor:        { etiqueta: 'El piso',         min: -5, max: 200,    entero: true },
  covered_area: { etiqueta: 'La superficie cubierta', min: 0, max: 100_000, entero: false },
  total_area:   { etiqueta: 'La superficie total',    min: 0, max: 100_000, entero: false },
  expensas:     { etiqueta: 'Las expensas',    min: 0, max: 100_000_000, entero: false },
}

const LARGO_DESCRIPCION = 5000

export const CAMPOS_EDITABLES = [
  'asking_price', 'currency',
  ...Object.keys(NUMERICOS),
  'description',
] as const

export type ResultadoEdicion =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * @param monedaActual la moneda que tiene HOY la propiedad. Define el techo del
 *   precio cuando el body no trae una moneda nueva.
 */
export function sanearEdicion(body: unknown, monedaActual?: string): ResultadoEdicion {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Los datos enviados no tienen el formato esperado.' }
  }
  const entrada = body as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if ('asking_price' in entrada) {
    const v = entrada.asking_price
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      return { ok: false, error: 'El precio tiene que ser un número mayor a cero.' }
    }
    // El techo sale de la moneda que va a quedar: si el mismo body cambia la
    // moneda, manda esa; si no, la que ya tiene la propiedad.
    const moneda = typeof entrada.currency === 'string' ? entrada.currency : monedaActual
    const techo = TECHO_PRECIO[moneda ?? ''] ?? TECHO_POR_DEFECTO
    if (v > techo) {
      return { ok: false, error: 'Ese precio parece tener un cero de más. Revisalo.' }
    }
    patch.asking_price = v
  }

  if ('currency' in entrada) {
    const v = entrada.currency
    if (typeof v !== 'string' || !MONEDAS.includes(v as Moneda)) {
      return { ok: false, error: 'La moneda tiene que ser USD o ARS.' }
    }
    patch.currency = v
  }

  for (const [campo, regla] of Object.entries(NUMERICOS)) {
    if (!(campo in entrada)) continue
    const v = entrada[campo]
    // Vaciar un dato es un cambio válido: "no sé la antigüedad" ≠ "0 años".
    if (v === null || v === '') { patch[campo] = null; continue }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: `${regla.etiqueta} tiene que ser un número.` }
    }
    if (regla.entero && !Number.isInteger(v)) {
      return { ok: false, error: `${regla.etiqueta} tiene que ser un número entero.` }
    }
    if (v < regla.min || v > regla.max) {
      return { ok: false, error: `${regla.etiqueta} tiene que estar entre ${regla.min} y ${regla.max}.` }
    }
    patch[campo] = v
  }

  if ('description' in entrada) {
    const v = entrada.description
    if (v === null || v === '') {
      patch.description = null
    } else if (typeof v !== 'string') {
      return { ok: false, error: 'La descripción tiene que ser texto.' }
    } else {
      patch.description = v.slice(0, LARGO_DESCRIPCION)
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay ningún cambio para guardar.' }
  }
  return { ok: true, patch }
}
