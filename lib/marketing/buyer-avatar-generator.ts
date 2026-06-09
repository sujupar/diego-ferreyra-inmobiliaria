/**
 * Generador de 3 avatares de comprador con Gemini.
 *
 * A diferencia del `buyer-persona-generator` que es heurístico determinístico
 * (un solo perfil), este genera **3 avatares distintos** usando Gemini Text
 * para que el asesor elija el que mejor le encaja a la propiedad.
 *
 * Cada avatar tiene una descripción práctica (no técnica) + cue visual para
 * el render del UI.
 *
 * Funciona en conjunto con `analyzePropertyPhotos` (Vision): primero el vision
 * detecta features/strengths, este toma esos inputs y genera los avatares.
 */
import type { Property } from '@/lib/portals/types'
import type { PropertyVisionAnalysis } from './property-vision-analyzer'

export interface BuyerAvatar {
  id: string // "avatar_0", "avatar_1", "avatar_2"
  shortLabel: string // "Joven profesional buscando primera vivienda"
  ageRange: string // "30-38 años"
  occupation: string // "Profesional liberal, trabaja híbrido"
  lifeMoment: string // "Mudándose de zona o subiendo de categoría"
  motivation: string // ¿Por qué compraría ESTA propiedad?
  concerns: string[] // Cosas que le preocuparían y necesita resolverse en el copy
  communicationTone:
    | 'aspiracional'
    | 'práctico'
    | 'familiar'
    | 'urgente'
    | 'sofisticado'
    | 'cálido'
  visualCue: 'persona_joven' | 'pareja_joven' | 'familia' | 'profesional_solo' | 'pareja_senior' | 'inversor'
  hooks: string[] // 3 ángulos de copy que resonarían
  reasoning: string // Por qué este avatar para esta propiedad
}

const SYSTEM_PROMPT = `Sos un director estratégico de campañas de Meta Ads para una inmobiliaria boutique argentina (Diego Ferreyra Inmobiliaria, segmento medio-alto y premium en CABA + GBA Norte).

Tu trabajo: a partir del brief de UNA propiedad concreta, proponé **EXACTAMENTE 3 avatares de comprador** distintos que podrían interesarse en ella. Cada avatar debe ser:

- **Práctico, no técnico**: nada de jerga marketing como "DINK upper-middle income". Sí: "Pareja joven sin hijos, dos profesionales, mudándose de un alquiler".
- **Diferenciado**: los 3 avatares NO pueden ser variaciones del mismo perfil. Por ejemplo: (1) joven profesional, (2) familia consolidada, (3) inversor — esos son 3 ángulos REALES distintos.
- **Anclado a la propiedad concreta**: si la propiedad tiene jardín, alguno de los avatares debe valorar ese feature. Si está en un edificio premium con pileta, otro avatar debe valorar el edificio.
- **Con tono comunicacional definido**: cada avatar viene con una "voz" distinta para que el copy de los ads pueda hablarle de modo diferente.

Output: JSON estricto con esta forma:

\`\`\`json
{
  "avatars": [
    {
      "id": "avatar_0",
      "shortLabel": "Etiqueta corta de ≤60 chars (humana, no técnica)",
      "ageRange": "ej. 32-42 años",
      "occupation": "Descripción concreta de la ocupación",
      "lifeMoment": "En qué momento de vida está (mudándose, primer hijo, divorciado, inversor experimentado, etc.)",
      "motivation": "¿Por qué COMPRARÍA esta propiedad? Una oración concreta.",
      "concerns": ["preocupación 1", "preocupación 2"],
      "communicationTone": "uno de: aspiracional | práctico | familiar | urgente | sofisticado | cálido",
      "visualCue": "uno de: persona_joven | pareja_joven | familia | profesional_solo | pareja_senior | inversor",
      "hooks": ["ángulo 1", "ángulo 2", "ángulo 3"],
      "reasoning": "1-2 oraciones: por qué este avatar para ESTA propiedad concreta"
    },
    ... (3 avatares en total)
  ]
}
\`\`\`

REGLAS DE ORO:
- Variá el tono comunicacional entre los 3 avatares (uno aspiracional, otro práctico, otro cálido — por ejemplo).
- Variá el visualCue entre los 3 (no todos "familia").
- Anclá cada avatar a uno de los strengths detectados de la propiedad.
- "concerns" debe ser CONCRETO: cosas que realmente preocupan a esa persona (ej. "Si va a estar cerca del trabajo", "Cuánto suben las expensas", "Si el barrio es seguro").
- "hooks" son ángulos de copy reales, no clichés.
- NO uses: "oportunidad única", "una joya", "imperdible", "premium", "exclusivo".
- Tono español rioplatense.
- Output: SOLO el JSON. Sin markdown ni texto antes/después.`

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

