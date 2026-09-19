import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { geocodeAddress } from './geocoder'

function mockFetchOnce(json: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => json } as Response)
}

const OSM_ROOFTOP = [{
  lat: '-34.6042926', lon: '-58.5129293',
  display_name: '4300, José Luis Cantilo, Villa Devoto, ...',
  class: 'place', type: 'house',
  address: { house_number: '4300', road: 'José Luis Cantilo', suburb: 'Villa Devoto', state: 'Ciudad Autónoma de Buenos Aires' },
}]

const OSM_WRONG_TOWN = [{
  lat: '-34.4482859', lon: '-59.4490401',
  display_name: '11 - Rivadavia, Centro, San Andrés de Giles, ...',
  class: 'highway', type: 'secondary',
  address: { house_number: '11', road: 'Rivadavia', county: 'Partido de San Andrés de Giles', state: 'Buenos Aires' },
}]

beforeEach(() => { delete process.env.GOOGLE_GEOCODING_API_KEY })
afterEach(() => { vi.unstubAllGlobals() })

describe('geocodeAddress (OSM, sin key de Google)', () => {
  it('casa exacta en CABA → high', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(OSM_ROOFTOP))
    const r = await geocodeAddress('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '4300', locality: 'Villa Devoto' })
    expect(r).not.toBeNull()
    expect(r!.provider).toBe('osm')
    expect(r!.confidence).toBe('high')
    expect(r!.lat).toBeCloseTo(-34.6042926, 4)
  })

  it('altura equivocada (11 vs 2537) → low', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(OSM_WRONG_TOWN))
    const r = await geocodeAddress('Rivadavia 2537, General San Martín, Provincia de Buenos Aires, Argentina', { isCaba: false, province: 'Buenos Aires', number: '2537', locality: 'General San Martín' })
    expect(r).not.toBeNull()
    expect(r!.confidence).toBe('low')
  })

  it('esperaba CABA pero el resultado es Provincia de Buenos Aires → rechazado (null)', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([{ ...OSM_WRONG_TOWN[0] }]))
    const r = await geocodeAddress('X 100, Y, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '100' })
    expect(r).toBeNull()
  })

  it('sin resultado → null', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([]))
    const r = await geocodeAddress('Calle inexistente 999, Nada, Argentina')
    expect(r).toBeNull()
  })

  it('fallback: si la query con sub-barrio no resuelve, reintenta sin la localidad', async () => {
    // La query completa (con "Flores Norte", que OSM no conoce) → sin resultado.
    // El fallback (calle + CABA + Argentina, sin el sub-barrio) → resuelve.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const hasBarrio = /Flores(%20| )Norte/i.test(String(url))
      return Promise.resolve({ ok: true, json: async () => (hasBarrio ? [] : OSM_ROOFTOP) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await geocodeAddress(
      'Coronel Falcón 2500, Flores Norte, Ciudad Autónoma de Buenos Aires, Argentina',
      { isCaba: true, province: 'CABA', locality: 'Flores Norte' },
    )
    expect(r).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2) // query completa (miss) + fallback (hit)
  })

  it('último intento: sin abreviaturas ni iniciales (caso real "Tte. Gral. Juan D. Perón 4227")', async () => {
    // OSM no entiende "Tte. Gral. Juan D." (verificado 2026-09-19) pero sí "Juan Perón 4227".
    const urls: string[] = []
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const q = decodeURIComponent(String(url).split('q=')[1] ?? '')
      urls.push(q)
      return Promise.resolve({ ok: true, json: async () => (q.startsWith('Juan Perón 4227,') ? OSM_ROOFTOP : []) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await geocodeAddress(
      'Tte. Gral. Juan D. Perón 4227, Almagro, Ciudad Autónoma de Buenos Aires, Argentina',
      { isCaba: true, province: 'CABA' },
    )
    expect(r).not.toBeNull()
    expect(urls.at(-1)).toBe('Juan Perón 4227, Almagro, Ciudad Autónoma de Buenos Aires, Argentina')
  })

  it('sin abreviaturas que sacar no hace un intento de más', async () => {
    const fetchMock = mockFetchOnce([])
    vi.stubGlobal('fetch', fetchMock)
    await geocodeAddress('Doblas 248, Caballito, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA' })
    expect(fetchMock).toHaveBeenCalledTimes(2) // completa + sin localidad, y nada más
  })
})

describe('geocodeAddress (Google primero cuando hay key)', () => {
  it('ROOFTOP → high y provider google; no llama a OSM', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key'
    const google = {
      status: 'OK',
      results: [{
        geometry: { location: { lat: -34.60, lng: -58.51 }, location_type: 'ROOFTOP' },
        formatted_address: 'José Luis Cantilo 4300, CABA',
        partial_match: false,
        address_components: [{ long_name: 'Ciudad Autónoma de Buenos Aires', short_name: 'CABA', types: ['administrative_area_level_1'] }],
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => google } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const r = await geocodeAddress('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '4300' })
    expect(r!.provider).toBe('google')
    expect(r!.confidence).toBe('high')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
