import { describe, it, expect } from 'vitest'
import {
  resolverUbicacion,
  leerRefArgenprop,
  esSeleccionCompleta,
  buscarEnCatalogoPorNombre,
  pistaDeProvincia,
  ID_LOCALIDAD_CABA,
} from './location-selection'

const BA = { id: 'PROVINCIA_1', nombre: 'Buenos Aires' }
const CAPITAL = { id: 'PROVINCIA_2', nombre: 'Capital Federal' }
const PARTIDO_SM = { id: 'PARTIDO_58', nombre: 'Partido de General San Martín' }
const PARTIDO_CAP = { id: 'PARTIDO_135', nombre: 'Capital Federal' }
const LOC_SM = { id: 'LOCALIDAD_928', nombre: 'General San Martin' }
const LOC_BALLESTER = { id: 'LOCALIDAD_931', nombre: 'Villa Ballester' }
const LOC_CABA = { id: ID_LOCALIDAD_CABA, nombre: 'CABA' }
const BARRIO_LIBERTAD = { id: 'BARRIO_323', nombre: 'Villa Libertad' }
const BARRIO_PUEYRREDON = { id: 'BARRIO_35', nombre: 'Villa Pueyrredon' }

describe('resolverUbicacion — el caso que rompió (Rogelio Vidal 6136)', () => {
  const r = resolverUbicacion(
    { provincia: BA, partido: PARTIDO_SM, localidad: LOC_SM, barrio: BARRIO_LIBERTAD },
    { province: null, city: 'General San Martín', neighborhood: 'Villa Libertad' },
  )

  it('guarda la provincia que faltaba', () => {
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.province).toBe('Buenos Aires')
  })

  it('guarda los identificadores reales de Argenprop', () => {
    if (!r.ok) throw new Error(r.error)
    expect(r.patch.location_refs.argenprop).toMatchObject({
      provinciaId: 'PROVINCIA_1',
      partidoId: 'PARTIDO_58',
      localidadId: 'LOCALIDAD_928',
      barrioId: 'BARRIO_323',
    })
  })

  it('conserva la tilde que ya estaba escrita ("General San Martín")', () => {
    if (!r.ok) throw new Error(r.error)
    // El catálogo lo escribe sin tilde; el nombre es el mismo, no se degrada.
    expect(r.patch.city).toBe('General San Martín')
  })
})

describe('resolverUbicacion — Capital Federal', () => {
  it('guarda province = CABA (lo que ya entienden el adapter, ML y el geocoder)', () => {
    const r = resolverUbicacion(
      { provincia: CAPITAL, partido: PARTIDO_CAP, localidad: LOC_CABA, barrio: BARRIO_PUEYRREDON },
      {},
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.patch.province).toBe('CABA')
    expect(r.patch.city).toBe('CABA')
    expect(r.patch.neighborhood).toBe('Villa Pueyrredon')
  })

  it('conserva "Villa Pueyrredón" con tilde si ya venía así', () => {
    const r = resolverUbicacion(
      { provincia: CAPITAL, partido: PARTIDO_CAP, localidad: LOC_CABA, barrio: BARRIO_PUEYRREDON },
      { neighborhood: 'Villa Pueyrredón' },
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.patch.neighborhood).toBe('Villa Pueyrredón')
  })

  it('en Capital el barrio es obligatorio', () => {
    const r = resolverUbicacion(
      { provincia: CAPITAL, partido: PARTIDO_CAP, localidad: LOC_CABA, barrio: null },
      {},
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/barrio/i)
  })
})

describe('resolverUbicacion — fuera de Capital el barrio es opcional', () => {
  const r = resolverUbicacion(
    { provincia: BA, partido: PARTIDO_SM, localidad: LOC_BALLESTER, barrio: null },
    {},
  )

  it('la ciudad es la LOCALIDAD, no el partido', () => {
    if (!r.ok) throw new Error(r.error)
    expect(r.patch.city).toBe('Villa Ballester')
  })

  it('sin barrio, el barrio queda igual a la localidad (la columna no admite vacío)', () => {
    if (!r.ok) throw new Error(r.error)
    expect(r.patch.neighborhood).toBe('Villa Ballester')
    expect(r.patch.location_refs.argenprop.barrioId).toBeNull()
  })
})

