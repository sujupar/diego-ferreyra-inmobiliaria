/**
 * Requisito duro del usuario (2026-07-30): el precio formateado y la
 * operación ("En venta"/"En alquiler"/"Alquiler temporario") tienen que
 * aparecer en la PRIMERA FRASE de cada primary text de los anuncios Meta —
 * antes del corte a ~125 chars que hace Meta en el feed — integrados al
 * ángulo emocional, no pegados como una etiqueta. Si la propiedad no tiene
 * precio cargado, solo la operación (nunca "consultar precio").
 *
 * Estos tests cubren el camino 100% determinístico (sin IA, sin red):
 * `buildTenEmotionalTemplates` directo, `ensureLeadSentence` (el backstop) y
 * `generateAdCopyVariations` con las API keys de IA deshabilitadas a
 * propósito (fuerza el fallback aunque el .env.local de la máquina tenga
 * alguna configurada).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  generateAdCopyVariations,
  ensureLeadSentence,
  buildTenEmotionalTemplates,
} from './copy-ai-generator'
import type { Property } from '../portals/types'

function makeProperty(o: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    location_refs: {},
    address: 'Honduras 5000',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 4,
    bedrooms: 2,
    bathrooms: 1,
    garages: 1,
    covered_area: 70,
    total_area: 75,
    floor: 5,
    age: 5,
    asking_price: 109000,
    currency: 'USD',
    commission_percentage: 3,
    contract_start_date: null,
    contract_end_date: null,
    origin: null,
    status: 'approved',
    documents: [],
    photos: ['https://x/1.jpg'],
    legal_status: 'approved',
    legal_reviewer_id: null,
    legal_notes: null,
    legal_reviewed_at: null,
    legal_docs: null,
    legal_flags: null,
    created_by: null,
    assigned_to: null,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    description: 'Departamento luminoso de 4 ambientes con balcón aterrazado.',
    latitude: -34.58,
    longitude: -58.43,
    video_url: null,
    tour_3d_url: null,
    video_file_url: null,
    expensas: 50000,
    amenities: ['pileta', 'parrilla', 'sum'],
    operation_type: 'venta',
    title: null,
    postal_code: '1414',
    public_slug: 'monte-castro-4amb',
    province: null,
    geo_confidence: null,
    geocoded_at: null,
    import_external_id: null,
    video_recorrido_url: null,
    deliver_media: null,
    ...o,
  }
}

const LEAD_WINDOW = 125

/** Precio formateado con el MISMO criterio que la app (Intl es-AR currency). */
function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

/** Casos variados: monedas, operaciones y con/sin precio cargado. */
const PROPERTIES: Array<{ label: string; property: Property; expectPrice: boolean }> = [
  {
    label: 'venta USD, Palermo',
    property: makeProperty(),
    expectPrice: true,
  },
  {
    label: 'venta ARS, Belgrano',
    property: makeProperty({
      neighborhood: 'Belgrano',
      currency: 'ARS',
      asking_price: 85_000_000,
    }),
    expectPrice: true,
  },
  {
    label: 'alquiler USD, Recoleta',
    property: makeProperty({
      neighborhood: 'Recoleta',
      operation_type: 'alquiler',
      asking_price: 1200,
    }),
    expectPrice: true,
  },
  {
    label: 'alquiler temporario, Caballito',
    property: makeProperty({
      neighborhood: 'Caballito',
      operation_type: 'temporario',
      asking_price: 900,
    }),
    expectPrice: true,
  },
  {
    label: 'venta SIN precio cargado, Monte Castro',
    property: makeProperty({ neighborhood: 'Monte Castro', asking_price: 0 }),
    expectPrice: false,
  },
  {
    // asking_price=0 es el centinela real de "sin precio cargado" en la app
    // (mismo criterio que lib/portals/validation.ts `if (!property.asking_price)`
    // y lib/ghl/import.ts `asking_price: 0`; la columna es NOT NULL en la DB).
    label: 'alquiler SIN precio cargado (0), Villa Urquiza',
    property: makeProperty({
      neighborhood: 'Villa Urquiza',
      operation_type: 'alquiler',
      asking_price: 0,
    }),
    expectPrice: false,
  },
]

