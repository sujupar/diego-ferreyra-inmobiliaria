/**
 * E1.0 (código) — Deriva el funnel_type de una landing de PROPIEDAD.
 *
 * Reemplaza el `funnelType="otro"` hardcodeado de app/p/[slug]. Se deriva
 * SERVER-SIDE desde la propiedad (nunca desde la URL: es spoofeable y las
 * visitas directas no traen UTM).
 *
 * Umbral alto valor: USD 400.000. Propiedades en ARS: si no hay tipo de cambio
 * a mano, se clasifican como venta_propiedad (los premium reales casi siempre
 * están en USD). El caller puede pasar `usdToArs` para clasificar ARS con
 * precisión.
 *
 * Nota: si la propiedad tiene una landing PUBLICADA, su funnel_type está
 * CONGELADO en property_landings y tiene prioridad sobre esta derivación.
 */
export const ALTO_VALOR_USD = 400_000

export type PropertyFunnelType = 'venta_propiedad' | 'alto_valor'

interface DeriveInput {
  asking_price: number | null
  currency: string | null
}

export function deriveFunnelType(property: DeriveInput, usdToArs?: number): PropertyFunnelType {
  const price = property.asking_price
  if (price == null || !Number.isFinite(price) || price <= 0) return 'venta_propiedad'

  const currency = (property.currency ?? 'USD').toUpperCase()
  let usdPrice: number
  if (currency === 'USD') {
    usdPrice = price
  } else if (currency === 'ARS' && usdToArs && usdToArs > 0) {
    usdPrice = price / usdToArs
  } else {
    // Sin tipo de cambio: no arriesgamos clasificar un ARS como alto valor.
    return 'venta_propiedad'
  }

  return usdPrice >= ALTO_VALOR_USD ? 'alto_valor' : 'venta_propiedad'
}
