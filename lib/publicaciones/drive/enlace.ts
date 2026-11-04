/**
 * Qué carpeta o qué archivo de Drive señala un enlace pegado.
 *
 * El host se compara EXACTO: con `includes` o `endsWith`, un
 * `drive.google.com.evil.com` pasaría. Y el identificador se valida contra el
 * alfabeto que usa Drive porque viaja después dentro de la consulta `'ID' in
 * parents`: una comilla ahí cambiaría la consulta.
 */
export interface EnlaceDrive {
  id: string
  tipo: 'carpeta' | 'archivo' | 'desconocido'
  resourceKey?: string
}

const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/
const CLAVE_RECURSO = /^[A-Za-z0-9_-]{1,100}$/

export function leerEnlaceDrive(texto: string): EnlaceDrive | null {
  let limpio = texto.trim()
  if (!limpio) return null
  if (!/^[a-z]+:\/\//i.test(limpio)) limpio = `https://${limpio}`
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null

  const partes = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  let tipo: EnlaceDrive['tipo'] = 'desconocido'
  const iCarpetas = partes.indexOf('folders')
  if (partes[0] === 'drive' && iCarpetas > 0) {
    id = partes[iCarpetas + 1] ?? null
    tipo = 'carpeta'
  } else if (partes[0] === 'file' && partes[1] === 'd') {
    id = partes[2] ?? null
    tipo = 'archivo'
  } else if (partes[0] === 'open' || partes[0] === 'uc') {
    id = url.searchParams.get('id')
  }
  if (!id || !ID_DRIVE.test(id)) return null

  const clave = url.searchParams.get('resourcekey')
  return clave && CLAVE_RECURSO.test(clave) ? { id, tipo, resourceKey: clave } : { id, tipo }
}
