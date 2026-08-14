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
 * Techo defensivo del precio. No es una regla de negocio: es la red contra el
 * cero de más al tipear (US$ 13.500.000 en vez de 1.350.000 en una landing con
 * tráfico pago encima).
 */
const TECHO_PRECIO = 100_000_000

export const CAMPOS_EDITABLES = ['asking_price', 'currency'] as const

export type ResultadoEdicion =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

export function sanearEdicion(body: unknown): ResultadoEdicion {
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
    if (v > TECHO_PRECIO) {
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

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay ningún cambio para guardar.' }
  }
  return { ok: true, patch }
}
