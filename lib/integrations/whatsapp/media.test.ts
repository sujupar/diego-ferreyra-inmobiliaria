import { describe, it, expect } from 'vitest'
import { mediaFileExtension, SignedUrlCache } from './media'

describe('mediaFileExtension', () => {
  it('resuelve la extensión desde mime types conocidos', () => {
    expect(mediaFileExtension('image/jpeg')).toBe('jpg')
    expect(mediaFileExtension('image/png')).toBe('png')
    expect(mediaFileExtension('application/pdf')).toBe('pdf')
    expect(mediaFileExtension('audio/ogg')).toBe('ogg')
    expect(mediaFileExtension('video/mp4')).toBe('mp4')
  })

  it('ignora parámetros extra del mime type (ej. codecs)', () => {
    expect(mediaFileExtension('audio/ogg; codecs=opus')).toBe('ogg')
  })

  it('cae al nombre de archivo si el mime type no es conocido', () => {
    expect(mediaFileExtension('application/octet-stream', 'plano-cocina.dwg')).toBe('dwg')
  })

  it('sin mime type ni filename, devuelve "bin"', () => {
    expect(mediaFileExtension(null)).toBe('bin')
    expect(mediaFileExtension(undefined)).toBe('bin')
  })

  it('mime type desconocido y sin filename también cae a "bin"', () => {
    expect(mediaFileExtension('application/x-weird')).toBe('bin')
  })
})

describe('SignedUrlCache (hallazgo #6 — parpadeo de imágenes por polling)', () => {
  it('devuelve null para un path nunca guardado', () => {
    const cache = new SignedUrlCache()
    expect(cache.getFresh('inbound/a.jpg', 0)).toBeNull()
  })

  it('devuelve la misma URL mientras esté fresca (simula 2 polls de 15s dentro del TTL)', () => {
    const cache = new SignedUrlCache()
    const t0 = 1_000_000
    cache.set('inbound/a.jpg', 'https://storage/signed?token=abc', t0, 55 * 60 * 1000)
    // Poll a los 15s: misma URL.
    expect(cache.getFresh('inbound/a.jpg', t0 + 15_000)).toBe('https://storage/signed?token=abc')
    // Poll a los 30s: sigue siendo la misma URL (no re-firma).
    expect(cache.getFresh('inbound/a.jpg', t0 + 30_000)).toBe('https://storage/signed?token=abc')
  })

  it('vence y deja de servir la URL una vez pasado el TTL efectivo', () => {
    const cache = new SignedUrlCache()
    const t0 = 1_000_000
    const ttl = 55 * 60 * 1000
    cache.set('inbound/a.jpg', 'https://storage/signed?token=abc', t0, ttl)
    expect(cache.getFresh('inbound/a.jpg', t0 + ttl - 1)).toBe('https://storage/signed?token=abc')
    expect(cache.getFresh('inbound/a.jpg', t0 + ttl)).toBeNull()
  })

  it('cachea paths independientemente', () => {
    const cache = new SignedUrlCache()
    const t0 = 0
    cache.set('inbound/a.jpg', 'url-a', t0, 1000)
    cache.set('inbound/b.jpg', 'url-b', t0, 1000)
    expect(cache.getFresh('inbound/a.jpg', t0)).toBe('url-a')
    expect(cache.getFresh('inbound/b.jpg', t0)).toBe('url-b')
    expect(cache.getFresh('inbound/c.jpg', t0)).toBeNull()
  })

  it('clear() vacía el cache', () => {
    const cache = new SignedUrlCache()
    cache.set('inbound/a.jpg', 'url-a', 0, 1000)
    cache.clear()
    expect(cache.getFresh('inbound/a.jpg', 0)).toBeNull()
  })
})
