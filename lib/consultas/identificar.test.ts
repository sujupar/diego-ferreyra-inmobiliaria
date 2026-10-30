import { describe, it, expect } from 'vitest'
import { crearSupabaseFalso, type Fila } from './supabase-falso'
import { identificarAviso, conectarConsulta, conectarAviso, quienMuestraLaPropiedad, ConsultaNoConectable } from './identificar'

const PROP = '33333333-3333-4333-8333-333333333333'
/** Quien CAPTÓ la propiedad (`properties.assigned_to`). */
const CAPTADOR = '22222222-2222-4222-8222-222222222222'
/** Quien la MUESTRA: otra persona, otra comisión (dueño, 2026-10-30). */
const MUESTRA = '44444444-4444-4444-8444-444444444444'
const OTRO_ASESOR = '55555555-5555-4555-8555-555555555555'
const INACTIVO = '66666666-6666-4666-8666-666666666666'
const ABOGADO = '88888888-8888-4888-8888-888888888888'

function consulta(p: Fila): Fila {
  return {
    portal: 'zonaprop', property_external_code: 'ZP123', property_url: 'https://www.zonaprop.com.ar/x-ZP123.html',
    property_id: null, assigned_to: null, property_address: null, matched_map_id: null, is_unmatched: true, ...p,
  }
}

function base(extra: Partial<Record<string, Fila[]>> = {}) {
  return crearSupabaseFalso({
    portal_inquiries: [
      consulta({ id: 'c1' }),
      consulta({ id: 'c2' }),
      consulta({ id: 'c3', portal: 'argenprop' }), // mismo código, OTRO portal: no se toca
      consulta({ id: 'c4', property_external_code: 'ZP999' }),
      consulta({ id: 'c5', property_external_code: null, assigned_to: OTRO_ASESOR }),
    ],
    property_leads: [{ id: 'l1', property_id: PROP }],
    properties: [
      { id: PROP, address: 'Doblas 248', assigned_to: CAPTADOR },
      { id: 'p-sin-asesor', address: 'Rivadavia 5000', assigned_to: null },
    ],
    profiles: [
      { id: CAPTADOR, role: 'dueno', is_active: true },
      { id: MUESTRA, role: 'asesor', is_active: true },
      { id: OTRO_ASESOR, role: 'asesor', is_active: true },
      { id: INACTIVO, role: 'asesor', is_active: false },
      { id: ABOGADO, role: 'abogado', is_active: true },
    ],
    portal_property_map: [],
    ...extra,
  })
}

const fila = (sb: ReturnType<typeof base>, id: string) => sb.tablas.portal_inquiries.find((f) => f.id === id)
const propiedadIntacta = (sb: ReturnType<typeof base>) =>
  expect(sb.tablas.properties.find((p) => p.id === PROP)).toEqual({ id: PROP, address: 'Doblas 248', assigned_to: CAPTADOR })

describe('identificarAviso', () => {
  const datos = {
    portal: 'zonaprop', externalCode: 'ZP123', address: 'Doblas 248', assignedTo: MUESTRA,
    propertyId: PROP, externalUrl: 'https://www.zonaprop.com.ar/x-ZP123.html',
  }

  it('crea la fila del mapa y corrige hacia atrás solo las consultas de ese portal y código', async () => {
    const sb = base()
    const r = await identificarAviso(sb.cliente, datos)
    expect(r.actualizadas).toBe(2)
    expect(sb.tablas.portal_property_map).toHaveLength(1)
    expect(sb.tablas.portal_property_map[0]).toMatchObject({
      id: r.mapId, portal: 'zonaprop', external_code: 'ZP123', address: 'Doblas 248',
      assigned_to: MUESTRA, property_id: PROP, active: true,
    })
    for (const id of ['c1', 'c2']) {
      expect(fila(sb, id)).toMatchObject({
        property_id: PROP, assigned_to: MUESTRA, property_address: 'Doblas 248', matched_map_id: r.mapId, is_unmatched: false,
      })
    }
    expect(fila(sb, 'c3')!.property_id).toBeNull()
    expect(fila(sb, 'c4')!.property_id).toBeNull()
  })

  it('si el aviso ya estaba en el mapa, lo pisa (idempotente) en vez de duplicarlo', async () => {
    const sb = base({
      portal_property_map: [{ id: 'm-viejo', portal: 'zonaprop', external_code: 'ZP123', address: 'otra', assigned_to: OTRO_ASESOR, active: false }],
    })
    const r = await identificarAviso(sb.cliente, datos)
    expect(r.mapId).toBe('m-viejo')
    expect(sb.tablas.portal_property_map).toHaveLength(1)
    expect(sb.tablas.portal_property_map[0]).toMatchObject({ address: 'Doblas 248', assigned_to: MUESTRA, active: true })
  })

  it('un error de la base se lanza, no se traga', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'update', 'se cayó')
    await expect(identificarAviso(sb.cliente, datos)).rejects.toThrow('se cayó')
  })

  it('un error al leer el mapa también se lanza (no se crea una fila duplicada a ciegas)', async () => {
    const sb = base()
    sb.fallar('portal_property_map', 'select', 'timeout')
    await expect(identificarAviso(sb.cliente, datos)).rejects.toThrow('timeout')
  })
})

