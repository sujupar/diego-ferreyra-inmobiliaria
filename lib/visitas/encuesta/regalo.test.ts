import { describe, it, expect } from 'vitest'
import {
  validarArchivoRegalo, validarPortada, pathDelRegalo, pathDePortada, esPathDelRegalo, esPathDePortada,
  nombreDeDescarga, validarTitulo, MAX_REGALO_BYTES, validarArchivoRegaloSubido, validarPortadaSubida,
} from './regalo'

const PROP = '33333333-3333-4333-8333-333333333333'
const OTRA = '77777777-7777-4777-8777-777777777777'
const UUID = '11111111-1111-4111-8111-111111111111'

describe('archivo y portada', () => {
  it('solo PDF de hasta 20 MB', () => {
    expect(validarArchivoRegalo({ nombre: 'Guía.PDF', bytes: 1000 })).toBeNull()
    expect(validarArchivoRegalo({ nombre: 'guia.docx', bytes: 1000 })).toBe('El regalo tiene que ser un PDF')
    expect(validarArchivoRegalo({ nombre: 'guia.pdf', bytes: 0 })).toBe('El archivo está vacío')
    expect(validarArchivoRegalo({ nombre: 'guia.pdf', bytes: MAX_REGALO_BYTES + 1 })).toBe('El PDF supera los 20 MB')
  })
  it('portada JPG/PNG/WEBP de hasta 5 MB', () => {
    expect(validarPortada({ nombre: 'tapa.jpeg', bytes: 100 })).toBeNull()
    expect(validarPortada({ nombre: 'tapa.gif', bytes: 100 })).toBe('La portada tiene que ser JPG, PNG o WEBP')
    expect(validarPortada({ nombre: 'tapa.png', bytes: 6 * 1024 * 1024 })).toBe('La portada supera los 5 MB')
  })
})

describe('validación contra lo REALMENTE subido (nunca lo declarado por el navegador)', () => {
  it('archivo: exige el mimetype application/pdf real, no una extensión declarada', () => {
    expect(validarArchivoRegaloSubido({ bytes: 1000, mimetype: 'application/pdf' })).toBeNull()
    expect(validarArchivoRegaloSubido({ bytes: 1000, mimetype: 'application/octet-stream' })).toBe('El regalo tiene que ser un PDF')
    expect(validarArchivoRegaloSubido({ bytes: MAX_REGALO_BYTES + 1, mimetype: 'application/pdf' })).toBe('El PDF supera los 20 MB')
  })
  it('archivo: sin metadatos (no terminó de subir) es un error distinto, no "no es PDF"', () => {
    expect(validarArchivoRegaloSubido(null)).toBe('El archivo no terminó de subir. Probá de nuevo.')
  })
  it('portada: exige un mimetype de imagen real', () => {
    expect(validarPortadaSubida({ bytes: 100, mimetype: 'image/webp' })).toBeNull()
    expect(validarPortadaSubida({ bytes: 100, mimetype: 'application/pdf' })).toBe('La portada tiene que ser JPG, PNG o WEBP')
    expect(validarPortadaSubida({ bytes: 100, mimetype: null })).toBe('La portada tiene que ser JPG, PNG o WEBP')
    expect(validarPortadaSubida({ bytes: 6 * 1024 * 1024, mimetype: 'image/png' })).toBe('La portada supera los 5 MB')
  })
  it('portada: sin metadatos es "no terminó de subir"', () => {
    expect(validarPortadaSubida(null)).toBe('La portada no terminó de subir. Probá de nuevo.')
  })
})

describe('paths atados a la propiedad', () => {
  it('se arman con un uuid y la extensión normalizada (jpeg → jpg)', () => {
    expect(pathDelRegalo(PROP, UUID)).toBe(`properties/${PROP}/regalo-${UUID}.pdf`)
    expect(pathDePortada(PROP, UUID, 'Tapa.JPEG')).toBe(`properties/${PROP}/portada-${UUID}.jpg`)
  })
  it('solo los de ESTA propiedad, con forma exacta (nada de startsWith)', () => {
    expect(esPathDelRegalo(pathDelRegalo(PROP, UUID), PROP)).toBe(true)
    expect(esPathDelRegalo(pathDelRegalo(OTRA, UUID), PROP)).toBe(false)
    expect(esPathDelRegalo(`properties/${PROP}/regalo-${UUID}.pdf/../../x`, PROP)).toBe(false)
    expect(esPathDelRegalo(`properties/${PROP}/photos/${UUID}.pdf`, PROP)).toBe(false)
    expect(esPathDelRegalo(pathDelRegalo(PROP, UUID), 'no-es-uuid')).toBe(false)
    expect(esPathDePortada(pathDePortada(PROP, UUID, 'a.webp'), PROP)).toBe(true)
    expect(esPathDePortada(pathDelRegalo(PROP, UUID), PROP)).toBe(false)
  })
})

describe('nombreDeDescarga y validarTitulo', () => {
  it('nombre seguro, con .pdf, sin rutas ni comillas', () => {
    expect(nombreDeDescarga('Guía del barrio "Caballito".pdf')).toBe('Guía del barrio Caballito.pdf')
    expect(nombreDeDescarga('../../etc/passwd')).toBe('etcpasswd.pdf')
    expect(nombreDeDescarga('   ')).toBe('regalo.pdf')
  })
  it('título de 3 a 120 caracteres, en NFC y sin saltos', () => {
    expect(validarTitulo('Guía\ndel barrio')).toEqual({ ok: true, titulo: 'Guía del barrio' })
    expect(validarTitulo('ab')).toEqual({ ok: false, error: 'El título tiene que tener entre 3 y 120 caracteres' })
    expect(validarTitulo(42)).toEqual({ ok: false, error: 'El título tiene que tener entre 3 y 120 caracteres' })
  })
})
