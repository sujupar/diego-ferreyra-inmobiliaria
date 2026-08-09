import { describe, it, expect } from 'vitest'
import {
  datosParaDescripcion,
  faltaParaGenerar,
  textoParaElCampo,
  type FormularioAlta,
} from './descripcion-desde-alta'
import { buildUserPayload } from '@/lib/marketing/portal-descriptions/generator'

const form: FormularioAlta = {
  address: 'Junín 1200', neighborhood: 'Recoleta', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  rooms: '3', bedrooms: '2', bathrooms: '1', garages: '',
  covered_area: '85', total_area: '92', floor: '7', age: '15',
  asking_price: '250000', currency: 'USD',
  description: '',
}

describe('faltaParaGenerar', () => {
  it('con dirección, barrio y precio no falta nada', () => {
    expect(faltaParaGenerar(form)).toEqual([])
  })

  it('nombra lo que falta — sin eso el modelo escribe un aviso genérico', () => {
    expect(faltaParaGenerar({ ...form, address: '  ', neighborhood: '', asking_price: '' }))
      .toEqual(['dirección', 'barrio', 'precio'])
  })

  it('un precio en cero no es un precio', () => {
    expect(faltaParaGenerar({ ...form, asking_price: '0' })).toEqual(['precio'])
  })
})

describe('datosParaDescripcion', () => {
  it('convierte los campos de texto del formulario a números', () => {
    const datos = datosParaDescripcion(form)
    expect(datos.asking_price).toBe(250000)
    expect(datos.rooms).toBe(3)
    expect(datos.covered_area).toBe(85)
    expect(datos.floor).toBe(7)
    expect(datos.age).toBe(15)
  })

  it('los campos vacíos se omiten en vez de mandarse como 0', () => {
    const datos = datosParaDescripcion(form)
    expect(datos.garages).toBeUndefined()
    const payload = buildUserPayload({ property: datos })
    expect(payload).not.toContain('Cocheras')
    expect(payload).toContain('Ambientes: 3')
  })

  it('lo que sale de acá entra al generador tal cual (misma forma que una fila de la base)', () => {
    const payload = buildUserPayload({ property: datosParaDescripcion(form) })
    expect(payload).toContain('Junín 1200')
    expect(payload).toContain('Recoleta')
    expect(payload).toContain('250000 USD')
    expect(payload).toContain('Sin datos investigados de la zona')
  })

  it('una operación fuera del catálogo NO viaja al modelo: cae en venta', () => {
    const datos = datosParaDescripcion({ ...form, operation_type: 'alquiler_temporario' })
    expect(datos.operation_type).toBe('venta')
  })

  it('conserva las tres operaciones canónicas', () => {
    expect(datosParaDescripcion({ ...form, operation_type: 'temporario' }).operation_type).toBe('temporario')
    expect(datosParaDescripcion({ ...form, operation_type: 'alquiler' }).operation_type).toBe('alquiler')
  })

  it('manda lo que escribió el asesor como referencia', () => {
    const datos = datosParaDescripcion({ ...form, description: 'Reciclado a nuevo en 2024.' })
    expect(datos.description).toBe('Reciclado a nuevo en 2024.')
    expect(buildUserPayload({ property: datos })).toContain('Descripción manual previa')
  })

  it('al REGENERAR no le devuelve al modelo su propia invención', () => {
    const generado = 'Subtítulo inventado\n\nCuerpo inventado con un parque que no existe.'
    const datos = datosParaDescripcion(
      { ...form, description: generado },
      { textoGenerado: generado },
    )
    expect(datos.description).toBeUndefined()
    expect(buildUserPayload({ property: datos })).not.toContain('parque que no existe')
  })

  it('si el asesor EDITÓ lo generado, eso sí es dato suyo y viaja', () => {
    const generado = 'Subtítulo\n\nCuerpo generado.'
    const datos = datosParaDescripcion(
      { ...form, description: `${generado}\nAgrego: cochera fija cubierta.` },
      { textoGenerado: generado },
    )
    expect(datos.description).toContain('cochera fija cubierta')
  })
})

describe('textoParaElCampo', () => {
  it('junta subtítulo y cuerpo, y deja el TITULAR afuera (no se guarda title)', () => {
    const texto = textoParaElCampo({ subtitle: 'Luz todo el día', body: 'Cuerpo del aviso.' })
    expect(texto).toBe('Luz todo el día\n\nCuerpo del aviso.')
  })

  it('sin subtítulo no deja saltos de línea de más al principio', () => {
    expect(textoParaElCampo({ subtitle: '  ', body: 'Cuerpo.' })).toBe('Cuerpo.')
  })
})
