import { describe, it, expect } from 'vitest'
import { crearSupabaseFalso, type Fila } from './supabase-falso'
import { identificarAviso, conectarConsulta, ConsultaNoConectable } from './identificar'

const PROP = '33333333-3333-4333-8333-333333333333'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const OTRO_ASESOR = '55555555-5555-4555-8555-555555555555'

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
      { id: PROP, address: 'Doblas 248', assigned_to: ASESOR },
      { id: 'p-sin-asesor', address: 'Rivadavia 5000', assigned_to: null },
    ],
    portal_property_map: [],
    ...extra,
  })
}

const fila = (sb: ReturnType<typeof base>, id: string) => sb.tablas.portal_inquiries.find((f) => f.id === id)

describe('identificarAviso', () => {
  const datos = {
    portal: 'zonaprop', externalCode: 'ZP123', address: 'Doblas 248', assignedTo: ASESOR,
    propertyId: PROP, externalUrl: 'https://www.zonaprop.com.ar/x-ZP123.html',
  }

  it('crea la fila del mapa y corrige hacia atrás solo las consultas de ese portal y código', async () => {
    const sb = base()
    const r = await identificarAviso(sb.cliente, datos)
    expect(r.actualizadas).toBe(2)
    expect(sb.tablas.portal_property_map).toHaveLength(1)
    expect(sb.tablas.portal_property_map[0]).toMatchObject({
      id: r.mapId, portal: 'zonaprop', external_code: 'ZP123', address: 'Doblas 248',
      assigned_to: ASESOR, property_id: PROP, active: true,
    })
    for (const id of ['c1', 'c2']) {
      expect(fila(sb, id)).toMatchObject({
        property_id: PROP, assigned_to: ASESOR, property_address: 'Doblas 248', matched_map_id: r.mapId, is_unmatched: false,
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
    expect(sb.tablas.portal_property_map[0]).toMatchObject({ address: 'Doblas 248', assigned_to: ASESOR, active: true })
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
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })
})

describe('conectarConsulta', () => {
  it('con recordar: todas las consultas del mismo portal+código quedan con la propiedad y se crea la fila del mapa', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, recordar: true })
    expect(r).toEqual({ actualizadas: 2, recordado: true })
    expect(fila(sb, 'c2')).toMatchObject({ property_id: PROP, assigned_to: ASESOR, is_unmatched: false })
    expect(sb.tablas.portal_property_map[0]).toMatchObject({
      portal: 'zonaprop', external_code: 'ZP123', property_id: PROP, assigned_to: ASESOR,
      external_url: 'https://www.zonaprop.com.ar/x-ZP123.html', address: 'Doblas 248',
    })
  })

  it('sin recordar: solo esa consulta, y el mapa no se toca', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, recordar: false })
    expect(r).toEqual({ actualizadas: 1, recordado: false })
    expect(fila(sb, 'c1')).toMatchObject({ property_id: PROP, assigned_to: ASESOR, property_address: 'Doblas 248', is_unmatched: false })
    expect(fila(sb, 'c2')!.property_id).toBeNull()
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('consulta sin código y recordar: solo esa, recordado false', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c5', propertyId: PROP, recordar: true })
    expect(r).toEqual({ actualizadas: 1, recordado: false })
    expect(fila(sb, 'c5')).toMatchObject({ property_id: PROP, assigned_to: ASESOR })
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('código en blanco cuenta como sin código', async () => {
    const sb = base({ portal_inquiries: [consulta({ id: 'cb', property_external_code: '   ' })] })
    const r = await conectarConsulta(sb.cliente, { consultaId: 'cb', propertyId: PROP, recordar: true })
    expect(r).toEqual({ actualizadas: 1, recordado: false })
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('propiedad sin asesor y recordar: no se recuerda el aviso y no se le borra el asesor a la consulta', async () => {
    const sb = base()
    const r = await conectarConsulta(sb.cliente, { consultaId: 'c5', propertyId: 'p-sin-asesor', recordar: true })
    expect(r).toEqual({ actualizadas: 1, recordado: false })
    expect(fila(sb, 'c5')).toMatchObject({ property_id: 'p-sin-asesor', assigned_to: OTRO_ASESOR, property_address: 'Rivadavia 5000', is_unmatched: false })
    expect(sb.tablas.portal_property_map).toHaveLength(0)
  })

  it('una consulta que ya tenía propiedad se puede reconectar (corrección)', async () => {
    const sb = base({ portal_inquiries: [consulta({ id: 'cx', property_id: 'p-sin-asesor', assigned_to: OTRO_ASESOR })] })
    const r = await conectarConsulta(sb.cliente, { consultaId: 'cx', propertyId: PROP, recordar: false })
    expect(r.actualizadas).toBe(1)
    expect(sb.tablas.portal_inquiries[0]).toMatchObject({ property_id: PROP, assigned_to: ASESOR })
  })

  it('consulta de landing: 400 "Esta consulta ya tiene propiedad"', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'l1', propertyId: PROP, recordar: true }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e).toMatchObject({ status: 400, message: 'Esta consulta ya tiene propiedad' })
  })

  it('consulta inexistente: 404', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'nada', propertyId: PROP, recordar: false }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e.status).toBe(404)
  })

  it('propiedad inexistente: 404 y no se toca la consulta', async () => {
    const sb = base()
    const e = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: 'no-existe', recordar: true }).catch((x) => x)
    expect(e).toBeInstanceOf(ConsultaNoConectable)
    expect(e.status).toBe(404)
    expect(fila(sb, 'c1')!.property_id).toBeNull()
  })

  it('error de la base al leer la consulta: se lanza (no se confunde con "no existe")', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'select', 'sin conexión')
    const e = await conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, recordar: false }).catch((x) => x)
    expect(e).not.toBeInstanceOf(ConsultaNoConectable)
    expect(String(e)).toContain('sin conexión')
  })

  it('error de la base al actualizar: se lanza', async () => {
    const sb = base()
    sb.fallar('portal_inquiries', 'update', 'rls')
    await expect(conectarConsulta(sb.cliente, { consultaId: 'c1', propertyId: PROP, recordar: false })).rejects.toThrow('rls')
  })
})
