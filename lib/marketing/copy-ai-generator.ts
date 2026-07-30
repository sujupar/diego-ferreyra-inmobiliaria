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
 *
 * Requisito duro (2026-07-30, pedido del dueño): la OPERACIÓN ("En venta"/
 * "En alquiler", vía operationLabelFor) y el PRECIO formateado tienen que
 * aparecer en la PRIMERA FRASE de cada primaryText, integrados al ángulo
 * emocional — no pegados como etiqueta. Meta corta el texto principal del
 * feed ~125 chars antes de "ver más", así que tienen que entrar ANTES de
 * ese corte. El prompt de la IA lo pide explícitamente; `ensureLeadSentence`
 * es el backstop determinístico que antepone operación+precio si el texto
 * (de la IA o de un template) no los trae ya — se aplica a TODOS los
 * caminos en `generateAdCopyVariations`. Si la propiedad no tiene precio
 * cargado (`asking_price` 0/null), se antepone SOLO la operación — nunca se
 * inventa un precio ni se escribe "consultar precio".
 */
import type { Property } from '@/lib/portals/types'
import { chatCompletion, hasAiConfigured } from '@/lib/ai/chat-client'
import { buildAdCopy, type AdCopy } from './copy-templates'
import { RIOPLATENSE_STYLE } from '@/lib/copy/rioplatense'
import { operationLabelFor, normalizePropertyTypeLabel } from './ad-image-generator-v2'

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
${RIOPLATENSE_STYLE}
- Cada primary text 60-180 chars. Cada headline ≤40 chars.
- **LA PRIMERA FRASE de cada primary text integra la OPERACIÓN y el PRECIO**
  que te paso en los datos de la propiedad, conectados de forma estratégica
  con el ángulo emocional de ESE texto — nunca pegados como una etiqueta
  suelta al principio. Usá EXACTAMENTE el texto de operación y el precio
  formateado que te doy (no los reformatees ni los redondees).
  - ❌ Mal (etiqueta pegada): "En venta USD 109.000. Descubrí tu próximo hogar en Monte Castro..."
  - ✅ Bien (integrado al ángulo): "En venta a USD 109.000, este 4 ambientes en Monte Castro te da el espacio que hoy te falta."
  - Si NO te doy un precio (te aviso explícitamente en los datos), mencioná
    SOLO la operación en esa primera frase — nunca inventes un precio, nunca
    escribas "consultar precio" ni nada equivalente.
- Cada variant arranca con UN ESCENARIO o UNA AFIRMACIÓN EMOCIONAL enlazado con esa primera frase de operación+precio, no con una lista de características.
- Cerrá con call to action implícito si suma (no obligatorio).
- Permitido mencionar el barrio si refuerza el ángulo (ej. "En Palermo vivir tranquilo es elegir bien").

**Lo que NUNCA hacés:**
- Listar features al principio: "Departamento 3 amb 70m²..." ❌
- Clichés inmobiliarios: "oportunidad única", "una joya", "imperdible", "de revista", "premium", "exclusivo", "lujo", "boutique", "sublime", "espectacular", "majestuoso", "sueño hecho realidad".
- Adjetivos vacíos: "increíble", "soñado", "espectacular", "único".
- Emojis (cero ✨, ❤️, 🌟, 🏡, ✓, 📍). Ninguno.
- Mayúsculas SOSTENIDAS para énfasis.
- Signos de exclamación abusivos. Como mucho 1.
- Verbos en infinitivo sin sujeto: "Disfrutar de..." → mejor "Disfrutás de..."

**Sobre la "description" (un solo string ≤100 chars):**
Esa sí puede ser objetiva. Tipo: "3 amb · 70 m² · piso 5 · Palermo · USD 180.000". Compacta. Para el espacio chico debajo del headline.

# Restricciones técnicas

