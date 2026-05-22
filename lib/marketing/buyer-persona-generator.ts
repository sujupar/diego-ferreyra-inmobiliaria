/**
 * Genera un perfil del comprador ideal (buyer persona) para una propiedad,
 * usado por el wizard inteligente de Meta Ads.
 *
 * Combina:
 *   - Datos de la propiedad (precio, tipo, ambientes, barrio)
 *   - Highlights visuales del vision-analyzer
 *   - Reglas heurísticas por nivel socioeconómico del barrio
 *
 * El persona se usa para:
 *   1. Sugerir copy con tono apropiado
 *   2. Setear targeting (edad, intereses, lifestyle)
 *   3. Mostrar al asesor "estamos buscando a una persona de X tipo"
 */
import type { Property } from '@/lib/portals/types'
import type { PropertyVisionAnalysis } from './property-vision-analyzer'

export interface BuyerPersona {
  ageRange: [number, number]
  incomeLevel: 'medio' | 'medio_alto' | 'alto' | 'premium'
  familyStatus:
    | 'soltero_o_pareja_sin_hijos'
    | 'familia_chica'
    | 'familia_con_hijos_crecidos'
    | 'inversor'
  lifestyle: string[] // ej. ["vida activa", "trabaja en zona céntrica", ...]
  communicationTone: 'aspiracional' | 'práctico' | 'familiar' | 'urgente'
  hooks: string[] // 3 ángulos de copy que resuenan con este persona
  reasoning: string // explicación humana para el asesor
}

// Mapeo de barrios CABA por nivel socioeconómico aproximado.
// Esta tabla es una simplificación — en F3.3 vamos a crear neighborhood_clusters
// en DB. Por ahora es un fallback inline.
const NEIGHBORHOOD_TIER: Record<string, BuyerPersona['incomeLevel']> = {
  // Premium
  recoleta: 'premium',
  palermo: 'alto',
  belgrano: 'alto',
  núñez: 'alto',
  nunez: 'alto',
  caballito: 'medio_alto',
  villa_urquiza: 'medio_alto',
  colegiales: 'medio_alto',
  // Medio alto
  almagro: 'medio',
  villa_crespo: 'medio_alto',
  chacarita: 'medio',
  flores: 'medio',
  // Medio
  san_telmo: 'medio',
  boedo: 'medio',
}

function neighborhoodTier(neighborhood: string): BuyerPersona['incomeLevel'] {
  const normalized = neighborhood
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
  return NEIGHBORHOOD_TIER[normalized] ?? 'medio'
}

function priceTier(priceUsd: number): BuyerPersona['incomeLevel'] {
  if (priceUsd >= 600_000) return 'premium'
  if (priceUsd >= 300_000) return 'alto'
  if (priceUsd >= 150_000) return 'medio_alto'
  return 'medio'
}

function combineIncome(
  byNeighborhood: BuyerPersona['incomeLevel'],
  byPrice: BuyerPersona['incomeLevel'],
): BuyerPersona['incomeLevel'] {
  // El precio tiene más peso (es objetivo). El barrio refina arriba o abajo.
  const order = ['medio', 'medio_alto', 'alto', 'premium'] as const
  const idxP = order.indexOf(byPrice)
  const idxN = order.indexOf(byNeighborhood)
  return order[Math.max(idxP, idxN)]
}

/**
 * Heurística determinística — funciona sin LLM, devuelve resultados
 * consistentes. Si en el futuro queremos refinar con AI, agregamos
 * un wrapper que llame al modelo y caigamos a este fallback.
 */
export function generateBuyerPersona(input: {
  property: Property
  vision?: PropertyVisionAnalysis
}): BuyerPersona {
  const { property, vision } = input
  const tier = combineIncome(
    neighborhoodTier(property.neighborhood),
    priceTier(
      property.currency === 'USD'
        ? property.asking_price
        : property.asking_price / 1000, // rough USD si está en ARS sin tipo de cambio
    ),
  )

  // Edad: depende de ambientes y tipo de operación
  const isVenta = (property.operation_type ?? 'venta') === 'venta'
  let ageRange: [number, number]
  let familyStatus: BuyerPersona['familyStatus']

  const rooms = property.rooms ?? 2
  if (rooms <= 2) {
    if (isVenta) {
      ageRange = [28, 45]
      familyStatus = 'soltero_o_pareja_sin_hijos'
    } else {
      ageRange = [25, 38]
      familyStatus = 'soltero_o_pareja_sin_hijos'
    }
  } else if (rooms === 3) {
    ageRange = [32, 50]
    familyStatus = 'familia_chica'
  } else {
    ageRange = [38, 60]
    familyStatus = 'familia_con_hijos_crecidos'
  }

  // Si es premium y < 3 amb, probable inversor
  if (tier === 'premium' && rooms <= 2) {
    familyStatus = 'inversor'
    ageRange = [40, 65]
  }

  // Lifestyle según barrio + features
  const lifestyle: string[] = []
  if (['palermo', 'villa_crespo', 'chacarita', 'colegiales'].some(n =>
    property.neighborhood.toLowerCase().includes(n.replace('_', ' ')),
  )) {
    lifestyle.push('vida nocturna y gastronomía cercana', 'profesional joven')
  }
  if (['belgrano', 'núñez', 'nunez', 'recoleta'].some(n =>
    property.neighborhood.toLowerCase().includes(n),
  )) {
    lifestyle.push('vida tranquila', 'cercanía a colegios privados')
  }
  if (vision?.detectedFeatures.some(f => /pileta|gym|gimnasio/i.test(f))) {
    lifestyle.push('valora vida activa y wellness')
  }
  if (vision?.detectedFeatures.some(f => /balc|terraz|jardin|verde/i.test(f))) {
    lifestyle.push('busca espacios abiertos')
  }
  if (lifestyle.length === 0) {
    lifestyle.push('profesional, busca ubicación estratégica')
  }

  // Tono según tier
  const communicationTone: BuyerPersona['communicationTone'] =
    tier === 'premium'
      ? 'aspiracional'
      : familyStatus.includes('familia')
        ? 'familiar'
        : tier === 'medio'
          ? 'práctico'
          : 'aspiracional'

  // Hooks: 3 ángulos de copy
  const hooks: string[] = []
  if (vision?.highlights.length) {
    hooks.push(`Destacar: ${vision.highlights[0].label}`)
  }
  if (lifestyle[0]) {
    hooks.push(`Apelar a: ${lifestyle[0]}`)
  }
  if (isVenta) {
    hooks.push('Hablar de inversión y revalorización del barrio')
  } else {
    hooks.push('Comodidad y disponibilidad inmediata')
  }

  const reasoning = [
    `Por el precio (${property.currency} ${property.asking_price.toLocaleString()}) y el barrio (${property.neighborhood}), apuntamos a un comprador de nivel "${tier.replace('_', ' ')}".`,
    `${rooms} ambientes sugiere ${familyStatus.replace(/_/g, ' ')}.`,
    `Edad probable: ${ageRange[0]}-${ageRange[1]}.`,
  ].join(' ')

  return {
    ageRange,
    incomeLevel: tier,
    familyStatus,
    lifestyle,
    communicationTone,
    hooks,
    reasoning,
  }
}
