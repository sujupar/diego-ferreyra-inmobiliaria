/**
 * E1.4 — Preguntas de co-creación.
 *
 * La IA lee la propiedad y le hace 3-5 preguntas AL ASESOR para afinar el perfil
 * del comprador y el mensaje de la landing (co-creación, no IA sola). jsonMode,
 * con fallback determinístico si la IA falla.
 */
import { chatCompletion } from '@/lib/ai/chat-client'
import type { LandingProperty } from '@/lib/landing/registry'
import { RIOPLATENSE_STYLE } from '@/lib/copy/rioplatense'

export interface CoCreationQuestion {
  id: string
  /** La pregunta en sí. */
  question: string
  /** Por qué la preguntamos (ayuda al asesor a responder bien). */
  hint?: string
}

const SYSTEM = `Sos un estratega de marketing inmobiliario en Argentina. Vas a hacerle 3 a 5 preguntas AL ASESOR sobre una propiedad, para afinar el perfil del comprador ideal y el mensaje de la landing. Preguntas concretas, fáciles de responder, que el asesor sepa contestar (conoce la propiedad y el barrio). Devolvés JSON.

${RIOPLATENSE_STYLE}`

export async function generateCoCreationQuestions(input: {
  property: LandingProperty
  visionSummary?: string
  description?: string
}): Promise<{ questions: CoCreationQuestion[]; source: 'ai' | 'fallback' }> {
  const ctx = [
    `Propiedad: ${input.property.property_type} en ${input.property.neighborhood}, ${input.property.city}.`,
    `${input.property.rooms ?? '?'} ambientes, ${input.property.currency} ${input.property.asking_price?.toLocaleString('es-AR') ?? '—'}.`,
    input.visionSummary ? `Fotos: ${input.visionSummary}` : '',
    input.description ? `Descripción: ${input.description.slice(0, 400)}` : '',
  ].filter(Boolean).join('\n')

  try {
    const res = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${ctx}\n\nDevolvé: { "questions": [ { "id": "q1", "question": "...", "hint": "..." }, ... 3 a 5 ] }` },
      ],
      temperature: 0.6,
      jsonMode: true,
    })
    const parsed = JSON.parse(res.content) as { questions?: unknown[] }
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map((q, i) => {
        const o = q as Record<string, unknown>
        const question = typeof o.question === 'string' ? o.question.trim() : ''
        if (!question) return null
        return {
          id: typeof o.id === 'string' && o.id ? o.id : `q${i + 1}`,
          question,
          hint: typeof o.hint === 'string' ? o.hint : undefined,
        } as CoCreationQuestion
      })
      .filter((q): q is CoCreationQuestion => q !== null)
      .slice(0, 5)
    if (questions.length >= 3) return { questions, source: 'ai' }
  } catch { /* fallback */ }

  return { questions: fallbackQuestions(input.property), source: 'fallback' }
}

/** Preguntas por defecto: sirven para cualquier propiedad. */
export function fallbackQuestions(property: LandingProperty): CoCreationQuestion[] {
  return [
    {
      id: 'q1',
      question: `¿Quién imaginás que es el comprador ideal de esta propiedad en ${property.neighborhood}?`,
      hint: 'Familia, inversor, pareja joven, primera vivienda, etc.',
    },
    {
      id: 'q2',
      question: '¿Cuál es el mayor atractivo o diferencial de esta propiedad?',
      hint: 'Lo que la hace destacar frente a otras similares.',
    },
    {
      id: 'q3',
      question: '¿Qué duda u objeción suele frenar a los interesados en propiedades como esta?',
      hint: 'Precio, ubicación, estado, expensas, etc.',
    },
    {
      id: 'q4',
      question: '¿Hay algo del barrio o del entorno que valga la pena destacar?',
      hint: 'Transporte, colegios, comercios, seguridad, verde.',
    },
  ]
}
