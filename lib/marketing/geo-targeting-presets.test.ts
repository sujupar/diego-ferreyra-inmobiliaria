import { describe, it, expect } from 'vitest'
import { geoSpecForPreset } from './geo-targeting-presets'

const prop = { latitude: -34.60, longitude: -58.42, neighborhood: 'Caballito' } as never

describe('geoSpecForPreset', () => {
  it('cercanos → 1 pin en la propiedad, 2km', () => {
    const s = geoSpecForPreset(prop, 'cercanos')
    expect(s.geo_locations.custom_locations).toHaveLength(1)
    expect(s.geo_locations.custom_locations![0]).toMatchObject({ latitude: -34.60, longitude: -58.42, radius: 2 })
  })
  it('amplio → 1 pin Obelisco 25km', () => {
    const s = geoSpecForPreset(prop, 'amplio')
    expect(s.geo_locations.custom_locations![0]).toMatchObject({ latitude: -34.6037, longitude: -58.3816, radius: 25 })
  })
  it('similares → múltiples pines (propiedad + hermanos)', () => {
    const s = geoSpecForPreset(prop, 'similares')
    expect(s.geo_locations.custom_locations!.length).toBeGreaterThan(1)
  })
  it('tira si falta lat/lng', () => {
    expect(() => geoSpecForPreset({ latitude: null, longitude: null } as never, 'cercanos')).toThrow()
  })
})
