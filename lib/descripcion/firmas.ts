/**
 * Firmas de caché: dicen si un análisis ya pagado sigue valiendo.
 *
 * El análisis de fotos vale mientras las fotos sean las mismas Y en el mismo
 * orden (las primeras son la portada y el modelo numera por posición). La
 * investigación de zona vale mientras la dirección Y el pin sean los mismos:
 * corregir el pin con "Cambiar ubicación" cambia el mapa aunque la dirección no
 * cambie. La dirección se normaliza para que un espacio de más o una tilde en
 * otra forma Unicode (macOS entrega NFD, ver CLAUDE.md) no obliguen a pagar la
 * búsqueda de nuevo.
 */

/** Hash FNV-1a de 32 bits: estable, sin dependencias. No es criptográfico ni hace falta. */
function hash(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Separador que no puede aparecer en una URL: así ["ab"] no firma igual que ["a","b"]. */
const SEPARADOR = String.fromCharCode(0)

export function firmaFotos(fotos: string[]): string {
  return `${fotos.length}:${hash(fotos.join(SEPARADOR))}`
}

function normalizar(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function firmaZona(
  p: { address?: string | null; neighborhood?: string | null; city?: string | null },
  pin: { lat: number; lng: number },
): string {
  // 5 decimales ≈ 1 m: menos que eso es ruido, no un pin corregido.
  return hash([normalizar(p.address), normalizar(p.neighborhood), normalizar(p.city), pin.lat.toFixed(5), pin.lng.toFixed(5)].join('|'))
}
