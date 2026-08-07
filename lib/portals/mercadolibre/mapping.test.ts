import { describe, it, expect } from 'vitest'
import {
  propertyToMlPayload,
  resolveCategory,
  mensajeSinCategoria,
  todasLasCategorias,
  ML_LISTING_TYPES,
  ML_TIPOS_SOPORTADOS,
  ML_OPERACIONES_SOPORTADAS,
} from './mapping'
import type { Property } from '../types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Honduras 5000',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0,
    covered_area: 70, total_area: 75, floor: 5, age: 5,
    asking_price: 180000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: null,
    status: 'approved', documents: [], photos: ['https://x/a.jpg', 'https://x/b.jpg'],
    legal_status: 'approved', legal_reviewer_id: null, legal_notes: null,
    legal_reviewed_at: null, legal_docs: null, legal_flags: null,
    created_by: null, assigned_to: null,
    created_at: '2026-05-12T00:00:00Z', updated_at: '2026-05-12T00:00:00Z',
    description: 'Departamento luminoso de 3 ambientes con balcón aterrazado, muy cerca del subte D y de Palermo Hollywood. Vista despejada al frente y luz natural durante todo el día.',
    latitude: -34.58, longitude: -58.43,
    video_url: null, tour_3d_url: null, video_file_url: null, video_recorrido_url: null, deliver_media: null,
    expensas: 50000, amenities: ['pileta', 'parrilla'],
    operation_type: 'venta', title: null, postal_code: '1414',
    public_slug: null,
    province: null,
    geo_confidence: null,
    geocoded_at: null,
    import_external_id: null,
    ...overrides,
  }
}

