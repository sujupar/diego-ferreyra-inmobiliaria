/**
 * E1.4 — Generador de EmpathyAvatar (avatar con mapa de empatía).
 *
 * Usa el cliente agnóstico chatCompletion (DeepSeek por defecto, barato) con
 * jsonMode. Si el JSON no valida el esquema, reintenta UNA vez forzando
 * gpt-4.1 (OpenAI). Si todo falla, cae a un fallback determinístico (nunca
 * rompe el flujo de la landing).
 *
 * Insumos: propiedad + análisis de fotos (Vision) + descripción de portal
 * (bridge) + respuestas del asesor a las preguntas de co-creación.
 */
import { chatCompletion } from '@/lib/ai/chat-client'
import type { LandingProperty } from '@/lib/landing/registry'
import { type EmpathyAvatar, coerceEmpathyAvatar } from './empathy-avatar'
import { RIOPLATENSE_STYLE } from '@/lib/copy/rioplatense'

const SYSTEM = `Sos un estratega de marketing inmobiliario boutique en Argentina (Diego Ferreyra Inmobiliaria, CABA + GBA Norte, segmento medio-alto y premium). Tu tarea es construir avatares de comprador con MAPA DE EMPATÍA para la landing de una propiedad.

${RIOPLATENSE_STYLE}

Devolvés SIEMPRE JSON válido. Concreto, sin relleno. Cada avatar debe ser una persona real y distinta, coherente con la propiedad y las respuestas del asesor.

Nunca asumas financiación bancaria: hoy prácticamente no existe crédito hipotecario relevante en Argentina, así que ni las preocupaciones ni los comportamientos del avatar giran alrededor de "conseguir crédito".

Estructura de CADA avatar:
{
  "id": "a1",
  "shortLabel": "etiqueta corta y evocadora",
  "ageRange": "35-45 años",
  "occupation": "...",
  "lifeMoment": "el momento de vida que lo trae a esta compra",
  "motivation": "por qué compraría ESTA propiedad",
  "concerns": ["preocupaciones a resolver en el copy"],
  "communicationTone": "aspiracional|práctico|familiar|urgente|sofisticado|cálido",
  "visualCue": "persona_joven|pareja_joven|familia|profesional_solo|pareja_senior|inversor",
  "hooks": ["3 ángulos de copy que resonarían"],
  "reasoning": "por qué este avatar para esta propiedad",
  "empathyMap": {
    "says": ["qué dice en voz alta"],
    "thinks": ["qué piensa pero no dice"],
    "feels": ["qué siente: emociones, miedos, deseos"],
    "does": ["qué hace: comportamientos observables"]
  },
  "pains": ["dolores/frustraciones que trae al proceso"],
  "gains": ["ganancias deseadas"],
  "jobsToBeDone": ["qué trabajo quiere resolver comprando esto"],
  "objections": ["objeciones concretas a superar"],
  "preferredChannel": "WhatsApp|Instagram|llamada|email",
  "decisionTriggers": ["qué lo hace pasar de mirar a querer verla"]
}`

function propertyContext(property: LandingProperty, opts: {
  visionSummary?: string
  description?: string
  answers?: Record<string, string>
}): string {
  const parts: string[] = [
    `Propiedad: ${property.property_type} en ${property.neighborhood}, ${property.city}.`,
    `Precio: ${property.currency} ${property.asking_price?.toLocaleString('es-AR') ?? '—'}.`,
    `${property.rooms ?? '?'} ambientes, ${property.bedrooms ?? '?'} dorm, ${property.bathrooms ?? '?'} baños, ` +
      `${property.covered_area ?? '?'}m² cubiertos.`,
    property.amenities && Array.isArray(property.amenities) && property.amenities.length
      ? `Amenities: ${(property.amenities as string[]).join(', ')}.` : '',
  ]
  if (opts.visionSummary) parts.push(`Análisis de fotos: ${opts.visionSummary}`)
  if (opts.description) parts.push(`Descripción: ${opts.description.slice(0, 600)}`)
  if (opts.answers && Object.keys(opts.answers).length) {
    parts.push('Respuestas del asesor: ' + Object.entries(opts.answers).map(([q, a]) => `${q} → ${a}`).join(' | '))
  }
  return parts.filter(Boolean).join('\n')
}