function buildUserBrief(
  property: Property,
  vision: PropertyVisionAnalysis | null,
): string {
  const amenities = Array.isArray(property.amenities)
    ? (property.amenities as string[])
    : []
  const lines = [
    `# Propiedad`,
    `Tipo: ${property.property_type}`,
    `Operación: ${property.operation_type ?? 'venta'}`,
    `Barrio: ${property.neighborhood}, ${property.city}`,
    `Dirección: ${property.address}`,
    `Precio: ${property.asking_price} ${property.currency}`,
    property.expensas ? `Expensas: ARS ${property.expensas}` : null,
    property.rooms ? `Ambientes: ${property.rooms}` : null,
    property.bedrooms ? `Dormitorios: ${property.bedrooms}` : null,
    property.bathrooms ? `Baños: ${property.bathrooms}` : null,
    property.covered_area ? `Cubierta: ${property.covered_area} m²` : null,
    property.floor != null ? `Piso: ${property.floor}` : null,
    property.age != null ? `Antigüedad: ${property.age} años` : null,
    amenities.length > 0 ? `Amenities: ${amenities.join(', ')}` : null,
    property.description
      ? `\nDescripción comercial:\n${property.description.slice(0, 800)}`
      : null,
  ]
  if (vision) {
    lines.push(``)
    lines.push(`# Análisis Gemini Vision`)
    lines.push(`Ambience global: ${vision.ambience}`)
    lines.push(`Resumen: ${vision.summary}`)
    if (vision.highlights.length > 0) {
      lines.push(`\nHighlights detectados (en orden de impacto):`)
      vision.highlights.slice(0, 5).forEach((h, i) => {
        lines.push(`  ${i + 1}. ${h.label}${h.impactScore != null ? ` (impacto ${h.impactScore})` : ''}`)
        if (h.reasoning) lines.push(`     razón: ${h.reasoning}`)
      })
    }
    if (vision.detectedFeatures.length > 0) {
      lines.push(`\nFeatures visibles: ${vision.detectedFeatures.join(', ')}`)
    }
  }
  lines.push(``)
  lines.push(`# Tarea`)
  lines.push(`Generá EXACTAMENTE 3 avatares de comprador distintos para esta propiedad concreta. Devolvé solo el JSON especificado.`)
  return lines.filter(l => l !== null).join('\n')
}

/**
 * Fallback determinístico cuando Gemini no está disponible o falla.
 * Genera 3 avatares plausibles para inmobiliaria CABA basados en metadata
 * de la propiedad (precio + barrio + ambientes). No reemplazan a Gemini
 * pero al menos el wizard puede continuar.
 */
