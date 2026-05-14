/**
 * Generador de copy AI para anuncios Meta Ads.
 *
 * A diferencia del generador de descripciones para portales (más largo y
 * estructurado), aquí necesitamos copy compacto para feed/story:
 *   - 3 variaciones de primary text (60-150 chars)
 *   - 3 variaciones de headline (≤40 chars)
 *   - 1 description (≤100 chars)
 *
 * Fallback: si OPENAI_API_KEY no está configurada, vuelve a templates
 * determinísticos (buildAdCopy de copy-templates.ts).
 *
 * Caching: se persiste en property_meta_campaigns.copy para reusar entre
 * reintentos. El builder pasa el resultado completo de aquí.
 */
import type { Property } from '@/lib/portals/types'
import { chatCompletion, hasAiConfigured } from '@/lib/ai/chat-client'
import { buildAdCopy, type AdCopy } from './copy-templates'

export interface AdCopyVariations {
  primaryTexts: string[] // 3 variaciones
  headlines: string[] // 3 variaciones
  description: string
  source: 'ai' | 'template'
}

const SYSTEM_PROMPT = `
Sos un copywriter de Meta Ads para una inmobiliaria argentina (Diego Ferreyra Inmobiliaria). Tu trabajo es crear copy compacto para anuncios en Facebook e Instagram que generen clicks de potenciales compradores en CABA y GBA.

# Reglas absolutas

- Español rioplatense profesional, sin "vos". Tono cálido pero claro.
- Cero clichés: prohibidas las frases "oportunidad única", "una joya", "el mejor", "imperdible", "de revista", "increíble", "premium".
- Adjetivos válidos: luminoso, amplio, moderno, funcional, sofisticado, confortable, encantador, tranquilo, impecable, cálido, ventilado, panorámico, estratégico, verde, industrial, clásico.
- No prometas imposibles ni inventes datos.
- Verbos en presente: "encontrás", "descubrís", "disfrutás".

# Formato de salida (JSON estricto)

\`\`\`json
{
  "primaryTexts": [
    "Variación 1 — 60 a 150 chars, foco en el beneficio principal y la emoción",
    "Variación 2 — distinta angulación, mencionar amenities o ubicación",
    "Variación 3 — más directa, urgencia razonable o claim concreto"
  ],
  "headlines": [
    "Headline 1 — ≤40 chars, tipo + barrio + precio (en USD si es USD)",
    "Headline 2 — ≤40 chars, gancho de feature destacada",
    "Headline 3 — ≤40 chars, ángulo emocional o lifestyle"
  ],
  "description": "≤100 chars, resumen objetivo (m², ambientes, barrio)"
}
\`\`\`

# Restricciones técnicas

- Headlines ≤40 chars (límite Meta).
- Primary texts ≤150 chars (mantenerlos legibles en mobile).
- Description ≤100 chars.
- No usar markdown, emojis ni saltos de línea raros en headlines.
- 1-2 emojis solo en primary texts si suman (✓, 🏡, 📍). No más.
- Output: SOLO el JSON. Sin texto antes ni después.
`

function buildUserPayload(property: Property, landingUrl: string): string {
  const amenities = Array.isArray(property.amenities)
    ? (property.amenities as string[])
    : []
  return [
    `# Propiedad`,
    `Tipo: ${property.property_type}`,
    `Operación: ${property.operation_type || 'venta'}`,
    `Barrio: ${property.neighborhood}`,
    `Dirección: ${property.address}`,
    `Precio: ${property.asking_price} ${property.currency}`,
    property.expensas ? `Expensas: ARS ${property.expensas}` : null,
    property.rooms ? `Ambientes: ${property.rooms}` : null,
    property.bedrooms ? `Dormitorios: ${property.bedrooms}` : null,
    property.bathrooms ? `Baños: ${property.bathrooms}` : null,
    property.garages ? `Cocheras: ${property.garages}` : null,
    property.covered_area ? `Cubierta: ${property.covered_area} m²` : null,
    property.total_area ? `Total: ${property.total_area} m²` : null,
    property.floor != null ? `Piso: ${property.floor}` : null,
    amenities.length > 0 ? `Amenities: ${amenities.join(', ')}` : null,
    property.description
      ? `\nDescripción del asesor:\n${property.description.slice(0, 500)}`
      : null,
    ``,
    `# Landing URL`,
    landingUrl,
    ``,
    `# Tarea`,
    `Generá 3 primary texts, 3 headlines y 1 description para anuncios Meta apuntando a esta landing. Devolvé solo el JSON.`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function callAi(
  property: Property,
  landingUrl: string,
): Promise<AdCopyVariations | null> {
  if (!hasAiConfigured()) return null

  try {
    const res = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPayload(property, landingUrl) },
      ],
      temperature: 0.8, // un poco más creativo que el de portales
      jsonMode: true,
    })
    const content = res.content
    if (!content) return null
    const parsed = JSON.parse(content) as Partial<AdCopyVariations>
    if (
      !Array.isArray(parsed.primaryTexts) ||
      !Array.isArray(parsed.headlines) ||
      !parsed.description
    ) {
      console.warn('[copy-ai] JSON shape inválido')
      return null
    }
    // Enforcement de límites por las dudas
    const primaryTexts = parsed.primaryTexts.slice(0, 3).map(t => String(t).slice(0, 150))
    const headlines = parsed.headlines.slice(0, 3).map(h => String(h).slice(0, 40))
    const description = String(parsed.description).slice(0, 100)
    if (primaryTexts.length === 0 || headlines.length === 0) return null
    return { primaryTexts, headlines, description, source: 'ai' }
  } catch (err) {
    console.warn('[copy-ai] error', err)
    return null
  }
}

/**
 * Devuelve copy variations para Meta Ads. Intenta OpenAI; si falla o no
 * está configurado, vuelve a templates determinísticos.
 *
 * El builder de campaign usa la primera variación de cada array como copy
 * principal del ad, y guarda las demás en property_meta_campaigns.copy
 * para futuros A/B tests.
 */
export async function generateAdCopyVariations(
  property: Property,
  landingUrl: string,
): Promise<AdCopyVariations> {
  const aiResult = await callAi(property, landingUrl)
  if (aiResult) return aiResult

  // Fallback determinístico
  const tpl = buildAdCopy(property)
  return {
    primaryTexts: [tpl.primaryText],
    headlines: [tpl.headline],
    description: tpl.description,
    source: 'template',
  }
}

/**
 * Helper: convierte AdCopyVariations al shape AdCopy (1 versión) que el
 * builder espera. Usa la primera variación de cada array.
 */
export function variationsToPrimary(variations: AdCopyVariations): AdCopy {
  return {
    primaryText: variations.primaryTexts[0],
    headline: variations.headlines[0],
    description: variations.description,
  }
}
