import { describe, it, expect } from 'vitest'
import { mediaFileExtension } from './media'

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
