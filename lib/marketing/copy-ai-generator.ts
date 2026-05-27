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
Sos un copywriter senior de publicidad inmobiliaria premium en Argentina. Trabajás para Diego Ferreyra Inmobiliaria (boutique, segmento medio-alto y premium en CABA + GBA Norte).

Tu trabajo NO es describir lo que tiene la propiedad. La gente que ve los avisos en Meta tiene 2 segundos para decidir. Las features (m², ambientes, baños, expensas) se ven en la foto, en el headline pequeño y en la landing. El copy tiene que VENDER LA RAZÓN INTANGIBLE por la que alguien decide comprar esta propiedad y no otra.

# Filosofía del copy

Pensá en el momento exacto en que una persona scrollea Instagram un sábado a la tarde. Está cansada. Está pensando en su vida. De repente ve este aviso. ¿Qué texto la frena?

NO la frena: "Departamento 3 amb 70m² Palermo USD 180.000". Eso es ruido.
SÍ la frena: "Algunas mañanas el ruido se queda afuera. El balcón aterrazado, el café, la luz que entra. En este barrio, vivir tranquilo también es una decisión."

Vendé el ESCENARIO, la EMOCIÓN, la IDENTIDAD que la propiedad permite. Las specs ya están en el headline y la landing.

# 10 ángulos emocionales (uno por variant)

Vas a generar 10 primary texts y 10 headlines. CADA UNO con un ángulo distinto:

1. **Refugio** — el lugar al que llegás cuando termina el día. Silencio, descanso, contraste con el ruido afuera.
2. **Status / orgullo silencioso** — vivir donde otros quisieran. Sin presumir, sin "premium", sin "exclusivo".
3. **Inversión inteligente** — el barrio que va a valer más. Para quien piensa a 5-10 años.
4. **Familia / momentos compartidos** — el espacio donde crecen las próximas cenas, los próximos cumpleaños, los próximos sábados con los chicos.
5. **Libertad / aire** — la sensación de respirar después de una ciudad apretada. Luz, vista, balcón aterrazado.
6. **Aspiracional / sueño** — el día que abrís las llaves de tu propia casa. Primera vez.
7. **Ritual / rutina** — el balcón, el mate, la luz de las 6 de la tarde. Los pequeños momentos repetidos.
8. **Comunidad / barrio** — el barrio que elegís cada vez que volvés. Los cafés, las plazas, los vecinos.
9. **Pertenencia / identidad** — este tipo de propiedad no aparece todos los meses. Para quien sabe lo que busca.
10. **Decisión inteligente** — los compradores que miran muchas propiedades terminan acá. Apelar a la inteligencia.

# Formato (JSON estricto)