async function askForAvatars(
  userPrompt: string,
  count: number,
  model?: string,
  provider?: 'openai',
): Promise<unknown[]> {
  const res = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${userPrompt}\n\nDevolvé un JSON: { "avatars": [ ...${count} avatares... ] }` },
    ],
    temperature: 0.8,
    jsonMode: true,
    model,
    // Sin `provider`, un modelo de OpenAI viajaba al endpoint de DeepSeek y el
    // reintento fallaba SIEMPRE en silencio (caía al fallback determinístico sin
    // que nadie lo notara). Es el mismo bug que ya se había arreglado en
    // `lib/landing/conversion-copy.ts` y acá quedó sin arreglar.
    provider,
  })
  const parsed = JSON.parse(res.content) as { avatars?: unknown[] }
  return Array.isArray(parsed.avatars) ? parsed.avatars : []
}

/** Genera N EmpathyAvatars. DeepSeek → (si falla el esquema) gpt-4.1 → fallback. */
export async function generateEmpathyAvatars(input: {
  property: LandingProperty
  count?: number
  visionSummary?: string
  description?: string
  answers?: Record<string, string>
}): Promise<{ avatars: EmpathyAvatar[]; source: 'ai' | 'ai-retry' | 'fallback'; model?: string }> {
  const count = input.count ?? 3
  const userPrompt = propertyContext(input.property, input)

  // Intento 1: proveedor default (DeepSeek barato).
  try {
    const raw = await askForAvatars(userPrompt, count)
    const avatars = raw.map((r, i) => coerceEmpathyAvatar(r, `a${i + 1}`)).filter((a): a is EmpathyAvatar => a !== null)
    if (avatars.length >= 1) return { avatars: avatars.slice(0, count), source: 'ai' }
  } catch { /* cae al retry */ }

  // Intento 2: forzar gpt-4.1 (mejor adherencia al esquema).
  try {
    const raw = await askForAvatars(userPrompt, count, 'gpt-4.1', 'openai')
    const avatars = raw.map((r, i) => coerceEmpathyAvatar(r, `a${i + 1}`)).filter((a): a is EmpathyAvatar => a !== null)
    if (avatars.length >= 1) return { avatars: avatars.slice(0, count), source: 'ai-retry', model: 'gpt-4.1' }
  } catch { /* cae al fallback */ }

  return { avatars: buildFallbackEmpathyAvatars(input.property, count), source: 'fallback' }
}

/** Refina un avatar con un comentario del asesor. Preserva el mapa de empatía. */
export async function refineEmpathyAvatar(input: {
  avatar: EmpathyAvatar
  comment: string
  property: LandingProperty
}): Promise<EmpathyAvatar> {
  try {
    const res = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content:
          `Avatar actual:\n${JSON.stringify(input.avatar)}\n\n` +
          `Comentario del asesor para ajustarlo: "${input.comment}"\n\n` +
          `Devolvé el avatar AJUSTADO como JSON: { "avatar": { ... } }` },
      ],
      temperature: 0.6,
      jsonMode: true,
    })
    const parsed = JSON.parse(res.content) as { avatar?: unknown }
    const coerced = coerceEmpathyAvatar(parsed.avatar, input.avatar.id)
    if (coerced) return { ...coerced, id: input.avatar.id }
  } catch { /* devuelve el original */ }
  return input.avatar
}

/** Fallback determinístico: 1-3 avatares genéricos coherentes con la propiedad. */
export function buildFallbackEmpathyAvatars(property: LandingProperty, count = 3): EmpathyAvatar[] {
  const zona = property.neighborhood ?? 'la zona'
  const base: EmpathyAvatar[] = [
    {
      id: 'a1', shortLabel: `Familia que busca crecer en ${zona}`,
      ageRange: '35-48 años', occupation: 'Profesionales con hijos', lifeMoment: 'Necesitan más espacio',
      motivation: 'Un hogar definitivo en un buen barrio', concerns: ['Presupuesto', 'Colegios cerca', 'Seguridad'],
      communicationTone: 'familiar', visualCue: 'familia',
      hooks: ['El lugar donde crecerán tus hijos', 'Espacio y luz para toda la familia', 'Un barrio para quedarse'],
      reasoning: 'Propiedad amplia en zona residencial',
      empathyMap: {
        says: ['Queremos algo definitivo', 'Que esté cerca del colegio'],
        thinks: ['¿Nos alcanza?', '¿Es seguro el barrio?'],
        feels: ['Ilusión', 'Ansiedad por decidir bien'],
        does: ['Compara varias propiedades', 'Consulta a la familia'],
      },
      pains: ['Poco espacio actual', 'Miedo a equivocarse en la compra'],
      gains: ['Tranquilidad', 'Un hogar propio y estable'],
      jobsToBeDone: ['Encontrar un hogar seguro y amplio para la familia'],
      objections: ['¿Es el precio justo?', '¿Conviene la zona?'],
      preferredChannel: 'WhatsApp',
      decisionTriggers: ['Ver la propiedad en persona', 'Confianza en el asesor'],
    },
    {
      id: 'a2', shortLabel: `Inversor buscando renta en ${zona}`,
      ageRange: '40-60 años', occupation: 'Inversor / ahorrista', lifeMoment: 'Busca resguardar capital',
      motivation: 'Renta y revalorización', concerns: ['Rentabilidad', 'Liquidez', 'Estado de la propiedad'],
      communicationTone: 'práctico', visualCue: 'inversor',
      hooks: ['Una inversión que se revaloriza', 'Renta segura en zona demandada', 'Resguardá tu capital en ladrillos'],
      reasoning: 'Zona con demanda de alquiler',
      empathyMap: {
        says: ['¿Cuánto rinde?', 'Quiero algo seguro'],
        thinks: ['¿Se alquila rápido?', '¿Se revaloriza?'],
        feels: ['Cautela', 'Búsqueda de certeza'],
        does: ['Calcula números', 'Compara vs otras inversiones'],
      },
      pains: ['Incertidumbre económica', 'Miedo a un mal negocio'],
      gains: ['Renta estable', 'Patrimonio protegido'],
      jobsToBeDone: ['Colocar capital en un activo seguro y rentable'],
      objections: ['¿La rentabilidad justifica el precio?'],
      preferredChannel: 'llamada',
      decisionTriggers: ['Números claros de renta', 'Buen estado del inmueble'],
    },
    {
      id: 'a3', shortLabel: `Primera vivienda en ${zona}`,
      ageRange: '28-38 años', occupation: 'Joven profesional', lifeMoment: 'Deja el alquiler',
      motivation: 'Dejar de alquilar y ser propietario', concerns: ['Gastos de escritura', 'Gastos', 'Ubicación'],
      communicationTone: 'aspiracional', visualCue: 'pareja_joven',
      hooks: ['Dejá de alquilar, empezá a construir tu patrimonio', 'Tu primer hogar propio', 'El primer paso es el más importante'],
      reasoning: 'Tipología accesible para primera compra',
      empathyMap: {
        says: ['Estoy cansado de alquilar', '¿Puedo pagarlo?'],
        thinks: ['¿Es el momento?', '¿Y si sube el dólar?'],
        feels: ['Entusiasmo', 'Miedo al compromiso grande'],
        does: ['Compara precios por m²', 'Visita en fin de semana'],
      },
      pains: ['Alquiler que sube', 'No tener algo propio'],
      gains: ['Estabilidad', 'Orgullo de ser propietario'],
      jobsToBeDone: ['Dar el paso a la primera vivienda propia'],
      objections: ['¿Me conviene ahora?', '¿Me alcanza?'],
      preferredChannel: 'Instagram',
      decisionTriggers: ['Sentir que es alcanzable', 'Acompañamiento en el proceso'],
    },
  ]
  return base.slice(0, count)
}
