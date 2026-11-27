// Las dos letras del avatar (maqueta `ui.avatar`): primera del nombre y primera del último
// apellido; con una sola palabra, sus dos primeras. La usan la ficha y las filas del CRM.
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/)
  const a = p[0]?.charAt(0) ?? ''
  const b = p.length > 1 ? (p[p.length - 1]?.charAt(0) ?? '') : (p[0]?.charAt(1) ?? '')
  return (a + b).toUpperCase()
}
