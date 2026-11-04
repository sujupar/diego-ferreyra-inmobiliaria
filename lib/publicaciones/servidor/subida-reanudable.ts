/**
 * La subida reanudable (protocolo TUS) de Supabase Storage, desde el servidor.
 * Verificado el 2026-11-04: partes de 6 MB, `HEAD` devuelve cuánto tiene, y la
 * dirección de la subida sirve 24 h para retomarla en otro pedido.
 */
import { BUCKET } from '../db'

const TECHO_MS = 8_000

function base(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
}

function cabeceras(): Record<string, string> {
  return { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`, 'tus-resumable': '1.0.0' }
}

const b64 = (s: string) => Buffer.from(s).toString('base64')

/** La dirección que devuelve Storage tiene que ser de NUESTRO Storage: viaja a la base y se vuelve a usar. */
function esDeNuestroStorage(url: string): boolean {
  try {
    const u = new URL(url)
    const b = new URL(base())
    return u.protocol === 'https:' && u.host === b.host && u.pathname.startsWith('/storage/v1/upload/resumable/')
  } catch {
    return false
  }
}

export async function crearSubida(path: string, total: number, tipo: string): Promise<string> {
  const res = await fetch(`${base()}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      ...cabeceras(),
      'upload-length': String(total),
      'x-upsert': 'true',
      'upload-metadata': `bucketName ${b64(BUCKET)},objectName ${b64(path)},contentType ${b64(tipo)},cacheControl ${b64('3600')}`,
    },
    signal: AbortSignal.timeout(TECHO_MS),
  })
  const destino = res.headers.get('location')
  if (res.status !== 201 || !destino) {
    throw new Error(`Storage no abrió la subida (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
  const absoluta = new URL(destino, base()).toString()
  if (!esDeNuestroStorage(absoluta)) throw new Error('Storage devolvió una dirección de subida inesperada')
  return absoluta
}

export async function offsetDeSubida(url: string): Promise<number | null> {
  if (!esDeNuestroStorage(url)) return null
  const res = await fetch(url, { method: 'HEAD', headers: cabeceras(), signal: AbortSignal.timeout(TECHO_MS) })
  if (res.status === 404 || res.status === 410) return null
  if (!res.ok) throw new Error(`Storage no respondió por la subida (${res.status})`)
  const offset = Number(res.headers.get('upload-offset'))
  return Number.isFinite(offset) ? offset : null
}

export async function subirParte(url: string, offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<number> {
  if (!esDeNuestroStorage(url)) throw new Error('Dirección de subida inesperada')
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...cabeceras(), 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
    body: bytes,
    signal: AbortSignal.timeout(TECHO_MS),
  })
  if (res.status !== 204) throw new Error(`Storage rechazó una parte (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return Number(res.headers.get('upload-offset'))
}
