import { describe, expect, it } from 'vitest'
import {
  automatizacionPorDefecto,
  conLineaDePalabra,
  lineaDePalabra,
  mencionaPalabra,
  validarAutomatizacion,
} from './automatizacion'

describe('automatizacionPorDefecto', () => {
  it('arranca en Modo prueba, sin palabra y con los textos de fábrica de los reels', () => {
    const a = automatizacionPorDefecto()
    expect(a.modo).toBe('prueba')
    expect(a.palabras).toBe('')
    expect(a.respuestas_con_privado.length).toBeGreaterThan(0)
    expect(a.respuestas_sin_privado.length).toBeGreaterThan(0)
    expect(a.dm_boton.length).toBeGreaterThan(0)
  })
})

describe('validarAutomatizacion', () => {
  const valida = { ...automatizacionPorDefecto(), palabras: 'doblas, info' }

  it('acepta una configuración completa y limpia las palabras', () => {
    const r = validarAutomatizacion({ ...valida, palabras: ' doblas ,  INFO, Doblas ' })
    expect(r).toMatchObject({ ok: true, valor: { palabras: 'doblas, INFO' } })
  })

  it('sin palabra solo se acepta apagado', () => {
    expect(validarAutomatizacion({ ...valida, palabras: '', modo: 'prueba' })).toMatchObject({ ok: false })
    expect(validarAutomatizacion({ ...valida, palabras: '', modo: 'apagado' })).toMatchObject({ ok: true })
  })

  it('rechaza una palabra de una sola letra', () => {
    expect(validarAutomatizacion({ ...valida, palabras: 'a' })).toMatchObject({ ok: false })
  })

  it('rechaza un enlace ajeno en el privado', () => {
    const r = validarAutomatizacion({ ...valida, dm_texto: 'Mirá https://otro-sitio.com' })
    expect(r.ok).toBe(false)
  })

  it('rechaza sin frases públicas', () => {
    expect(validarAutomatizacion({ ...valida, respuestas_con_privado: [] }).ok).toBe(false)
  })

  it('rechaza un modo inventado o campos de más', () => {
    expect(validarAutomatizacion({ ...valida, modo: 'turbo' }).ok).toBe(false)
    expect(validarAutomatizacion({ ...valida, extra: 1 }).ok).toBe(false)
    expect(validarAutomatizacion(null).ok).toBe(false)
  })
})

describe('lineaDePalabra / conLineaDePalabra', () => {
  it('arma la línea con la PRIMERA palabra en mayúsculas', () => {
    expect(lineaDePalabra('doblas, info')).toBe('Comentá «DOBLAS» y te mando toda la info.')
    expect(lineaDePalabra('')).toBeNull()
  })

  it('agrega la línea al final, separada', () => {
    expect(conLineaDePalabra('Un depto hermoso.', 'doblas')).toBe('Un depto hermoso.\n\nComentá «DOBLAS» y te mando toda la info.')
  })

  it('cambiar la palabra reemplaza la línea anterior, no la duplica', () => {
    const una = conLineaDePalabra('Texto.', 'doblas')
    expect(conLineaDePalabra(una, 'caballito')).toBe('Texto.\n\nComentá «CABALLITO» y te mando toda la info.')
  })

  it('sacar la palabra saca la línea', () => {
    expect(conLineaDePalabra(conLineaDePalabra('Texto.', 'doblas'), '')).toBe('Texto.')
  })

  it('con la descripción vacía queda solo la línea', () => {
    expect(conLineaDePalabra('', 'doblas')).toBe('Comentá «DOBLAS» y te mando toda la info.')
  })

  it('no se pasa del límite de Instagram: recorta el texto, nunca la línea', () => {
    const largo = 'a'.repeat(2200)
    const r = conLineaDePalabra(largo, 'doblas')
    expect(r.length).toBeLessThanOrEqual(2200)
    expect(r.endsWith('Comentá «DOBLAS» y te mando toda la info.')).toBe(true)
  })
})

describe('mencionaPalabra', () => {
  it('reconoce la palabra escrita en la descripción, sin importar tildes ni mayúsculas', () => {
    expect(mencionaPalabra('Comentá «DOBLAS» y listo', 'doblas')).toBe(true)
    expect(mencionaPalabra('Escribí balcón abajo', 'BALCON')).toBe(true)
  })

  it('una descripción que no la nombra lo dice', () => {
    expect(mencionaPalabra('Un depto hermoso', 'doblas')).toBe(false)
  })

  it('sin palabra no hay nada que mencionar', () => {
    expect(mencionaPalabra('lo que sea', '')).toBe(true)
  })
})