describe('propertyToMlPayload', () => {
  it('maps basic apartment for sale', () => {
    const payload = propertyToMlPayload(makeProperty())
    expect(payload.title).toContain('Palermo')
    expect(payload.currency_id).toBe('USD')
    expect(payload.price).toBe(180000)
    expect(payload.pictures.length).toBe(2)
    expect(payload.location.latitude).toBe(-34.58)
    // Departamentos > Venta > Propiedades Individuales (hoja publicable).
    expect(payload.category_id).toBe('MLA401686')
  })

  it('un tipo desconocido REVIENTA en vez de publicar en una categoría cualquiera', () => {
    // Antes caía en MLA1459 ("Inmuebles", la raíz del árbol), que ML rechaza
    // siempre. Un respaldo silencioso sobre un dato de un sistema ajeno es peor
    // que un error: o falla después con un mensaje ilegible, o publica en el
    // rubro equivocado sin que nadie se entere.
    expect(() => propertyToMlPayload(makeProperty({ property_type: 'cochera' })))
      .toThrow(/No hay categoría de MercadoLibre/)
  })

  it('uses custom title when provided', () => {
    const payload = propertyToMlPayload(makeProperty({ title: 'Hermoso depto frente al parque' }))
    expect(payload.title).toBe('Hermoso depto frente al parque')
  })

  it('truncates title to 60 chars', () => {
    const long = 'x'.repeat(100)
    const payload = propertyToMlPayload(makeProperty({ title: long }))
    expect(payload.title.length).toBe(60)
  })

  it('limits pictures to 12', () => {
    const photos = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`)
    const payload = propertyToMlPayload(makeProperty({ photos }))
    expect(payload.pictures.length).toBe(12)
  })

  it('includes expensas attribute when present', () => {
    const payload = propertyToMlPayload(makeProperty({ expensas: 75000 }))
    const expensas = payload.attributes.find(a => a.id === 'MAINTENANCE_FEE')
    expect(expensas?.value_name).toBe('75000 ARS')
  })

  it('maps rental departamento', () => {
    const payload = propertyToMlPayload(makeProperty({ operation_type: 'alquiler' }))
    // Departamentos > Alquiler. MLA1463 (el valor viejo) ni siquiera existe.
    expect(payload.category_id).toBe('MLA1473')
  })

  it('falls back to address in description when description is empty', () => {
    const payload = propertyToMlPayload(makeProperty({ description: null }))
    expect(payload.description.plain_text.length).toBeGreaterThan(0)
  })
})

describe('propertyToMlPayload con opts', () => {
  it('default listing_type_id = free (publicación gratuita)', () => {
    const p = propertyToMlPayload(makeProperty())
    expect(p.listing_type_id).toBe('free')
  })
  it('respeta el listingType pasado', () => {
    const p = propertyToMlPayload(makeProperty(), { listingType: 'silver' })
    expect(p.listing_type_id).toBe('silver')
  })
  it('aplica attributeOverrides (value_id para list)', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { ORIENTATION: { value_id: '1' } },
    })
    expect(p.attributes).toContainEqual({ id: 'ORIENTATION', value_id: '1' })
  })
  it('override vacío limpia el atributo derivado', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { ROOMS: {} },
    })
    expect(p.attributes.find(a => a.id === 'ROOMS')).toBeUndefined()
  })
  it('filtra atributos no permitidos por la categoría', () => {
    const p = propertyToMlPayload(makeProperty(), {
      allowedAttributeIds: new Set(['ROOMS', 'BEDROOMS']),
    })
    const ids = p.attributes.map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['ROOMS', 'BEDROOMS']))
    expect(ids).not.toContain('FLOORS')
  })
  it('mediaChoice=video setea video_id desde video_url', () => {
    const p = propertyToMlPayload(makeProperty({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), { mediaChoice: 'video' })
    expect(p.video_id).toBe('dQw4w9WgXcQ')
  })
  it('mediaChoice=tour NO setea video_id', () => {
    const p = propertyToMlPayload(makeProperty({ video_url: 'https://youtu.be/dQw4w9WgXcQ' }), { mediaChoice: 'tour' })
    expect(p.video_id).toBeUndefined()
  })
  it('normaliza number_unit sin unidad (override "95" -> "95 m²", age "15" -> "15 años")', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: {
        COVERED_AREA: { value_name: '95' },
        TOTAL_AREA: { value_name: '105' },
        PROPERTY_AGE: { value_name: '15' },
      },
    })
    expect(p.attributes).toContainEqual({ id: 'COVERED_AREA', value_name: '95 m²' })
    expect(p.attributes).toContainEqual({ id: 'TOTAL_AREA', value_name: '105 m²' })
    expect(p.attributes).toContainEqual({ id: 'PROPERTY_AGE', value_name: '15 años' })
  })
  it('no toca un number_unit que ya trae unidad', () => {
    const p = propertyToMlPayload(makeProperty(), {
      attributeOverrides: { COVERED_AREA: { value_name: '95 m²' } },
    })
    expect(p.attributes).toContainEqual({ id: 'COVERED_AREA', value_name: '95 m²' })
  })

  it('mediaChoice=tour agrega el link del recorrido a la descripción', () => {
    const p = propertyToMlPayload(makeProperty({ tour_3d_url: 'https://my.matterport.com/show/?m=abc' }), { mediaChoice: 'tour' })
    expect(p.description.plain_text).toContain('https://my.matterport.com/show/?m=abc')
    expect(p.description.plain_text).toContain('Recorrido virtual')
  })
})

describe('resolveCategory', () => {
  // Los IDs están verificados uno por uno contra la API de MercadoLibre por
  // scripts/verify-ml-categories.ts (existe + es hoja + admite publicar + la
  // ruta coincide con la operación). Este bloque congela ese resultado: si
  // alguien toca el mapa, el test canta antes de que se entere un cliente.
  const ESPERADO: Record<string, Record<string, string>> = {
    venta: {
      departamento: 'MLA401686', casa: 'MLA401685', ph: 'MLA105182',
      terreno: 'MLA401687', local: 'MLA79244', oficina: 'MLA401684',
    },
    alquiler: {
      departamento: 'MLA1473', casa: 'MLA1467', ph: 'MLA105181',
      terreno: 'MLA1494', local: 'MLA79243', oficina: 'MLA50539',
    },
    temporario: {
      departamento: 'MLA50279', casa: 'MLA50278', ph: 'MLA105180',
      terreno: 'MLA50283', local: 'MLA50283', oficina: 'MLA50283',
    },
  }

  for (const operacion of ML_OPERACIONES_SOPORTADAS) {
    for (const tipo of ML_TIPOS_SOPORTADOS) {
      it(`${tipo} en ${operacion} -> ${ESPERADO[operacion][tipo]}`, () => {
        const p = makeProperty({ operation_type: operacion, property_type: tipo })
        expect(resolveCategory(p)).toBe(ESPERADO[operacion][tipo])
      })
    }
  }

  it('el mapa cubre las 18 combinaciones del formulario, sin sobrantes', () => {
    const combos = todasLasCategorias()
    expect(combos).toHaveLength(ML_OPERACIONES_SOPORTADAS.length * ML_TIPOS_SOPORTADOS.length)
    for (const { operacion, tipo } of combos) {
      expect(ML_OPERACIONES_SOPORTADAS).toContain(operacion as never)
      expect(ML_TIPOS_SOPORTADOS).toContain(tipo as never)
    }
  })

  it('ninguna categoría se repite entre operaciones distintas del mismo tipo', () => {
    // Esta es la prueba que habría cazado el bug original: el mapa viejo mandaba
    // "departamento en venta" a la categoría de ALQUILER.
    for (const tipo of ML_TIPOS_SOPORTADOS) {
      const porOperacion = ML_OPERACIONES_SOPORTADAS.map(op =>
        resolveCategory(makeProperty({ operation_type: op, property_type: tipo })),
      )
      // (terreno/local/oficina comparten la hoja de "Otros Inmuebles" en
      // temporario porque ML no tiene una propia — eso es entre TIPOS, no entre
      // operaciones, así que acá sí exigimos tres valores distintos.)
      expect(new Set(porOperacion).size).toBe(3)
    }
  })

  it('acepta "alquiler temporario" y "alquiler_temporario" como temporario', () => {
    const esperado = resolveCategory(makeProperty({ operation_type: 'temporario' }))
    expect(resolveCategory(makeProperty({ operation_type: 'alquiler temporario' }))).toBe(esperado)
    expect(resolveCategory(makeProperty({ operation_type: 'alquiler_temporario' }))).toBe(esperado)
    expect(resolveCategory(makeProperty({ operation_type: 'Alquiler Temporario' }))).toBe(esperado)
  })

  it('una combinación no mapeada devuelve null, nunca una categoría cualquiera', () => {
    expect(resolveCategory(makeProperty({ property_type: 'cochera' }))).toBeNull()
    expect(resolveCategory(makeProperty({ property_type: 'galpon' }))).toBeNull()
    expect(resolveCategory(makeProperty({ operation_type: 'permuta' }))).toBeNull()
  })

  it('el mensaje de "sin categoría" nombra los dos datos a corregir', () => {
    const msg = mensajeSinCategoria(makeProperty({ property_type: 'cochera', operation_type: 'venta' }))
    expect(msg).toContain('cochera')
    expect(msg).toContain('venta')
    expect(msg).not.toMatch(/MLA/) // el asesor no tiene por qué ver un ID de ML
  })
})

describe('ML_LISTING_TYPES', () => {
  it('gold_premium es el primer listing type', () => {
    expect(ML_LISTING_TYPES[0].id).toBe('gold_premium')
  })
})
