import { describe, it, expect } from 'vitest'
import {
  validarArchivoRegalo, validarPortada, pathDelRegalo, pathDePortada, esPathDelRegalo, esPathDePortada,
  nombreDeDescarga, validarTitulo, MAX_REGALO_BYTES, validarArchivoRegaloSubido, validarPortadaSubida,
  esPdf, esImagenValida, pathDelRegaloGeneral, pathDePortadaGeneral, esPathDelRegaloGeneral, esPathDePortadaGeneral,
  regaloQueAplica,
} from './regalo'
import type { RegaloDeLaPropiedad, RegaloGeneral } from './tipos'

const bytes = (...n: number[]) => new Uint8Array(n)

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

describe('esPdf / esImagenValida (bytes reales, nunca lo que declara el Content-Type)', () => {
  it('un PDF de verdad empieza con %PDF-', () => {
    expect(esPdf(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34))).toBe(true)
  })
  it('un ejecutable con Content-Type: application/pdf no engaña a esPdf', () => {
    expect(esPdf(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(false) // cabecera MZ de un .exe
    expect(esPdf(bytes())).toBe(false)
  })
  it('JPEG, PNG y WebP válidos', () => {
    expect(esImagenValida(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(esImagenValida(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true)
    expect(esImagenValida(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(true)
  })
  it('un RIFF que no es WebP (ej. un .wav) no pasa', () => {
    expect(esImagenValida(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBe(false)
  })
  it('bytes vacíos o de otro formato no pasan', () => {
    expect(esImagenValida(bytes())).toBe(false)
    expect(esImagenValida(bytes(0x25, 0x50, 0x44, 0x46))).toBe(false)
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

describe('regalo general (la guía de gastos, 2026-10-17)', () => {
  it('paths en la carpeta general/, nunca dentro de una propiedad', () => {
    expect(pathDelRegaloGeneral(UUID)).toBe(`general/regalo-${UUID}.pdf`)
    expect(pathDePortadaGeneral(UUID, 'Tapa.JPEG')).toBe(`general/portada-${UUID}.jpg`)
    expect(esPathDelRegaloGeneral(`general/regalo-${UUID}.pdf`)).toBe(true)
    expect(esPathDePortadaGeneral(`general/portada-${UUID}.png`)).toBe(true)
  })
  it('rechaza paths de una propiedad, recorridos de carpeta y extensiones cambiadas', () => {
    expect(esPathDelRegaloGeneral(`properties/${PROP}/regalo-${UUID}.pdf`)).toBe(false)
    expect(esPathDelRegaloGeneral(`general/regalo-${UUID}.pdf/../../otra`)).toBe(false)
    expect(esPathDelRegaloGeneral(`general/regalo-${UUID}.exe`)).toBe(false)
    expect(esPathDelRegaloGeneral(`xgeneral/regalo-${UUID}.pdf`)).toBe(false)
    expect(esPathDePortadaGeneral(`general/portada-${UUID}.gif`)).toBe(false)
    expect(esPathDePortadaGeneral(`general/regalo-${UUID}.pdf`)).toBe(false)
  })
})

describe('regaloQueAplica: la general manda sobre la de la propiedad', () => {
  const general: RegaloGeneral = {
    titulo: 'Guía de gastos para compradores', archivoPath: `general/regalo-${UUID}.pdf`, archivoNombre: 'guia.pdf',
    archivoBytes: 1000, portadaPath: `general/portada-${UUID}.jpg`, actualizadoEl: '2026-10-17T12:00:00Z',
  }
  const propio: RegaloDeLaPropiedad = {
    propertyId: PROP, titulo: 'Guía de Caballito', archivoPath: `properties/${PROP}/regalo-${UUID}.pdf`, archivoNombre: 'c.pdf',
    archivoBytes: 500, portadaPath: null, actualizadoEl: '2026-10-16T12:00:00Z',
  }
  it('con general: la general, aunque la propiedad tenga la suya (los mensajes prometen la guía)', () => {
    expect(regaloQueAplica(general, propio, PROP)).toEqual({ ...general, propertyId: PROP })
    expect(regaloQueAplica(general, null, OTRA)).toEqual({ ...general, propertyId: OTRA })
  })
  it('sin general: exactamente como antes (la de la propiedad o ninguna)', () => {
    expect(regaloQueAplica(null, propio, PROP)).toBe(propio)
    expect(regaloQueAplica(null, null, PROP)).toBeNull()
  })
})