describe('buildTenEmotionalTemplates — camino 100% determinístico (sin IA, sin red)', () => {
  for (const { label, property, expectPrice } of PROPERTIES) {
    it(`${label}: los 10 primary texts incluyen operación${expectPrice ? ' + precio' : ''} en los primeros ${LEAD_WINDOW} caracteres`, () => {
      const result = buildTenEmotionalTemplates(property)
      expect(result.primaryTexts).toHaveLength(10)

      const operationLabel =
        property.operation_type === 'alquiler'
          ? 'En alquiler'
          : property.operation_type === 'temporario'
            ? 'Alquiler temporario'
            : 'En venta'
      const price =
        expectPrice && property.asking_price
          ? formatPrice(property.asking_price, property.currency)
          : null

      for (const text of result.primaryTexts) {
        const window = text.slice(0, LEAD_WINDOW).toLowerCase()
        expect(window).toContain(operationLabel.toLowerCase())
        if (price) {
          expect(window).toContain(price.toLowerCase())
        }
      }

      if (!expectPrice) {
        // Nunca se inventa un precio ni se pone un placeholder tipo "consultar precio".
        for (const text of result.primaryTexts) {
          expect(text.toLowerCase()).not.toContain('consultar precio')
          expect(text).not.toMatch(/\$/)
        }
      }
    })
  }

  it('el precio SIEMPRE cae en la PRIMERA frase (antes del primer punto), no al final', () => {
    const property = makeProperty()
    const price = formatPrice(property.asking_price, property.currency)
    const result = buildTenEmotionalTemplates(property)
    for (const text of result.primaryTexts) {
      // Corte de "fin de oración" real: punto/dos puntos SEGUIDO de espacio.
      // (el precio en sí trae puntos como separador de miles — "US$ 109.000" —
      // así que un `search(/[.:]/)` ingenuo corta adentro del número.)
      const firstSentenceEnd = text.search(/[.:]\s/)
      const firstSentence = firstSentenceEnd >= 0 ? text.slice(0, firstSentenceEnd) : text
      expect(firstSentence).toContain(price)
      expect(firstSentence.toLowerCase()).toContain('en venta')
    }
  })

  it('el precio conecta con el barrio en la misma frase, no queda pegado como etiqueta aislada', () => {
    // Mal: "En venta USD 109.000. Descubrí tu próximo hogar..." (precio aislado, sin conexión).
    // Bien: el barrio/ángulo aparece a poca distancia del precio, en la MISMA oración inicial.
    const property = makeProperty()
    const price = formatPrice(property.asking_price, property.currency)
    const result = buildTenEmotionalTemplates(property)
    for (const text of result.primaryTexts) {
      const priceEndIdx = text.indexOf(price) + price.length
      expect(priceEndIdx).toBeGreaterThan(price.length - 1) // el precio está presente
      const barrioIdx = text.indexOf(property.neighborhood, priceEndIdx)
      expect(barrioIdx).toBeGreaterThan(-1)
      expect(barrioIdx - priceEndIdx).toBeLessThanOrEqual(90)
    }
  })
})