- Headlines ≤40 chars (límite Meta).
- Primary texts ≤180 chars (Meta corta a 125 en el preview mobile pero permite hasta 280).
- **La operación + el precio (si hay) tienen que quedar DENTRO de esos primeros ~125 caracteres** — es decir, en la primera frase, no al final.
- Description ≤100 chars.
- Output: SOLO el JSON. Sin markdown, sin fences, sin texto antes ni después.
`

function buildUserPayload(property: Property, landingUrl: string): string {
  const amenities = Array.isArray(property.amenities)
    ? (property.amenities as string[])
    : []
  const operationLabel = operationLabelFor(property.operation_type)
  const formattedPrice = formatPriceForCopy(property)
  return [
    `# Propiedad`,
    `Tipo: ${property.property_type}`,
    `Operación (usar EXACTAMENTE esta frase en la primera oración de cada primary text): ${operationLabel}`,
    `Barrio: ${property.neighborhood}`,
    `Dirección: ${property.address}`,
    formattedPrice
      ? `Precio (usar EXACTAMENTE este texto en la primera oración de cada primary text, no lo reformatees): ${formattedPrice}`
      : `Precio: NO CARGADO — no inventes un precio ni escribas "consultar precio". En la primera oración de cada primary text mencioná SOLO la operación.`,
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
    `Generá EXACTAMENTE 10 primary texts y 10 headlines (uno por ángulo emocional descrito en el system prompt), y 1 description. Recordá: LOS 10 primary texts tienen que arrancar integrando la operación${formattedPrice ? ' y el precio de arriba' : ' de arriba (sin precio, no lo inventes)'} en su primera oración. Devolvé solo el JSON.`,
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
    // después en el builder. `ensureLeadSentence` va ANTES del slice: si la
    // IA no integró operación+precio, anteponemos y recién ahí recortamos
    // (si recortáramos antes, un texto de 200 chars perdería el margen para
    // el prepend).
    const primaryTexts = parsed.primaryTexts
      .slice(0, 10)
      .map(t => ensureLeadSentence(String(t), property).slice(0, 220))
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
  const result = aiResult
    ? padCopyToTen(aiResult, property) // AI dio menos de 10 variants → completar con templates ciclados.
    : buildTenEmotionalTemplates(property) // Fallback total: 10 templates emocionales por ángulo (sin AI).

  // Backstop final, aplicado a TODOS los caminos (AI, padding con templates,
  // o fallback puro): garantiza que cada primaryText tenga operación+precio
  // en la primera frase, sin importar de dónde vino el texto. No-op si el
  // texto ya lo trae integrado (caso normal: los templates ya lo integran y
  // la IA fue instruida explícitamente).
  return {
    ...result,
    primaryTexts: result.primaryTexts.map(t => ensureLeadSentence(t, property)),
  }
}

/**
 * Precio formateado con el mismo criterio que el resto de la app
 * (`Intl.NumberFormat('es-AR', {style:'currency', ...})`, ver `app/v/[token]/page.tsx`
 * y `app/(dashboard)/properties/page.tsx`). Devuelve `null` si la propiedad
 * NO tiene precio cargado (`asking_price` 0/null) — el llamador NUNCA debe
 * inventar un precio ni escribir "consultar precio" en su lugar.
 */
function formatPriceForCopy(property: Property): string | null {
  if (!property.asking_price || property.asking_price <= 0) return null
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: property.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(property.asking_price)
  } catch {
    return `${property.currency ?? 'USD'} ${property.asking_price.toLocaleString('es-AR')}`
  }
}

/** Frase de apertura: "En venta a USD 109.000" o, sin precio cargado, solo "En venta". */
function leadPhrase(operationLabel: string, price: string | null): string {
  return price ? `${operationLabel} a ${price}` : operationLabel
}

/**
 * Longitud aproximada donde Meta corta el texto principal en el feed antes
 * de mostrar "ver más" (verificado empíricamente, ver CLAUDE.md). La
 * operación y el precio tienen que quedar ANTES de ese corte.
 */
const LEAD_SENTENCE_WINDOW = 125

function textHasLeadSentence(text: string, price: string | null, operationLabel: string): boolean {
  const window = text.slice(0, LEAD_SENTENCE_WINDOW).toLowerCase()
  const hasOperation = window.includes(operationLabel.toLowerCase())
  const hasPrice = price ? window.includes(price.toLowerCase()) : true
  return hasOperation && hasPrice
}

/**
 * Backstop determinístico: si `text` (venga de la IA o de un template) NO
 * trae ya la operación + el precio dentro de los primeros ~125 caracteres,
 * se los antepone. Nunca inventa un precio: si la propiedad no tiene
 * `asking_price` cargado, antepone SOLO la operación. Idempotente — si el
 * texto ya cumple, lo devuelve sin tocar (evita duplicar la frase cuando se
 * aplica más de una vez en la cadena de fallbacks).
 */
export function ensureLeadSentence(text: string, property: Property): string {
  const operationLabel = operationLabelFor(property.operation_type)
  const price = formatPriceForCopy(property)
  if (textHasLeadSentence(text, price, operationLabel)) return text
  return `${leadPhrase(operationLabel, price)}. ${text}`
}

