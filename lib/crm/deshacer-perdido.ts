// Deshacer un "perdido" recién marcado (design.md D2 y D9). Puro.
// No distingue por dónde se descartó: "Descartar" en `/pipeline/<id>` deja la misma fila
// en el historial, y la spec pide que también se pueda deshacer.

export const MINUTOS_PARA_DESHACER = 10
export const MENSAJE_NO_SE_PUEDE_DESHACER =
  'Ya no se puede deshacer: pasaron más de 10 minutos o el proceso cambió de etapa.'
const MARGEN_LOST_AT_MS = 60_000

export function puedeDeshacerPerdido(
  deal: { stage: string; lost_at: string | null },
  ultimoCambio: { from_stage: string | null; to_stage: string; changed_at: string } | null,
  ahora: Date,
): { ok: true; volverA: string; limpiarLostAt: boolean } | { ok: false; motivo: string } {
  // Ya no está descartado, o después de descartarlo cambió de etapa: el historial lo dice.
  if (deal.stage !== 'lost' || !ultimoCambio || ultimoCambio.to_stage !== 'lost') {
    return { ok: false, motivo: MENSAJE_NO_SE_PUEDE_DESHACER }
  }
  if (!ultimoCambio.from_stage) {
    return { ok: false, motivo: 'No se sabe en qué etapa estaba el proceso: cambialo desde su pantalla.' }
  }
  const cambio = Date.parse(ultimoCambio.changed_at)
  if (Number.isNaN(cambio) || ahora.getTime() - cambio > MINUTOS_PARA_DESHACER * 60_000) {
    return { ok: false, motivo: MENSAJE_NO_SE_PUEDE_DESHACER }
  }
  // Un `lost_at` de otra vez (más viejo) es historia de un descarte anterior: no se toca.
  const lostAt = deal.lost_at ? Date.parse(deal.lost_at) : NaN
  const limpiarLostAt = !Number.isNaN(lostAt) && Math.abs(lostAt - cambio) <= MARGEN_LOST_AT_MS
  return { ok: true, volverA: ultimoCambio.from_stage, limpiarLostAt }
}