describe('ensureLeadSentence — backstop determinístico', () => {
  it('antepone operación + precio si el texto NO los trae', () => {
    const property = makeProperty()
    const out = ensureLeadSentence('Un texto cualquiera sin nada de esto.', property)
    const window = out.slice(0, LEAD_WINDOW).toLowerCase()
    expect(window).toContain('en venta')
    expect(window).toContain(formatPrice(109000, 'USD').toLowerCase())
    expect(out.endsWith('Un texto cualquiera sin nada de esto.')).toBe(true)
  })

  it('es idempotente: si el texto YA cumple, lo devuelve sin tocar', () => {
    const property = makeProperty()
    const compliant = `En venta a ${formatPrice(109000, 'USD')}, ya cumple.`
    expect(ensureLeadSentence(compliant, property)).toBe(compliant)
  })

  it('sin precio cargado antepone SOLO la operación (nunca "consultar precio")', () => {
    const property = makeProperty({ asking_price: 0 })
    const out = ensureLeadSentence('Texto sin lead.', property)
    expect(out.slice(0, LEAD_WINDOW).toLowerCase()).toContain('en venta')
    expect(out.toLowerCase()).not.toContain('consultar precio')
    expect(out).not.toMatch(/\$/)
  })

  it('alquiler usa la etiqueta "En alquiler" (operationLabelFor, no hardcodeado)', () => {
    const property = makeProperty({ operation_type: 'alquiler', asking_price: 1200 })
    const out = ensureLeadSentence('Texto.', property)
    expect(out.toLowerCase()).toContain('en alquiler')
  })
})

describe('generateAdCopyVariations — camino determinístico end-to-end (IA deshabilitada a propósito)', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Fuerza el fallback SIN IA sin importar qué haya en el .env.local de la
    // máquina (requisito del task: "sin IA, sin red"). Restaurado en afterAll.
    for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY']) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  for (const { label, property, expectPrice } of PROPERTIES) {
    it(`${label}: los 10 textos generados contienen operación${expectPrice ? ' + precio' : ''} en los primeros ${LEAD_WINDOW} caracteres`, async () => {
      const result = await generateAdCopyVariations(property, 'https://inmodf.com.ar/p/x')
      expect(result.source).toBe('template') // confirma que corrió el fallback, no la IA
      expect(result.primaryTexts).toHaveLength(10)

      const operationLabel =
        property.operation_type === 'alquiler'
          ? 'en alquiler'
          : property.operation_type === 'temporario'
            ? 'alquiler temporario'
            : 'en venta'
      const price =
        expectPrice && property.asking_price
          ? formatPrice(property.asking_price, property.currency).toLowerCase()
          : null

      for (const text of result.primaryTexts) {
        const window = text.slice(0, LEAD_WINDOW).toLowerCase()
        expect(window).toContain(operationLabel)
        if (price) expect(window).toContain(price)
      }
    })
  }
})

describe('el backstop no duplica la frase de apertura', () => {
  const prop = {
    id: 'x', address: 'Álvarez Jonte 4300', neighborhood: 'Monte Castro', city: 'Capital Federal',
    property_type: 'departamento', operation_type: 'venta', asking_price: 109000, currency: 'USD',
    rooms: 4, covered_area: 76,
  } as never

  it('reconoce el precio escrito con espacio NORMAL (así lo escribe la IA)', () => {
    // Bug real de los anuncios publicados: Intl genera el precio con espacio DURO
    // (U+00A0) y la IA lo escribe con espacio normal. La comparación cruda fallaba
    // y todos los textos salieron con "En venta a US$ 109.000." dos veces seguidas.
    const deLaIA = 'En venta a US$ 109.000, este 4 ambientes en Monte Castro es una inversión inteligente.'
    expect(ensureLeadSentence(deLaIA, prop)).toBe(deLaIA)
  })

  it('reconoce el precio escrito con espacio DURO', () => {
    const conDuro = 'En venta a US$ 109.000, este 4 ambientes en Monte Castro te espera.'
    expect(ensureLeadSentence(conDuro, prop)).toBe(conDuro)
  })

  it('aplicarlo dos veces da el mismo resultado (idempotente)', () => {
    const sinLead = 'Este 4 ambientes en Monte Castro te da el aire que hoy te falta.'
    const unaVez = ensureLeadSentence(sinLead, prop)
    expect(ensureLeadSentence(unaVez, prop)).toBe(unaVez)
    expect((unaVez.match(/En venta/gi) ?? []).length).toBe(1)
  })
})