function buildFallbackAvatars(property: Property): BuyerAvatar[] {
  const barrio = property.neighborhood
  const rooms = property.rooms ?? 3
  const priceUsd = property.currency === 'USD' ? property.asking_price : property.asking_price / 1000
  const tier = priceUsd > 400_000 ? 'premium' : priceUsd > 200_000 ? 'alto' : 'medio'

  return [
    {
      id: 'avatar_0',
      shortLabel:
        rooms <= 2
          ? `Profesional joven en ${barrio}`
          : `Familia chica buscando crecer en ${barrio}`,
      ageRange: rooms <= 2 ? '28-38 años' : '32-42 años',
      occupation:
        rooms <= 2
          ? 'Profesional independiente o empleado con buen salario, trabajo híbrido'
          : 'Pareja de profesionales con un hijo o planeando familia',
      lifeMoment:
        rooms <= 2
          ? 'Saliendo del alquiler, comprando su primera propiedad'
          : 'Necesita más espacio, mudándose desde un dos ambientes',
      motivation:
        rooms <= 2
          ? `Quiere dejar de tirar el alquiler y empezar a construir patrimonio en ${barrio}`
          : `Busca el espacio para que la familia se desarrolle, en un barrio con buenos colegios y servicios`,
      concerns: [
        'Cuánto suben las expensas',
        'Cuánto tarda en valorizarse',
        rooms <= 2 ? 'Si el lugar tiene buena reventa' : 'Si el barrio es seguro para chicos',
      ],
      communicationTone: rooms <= 2 ? 'práctico' : 'familiar',
      visualCue: rooms <= 2 ? 'pareja_joven' : 'familia',
      hooks: [
        `Vivir en ${barrio}`,
        rooms <= 2 ? 'Patrimonio que crece' : 'Espacio para crecer',
        'Cerca de todo',
      ],
      reasoning: `Perfil generado sin IA (fallback). ${rooms} ambientes en ${barrio} tier ${tier} sugiere ${rooms <= 2 ? 'profesional joven o pareja sin hijos' : 'familia chica'}.`,
    },
    {
      id: 'avatar_1',
      shortLabel:
        tier === 'premium'
          ? `Comprador establecido buscando upgrade en ${barrio}`
          : `Inversor que conoce ${barrio}`,
      ageRange: tier === 'premium' ? '45-58 años' : '38-52 años',
      occupation:
        tier === 'premium'
          ? 'Empresario o profesional senior con cartera diversificada'
          : 'Profesional con experiencia comprando para alquilar o reventa',
      lifeMoment:
        tier === 'premium'
          ? 'Buscando una propiedad para mudarse o para uso ocasional'
          : 'Buscando dónde colocar excedente con buena renta',
      motivation:
        tier === 'premium'
          ? `Una propiedad en ${barrio} que mejore su calidad de vida o esté lista para mudar la familia mayor`
          : `Ubicación con potencial de revalorización a 5-10 años en una zona con demanda firme`,
      concerns: [
        'Estado real de la propiedad y mantenimiento',
        'Liquidez del barrio para reventa',
        tier === 'premium' ? 'Detalles de terminaciones y vista' : 'Renta esperada vs. tasa',
      ],
      communicationTone: tier === 'premium' ? 'sofisticado' : 'práctico',
      visualCue: tier === 'premium' ? 'pareja_senior' : 'inversor',
      hooks: [`Inversión en ${barrio}`, 'Revalorización a largo plazo', 'Demanda firme'],
      reasoning: `Perfil generado sin IA (fallback). Tier ${tier} en ${barrio} con ${rooms} amb apunta a ${tier === 'premium' ? 'comprador maduro' : 'inversor experimentado'}.`,
    },
    {
      id: 'avatar_2',
      shortLabel: `Quien valora la ubicación y los detalles`,
      ageRange: '35-50 años',
      occupation: 'Profesional con criterio, ha mirado muchas propiedades',
      lifeMoment: 'Busca la propiedad correcta, no la primera que aparece',
      motivation: `Encontró este aviso después de buscar mucho y reconoce el valor de la ubicación en ${barrio}, los amenities y el estado de la propiedad`,
      concerns: [
        'Que la propiedad sea realmente como la publican',
        'Cuán negociable está el precio',
        'Estado de la documentación y plazos',
      ],
      communicationTone: 'sofisticado',
      visualCue: 'profesional_solo',
      hooks: ['Para quien sabe buscar', 'Lo miraste todo. Vení a verla', 'Atención al detalle'],
      reasoning:
        'Perfil generado sin IA (fallback). Ángulo "decisión inteligente" — apela al comprador analítico que valora encontrar la propiedad correcta.',
    },
  ]
}

