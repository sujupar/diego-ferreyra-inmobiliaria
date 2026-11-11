import { describe, it, expect, vi } from 'vitest'
import {
  armarAvisoConOperacionYPrecio, armarAvisoRepublicado, republicarAviso, MENSAJE_ELIMINADO_SIN_REPUBLICAR,
  publicarConCodigoLibre, partirCodigo, codigoNumero, type AvisoExistente,
} from './cambio-categoria'
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
  const dto = armarAvisoRepublicado(aviso, { tipo: 'CASA' }, new Set(['AMBIENTES']), ['https://f/1.jpg'], 7) as any
  it('misma Codigo, Categoria nueva con Subtipo CASA', () => {
    expect(dto.Codigo).toBe('COD1')
    expect(dto.Categoria).toEqual({ Tipo: 'CASA', Subtipo: 'CASA' })
  })
  it('descarta características no aceptadas', () => {
    expect(dto.Caracteristicas).toEqual([{ Id: 'AMBIENTES', Valor: 3 }])
  })
  it('conserva SUPERFICIE_TOTAL aunque el catálogo no la acepte (la sonda mostró que CASA la guarda)', () => {
    const conSup = { ...aviso, Caracteristicas: [...aviso.Caracteristicas, { Id: 'SUPERFICIE_TOTAL', Valor: 120 }] }
    const d = armarAvisoRepublicado(conSup, { tipo: 'CASA' }, new Set(['AMBIENTES']), [], 7)
    expect(d.Caracteristicas).toEqual([{ Id: 'AMBIENTES', Valor: 3 }, { Id: 'SUPERFICIE_TOTAL', Valor: 120 }])
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

const ent002 = () => new PortalAdapterError('Argenprop rechazó el aviso: ya existe un aviso', 'argenprop', 'unknown', false, 'Argenprop 400 ENT002 /v1/avisos')
const sinAviso = async (): Promise<AvisoExistente | undefined> => undefined
const dtoCasa = { Codigo: 'COD1', Categoria: { Tipo: 'CASA' } }

describe('republicarAviso', () => {
  it('POST falla 2 veces → error claro con el crudo', async () => {
    const eliminar = vi.fn().mockResolvedValue(undefined)
    const publicar = vi.fn().mockRejectedValue(new PortalAdapterError('x', 'argenprop', 'unknown', false, 'crudo'))
    const err = await republicarAviso({ eliminar, publicar, leerExistente: sinAviso }, dtoCasa).catch(e => e)
    expect(err).toBeInstanceOf(PortalAdapterError)
    expect(err.message).toBe(MENSAJE_ELIMINADO_SIN_REPUBLICAR)
    expect(err.original).toBe('crudo')
    expect(publicar).toHaveBeenCalledTimes(2)
  })
  it('POST falla 1 vez y luego OK → IdAviso con el mismo código', async () => {
    const publicar = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(999)
    expect(await republicarAviso({ eliminar: async () => {}, publicar, leerExistente: sinAviso }, dtoCasa)).toEqual({ avisoId: 999, codigo: 'COD1' })
  })
  it('reintento con ENT002 y el aviso vivo YA del tipo nuevo → éxito (el intento anterior llegó)', async () => {
    const publicar = vi.fn().mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(ent002())
    const leerExistente = async () => ({ idAviso: 555, eliminado: false, tipo: 'CASA' })
    expect(await republicarAviso({ eliminar: async () => {}, publicar, leerExistente }, dtoCasa)).toEqual({ avisoId: 555, codigo: 'COD1' })
  })
  it('ENT002 con el aviso vivo del tipo VIEJO → NO se da por republicado', async () => {
    const publicar = vi.fn().mockRejectedValue(ent002())
    const leerExistente = async () => ({ idAviso: 10, eliminado: false, tipo: 'DEPARTAMENTO' })
    const err = await republicarAviso({ eliminar: async () => {}, publicar, leerExistente }, dtoCasa).catch(e => e)
    expect(err.message).toBe(MENSAJE_ELIMINADO_SIN_REPUBLICAR)
  })
  it('código ocupado por el aviso ELIMINADO (caso Olmos) → publica con …r2 y lo devuelve', async () => {
    const publicar = vi.fn(async (d: Record<string, unknown>) => { if (d.Codigo === 'COD1') throw ent002(); return 777 })
    const leerExistente = vi.fn(async () => ({ idAviso: 10, eliminado: true, tipo: 'DEPARTAMENTO' }))
    expect(await republicarAviso({ eliminar: async () => {}, publicar, leerExistente }, dtoCasa)).toEqual({ avisoId: 777, codigo: 'COD1r2' })
    expect(publicar.mock.calls.map(c => c[0].Codigo)).toEqual(['COD1', 'COD1r2'])
    expect(publicar.mock.calls[1][0].Categoria).toEqual({ Tipo: 'CASA' })
  })
  it('si eliminar falla no publica', async () => {
    const publicar = vi.fn()
    await expect(republicarAviso({ eliminar: async () => { throw new Error('no') }, publicar, leerExistente: sinAviso }, dtoCasa)).rejects.toThrow('no')
    expect(publicar).not.toHaveBeenCalled()
  })
})

describe('códigos alternativos', () => {
  it('partirCodigo / codigoNumero', () => {
    expect(partirCodigo('60U6_d8ca41a3347c')).toEqual({ raiz: '60U6_d8ca41a3347c', n: 1 })
    expect(partirCodigo('60U6_d8ca41a3347cr2')).toEqual({ raiz: '60U6_d8ca41a3347c', n: 2 })
    expect(codigoNumero('60U6_d8ca41a3347c', 1)).toBe('60U6_d8ca41a3347c')
    expect(codigoNumero('60U6_d8ca41a3347c', 3)).toBe('60U6_d8ca41a3347cr3')
  })
})

describe('publicarConCodigoLibre', () => {
  const vivo = vi.fn(async () => 4242)
  it('POST OK → mismo código, sin leer nada', async () => {
    const leerExistente = vi.fn(sinAviso)
    expect(await publicarConCodigoLibre({ publicar: async () => 1, leerExistente, siExisteVivo: vivo }, { Codigo: 'C' })).toEqual({ avisoId: 1, codigo: 'C' })
    expect(leerExistente).not.toHaveBeenCalled()
  })
  it('ENT002 con aviso vivo → decide siExisteVivo (el asistente hace PUT) con el mismo código', async () => {
    const siExisteVivo = vi.fn(async () => 4242)
    const r = await publicarConCodigoLibre({
      publicar: async () => { throw ent002() },
      leerExistente: async () => ({ idAviso: 4242, eliminado: false, tipo: 'CASA' }),
      siExisteVivo,
    }, { Codigo: 'C' })
    expect(r).toEqual({ avisoId: 4242, codigo: 'C' })
    expect(siExisteVivo).toHaveBeenCalledWith('C', expect.anything(), { Codigo: 'C' })
  })
  it('un código ya alternativo sigue numerando desde ahí (…r2 → …r3)', async () => {
    const publicar = vi.fn(async (d: Record<string, unknown>) => { if (d.Codigo === 'Cr2') throw ent002(); return 9 })
    const r = await publicarConCodigoLibre({ publicar, leerExistente: async () => ({ idAviso: 1, eliminado: true, tipo: 'X' }), siExisteVivo: vivo }, { Codigo: 'Cr2' })
    expect(r).toEqual({ avisoId: 9, codigo: 'Cr3' })
  })
  it('todos los códigos ocupados por eliminados → error claro, sin loop infinito', async () => {
    const publicar = vi.fn(async () => { throw ent002() })
    const err = await publicarConCodigoLibre({ publicar, leerExistente: async () => ({ idAviso: 1, eliminado: true, tipo: 'X' }), siExisteVivo: vivo }, { Codigo: 'C' }).catch(e => e)
    expect(err.message).toMatch(/ocupados los códigos/)
    expect(publicar).toHaveBeenCalledTimes(4)
  })
  it('si no se puede leer el aviso que ocupa el código → error, nunca publica a ciegas otro código', async () => {
    const publicar = vi.fn(async () => { throw ent002() })
    await expect(publicarConCodigoLibre({ publicar, leerExistente: async () => { throw new Error('red') }, siExisteVivo: vivo }, { Codigo: 'C' })).rejects.toThrow('red')
    expect(publicar).toHaveBeenCalledTimes(1)
  })
  it('ENT002 pero la lectura no encuentra el aviso → frena, NO avanza de código (evita duplicar)', async () => {
    const publicar = vi.fn(async () => { throw ent002() })
    const err = await publicarConCodigoLibre({ publicar, leerExistente: sinAviso, siExisteVivo: vivo }, { Codigo: 'C' }).catch(e => e)
    expect(err.message).toMatch(/todavía no lo muestra/)
    expect(publicar).toHaveBeenCalledTimes(1)
  })
  it('un error que no es ENT002 se propaga tal cual', async () => {
    await expect(publicarConCodigoLibre({ publicar: async () => { throw new Error('PUB003') }, leerExistente: sinAviso, siExisteVivo: vivo }, { Codigo: 'C' })).rejects.toThrow('PUB003')
  })
})
