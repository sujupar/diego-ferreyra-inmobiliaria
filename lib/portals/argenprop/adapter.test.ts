import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resolveLocalizacion: el adapter lanzaba "Por ahora la publicación en
 * Argenprop soporta solo CABA". Estos tests cubren el resolver general con el
 * catálogo MOCKEADO usando los datos del probe en vivo (2026-08-06): la
 * jerarquía país→provincia→partido→localidad existe y responde.
 */

vi.mock('./catalog', async () => {
  const real = await vi.importActual<typeof import('./catalog')>('./catalog')
  const barriosCaba = [
    { Id: 'BARRIO_20', Nombre: 'Palermo' },
    { Id: 'BARRIO_21', Nombre: 'Palermo Chico' },
    { Id: 'BARRIO_5', Nombre: 'Belgrano' },
  ]
  return {
    ...real,
    getProvincias: vi.fn().mockResolvedValue([
      { Id: 'PROVINCIA_1', Nombre: 'Buenos Aires' },
      { Id: 'PROVINCIA_2', Nombre: 'Capital Federal' },
      { Id: 'PROVINCIA_14', Nombre: 'Neuquén' },
    ]),
    getPartidos: vi.fn().mockResolvedValue([
      { Id: 'PARTIDO_107', Nombre: 'Partido de Roque Pérez' },
      { Id: 'PARTIDO_58', Nombre: 'Partido de La Plata' },
    ]),
    getLocalidadesDePartido: vi.fn().mockResolvedValue([
      { Id: 'LOCALIDAD_1730', Nombre: 'Roque Pérez' },
      { Id: 'LOCALIDAD_1724', Nombre: 'Barrientos' },
    ]),
    getBarrios: vi.fn(async (_creds: unknown, localidadId: string) =>
      localidadId === real.CABA_LOCALIDAD_ID ? barriosCaba : []),
    resolveBarrioId: vi.fn(async (_creds: unknown, localidadId: string, barrio?: string | null) => {
      if (localidadId !== real.CABA_LOCALIDAD_ID) return null
      const hit = barriosCaba.find(b => b.Nombre.toLowerCase() === (barrio ?? '').toLowerCase())
      return hit?.Id ?? null
    }),
    resolveCabaBarrioId: vi.fn(async (_creds: unknown, barrio?: string | null) => {
      const hit = barriosCaba.find(b => b.Nombre.toLowerCase() === (barrio ?? '').toLowerCase())
      return hit?.Id ?? null
    }),
  }
})

import { ArgenpropAdapter } from './adapter'
import { CABA_LOCALIDAD_ID } from './catalog'
import type { Property } from '../types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', appraisal_id: null,
    address: 'Honduras 5000', neighborhood: 'Palermo', city: 'CABA', province: 'CABA',
    property_type: 'departamento', operation_type: 'venta',
    title: 'Depto', description: 'x'.repeat(120),
    asking_price: 180000, currency: 'USD',
    photos: ['https://x/1.jpg'], latitude: -34.58, longitude: -58.43,
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0,
    covered_area: 70, total_area: 80, age: 10, expensas: null,
    video_url: null, video_file_url: null, tour_3d_url: null,
    video_recorrido_url: null, deliver_media: null,
    ...overrides,
  } as unknown as Property
}

function makeAdapter(): ArgenpropAdapter {
  const a = new ArgenpropAdapter(true)
  // resolveLocalizacion exige credenciales resueltas; para estos tests alcanza un stub.
  ;(a as unknown as { creds: unknown }).creds = {
    apiBase: 'https://x', tokenCrm: 't', usr: 'u', psd: 'p', idAnunciante: 1,
  }
  return a
}

type ResolverPrivado = { resolveLocalizacion(p: Property): Promise<{ localidadId: string; barrioId: string | null }> }
const resolver = (a: ArgenpropAdapter, p: Property) =>
  (a as unknown as ResolverPrivado).resolveLocalizacion(p)

beforeEach(() => vi.clearAllMocks())

describe('resolveLocalizacion — CABA (comportamiento que ya existía)', () => {
  it('provincia CABA + barrio conocido → localidad 2102 y el barrio', async () => {
    const r = await resolver(makeAdapter(), makeProperty())
    expect(r).toEqual({ localidadId: CABA_LOCALIDAD_ID, barrioId: 'BARRIO_20' })
  })

  it('en CABA el barrio sigue siendo OBLIGATORIO: sin barrio resolvible, error', async () => {
    const p = makeProperty({ neighborhood: 'Barrio Inventado' })
    await expect(resolver(makeAdapter(), p)).rejects.toThrow(/barrio/i)
  })

  it('ficha vieja sin provincia pero con barrio de CABA → camino CABA', async () => {
    const p = makeProperty({ province: null, city: '', neighborhood: 'Belgrano' } as never)
    const r = await resolver(makeAdapter(), p)
    expect(r).toEqual({ localidadId: CABA_LOCALIDAD_ID, barrioId: 'BARRIO_5' })
  })
})

describe('resolveLocalizacion — fuera de CABA (lo nuevo)', () => {
  it('Buenos Aires + Roque Pérez resuelve provincia→partido→localidad; sin barrio NO es error', async () => {
    const p = makeProperty({ province: 'Buenos Aires', city: 'Roque Pérez', neighborhood: null } as never)
    const r = await resolver(makeAdapter(), p)
    expect(r).toEqual({ localidadId: 'LOCALIDAD_1730', barrioId: null })
  })

  it('ciudad que no existe en la provincia → error castellano que nombra la Ciudad y el valor', async () => {
    const p = makeProperty({ province: 'Buenos Aires', city: 'Gotham', neighborhood: null } as never)
    await expect(resolver(makeAdapter(), p)).rejects.toThrow(/[Cc]iudad.*Gotham/)
  })

  it('provincia que no existe → error castellano que nombra la provincia', async () => {
    const p = makeProperty({ province: 'Marte', city: 'Roque Pérez' } as never)
    await expect(resolver(makeAdapter(), p)).rejects.toThrow(/provincia.*Marte/i)
  })

  it('sin provincia y sin barrio de CABA → error que pide cargar la provincia', async () => {
    const p = makeProperty({ province: null, city: 'Roque Pérez', neighborhood: 'Centro' } as never)
    await expect(resolver(makeAdapter(), p)).rejects.toThrow(/provincia/i)
  })
})