/**
 * Templates determinísticos para los 10 ángulos emocionales. Se usan cuando:
 *  - No hay AI configurada (sin DEEPSEEK/OPENAI key)
 *  - La AI falló (timeout, JSON inválido)
 *  - La AI devolvió < 10 variants y necesitamos completar
 *
 * No son tan buenos como copy de AI pero garantizan variedad creativa. Cada
 * primary text ARRANCA con operación+precio integrados a la primera frase
 * (requisito duro, ver docstring del módulo) — `generateAdCopyVariations`
 * igual pasa todo por `ensureLeadSentence` al final, así que si algún día se
 * agrega un ángulo nuevo acá y se olvida el lead, el backstop lo corrige.
 */
export function buildTenEmotionalTemplates(property: Property): AdCopyVariations {
  const barrio = property.neighborhood
  const rooms = property.rooms ? `${property.rooms} amb` : 'la propiedad'
  const roomsLabel = property.rooms
    ? `${property.rooms} ambiente${property.rooms === 1 ? '' : 's'}`
    : normalizePropertyTypeLabel(property.property_type).toLowerCase()
  const operationLabel = operationLabelFor(property.operation_type)
  const price = formatPriceForCopy(property)
  const lead = leadPhrase(operationLabel, price)

  // Cada par (primary, headline) corresponde a un ángulo emocional. El
  // primary SIEMPRE arranca con `lead` (operación[+precio]) conectado a la
  // emoción del ángulo en la misma primera oración — nunca como etiqueta
  // aparte al principio.
  const angles: Array<{ primary: string; headline: string }> = [
    {
      // Refugio
      primary: `${lead}, este ${roomsLabel} en ${barrio} es el refugio de las mañanas en las que el ruido se queda afuera.`,
      headline: `Tu refugio en ${barrio}`.slice(0, 40),
    },
    {
      // Status silencioso
      primary: `${lead}, este ${roomsLabel} en ${barrio} es vivir donde otros quisieran, sin necesidad de decirlo.`,
      headline: `Vivir en ${barrio}`.slice(0, 40),
    },
    {
      // Inversión
      primary: `${lead}: este ${roomsLabel} en ${barrio} es la clase de decisión que crece en silencio, para quien piensa a 5 años.`,
      headline: `Inversión inteligente en ${barrio}`.slice(0, 40),
    },
    {
      // Familia
      primary: `${lead}, este ${roomsLabel} en ${barrio} es el espacio donde van a crecer las próximas cenas, los próximos cumpleaños, los próximos sábados.`,
      headline: `Tu casa de familia en ${barrio}`.slice(0, 40),
    },
    {
      // Libertad / aire
      primary: `${lead}, este ${roomsLabel} en ${barrio} te da el aire que hoy te falta: luz, balcón y la calma del barrio.`,
      headline: `Aire propio en ${barrio}`.slice(0, 40),
    },
    {
      // Aspiracional
      primary: `${lead}: el día que abrís las llaves de tu propia casa empieza acá, en este ${roomsLabel} de ${barrio}.`,
      headline: `Empieza otra historia`.slice(0, 40),
    },
    {
      // Ritual
      primary: `${lead}, este ${roomsLabel} en ${barrio} tiene el balcón, el mate y la luz de las 6 de la tarde que se repiten cada día.`,
      headline: `Acá empieza otra rutina`.slice(0, 40),
    },
    {
      // Comunidad / barrio
      primary: `${lead}, en ${barrio}: el barrio que elegís cada vez que volvés, con sus cafés, sus plazas, sus vecinos.`,
      headline: `El barrio que elegís`.slice(0, 40),
    },
    {
      // Pertenencia / identidad
      primary: `${lead}: este ${roomsLabel} en ${barrio} no aparece todos los meses. Para quien sabe lo que busca.`,
      headline: `Para quien sabe buscar`.slice(0, 40),
    },
    {
      // Decisión inteligente
      primary: `${lead}. Los compradores que miran muchas propiedades terminan en este ${roomsLabel} de ${barrio}. ¿Querés saber por qué?`,
      headline: `Lo miraste todo. Vení a esta`.slice(0, 40),
    },
  ]

  const descriptionPrice = price ? ` · ${price}` : ''
  return {
    primaryTexts: angles.map(a => a.primary),
    headlines: angles.map(a => a.headline),
    description: `${rooms} · ${barrio}${descriptionPrice}`.slice(0, 100),
    source: 'template',
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
