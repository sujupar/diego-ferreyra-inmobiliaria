import { describe, it, expect } from 'vitest'
import { valoresDesdeAviso, armarAvisoActualizado, type ApAvisoVivo } from './edicion'
import { getApSchema } from './field-schema'

const schema = (() => { const s = getApSchema({ property_type: 'departamento' } as never); return [...s.required, ...s.recommended] })()
const aviso = (): ApAvisoVivo => ({
  Codigo: '60U6_x', IdAviso: 1, Titulo: 'T', Descripcion: 'D', AptoCredito: false, AceptaPermuta: false,
  Categoria: { Tipo: 'DEPARTAMENTO', SubTipo: 'DEPARTAMENTO' },
  Publicacion: { EstadoPublicacion: 'VIGENTE', Visible: true },
  Precio: { Monto: 220000, Moneda: 'USD', Operacion: 'VENTA', Mostrar: true },
  Caracteristicas: [
    { Id: 'ESTADO_PROPIEDAD', Valor: 'Muy_Bueno' }, { Id: 'DISPOSICION', Valor: 'Contra_Frente' },
    { Id: 'SUPERFICIE_CUBIERTA', Valor: 80.0 }, { Id: 'CANTIDAD_TOILETTES', Valor: 1 },
  ],
  Multimedia: [{ Tipo: 'FOTO', Url: 'https://static1.sosiva451.com/1.jpg' }],
  Localizacion: { Calle: { Nombre: 'Doblas', Numero: '248' }, Latitud: -34.6, Longitud: -58.4, Localidad: { Id: 'LOCALIDAD_2102' }, Barrio: { Id: 'BARRIO_3' } },
  Contacto: { Nombre: 'Diego' },
})

describe('valoresDesdeAviso', () => {
  it('traduce las formas del GET a los ids del catálogo', () => {
    const v = valoresDesdeAviso(aviso(), schema)
    expect(v.ESTADO_PROPIEDAD).toEqual({ value_id: 'MUY_BUENO' })
    expect(v.DISPOSICION).toEqual({ value_id: 'CONTRA_FRENTE' })
    expect(v.SUPERFICIE_CUBIERTA).toEqual({ value_name: '80' })
    expect(v.APTO_CREDITO).toEqual({ value_name: 'No' })
    expect(v.TIPO_OPERACION).toEqual({ value_id: 'VENTA' })
  })
})

describe('armarAvisoActualizado', () => {
  it('conserva todo lo que no se tocó (fotos, localización, contacto, características ajenas)', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: { EXPENSAS: { value_name: '600000' } } }, schema, 281022)
    expect(cambiados).toEqual(['EXPENSAS'])
    expect(dto.Multimedia).toEqual(aviso().Multimedia)
    expect(dto.Localizacion).toEqual({ Calle: { Nombre: 'Doblas', Numero: '248' }, Latitud: -34.6, Longitud: -58.4, Localidad: { Id: 'LOCALIDAD_2102' }, Barrio: { Id: 'BARRIO_3' } })
    expect(dto.Contacto).toEqual({ Nombre: 'Diego' })
    expect(dto.Categoria).toEqual({ Tipo: 'DEPARTAMENTO', Subtipo: 'DEPARTAMENTO' })
    const c = dto.Caracteristicas as { Id: string; Valor: unknown }[]
    expect(c).toEqual(expect.arrayContaining([
      { Id: 'EXPENSAS', Valor: 600000 }, { Id: 'CANTIDAD_TOILETTES', Valor: 1 },
      { Id: 'ESTADO_PROPIEDAD', Valor: 'MUY_BUENO' }, { Id: 'DISPOSICION', Valor: 'CONTRA_FRENTE' },
    ]))
  })
  it('apto crédito va al campo propio', () => {
    const { dto } = armarAvisoActualizado(aviso(), { valores: { APTO_CREDITO: { value_name: 'Sí' } } }, schema, 1)
    expect(dto.AptoCredito).toBe(true)
  })
  it('vaciar saca la característica', () => {
    const { dto } = armarAvisoActualizado(aviso(), { valores: { DISPOSICION: null } }, schema, 1)
    expect((dto.Caracteristicas as { Id: string }[]).some(c => c.Id === 'DISPOSICION')).toBe(false)
  })
  it('precio y fotos del envío automático', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: {}, precio: 210000, fotos: ['https://a/1.jpg'] }, schema, 1)
    expect((dto.Precio as { Monto: number }).Monto).toBe(210000)
    expect(dto.Multimedia).toEqual([{ Tipo: 'FOTO', Url: 'https://a/1.jpg' }])
    expect(cambiados).toEqual(['precio', 'fotos'])
  })
  it('interpreta miles en formato argentino ("600.000" → 600000, no 600)', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: { EXPENSAS: { value_name: '600.000' } } }, schema, 1)
    expect(cambiados).toEqual(['EXPENSAS'])
    const c = dto.Caracteristicas as { Id: string; Valor: unknown }[]
    expect(c.find(x => x.Id === 'EXPENSAS')?.Valor).toBe(600000)
  })
  it('"600.000 ARS" contra un valor vivo de 600000 no es un cambio', () => {
    const conExpensas: ApAvisoVivo = { ...aviso(), Caracteristicas: [...aviso().Caracteristicas, { Id: 'EXPENSAS', Valor: 600000 }] }
    const { cambiados } = armarAvisoActualizado(conExpensas, { valores: { EXPENSAS: { value_name: '600.000 ARS' } } }, schema, 1)
    expect(cambiados).toEqual([])
  })
  it('interpreta miles + decimal con coma ("1.250.000,50" → 1250000.5)', () => {
    const { dto } = armarAvisoActualizado(aviso(), { valores: { EXPENSAS: { value_name: '1.250.000,50' } } }, schema, 1)
    const c = dto.Caracteristicas as { Id: string; Valor: unknown }[]
    expect(c.find(x => x.Id === 'EXPENSAS')?.Valor).toBe(1250000.5)
  })
  it('un número simple sin separadores no se altera ("80" → 80)', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: { ANTIGUEDAD: { value_name: '80' } } }, schema, 1)
    expect(cambiados).toEqual(['ANTIGUEDAD'])
    const c = dto.Caracteristicas as { Id: string; Valor: unknown }[]
    expect(c.find(x => x.Id === 'ANTIGUEDAD')?.Valor).toBe(80)
  })
})
