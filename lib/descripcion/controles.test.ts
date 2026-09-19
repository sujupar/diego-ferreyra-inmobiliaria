import { describe, it, expect } from 'vitest'
import { controlarTexto } from './controles'
import { DISCLAIMER, promptEscritura } from './metodo-diego'

const cuerpo = (final: string) => `Living luminoso con balcón.\n\nCoordiná tu visita.\n\n${final}`
const ok = { title: 'Departamento luminoso de 3 ambientes con terraza', subtitle: 'Piso alto con vista abierta.', body: cuerpo(DISCLAIMER) }

describe('controlarTexto', () => {
  it('un texto correcto pasa sin cambios ni problemas', () => {
    const r = controlarTexto(ok)
    expect(r.texto).toEqual(ok)
    expect(r.problemas).toEqual([])
  })

  it('repone el disclaimer literal cuando viene parafraseado (caso real Doblas 248)', () => {
    const parafraseado = 'La presente publicación describe las características esenciales del inmueble. Las medidas exactas surgirán del título de propiedad. Para más detalles, consulte con el corredor."\nPreguntas para la inmobiliaria'
    const r = controlarTexto({ ...ok, body: cuerpo(parafraseado) })
    expect(r.texto.body).toBe(cuerpo(DISCLAIMER))
  })

  it('agrega el disclaimer si falta', () => {
    const r = controlarTexto({ ...ok, body: 'Living luminoso.' })
    expect(r.texto.body).toBe(`Living luminoso.\n\n${DISCLAIMER}`)
  })

  it('no lo duplica si aparece dos veces', () => {
    const r = controlarTexto({ ...ok, body: `Living.\n\n${DISCLAIMER}\n\n${DISCLAIMER}` })
    expect(r.texto.body).toBe(`Living.\n\n${DISCLAIMER}`)
  })

  it('detecta adjetivos prohibidos sin importar mayúsculas ni tildes', () => {
    const r = controlarTexto({ ...ok, subtitle: 'Una joya. IMPERDIBLE OPORTUNIDAD, increible.' })
    expect(r.problemas).toEqual(expect.arrayContaining([
      expect.stringContaining('una joya'), expect.stringContaining('imperdible'), expect.stringContaining('increíble'),
    ]))
  })

  it('detecta rótulos de la estructura', () => {
    const r = controlarTexto({ ...ok, body: cuerpo(`Primera parte: el recorrido.\nUbicación: Almagro.\n\n${DISCLAIMER}`) })
    expect(r.problemas).toEqual(expect.arrayContaining([expect.stringContaining('rótulos')]))
  })

  it('detecta markdown', () => {
    const r = controlarTexto({ ...ok, body: cuerpo(`**Gran terraza**\n\n${DISCLAIMER}`) })
    expect(r.problemas).toEqual(expect.arrayContaining([expect.stringContaining('markdown')]))
  })

  it('controla el largo del titular y del subtitular', () => {
    const r = controlarTexto({
      ...ok,
      title: 'uno dos tres cuatro cinco seis siete ocho nueve diez once',
      subtitle: Array.from({ length: 51 }, (_, i) => `p${i}`).join(' '),
    })
    expect(r.problemas).toEqual(expect.arrayContaining([
      expect.stringContaining('titular tiene 11 palabras'), expect.stringContaining('subtitular tiene 51 palabras'),
    ]))
  })

  it('avisa si el texto no dice cuántos dormitorios tiene (auditoría de Doblas 248)', () => {
    const sinCantidad = { ...ok, body: cuerpo(`El dormitorio de servicio es luminoso.\n\n${DISCLAIMER}`) }
    expect(controlarTexto(sinCantidad, { bedrooms: 3 }).problemas).toEqual(['no dice cuántos dormitorios tiene (la ficha dice 3)'])
  })
  it('acepta la cantidad en número o en palabras', () => {
    expect(controlarTexto({ ...ok, body: cuerpo(`Tiene tres dormitorios.\n\n${DISCLAIMER}`) }, { bedrooms: 3 }).problemas).toEqual([])
    expect(controlarTexto({ ...ok, body: cuerpo(`Tiene 2 dormitorios.\n\n${DISCLAIMER}`) }, { bedrooms: 2 }).problemas).toEqual([])
    expect(controlarTexto({ ...ok, body: cuerpo(`Un dormitorio amplio.\n\n${DISCLAIMER}`) }, { bedrooms: 1 }).problemas).toEqual([])
  })
  it('sin dato de dormitorios en la ficha no controla', () => {
    expect(controlarTexto(ok, { bedrooms: null }).problemas).toEqual([])
    expect(controlarTexto(ok).problemas).toEqual([])
  })

  it('recorta espacios de los tres campos', () => {
    const r = controlarTexto({ title: '  T  ', subtitle: ' S ', body: `  B\n\n${DISCLAIMER}  ` })
    expect(r.texto).toEqual({ title: 'T', subtitle: 'S', body: `B\n\n${DISCLAIMER}` })
  })
})

describe('promptEscritura', () => {
  const p = promptEscritura()
  it('lleva el disclaimer literal y los tres ejemplos de Diego', () => {
    expect(p).toContain(DISCLAIMER)
    expect(p).toContain('Calfucura')
    expect(p).toContain('Plaza Irlanda')
    expect(p).toContain('Nazca')
  })
  it('los ejemplos no traen rótulos de partes (el modelo los copiaba)', () => {
    expect(p).not.toMatch(/Primera parte:|Segunda parte:|Tercera Parte:|Cuarta Parte:/)
  })
  it('no infla calificaciones ni suma dormitorios de servicio a los de la ficha (auditoría de Doblas 248)', () => {
    expect(p).toMatch(/TAL CUAL/)
    expect(p).toMatch(/no "3 más uno de servicio"/)
  })
  it('usa voseo (decisión del 2026-07-28)', () => {
    expect(p).toContain('VOSEO')
  })
})
