import { describe, it, expect } from 'vitest'
import { flagEmoji, buildCountryOptions, filterCountries, composePhoneForSubmit } from './phone-country'

describe('flagEmoji', () => {
  it('convierte un ISO2 en la bandera emoji correspondiente', () => {
    expect(flagEmoji('AR')).toBe('🇦🇷')
    expect(flagEmoji('us')).toBe('🇺🇸') // minúscula también funciona
    expect(flagEmoji('BR')).toBe('🇧🇷')
  })

  it('devuelve una bandera blanca ante un código inválido, nunca lanza', () => {
    expect(flagEmoji('')).toBe('🏳️')
    expect(flagEmoji('ARG')).toBe('🏳️')
    expect(flagEmoji('1')).toBe('🏳️')
  })
})

describe('buildCountryOptions', () => {
  const codes: Record<string, string> = { AR: '54', US: '1', BR: '55' }
  const names: Record<string, string> = { AR: 'Argentina', US: 'Estados Unidos', BR: 'Brasil' }
  const options = buildCountryOptions(
    Object.keys(codes),
    iso2 => codes[iso2],
    iso2 => names[iso2],
  )

  it('mapea iso2/código/nombre para cada país', () => {
    expect(options).toContainEqual({ iso2: 'AR', code: '54', name: 'Argentina' })
    expect(options).toContainEqual({ iso2: 'US', code: '1', name: 'Estados Unidos' })
  })

  it('ordena por nombre', () => {
    expect(options.map(o => o.name)).toEqual(['Argentina', 'Brasil', 'Estados Unidos'])
  })
})

describe('filterCountries', () => {
  const options = [
    { iso2: 'AR', code: '54', name: 'Argentina' },
    { iso2: 'US', code: '1', name: 'Estados Unidos' },
    { iso2: 'BR', code: '55', name: 'Brasil' },
  ]

  it('sin query devuelve todo', () => {
    expect(filterCountries(options, '')).toHaveLength(3)
    expect(filterCountries(options, '   ')).toHaveLength(3)
  })

  it('filtra por nombre (case-insensitive)', () => {
    expect(filterCountries(options, 'argen')).toEqual([options[0]])
    expect(filterCountries(options, 'BRA')).toEqual([options[2]])
  })

  it('filtra por ISO2 exacto', () => {
    expect(filterCountries(options, 'us')).toEqual([options[1]])
  })

  it('filtra por indicativo', () => {
    expect(filterCountries(options, '54')).toEqual([options[0]])
    expect(filterCountries(options, '+54')).toEqual([options[0]])
  })

  it('sin coincidencias devuelve vacío, nunca lanza', () => {
    expect(filterCountries(options, 'xyz-no-existe')).toEqual([])
  })
})

describe('composePhoneForSubmit', () => {
  it('antepone el indicativo del país elegido cuando no hay "+"', () => {
    expect(composePhoneForSubmit('11 6123 4567', '54')).toBe('+54 11 6123 4567')
    expect(composePhoneForSubmit('310 782 2955', '57')).toBe('+57 310 782 2955')
  })

  it('respeta un "+" ya presente (alguien pegó el número completo) — nunca lo duplica', () => {
    expect(composePhoneForSubmit('+57 310 782 2955', '54')).toBe('+57 310 782 2955')
  })

  it('vacío/blanco da vacío, sin componer nada', () => {
    expect(composePhoneForSubmit('', '54')).toBe('')
    expect(composePhoneForSubmit('   ', '54')).toBe('')
  })
})
