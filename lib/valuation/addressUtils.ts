/**
 * Extrae solo la dirección (calle + número) de un texto que puede contener
 * "Calle Numero, Barrio, Ciudad" o "PH 3 amb, Calle Numero, Barrio, Ciudad, Portal".
 *
 * Reglas:
 * - Si el string contiene comas, toma el primer fragmento que matchea calle+número.
 * - Un fragmento es "dirección" si tiene >= 1 letra y >= 1 dígito.
 * - EXCLUYE fragmentos que empiezan con tipo de propiedad (PH 3, depto 2, casa 4)
 *   porque suelen indicar características, no direcciones.
 * - Si nada matchea, devuelve el primer fragmento o el string original truncado.
 */
const PROPERTY_TYPE_PREFIX = /^(ph|piso|departamento|dpto|local|oficina|casa|monoambiente)\s+\d/i

export function extractAddress(raw: string | null | undefined): string {
    if (!raw) return ''
    const cleaned = raw.trim()
    if (!cleaned) return ''

    const parts = cleaned.split(/\s*[,|·]\s*/).map(p => p.trim()).filter(Boolean)
    const hasLetter = (s: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s)
    const hasDigit = (s: string) => /\d/.test(s)
    const isPropertyType = (s: string) => PROPERTY_TYPE_PREFIX.test(s)

    const addressLike = parts.find(p =>
        hasLetter(p) && hasDigit(p) && p.length <= 60 && !isPropertyType(p)
    )
    if (addressLike) return addressLike

    const fallbackWithType = parts.find(p => hasLetter(p) && hasDigit(p) && p.length <= 60)
    if (fallbackWithType) return fallbackWithType

    if (process.env.NODE_ENV !== 'production') {
        console.debug('[extractAddress] fallback used for:', cleaned)
    }
    return (parts[0] || cleaned).slice(0, 60)
}
