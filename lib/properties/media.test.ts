import { describe, it, expect } from 'vitest'
import { storagePathFromPublicUrl, PHOTO_EXTS, VIDEO_EXTS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from './media'

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
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024)
    expect(MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024)
  })
})
