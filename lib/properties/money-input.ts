/**
 * Campo de dinero que se escribe como se escribe en Argentina.
 *
 * POR QUÉ EXISTE: con un `<input type="number">` pelado, 1.290.000 y 129.000 se
 * ven casi igual mientras se tipea, y escribir los puntos de miles (como los
 * escribe cualquiera acá) produce basura. La defensa más fuerte contra
 * "parece 12 y en realidad es 1.290.000" no es un cartel: es que el número se
 * vea SIEMPRE agrupado mientras se escribe, así el error salta a la vista antes
 * de guardar.
 *
 * Módulo puro: se testea sin navegador.
 */

/** Deja solo dígitos y los agrupa de a miles: "1290000" → "1.290.000". */
export function formatearMiles(crudo: string): string {
  const digitos = (crudo ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (digitos === '') return ''
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Texto del campo → número. Devuelve null si no hay un monto válido.
 * Ignora todo lo que no sea dígito, así que tolera "1.290.000", "$1290000" o
 * un pegado con espacios.
 */
export function parsearMonto(texto: string): number | null {
  const digitos = (texto ?? '').replace(/\D/g, '')
  if (digitos === '') return null
  const n = Number(digitos)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
