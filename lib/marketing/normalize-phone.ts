/**
 * Normaliza un teléfono argentino al formato que Meta espera para hashear:
 * dígitos, con código de país 54 y (para móviles) el 9, sin '+', sin 0 inicial, sin 15.
 * Conservador: si ya tiene país (>=11 díg con prefijo conocido) o no parece AR, no fuerza 54.
 * Reglas AR: quitar 0 de área inicial y el 15 de móvil; anteponer 54 9 para móviles AR.
 */
export function normalizeArPhone(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  // Ya viene con país 54
  if (d.startsWith('54')) {
    let rest = d.slice(2)
    if (rest.startsWith('0')) rest = rest.slice(1)
    // si quedó 9 + area + 15 + num, sacar el 15 intermedio no es trivial; caso común ya viene limpio
    if (!rest.startsWith('9')) rest = '9' + rest
    return '54' + rest
  }
  // Otro país explícito (heurística: empieza con 1/ + largo típico). No forzar AR.
  if (d.length >= 11 && (d.startsWith('1') || d.startsWith('34') || d.startsWith('55'))) {
    return d
  }
  // Formato local AR: quitar 0 inicial de área y 15 de móvil
  if (d.startsWith('0')) d = d.slice(1)
  // patrón "<area>15<numero>" → quitar el 15
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  return '549' + d
}
