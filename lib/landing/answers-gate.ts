/**
 * Gate de publicación (decisión del usuario, 2026-08-06): la landing NO se
 * publica sin responder las preguntas de co-creación — las respuestas son lo
 * que hace que el copy no sea genérico. Compartido por la UI (deshabilita el
 * botón) y por `publishLanding` (rechaza en el server) para que el asesor vea
 * EXACTAMENTE el mismo mensaje en los dos lados.
 *
 * Compat: una landing sin preguntas (legacy, o con el enrich caído) no se
 * bloquea — el gate aplica solo cuando hay preguntas que responder.
 */
export const GATE_RESPUESTAS_MSG =
  'Antes de publicar, respondé todas las preguntas y generá los textos con tus respuestas. ' +
  'Son las respuestas las que hacen que la landing no sea genérica.'

export function faltanRespuestas(ws: {
  questions?: { id: string }[]
  answers?: Record<string, string>
}): string[] {
  const questions = ws.questions ?? []
  if (questions.length === 0) return []
  const answers = ws.answers ?? {}
  return questions.filter(q => !(answers[q.id] ?? '').trim()).map(q => q.id)
}