describe('resolverUbicacion — rechaza lo que no viene del catálogo', () => {
  it('rechaza un id con forma inventada', () => {
    const r = resolverUbicacion(
      { provincia: { id: 'DROP TABLE', nombre: 'x' }, partido: PARTIDO_SM, localidad: LOC_SM, barrio: null },
      {},
    )
    expect(r.ok).toBe(false)
  })

  it('rechaza una localidad con id de partido', () => {
    const r = resolverUbicacion(
      { provincia: BA, partido: PARTIDO_SM, localidad: { id: 'PARTIDO_58', nombre: 'x' }, barrio: null },
      {},
    )
    expect(r.ok).toBe(false)
  })

  it('rechaza un nombre vacío', () => {
    const r = resolverUbicacion(
      { provincia: BA, partido: PARTIDO_SM, localidad: { id: 'LOCALIDAD_928', nombre: '   ' }, barrio: null },
      {},
    )
    expect(r.ok).toBe(false)
  })

  it('rechaza un nombre absurdamente largo', () => {
    const r = resolverUbicacion(
      { provincia: BA, partido: PARTIDO_SM, localidad: { id: 'LOCALIDAD_928', nombre: 'x'.repeat(400) }, barrio: null },
      {},
    )
    expect(r.ok).toBe(false)
  })

  it('rechaza una selección incompleta', () => {
    expect(resolverUbicacion({ provincia: BA } as never, {}).ok).toBe(false)
    expect(resolverUbicacion(null as never, {}).ok).toBe(false)
    expect(resolverUbicacion('cualquier cosa' as never, {}).ok).toBe(false)
  })
})

describe('esSeleccionCompleta', () => {
  it('acepta una selección con los tres niveles obligatorios', () => {
    expect(esSeleccionCompleta({ provincia: BA, partido: PARTIDO_SM, localidad: LOC_SM })).toBe(true)
  })
  it('rechaza si falta la localidad', () => {
    expect(esSeleccionCompleta({ provincia: BA, partido: PARTIDO_SM })).toBe(false)
  })
})

describe('leerRefArgenprop', () => {
  it('devuelve la localidad y el barrio guardados', () => {
    const ref = leerRefArgenprop({
      argenprop: { localidadId: 'LOCALIDAD_928', barrioId: 'BARRIO_323' },
    })
    expect(ref).toEqual({ localidadId: 'LOCALIDAD_928', barrioId: 'BARRIO_323' })
  })

  it('devuelve null si no hay nada guardado', () => {
    expect(leerRefArgenprop(null)).toBeNull()
    expect(leerRefArgenprop({})).toBeNull()
    expect(leerRefArgenprop({ argenprop: {} })).toBeNull()
  })

  it('ignora un id con forma inválida en vez de mandarlo a la API', () => {
    expect(leerRefArgenprop({ argenprop: { localidadId: 'BARRIO_1' } })).toBeNull()
    expect(leerRefArgenprop({ argenprop: { localidadId: 123 } })).toBeNull()
  })

  it('descarta un barrio con forma inválida pero conserva la localidad', () => {
    expect(leerRefArgenprop({ argenprop: { localidadId: 'LOCALIDAD_928', barrioId: 'x' } }))
      .toEqual({ localidadId: 'LOCALIDAD_928', barrioId: null })
  })
})

describe('buscarEnCatalogoPorNombre — la preselección del selector', () => {
  const BARRIOS = [
    { id: 'BARRIO_35', nombre: 'Villa Pueyrredon' },
    { id: 'BARRIO_20', nombre: 'Palermo' },
    { id: 'BARRIO_21', nombre: 'Palermo Chico' },
  ]

  it('encuentra aunque la ficha tenga tilde y el catálogo no', () => {
    expect(buscarEnCatalogoPorNombre(BARRIOS, 'Villa Pueyrredón')?.id).toBe('BARRIO_35')
  })

  it('ignora mayúsculas y espacios de más', () => {
    expect(buscarEnCatalogoPorNombre(BARRIOS, '  PALERMO  ')?.id).toBe('BARRIO_20')
  })

  it('ignora el prefijo "Partido de" que la API le pone a todos los partidos', () => {
    const partidos = [{ id: 'PARTIDO_58', nombre: 'Partido de General San Martín' }]
    expect(buscarEnCatalogoPorNombre(partidos, 'General San Martin')?.id).toBe('PARTIDO_58')
  })

  it('NO acepta parecidos: "Palermo Soho" no es "Palermo"', () => {
    // Una preselección equivocada es peor que ninguna: se acepta sin mirar.
    expect(buscarEnCatalogoPorNombre(BARRIOS, 'Palermo Soho')).toBeUndefined()
  })

  it('sin nombre no preselecciona nada', () => {
    expect(buscarEnCatalogoPorNombre(BARRIOS, '')).toBeUndefined()
    expect(buscarEnCatalogoPorNombre(BARRIOS, null)).toBeUndefined()
    expect(buscarEnCatalogoPorNombre(BARRIOS, undefined)).toBeUndefined()
  })
})

describe('pistaDeProvincia', () => {
  it('traduce el "CABA" de la ficha al "Capital Federal" del catálogo', () => {
    expect(pistaDeProvincia('CABA')).toBe('Capital Federal')
    expect(pistaDeProvincia(' caba ')).toBe('Capital Federal')
  })
  it('deja pasar el resto tal cual', () => {
    expect(pistaDeProvincia('Buenos Aires')).toBe('Buenos Aires')
    expect(pistaDeProvincia(null)).toBeNull()
  })
})
