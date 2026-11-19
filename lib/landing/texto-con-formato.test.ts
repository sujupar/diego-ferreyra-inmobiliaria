import { describe, it, expect } from 'vitest'
import { bloquesDeTexto, tramosDe } from './texto-con-formato'

describe('bloquesDeTexto', () => {
  it('### se vuelve un título sin los numerales (caso Salta 297)', () => {
    const b = bloquesDeTexto('### UN 2 AMBIENTES AL FRENTE CON BALCÓN CORRIDO EN MONSERRAT\n\nUbicado en un segundo piso.')
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'UN 2 AMBIENTES AL FRENTE CON BALCÓN CORRIDO EN MONSERRAT' })
    expect(b[1]).toEqual({ tipo: 'parrafo', tramos: [{ texto: 'Ubicado en un segundo piso.', negrita: false }] })
  })

  it('una línea toda en negrita y en mayúsculas es un título (caso Rogelio Vidal)', () => {
    const b = bloquesDeTexto('**PH 3 AMBIENTES CON PATIO Y AMPLIA TERRAZA – VILLA LIBERTAD**')
    expect(b).toEqual([{ tipo: 'titulo', texto: 'PH 3 AMBIENTES CON PATIO Y AMPLIA TERRAZA – VILLA LIBERTAD' }])
  })

  it('una frase toda en negrita pero con minúsculas sigue siendo párrafo destacado', () => {
    const b = bloquesDeTexto('**Si querés conocerla, escribime.**')
    expect(b).toEqual([{ tipo: 'parrafo', tramos: [{ texto: 'Si querés conocerla, escribime.', negrita: true }] }])
  })

  it('texto sin formato queda igual, un párrafo por renglón', () => {
    expect(bloquesDeTexto('Hola.\nChau.')).toEqual([
      { tipo: 'parrafo', tramos: [{ texto: 'Hola.', negrita: false }] },
      { tipo: 'parrafo', tramos: [{ texto: 'Chau.', negrita: false }] },
    ])
  })

  it('no confunde un # que no abre la línea (ej. "depto #4")', () => {
    expect(bloquesDeTexto('Unidad #4 al frente')[0]).toEqual({
      tipo: 'parrafo', tramos: [{ texto: 'Unidad #4 al frente', negrita: false }],
    })
  })

  it('"###" solo, sin texto, no deja un título vacío', () => {
    expect(bloquesDeTexto('###\nTexto')).toEqual([
      { tipo: 'parrafo', tramos: [{ texto: '###', negrita: false }] },
      { tipo: 'parrafo', tramos: [{ texto: 'Texto', negrita: false }] },
    ])
  })
})

describe('tramosDe', () => {
  it('negritas en medio de la frase', () => {
    expect(tramosDe('Cuenta con **49 m² cubiertos** y patio.')).toEqual([
      { texto: 'Cuenta con ', negrita: false },
      { texto: '49 m² cubiertos', negrita: true },
      { texto: ' y patio.', negrita: false },
    ])
  })

  it('un ** sin pareja se descarta en vez de mostrarse', () => {
    expect(tramosDe('Amplia **terraza')).toEqual([{ texto: 'Amplia terraza', negrita: false }])
  })

  it('el texto nunca se interpreta como HTML (se devuelve literal, lo escapa React)', () => {
    expect(tramosDe('<b>x</b>')).toEqual([{ texto: '<b>x</b>', negrita: false }])
  })
})
