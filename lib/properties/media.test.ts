import { describe, it, expect } from 'vitest'
import {
  storagePathFromPublicUrl, sanitizeFileBase, planLabelFromUrl,
  PHOTO_EXTS, VIDEO_EXTS, PLAN_EXTS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, MAX_PLAN_BYTES,
} from './media'

describe('storagePathFromPublicUrl', () => {
  it('extrae el path dentro del bucket property-files', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/photos/uuid-1.jpg'
    expect(storagePathFromPublicUrl(url)).toBe('properties/p1/photos/uuid-1.jpg')
  })
  it('decodifica caracteres escapados', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/video/a%20b.mp4'
    expect(storagePathFromPublicUrl(url)).toBe('properties/p1/video/a b.mp4')
  })
  it('devuelve null si no es una URL del bucket', () => {
    expect(storagePathFromPublicUrl('https://youtu.be/abc')).toBeNull()
    expect(storagePathFromPublicUrl('')).toBeNull()
  })
  it('devuelve null si el path está mal formado (% suelto)', () => {
    expect(storagePathFromPublicUrl('https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/%')).toBeNull()
  })
})

describe('constantes de media', () => {
  it('definen extensiones y límites esperados', () => {
    expect(PHOTO_EXTS).toEqual(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])
    expect(VIDEO_EXTS).toEqual(['mp4', 'mov', 'webm', 'm4v'])
    expect(PLAN_EXTS).toEqual(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024)
    expect(MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024)
    expect(MAX_PLAN_BYTES).toBe(100 * 1024 * 1024)
  })
})

describe('sanitizeFileBase', () => {
  it('sanea nombre con tildes, espacios y mayúsculas', () => {
    expect(sanitizeFileBase('Plano Cocina Ampliación.pdf')).toBe('plano-cocina-ampliacion')
  })
  it('trunca a 40 caracteres sin dejar guion colgando', () => {
    const out = sanitizeFileBase('a'.repeat(39) + ' bcd.pdf')
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.endsWith('-')).toBe(false)
  })
  it('cae a "plano" si no queda nada usable', () => {
    expect(sanitizeFileBase('日本語.pdf')).toBe('plano')
    expect(sanitizeFileBase('.pdf')).toBe('plano')
    expect(sanitizeFileBase('')).toBe('plano')
  })
  it('no incluye la extensión', () => {
    expect(sanitizeFileBase('frente.jpg')).toBe('frente')
  })
})

describe('planLabelFromUrl', () => {
  it('quita el prefijo uuid del nombre', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/plans/123e4567-e89b-12d3-a456-426614174000-plano-cocina.pdf'
    expect(planLabelFromUrl(url)).toBe('plano-cocina.pdf')
  })
  it('devuelve el segmento tal cual si no hay prefijo uuid', () => {
    expect(planLabelFromUrl('https://x/y/mi-plano.pdf')).toBe('mi-plano.pdf')
  })
  it('cae a "plano" con URL vacía o rota', () => {
    expect(planLabelFromUrl('')).toBe('plano')
  })
})