describe('conectarConsulta', () => {
  it('con código de aviso: todas las del aviso quedan con la propiedad y con QUIEN LA MUESTRA, y se recuerda el aviso', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 2, recordado: true, agrupable: true })
    expect(fila(sb, 'c2')).toMatchObject({ property_id: PROP, assigned_to: MUESTRA, is_unmatched: false })
    expect(sb.tablas.portal_property_map[0]).toMatchObject({
      portal: 'zonaprop', external_code: 'ZP123', property_id: PROP, assigned_to: MUESTRA,
      external_url: 'https://www.zonaprop.com.ar/x-ZP123.html', address: 'Doblas 248',
    })
  })

  it('NUNCA cambia quién captó la propiedad', async () => {
    const sb = base()
    await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA })
    propiedadIntacta(sb)
  })

  it('consulta sin código: solo esa, con quien la muestra, sin tocar el mapa', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c5', propertyId: PROP, muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 1, recordado: false, agrupable: false })
    expect(fila(sb, 'c5')).toMatchObject({ property_id: PROP, assigned_to: MUESTRA })
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('código en blanco, "https" o la REF de ZonaProp: solo esa consulta', async () => {
    for (const codigo of ['   ', 'https', '309710959']) {
      const sb = base({ portal_inquiries: [consulta({ id: 'cb', property_external_code: codigo }), consulta({ id: 'cc', property_external_code: codigo })] })
      const r = await conectarConsulta(sb.cliente, { consultaId: 'cb', propertyId: PROP, muestraId: MUESTRA })
      expect(r).toEqual({ actualizadas: 1, recordado: false, agrupable: false })
      expect(fila(sb, 'cc')!.property_id).toBeNull()
      expect(sb.tablas.portal_property_map).toHaveLength(0)
    }
  })

  it('propiedad sin asesor: igual se recuerda el aviso con quien la muestra', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: 'p-sin-asesor', muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 2, recordado: true, agrupable: true })
    expect(fila(sb, 'c1')).toMatchObject({ property_id: 'p-sin-asesor', assigned_to: MUESTRA, property_address: 'Rivadavia 5000' })
    expect(sb.tablas.portal_property_map[0]).toMatchObject({ assigned_to: MUESTRA, property_id: 'p-sin-asesor' })
  })

  it('una consulta que ya tenía propiedad se puede reconectar (corrección)', async () => {
    const sb = base({ portal_inquiries: [consulta({ id: 'cx', property_id: 'p-sin-asesor', assigned_to: OTRO_ASESOR })] })
    const r = await conectarConsulta(sb.cliente, { consultaId: 'cx', propertyId: PROP, muestraId: MUESTRA })
    expect(r.actualizadas).toBe(1)
    expect(sb.tablas.portal_inquiries[0]).toMatchObject({ property_id: PROP, assigned_to: MUESTRA })
  })

  it.each([
    ['inexistente', '99999999-9999-4999-8999-999999999999'],
    ['inactivo', INACTIVO],
    ['un rol que no muestra propiedades', ABOGADO],
  ])('quien la muestra %s: 400 y no se toca nada', async (_caso, muestraId) => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e).toMatchObject({ status: 400, message: 'Elegí quién muestra la propiedad' })
    expect(fila(sb, 'c1')!.property_id).toBeNull()
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('consulta de landing: 400 "Esta consulta ya tiene propiedad"', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'l1', propertyId: PROP, muestraId: MUESTRA }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e).toMatchObject({ status: 400, message: 'Esta consulta ya tiene propiedad' })
  })

  it('consulta de landing SIN propiedad: 400 "Las consultas de landing no se conectan desde acá"', async () => {
    const sb = base({ property_leads: [{ id: 'l2', property_id: null }] })
    const e = await conectarConsulta(sb.cliente, { consultaId: 'l2', propertyId: PROP, muestraId: MUESTRA }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e).toMatchObject({ status: 400, message: 'Las consultas de landing no se conectan desde acá' })
  })

  it('consulta inexistente: 404', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'nada', propertyId: PROP, muestraId: MUESTRA }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e.status).toBe(404)
  })

  it('propiedad inexistente: 404 y no se toca la consulta', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: 'no-existe', muestraId: MUESTRA }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e.status).toBe(404)
    expect(fila(sb, 'c1')!.property_id).toBeNull()
  })

  it('error de la base al leer la consulta: se lanza (no se confunde con "no existe")', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'select', 'sin conexión')
    const e = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA }).catch((x) => x)
    expect(e).not.toBeInstanceOf(ConsultaNoConectable)
    expect(String(e)).toContain('sin conexión')
  })

  it('error de la base al leer quién la muestra: se lanza (no se confunde con "no existe")', async () => {
    const sb = base()
    sb.fallar('profiles', 'select', 'timeout perfiles')
    await expect(conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA })).rejects.toThrow('timeout perfiles')
  })

  it('error de la base al actualizar: se lanza', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'update', 'rls')
    await expect(conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA })).rejects.toThrow('rls')
  })
})