export async function generateThreeAvatars(input: {
  property: Property
  vision?: PropertyVisionAnalysis | null
}): Promise<BuyerAvatar[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[buyer-avatars] sin GEMINI_API_KEY — usando fallback determinístico')
    return buildFallbackAvatars(input.property)
  }

  const brief = buildUserBrief(input.property, input.vision ?? null)
  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25_000)

  try {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: brief }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 3000,
      },
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300)
      console.warn(`[buyer-avatars] Gemini ${res.status} — usando fallback. Body:`, errText)
      return buildFallbackAvatars(input.property)
    }
    const data = (await res.json()) as GeminiTextResponse
    const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
    if (!text) {
      console.warn('[buyer-avatars] respuesta sin texto — usando fallback. Data:', JSON.stringify(data).slice(0, 300))
      return buildFallbackAvatars(input.property)
    }
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    let parsed: { avatars?: BuyerAvatar[] }
    try {
      parsed = JSON.parse(cleaned) as { avatars?: BuyerAvatar[] }
    } catch (parseErr) {
      console.warn('[buyer-avatars] JSON parse falló — usando fallback. Snippet:', cleaned.slice(0, 200), parseErr)
      return buildFallbackAvatars(input.property)
    }
    if (!Array.isArray(parsed.avatars) || parsed.avatars.length === 0) {
      console.warn('[buyer-avatars] JSON shape inválido — usando fallback. Got:', JSON.stringify(parsed).slice(0, 200))
      return buildFallbackAvatars(input.property)
    }
    return parsed.avatars.slice(0, 3).map((a, i) => ({
      id: a.id || `avatar_${i}`,
      shortLabel: String(a.shortLabel ?? '').slice(0, 120),
      ageRange: String(a.ageRange ?? ''),
      occupation: String(a.occupation ?? ''),
      lifeMoment: String(a.lifeMoment ?? ''),
      motivation: String(a.motivation ?? ''),
      concerns: Array.isArray(a.concerns) ? a.concerns.slice(0, 5).map(String) : [],
      communicationTone:
        (['aspiracional', 'práctico', 'familiar', 'urgente', 'sofisticado', 'cálido'] as const).find(
          t => t === a.communicationTone,
        ) ?? 'cálido',
      visualCue:
        (['persona_joven', 'pareja_joven', 'familia', 'profesional_solo', 'pareja_senior', 'inversor'] as const).find(
          v => v === a.visualCue,
        ) ?? 'profesional_solo',
      hooks: Array.isArray(a.hooks) ? a.hooks.slice(0, 4).map(String) : [],
      reasoning: String(a.reasoning ?? '').slice(0, 300),
    }))
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[buyer-avatars] timeout (>25s) — usando fallback')
    } else {
      console.warn('[buyer-avatars] error — usando fallback:', err)
    }
    return buildFallbackAvatars(input.property)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Optimiza un avatar tomando en cuenta un comentario del asesor.
 * NO reemplaza el avatar — lo complementa con la observación.
 *
 * Ejemplo: avatar "Joven profesional 30-38, busca primera vivienda" + comentario
 * "Generalmente este perfil ya viene mudándose con su pareja" → ajusta el avatar
 * para incorporar pareja sin perder la esencia.
 */
export async function optimizeAvatarWithComment(input: {
  avatar: BuyerAvatar
  comment: string
  property: Property
}): Promise<BuyerAvatar | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const systemPrompt = `Tu tarea es OPTIMIZAR un avatar de comprador inmobiliario integrando un comentario del asesor. NO reemplaces el avatar — complementarlo respetando su esencia.

Si el comentario es contradictorio con la esencia del avatar (ej. comentario "es un inversor" sobre avatar de "familia con hijos"), devolvé el avatar sin cambios y agregá un campo "warning" explicando.

Output: JSON con el avatar optimizado en la MISMA estructura que recibís (id, shortLabel, ageRange, occupation, lifeMoment, motivation, concerns, communicationTone, visualCue, hooks, reasoning). Sin markdown.`

  const userMsg = [
    `# Avatar actual`,
    JSON.stringify(input.avatar, null, 2),
    ``,
    `# Comentario del asesor`,
    input.comment,
    ``,
    `# Propiedad (referencia)`,
    `${input.property.address} — ${input.property.rooms} amb · ${input.property.neighborhood} · ${input.property.asking_price} ${input.property.currency}`,
    ``,
    `Devolvé el avatar optimizado.`,
  ].join('\n')

  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxOutputTokens: 1500,
          },
        }),
      },
    )
    if (!res.ok) {
      console.warn('[buyer-avatars optimize] error', res.status)
      return null
    }
    const data = (await res.json()) as GeminiTextResponse
    const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
    if (!text) return null
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as Partial<BuyerAvatar>
    // Shape validation — Gemini puede devolver partial JSON bajo rate limit.
    // Sin esto el optimized_avatar quedaría malformado en la DB.
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.shortLabel !== 'string' ||
      typeof parsed.motivation !== 'string'
    ) {
      console.warn('[buyer-avatars optimize] shape inválido', JSON.stringify(parsed).slice(0, 200))
      return null
    }
    return {
      id: String(parsed.id),
      shortLabel: String(parsed.shortLabel).slice(0, 120),
      ageRange: String(parsed.ageRange ?? input.avatar.ageRange),
      occupation: String(parsed.occupation ?? input.avatar.occupation),
      lifeMoment: String(parsed.lifeMoment ?? input.avatar.lifeMoment),
      motivation: String(parsed.motivation),
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 5).map(String) : input.avatar.concerns,
      communicationTone: (parsed.communicationTone as BuyerAvatar['communicationTone']) ?? input.avatar.communicationTone,
      visualCue: (parsed.visualCue as BuyerAvatar['visualCue']) ?? input.avatar.visualCue,
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 4).map(String) : input.avatar.hooks,
      reasoning: String(parsed.reasoning ?? input.avatar.reasoning).slice(0, 300),
    }
  } catch (err) {
    console.warn('[buyer-avatars optimize] exception:', err)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
