/**
 * Helpers de presentación del tablero del embudo.
 *
 * Puros y testeados a propósito: Turbopack no arranca en esta carpeta (bug con
 * el acento de "Gestión" en el path), así que las funciones sin React son la
 * única verificación barata y confiable de esta lógica.
 */

export interface StageTiming {
  desde: string
  hasta: string
  n: number
  mediana_dias: number
  p75_dias: number
}

export interface FunnelCosts {
  inversion: number
  solicitudes: number
  tasaciones: number
  captaciones: number
  costo_solicitud: number | null
  costo_tasacion: number | null
  costo_captacion: number | null
  dias_con_dato: number
  dias_del_periodo: number
}

/** Debajo de esto, un promedio no sostiene una decisión de negocio. */
export const MUESTRA_MINIMA = 20

export function esMuestraChica(n: number): boolean {
  return n < MUESTRA_MINIMA
}

/** Cobertura de los datos de inversión del período. */
export function cobertura(c: Pick<FunnelCosts, 'dias_con_dato' | 'dias_del_periodo'>): {
  pct: number; confiable: boolean; texto: string
} {
  if (c.dias_del_periodo <= 0) {
    return { pct: 0, confiable: false, texto: 'Sin datos de inversión para este período.' }
  }
  const pct = Math.round((c.dias_con_dato / c.dias_del_periodo) * 100)
  if (c.dias_con_dato === 0) {
    return { pct: 0, confiable: false, texto: 'Sin datos de inversión para este período.' }
  }
  const confiable = pct >= 95
  return {
    pct,
    confiable,
    texto: confiable
      ? `Inversión cargada para los ${c.dias_del_periodo} días del período.`
      : `Ojo: hay inversión cargada para ${c.dias_con_dato} de ${c.dias_del_periodo} días (${pct}%). El costo real es mayor que el que se muestra.`,
  }
}

const ETAPAS: Record<string, string> = {
  clase_gratuita: 'Clase gratuita',
  request: 'Solicitud',
  scheduled: 'Coordinada',
  not_visited: 'Visita no realizada',
  visited: 'Visita realizada',
  appraisal_sent: 'Tasación entregada',
  followup: 'En seguimiento',
  captured: 'Captada',
  lost: 'Perdido',
  comprador: 'Comprador',
}

export function etiquetaEtapa(stage: string): string {
  return ETAPAS[stage] ?? stage
}

export function formatearDuracion(dias: number): string {
  if (dias < 1) return 'menos de un día'
  const redondeado = Math.round(dias)
  return `${redondeado} día${redondeado === 1 ? '' : 's'}`
}

/**
 * El paso más lento del embudo, nombrado en castellano.
 *
 * Las transiciones a `lost` se excluyen: perder un deal no es un paso del
 * embudo, y como suelen tardar mucho (se marcan tarde) se llevarían siempre el
 * primer puesto y taparían el cuello de botella real.
 */
export function cuelloDeBotella(timings: StageTiming[]): {
  masLento: StageTiming | null; texto: string
} {
  const pasos = timings.filter(t => t.hasta !== 'lost' && t.desde !== 'lost')
  if (pasos.length === 0) {
    return { masLento: null, texto: 'Sin datos suficientes para identificar el paso más lento.' }
  }
  const masLento = pasos.reduce((a, b) => (b.mediana_dias > a.mediana_dias ? b : a))
  const aviso = esMuestraChica(masLento.n) ? ` (sobre ${masLento.n} casos, muestra chica)` : ''
  return {
    masLento,
    texto: `El paso más lento es de ${etiquetaEtapa(masLento.desde)} a ${etiquetaEtapa(masLento.hasta)}: ${formatearDuracion(masLento.mediana_dias)}${aviso}.`,
  }
}