describe('conectarAviso', () => {
  it('conecta TODAS las consultas del aviso con quien la muestra y lo recuerda', async () => {
    const sb = base()
    const r = await conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: PROP, muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 2, recordado: true })
    for (const id of ['c1', 'c2']) expect(fila(sb, id)).toMatchObject({ property_id: PROP, assigned_to: MUESTRA })
    expect(fila(sb, 'c3')!.property_id).toBeNull()
    expect(sb.tablas.portal_property_map).toHaveLength(1)
    expect(sb.tablas.portal_property_map[0]).toMatchObject({ assigned_to: MUESTRA })
    propiedadIntacta(sb)
  })

  it('propiedad sin asesor: conecta y recuerda igual', async () => {
    const sb = base()
    const r = await conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: 'p-sin-asesor', muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 2, recordado: true })
    expect(sb.tablas.portal_property_map).toHaveLength(1)
  })

  it('quien la muestra inválido: 400 y no toca nada', async () => {
    const sb = base()
    await expect(conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: PROP, muestraId: INACTIVO }))
      .rejects.toMatchObject({ status: 400 })
    expect(sb.tablas.portal_inquiries.every((f) => f.property_id === null)).toBe(true)
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('un código que no agrupa: 400 y no toca nada', async () => {
    const sb = base()
    await expect(conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'https', propertyId: PROP, muestraId: MUESTRA }))
      .rejects.toMatchObject({ status: 400 })
    expect(sb.tablas.portal_inquiries.every((f) => f.property_id === null)).toBe(true)
  })

  it('propiedad inexistente: 404 y no toca nada', async () => {
    const sb = base()
    await expect(conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: 'no-existe', muestraId: MUESTRA }))
      .rejects.toBeInstanceOf(ConsultaNoConectable)
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('error de la base al actualizar: se lanza', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'update', 'boom')
    await expect(conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: PROP, muestraId: MUESTRA })).rejects.toThrow('boom')
  })
})

