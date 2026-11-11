import { describe, it, expect, vi } from 'vitest'
import { armarAvisoConOperacionYPrecio, armarAvisoRepublicado, republicarAviso, MENSAJE_ELIMINADO_SIN_REPUBLICAR } from './cambio-categoria'
import type { ApAvisoVivo } from './edicion'
import { PortalAdapterError } from '../types'

const aviso: ApAvisoVivo = {
  Codigo: 'COD1', IdAviso: 10, Titulo: 'T', Descripcion: 'D', AptoCredito: true, AceptaPermuta: true,
  Categoria: { Tipo: 'DEPARTAMENTO', SubTipo: 'PH' },
  Publicacion: { Visible: true },
  Precio: { Monto: 100000, Moneda: 'USD', Operacion: 'VENTA', Mostrar: true },
  Caracteristicas: [
    { Id: 'AMBIENTES', Valor: 3 }, { Id: 'DISPOSICION', Valor: 'Contra_Frente' }, { Id: 'APTO_PROFESIONAL', Valor: true },
  ],
  Multimedia: [{ Tipo: 'FOTO', Url: 'https://sosiva/x.jpg' }, { Tipo: 'VIDEO', Url: 'https://yt/v' }],
  Localizacion: { Localidad: { Id: 'LOC_1' }, Barrio: { Id: 'B_1' } },
  Contacto: { Nombre: 'A' },
}

describe('armarAvisoConOperacionYPrecio', () => {
  it('VENTA→ALQUILER con AptoCredito true lo apaga', () => {
    const dto = armarAvisoConOperacionYPrecio(aviso, { operacion: 'ALQUILER', monto: 75000 }, [], 7) as any
    expect(dto.AptoCredito).toBe(false)
    expect(dto.Precio.Operacion).toBe('ALQUILER')
    expect(dto.Precio.Monto).toBe(75000)
    expect(dto.Codigo).toBe('COD1')
  })
  it('sin cambio de operación conserva AptoCredito', () => {
    const dto = armarAvisoConOperacionYPrecio(aviso, { monto: 120000 }, [], 7) as any
    expect(dto.AptoCredito).toBe(true)
    expect(dto.Precio.Monto).toBe(120000)
  })
})

describe('armarAvisoRepublicado', () => {
  const dto = armarAvisoRepublicado(aviso, { tipo: 'CASA', subtipo: 'PH' }, new Set(['AMBIENTES']), ['https://f/1.jpg'], 7) as any
  it('misma Codigo, Categoria nueva sin Subtipo en CASA', () => {
    expect(dto.Codigo).toBe('COD1')
    expect(dto.Categoria).toEqual({ Tipo: 'CASA' })
  })
  it('descarta características no aceptadas', () => {
    expect(dto.Caracteristicas).toEqual([{ Id: 'AMBIENTES', Valor: 3 }])
  })
  it('multimedia: fotos de la ficha + VIDEO vivo', () => {
    expect(dto.Multimedia).toEqual([{ Tipo: 'FOTO', Url: 'https://f/1.jpg' }, { Tipo: 'VIDEO', Url: 'https://yt/v' }])
  })
  it('conserva AptoCredito, Contacto y Localizacion', () => {
    expect(dto.AptoCredito).toBe(true)
    expect(dto.Contacto).toEqual({ Nombre: 'A' })
    expect(dto.Localizacion.Localidad).toEqual({ Id: 'LOC_1' })
    expect(dto.Localizacion.Barrio).toEqual({ Id: 'B_1' })
  })
  it('CASA sin subtipo → Subtipo CASA; con subtipo → mayúsculas', () => {
    const d = armarAvisoRepublicado(aviso, { tipo: 'CASA' }, new Set(), [], 7) as any
    expect(d.Categoria).toEqual({ Tipo: 'CASA', Subtipo: 'CASA' })
    const e = armarAvisoRepublicado(aviso, { tipo: 'CASA', subtipo: 'Duplex' }, new Set(), [], 7) as any
    expect(e.Categoria.Subtipo).toBe('DUPLEX')
  })
  it('31 fotos → 30; ficha sin fotos conserva las vivas', () => {
    const f = Array.from({ length: 31 }, (_, i) => `https://f/${i}.jpg`)
    const d = armarAvisoRepublicado(aviso, { tipo: 'CASA' }, new Set(), f, 7) as any
    expect(d.Multimedia.filter((m: any) => m.Tipo === 'FOTO')).toHaveLength(30)
    const v = armarAvisoRepublicado(aviso, { tipo: 'CASA' }, new Set(), [], 7) as any
    expect(v.Multimedia).toContainEqual({ Tipo: 'FOTO', Url: 'https://sosiva/x.jpg' })
  })
  it('depto venta → casa alquiler en un solo republicado', () => {
    const d = armarAvisoRepublicado(aviso, { tipo: 'CASA' }, new Set(), [], 7, { operacion: 'alquiler', monto: 900000, moneda: 'ARS' }) as any
    expect(d.Precio).toMatchObject({ Operacion: 'ALQUILER', Monto: 900000, Moneda: 'ARS' })
    expect(d.AptoCredito).toBe(false)
  })
  it('operación en minúsculas / temporario se normaliza', () => {
    expect((armarAvisoConOperacionYPrecio(aviso, { operacion: 'alquiler temporario' }, [], 7) as any).Precio.Operacion).toBe('ALQUILER_TEMPORAL')
    expect((armarAvisoConOperacionYPrecio(aviso, { operacion: 'venta' }, [], 7) as any).AptoCredito).toBe(true)
  })
  it('subtipo se conserva en categorías no CASA', () => {
    const d = armarAvisoRepublicado(aviso, { tipo: 'DEPARTAMENTO', subtipo: 'PH' }, new Set(), [], 7) as any
    expect(d.Categoria).toEqual({ Tipo: 'DEPARTAMENTO', Subtipo: 'PH' })
  })
})

describe('republicarAviso', () => {
  it('POST falla 2 veces → error claro con el crudo', async () => {
    const eliminar = vi.fn().mockResolvedValue(undefined)
    const publicar = vi.fn().mockRejectedValue(new PortalAdapterError('x', 'argenprop', 'unknown', false, 'crudo'))
    const err = await republicarAviso({ eliminar, publicar }, {}).catch(e => e)
    expect(err).toBeInstanceOf(PortalAdapterError)
    expect(err.message).toBe(MENSAJE_ELIMINADO_SIN_REPUBLICAR)
    expect(err.original).toBe('crudo')
    expect(publicar).toHaveBeenCalledTimes(2)
  })
  it('POST falla 1 vez y luego OK → IdAviso', async () => {
    const publicar = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(999)
    expect(await republicarAviso({ eliminar: async () => {}, publicar }, {})).toEqual({ avisoId: 999 })
  })
  it('reintento con ENT002 → éxito leyendo el aviso vivo', async () => {
    const publicar = vi.fn().mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new PortalAdapterError('dup', 'argenprop', 'unknown', false, 'Argenprop 400 ENT002 /v1/avisos'))
    const r = await republicarAviso({ eliminar: async () => {}, publicar, leerIdExistente: async () => 555 }, {})
    expect(r).toEqual({ avisoId: 555 })
  })
  it('si eliminar falla no publica', async () => {
    const publicar = vi.fn()
    await expect(republicarAviso({ eliminar: async () => { throw new Error('no') }, publicar }, {})).rejects.toThrow('no')
    expect(publicar).not.toHaveBeenCalled()
  })
})
