import { describe, it, expect } from 'vitest'
import { esFotoIncrustada, parsearDataUrl, separarFotos } from './fotos-incrustadas'

// 1x1 PNG real, en base64 (68 bytes decodificados).
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('esFotoIncrustada', () => {
  it('reconoce un data URL de imagen', () => {
    expect(esFotoIncrustada(`data:image/png;base64,${PNG_1X1}`)).toBe(true)
  })
  it('un enlace https no es una foto incrustada', () => {
    expect(esFotoIncrustada('https://x.supabase.co/storage/v1/object/public/property-files/a.jpg')).toBe(false)
  })
  it('tolera mayúsculas y espacios al principio', () => {
    expect(esFotoIncrustada('  DATA:image/jpeg;base64,abc')).toBe(true)
  })
  it('vacío o no-string no es incrustada', () => {
    expect(esFotoIncrustada('')).toBe(false)
    expect(esFotoIncrustada(undefined as unknown as string)).toBe(false)
  })
})

describe('parsearDataUrl', () => {
  it('devuelve mime, extensión y los bytes decodificados', () => {
    const r = parsearDataUrl(`data:image/png;base64,${PNG_1X1}`)
    expect(r).not.toBeNull()
    expect(r!.mime).toBe('image/png')
    expect(r!.extension).toBe('png')
    expect(r!.bytes.length).toBe(70)
    // Firma PNG: 89 50 4E 47
    expect(Array.from(r!.bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
  it('jpeg → jpg y webp → webp', () => {
    expect(parsearDataUrl('data:image/jpeg;base64,/9j/4AAQ')!.extension).toBe('jpg')
    expect(parsearDataUrl('data:image/webp;base64,UklGR')!.extension).toBe('webp')
  })
  it('rechaza un tipo que no es imagen soportada', () => {
    expect(parsearDataUrl('data:text/html;base64,PGh0bWw+')).toBeNull()
    expect(parsearDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
  })
  it('rechaza un data URL sin base64 o con base64 vacío', () => {
    expect(parsearDataUrl('data:image/png,abc')).toBeNull()
    expect(parsearDataUrl('data:image/png;base64,')).toBeNull()
  })
  it('rechaza lo que no es un data URL', () => {
    expect(parsearDataUrl('https://a/b.png')).toBeNull()
  })
})

describe('separarFotos', () => {
  it('separa incrustadas y enlaces conservando el índice original', () => {
    const fotos = ['https://a/1.jpg', `data:image/png;base64,${PNG_1X1}`, 'https://a/3.jpg']
    const r = separarFotos(fotos)
    expect(r.incrustadas).toEqual([1])
    expect(r.enlaces).toEqual([0, 2])
  })
  it('lista vacía → nada', () => {
    expect(separarFotos([])).toEqual({ incrustadas: [], enlaces: [] })
  })
  it('lo que no es string ni incrustada ni enlace se ignora', () => {
    const r = separarFotos(['', null as unknown as string, 'https://a/1.jpg'])
    expect(r.incrustadas).toEqual([])
    expect(r.enlaces).toEqual([2])
  })
})