describe('conectar NO pisa consultas que ya tenían otra propiedad (revisión adversarial)', () => {
  const OTRA = '77777777-7777-4777-8777-777777777777'
  const conUnaYaConectada = () => base({ portal_inquiries: [
    consulta({ id: 'c1' }), consulta({ id: 'c2' }),
    consulta({ id: 'ya', property_id: OTRA, assigned_to: OTRO_ASESOR, property_address: 'Otra 100' }),
  ] })

  it('conectarAviso: solo las sin propiedad; la que ya tenía otra queda igual', async () => {
    const sb = conUnaYaConectada()
    const r = await conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: PROP, muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 2, recordado: true })
    expect(fila(sb, 'ya')).toMatchObject({ property_id: OTRA, assigned_to: OTRO_ASESOR, property_address: 'Otra 100' })
  })

  it('conectarConsulta desde una consulta del aviso: tampoco la mueve', async () => {
    const sb = conUnaYaConectada()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, muestraId: MUESTRA })
    expect(r.actualizadas).toBe(2)
    expect(fila(sb, 'ya')).toMatchObject({ property_id: OTRA })
  })

  it('reconectar la que ya tenía propiedad corrige SOLO esa, no el aviso entero', async () => {
    const sb = conUnaYaConectada()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'ya', propertyId: PROP, muestraId: MUESTRA })
    expect(r).toEqual({ actualizadas: 1, recordado: false, agrupable: false })
    expect(fila(sb, 'ya')).toMatchObject({ property_id: PROP, assigned_to: MUESTRA })
    expect(fila(sb, 'c1')!.property_id).toBeNull()
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('conectarAviso de un aviso sin consultas pendientes: 404 y el mapa no se toca', async () => {
    const sb = base()
    await expect(conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'NO-EXISTE1', propertyId: PROP, muestraId: MUESTRA }))
      .rejects.toMatchObject({ status: 404 })
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('conectarAviso con un portal que no tiene avisos (landing, inventado): 400', async () => {
    const sb = base()
    for (const portal of ['landing', 'properati']) {
      await expect(conectarAviso(sb.cliente, { portal, codigo: 'ZP123', propertyId: PROP, muestraId: MUESTRA })).rejects.toMatchObject({ status: 400 })
    }
  })

  it('el enlace que se guarda en el mapa es el de la consulta más nueva', async () => {
    const sb = base({ portal_inquiries: [
      consulta({ id: 'v', property_url: 'https://www.zonaprop.com.ar/viejo', received_at: '2026-01-01T00:00:00Z' }),
      consulta({ id: 'n', property_url: 'https://www.zonaprop.com.ar/nuevo', received_at: '2026-10-01T00:00:00Z' }),
    ] })
    await conectarAviso(sb.cliente, { portal: 'zonaprop', codigo: 'ZP123', propertyId: PROP, muestraId: MUESTRA })
    expect(sb.tablas.portal_property_map[0]).toMatchObject({ external_url: 'https://www.zonaprop.com.ar/nuevo' })
  })
})

describe('quienMuestraLaPropiedad', () => {
  it('el de su aviso activo más reciente', async () => {
    const sb = base({ portal_property_map: [
      { id: 'a', property_id: PROP, assigned_to: OTRO_ASESOR, active: true, updated_at: '2026-01-01T00:00:00Z' },
      { id: 'b', property_id: PROP, assigned_to: MUESTRA, active: true, updated_at: '2026-10-01T00:00:00Z' },
      { id: 'c', property_id: PROP, assigned_to: CAPTADOR, active: false, updated_at: '2026-12-01T00:00:00Z' },
      { id: 'd', property_id: PROP, assigned_to: null, active: true, updated_at: '2026-12-01T00:00:00Z' },
      { id: 'e', property_id: 'otra', assigned_to: CAPTADOR, active: true, updated_at: '2026-12-01T00:00:00Z' },
    ] })
    await expect(quienMuestraLaPropiedad(sb.cliente, PROP)).resolves.toBe(MUESTRA)
  })

  it('sin avisos con alguien: null (nunca cae en quien la captó)', async () => {
    const sb = base()
    await expect(quienMuestraLaPropiedad(sb.cliente, PROP)).resolves.toBeNull()
  })

  it('error de la base: se lanza', async () => {
    const sb = base()
    sb.fallar('portal_property_map', 'select', 'caída')
    await expect(quienMuestraLaPropiedad(sb.cliente, PROP)).rejects.toThrow('caída')
  })
})