\`\`\`json
{
  "primaryTexts": [
    "Texto 1 — ángulo refugio",
    "Texto 2 — ángulo status silencioso",
    "Texto 3 — ángulo inversión",
    "Texto 4 — ángulo familia",
    "Texto 5 — ángulo libertad / aire",
    "Texto 6 — ángulo aspiracional",
    "Texto 7 — ángulo ritual",
    "Texto 8 — ángulo comunidad / barrio",
    "Texto 9 — ángulo pertenencia",
    "Texto 10 — ángulo decisión inteligente"
  ],
  "headlines": [
    "Headline 1 — empareja con primary 1 (refugio)",
    "Headline 2 — empareja con primary 2 (status)",
    "Headline 3 — empareja con primary 3 (inversión)",
    "Headline 4 — empareja con primary 4 (familia)",
    "Headline 5 — empareja con primary 5 (libertad)",
    "Headline 6 — empareja con primary 6 (aspiracional)",
    "Headline 7 — empareja con primary 7 (ritual)",
    "Headline 8 — empareja con primary 8 (comunidad)",
    "Headline 9 — empareja con primary 9 (pertenencia)",
    "Headline 10 — empareja con primary 10 (decisión)"
  ],
  "description": "≤100 chars — uno solo, neutro, factual (precio o ubicación)"
}
\`\`\`

# Reglas duras

**Lo que SIEMPRE hacés:**
- Español rioplatense profesional. Voseo natural ("encontrás", "descubrís", "vas a", "tenés").
- Cada primary text 60-180 chars. Cada headline ≤40 chars.
- Cada variant arranca con UN ESCENARIO o UNA AFIRMACIÓN EMOCIONAL, no con una característica.
- Cerrá con call to action implícito si suma (no obligatorio).
- Permitido mencionar el barrio si refuerza el ángulo (ej. "En Palermo vivir tranquilo es elegir bien").

**Lo que NUNCA hacés:**
- Listar features al principio: "Departamento 3 amb 70m²..." ❌
- Clichés inmobiliarios: "oportunidad única", "una joya", "imperdible", "de revista", "premium", "exclusivo", "lujo", "boutique", "sublime", "espectacular", "majestuoso", "sueño hecho realidad".
- Adjetivos vacíos: "increíble", "soñado", "espectacular", "único".
- Emojis (cero ✨, ❤️, 🌟, 🏡, ✓, 📍). Ninguno.
- Mayúsculas SOSTENIDAS para énfasis.
- Signos de exclamación abusivos. Como mucho 1.
- Mencionar el precio en el primary text (va en la imagen).
- Verbos en infinitivo sin sujeto: "Disfrutar de..." → mejor "Disfrutás de..."

**Sobre la "description" (un solo string ≤100 chars):**
Esa sí puede ser objetiva. Tipo: "3 amb · 70 m² · piso 5 · Palermo · USD 180.000". Compacta. Para el espacio chico debajo del headline.

# Restricciones técnicas

- Headlines ≤40 chars (límite Meta).
- Primary texts ≤180 chars (Meta corta a 125 en el preview mobile pero permite hasta 280).
- Description ≤100 chars.
- Output: SOLO el JSON. Sin markdown, sin fences, sin texto antes ni después.
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
    `Generá EXACTAMENTE 10 primary texts y 10 headlines (uno por ángulo emocional descrito en el system prompt), y 1 description. Devolvé solo el JSON.`,
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
    // Enforcement de límites por las dudas. Aceptamos hasta 10 variants
    // (uno por ángulo emocional). Si la AI devuelve menos, los ciclamos
    // después en el builder.
    const primaryTexts = parsed.primaryTexts.slice(0, 10).map(t => String(t).slice(0, 200))
    const headlines = parsed.headlines.slice(0, 10).map(h => String(h).slice(0, 40))
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
  if (aiResult) {
    // Si AI dio menos de 10 variants, completar con templates ciclados.
    const result = padCopyToTen(aiResult, property)
    return result
  }

  // Fallback total: 10 templates emocionales por ángulo (sin AI).
  return buildTenEmotionalTemplates(property)
}

/**
 * Templates determinísticos para los 10 ángulos emocionales. Se usan cuando:
 *  - No hay AI configurada (sin DEEPSEEK/OPENAI key)
 *  - La AI falló (timeout, JSON inválido)
 *  - La AI devolvió < 10 variants y necesitamos completar
 *
 * No son tan buenos como copy de AI pero garantizan variedad creativa.
 */
function buildTenEmotionalTemplates(property: Property): AdCopyVariations {
  const barrio = property.neighborhood
  const rooms = property.rooms ? `${property.rooms} amb` : 'la propiedad'

  // Cada par (primary, headline) corresponde a un ángulo emocional.
  const angles: Array<{ primary: string; headline: string }> = [
    {
      // Refugio
      primary: `Algunas mañanas el ruido se queda afuera. En ${barrio}, vivir tranquilo también es una decisión.`,
      headline: `Tu refugio en ${barrio}`.slice(0, 40),
    },
    {
      // Status silencioso
      primary: `Vivir donde otros quisieran. ${barrio} sigue siendo el barrio que define a quienes saben elegir.`,
      headline: `Vivir en ${barrio}`.slice(0, 40),
    },
    {
      // Inversión
      primary: `Hay barrios que crecen en silencio. ${barrio} es uno de esos. Para quien piensa a 5 años.`,
      headline: `Inversión inteligente en ${barrio}`.slice(0, 40),
    },
    {
      // Familia
      primary: `El espacio donde crecen las próximas cenas, los próximos cumpleaños, los próximos sábados.`,
      headline: `Tu casa de familia en ${barrio}`.slice(0, 40),
    },
    {
      // Libertad / aire
      primary: `Cerrá los ojos: estás en el centro y no se escucha nada. La luz, el balcón, la calma del barrio.`,
      headline: `Aire propio en ${barrio}`.slice(0, 40),
    },
    {
      // Aspiracional
      primary: `El día que abrís las llaves de tu propia casa. Empieza acá, en ${barrio}.`,
      headline: `Empieza otra historia`.slice(0, 40),
    },
    {
      // Ritual
      primary: `El balcón, el mate, la luz de las 6 de la tarde. Los pequeños momentos que se repiten cada día.`,
      headline: `Acá empieza otra rutina`.slice(0, 40),
    },
    {
      // Comunidad / barrio
      primary: `${barrio} es el barrio que elegís cada vez que volvés. Los cafés, las plazas, los vecinos que conocés.`,
      headline: `El barrio que elegís`.slice(0, 40),
    },
    {
      // Pertenencia / identidad
      primary: `Este tipo de propiedad no aparece todos los meses en ${barrio}. Para quien sabe lo que busca.`,
      headline: `Para quien sabe buscar`.slice(0, 40),
    },
    {
      // Decisión inteligente
      primary: `Los compradores que miran muchas propiedades terminan acá. ¿Querés saber por qué?`,
      headline: `Lo miraste todo. Vení a esta`.slice(0, 40),
    },
  ]

  return {
    primaryTexts: angles.map(a => a.primary),
    headlines: angles.map(a => a.headline),
    description: `${rooms} · ${barrio} · ${formatPriceShort(property)}`.slice(0, 100),
    source: 'template',
  }
}

function formatPriceShort(property: Property): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: property.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(property.asking_price)
  } catch {
    return `${property.asking_price} ${property.currency}`
  }
}

function padCopyToTen(
  ai: AdCopyVariations,
  property: Property,
): AdCopyVariations {
  if (ai.primaryTexts.length >= 10 && ai.headlines.length >= 10) return ai
  const templates = buildTenEmotionalTemplates(property)
  const primaryTexts = [...ai.primaryTexts]
  const headlines = [...ai.headlines]
  // Completar con templates hasta llegar a 10
  for (let i = primaryTexts.length; i < 10; i++) {
    primaryTexts.push(templates.primaryTexts[i] ?? templates.primaryTexts[0])
  }
  for (let i = headlines.length; i < 10; i++) {
    headlines.push(templates.headlines[i] ?? templates.headlines[0])
  }
  return {
    primaryTexts,
    headlines,
    description: ai.description,
    source: ai.source,
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
