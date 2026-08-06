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

/* ─────────────────── Estado de resultados del embudo ─────────────────────── */

/** Una etapa tal como la devuelve `get_funnel_statement`. */
export interface StatementStage {
  etapa: string
  orden: number
  cantidad: number
  mediana_dias: number | null
}

/** Una línea del estado de resultados, ya lista para mostrar. */
export interface StatementLine {
  etapa: string
  label: string
  cantidad: number
  /** Inversión total dividida por los que llegaron hasta acá. */
  costoUnitario: number | null
  /** % que pasó desde la etapa anterior. null en la primera. */
  conversionPct: number | null
  /** Cuántos se quedaron en el camino desde la etapa anterior. */
  perdidos: number | null
  medianaDias: number | null
  /** El peor salto de conversión de toda la cascada. */
  esCuelloDeBotella: boolean
  /** Ancho de la barra, 0–100, relativo a la etapa más numerosa. */
  pctDelMaximo: number
}

/**
 * Arma el estado de resultados: cada línea con su volumen, su costo unitario,
 * cuánto convirtió desde la anterior y cuánto tardó.
 *
 * El costo unitario es la inversión TOTAL dividida por los que llegaron a esa
 * etapa — no un prorrateo. Es lo que cuesta, a la fecha, conseguir uno: si
 * invertí 3 millones y capté una sola propiedad, esa captación costó 3 millones.
 */
export function construirEstado(stages: StatementStage[], inversion: number): StatementLine[] {
  const ordenadas = [...stages].sort((a, b) => a.orden - b.orden)
  const maximo = Math.max(0, ...ordenadas.map(s => s.cantidad))

  const lineas: StatementLine[] = ordenadas.map((s, i) => {
    const previa = i > 0 ? ordenadas[i - 1] : null
    const conversionPct = previa && previa.cantidad > 0
      ? Math.round((s.cantidad / previa.cantidad) * 100)
      : null
    return {
      etapa: s.etapa,
      label: etiquetaEtapa(s.etapa),
      cantidad: s.cantidad,
      costoUnitario: s.cantidad > 0 && inversion > 0 ? Math.round(inversion / s.cantidad) : null,
      conversionPct,
      perdidos: previa ? previa.cantidad - s.cantidad : null,
      medianaDias: s.mediana_dias,
      esCuelloDeBotella: false,
      // La barra es proporcional al volumen: así el desplome se VE, no se lee.
      pctDelMaximo: maximo > 0 ? (s.cantidad / maximo) * 100 : 0,
    }
  })

  // El cuello de botella es el peor salto de conversión, no la etapa con menos
  // gente: al final del embudo siempre queda poca, y eso no es un problema.
  const conConversion = lineas.filter(l => l.conversionPct !== null)
  if (conConversion.length > 0) {
    const peor = conConversion.reduce((a, b) => (b.conversionPct! < a.conversionPct! ? b : a))
    peor.esCuelloDeBotella = true
  }

  return lineas
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
