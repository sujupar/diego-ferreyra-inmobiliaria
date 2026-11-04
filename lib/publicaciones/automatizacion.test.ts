import { describe, expect, it } from 'vitest'
import {
  automatizacionPorDefecto,
  conLineaDePalabra,
  lineaDePalabra,
  mencionaPalabra,
  BOTON_PERSONALIZADO,
  PRIVADO_PERSONALIZADO,
  privadoParaTipo,
  sinConfirmar,
  validarAutomatizacion,
} from './automatizacion'
import { BOTON_POR_DEFECTO, PRIVADO_POR_DEFECTO } from '@/lib/social/reels/textos-por-defecto'

describe('privadoParaTipo (el texto de fábrica habla de la propiedad)', () => {
  const fabrica = { dm_texto: PRIVADO_POR_DEFECTO, dm_boton: BOTON_POR_DEFECTO }

  it('personalizado con el texto de fábrica: pasa al general', () => {
    expect(privadoParaTipo(fabrica, 'personalizado')).toEqual({ dm_texto: PRIVADO_PERSONALIZADO, dm_boton: BOTON_PERSONALIZADO })
  })

  it('volver a propiedad con el general: vuelve al de fábrica', () => {
    expect(privadoParaTipo({ dm_texto: PRIVADO_PERSONALIZADO, dm_boton: BOTON_PERSONALIZADO }, 'propiedad')).toEqual(fabrica)
  })

  it('un texto escrito a mano no se toca nunca', () => {
    const propio = { dm_texto: 'Te paso el link para tasar tu casa', dm_boton: 'Tasar' }
    expect(privadoParaTipo(propio, 'personalizado')).toEqual(propio)
    expect(privadoParaTipo(propio, 'propiedad')).toEqual(propio)
  })

  it('el general no habla de una propiedad y el botón entra en el tope', () => {
    expect(PRIVADO_PERSONALIZADO.toLowerCase()).not.toContain('propiedad')
    expect(BOTON_PERSONALIZADO.length).toBeLessThanOrEqual(20)
  })
})

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

describe('validarAutomatizacion — tipo, destino y confirmación', () => {
  const base = { ...automatizacionPorDefecto(), palabras: 'info' }

  it('arranca sin confirmar y de tipo propiedad', () => {
    expect(automatizacionPorDefecto()).toMatchObject({ tipo: 'propiedad', enlace: null, confirmada: false })
  })

  it('personalizado exige un enlace https al que lleve el botón', () => {
    expect(validarAutomatizacion({ ...base, tipo: 'personalizado', enlace: null }).ok).toBe(false)
    expect(validarAutomatizacion({ ...base, tipo: 'personalizado', enlace: 'http://wa.me/54911' }).ok).toBe(false)
    expect(validarAutomatizacion({ ...base, tipo: 'personalizado', enlace: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validarAutomatizacion({ ...base, tipo: 'personalizado', enlace: 'https://wa.me/5491159109252?text=Hola' })).toMatchObject({
      ok: true,
      valor: { tipo: 'personalizado', enlace: 'https://wa.me/5491159109252?text=Hola' },
    })
  })

  it('el enlace se limpia de espacios y uno sin https se completa', () => {
    expect(validarAutomatizacion({ ...base, tipo: 'personalizado', enlace: '  wa.me/5491159109252 ' })).toMatchObject({
      ok: true,
      valor: { enlace: 'https://wa.me/5491159109252' },
    })
  })

  it('de propiedad ignora el enlace (lleva a la landing)', () => {
    expect(validarAutomatizacion({ ...base, tipo: 'propiedad', enlace: 'https://otro.com' })).toMatchObject({ ok: true, valor: { enlace: null } })
  })

  it('conserva si está confirmada', () => {
    expect(validarAutomatizacion({ ...base, confirmada: true })).toMatchObject({ ok: true, valor: { confirmada: true } })
  })
})

describe('sinConfirmar', () => {
  const conf = (confirmada: boolean) => ({ ...automatizacionPorDefecto(), palabras: 'info', confirmada })
  it('cuenta los videos con comentarios configurados pero sin confirmar', () => {
    expect(
      sinConfirmar([
        { nombre_archivo: 'a', automatizacion: conf(false) },
        { nombre_archivo: 'b', automatizacion: conf(true) },
        { nombre_archivo: 'c', automatizacion: null },
      ]),
    ).toEqual(['a'])
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
