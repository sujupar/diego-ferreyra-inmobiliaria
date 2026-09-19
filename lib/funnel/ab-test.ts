/**
 * Reparto A/B de las landings del embudo. Módulo PURO: no lee cookies, no toca
 * la red, no mira el reloj. Todo lo que necesita entra por parámetro para que la
 * página sea una cáscara fina y esta decisión se pueda testear entera. La única
 * fuente de azar es el dado por defecto de `variantePorClic` (`Math.random`), y es
 * inyectable justamente para que las pruebas no dependan de él.
 *
 * REGLA DE ORO: ante cualquier duda se sirve 'A' (la landing que ya está viva y
 * recibiendo tráfico pago). Un experimento roto NUNCA puede dejar sin página al
 * visitante ni mandarlo a una variante que el dueño no encendió.
 */

export type Variant = 'A' | 'B'
export type ExperimentStatus = 'off' | 'running' | 'paused'

export interface ExperimentConfig {
  status: ExperimentStatus
  /** Porcentaje del tráfico que ve la variante B. 0–100. */
  splitB: number
  /** Ganador declarado al apagar el test. Solo se usa con status 'off'. */
  winner: Variant | null
}

/** Lo que se sirve cuando no se pudo leer la configuración. */
export const FALLBACK: ExperimentConfig = { status: 'off', splitB: 0, winner: null }

/**
 * Reparto POR CLIC: cada apertura de la landing se sortea de nuevo. Es lo que usa
 * la página (`app/(funnels)/tasacion-directa/page.tsx`).
 *
 * DECISIÓN DEL DUEÑO (2026-09-19), reafirmada después de escuchar el reparo: quiere
 * que funcione como el split test de GoHighLevel, donde cada clic puede abrir una
 * versión distinta. Hasta ese día el reparto era POR VISITANTE (un número 0–999 en
 * la cookie `df_lp_roll`, 90 días): funcionaba 50/50, pero el dueño —que abría el
 * enlace siempre desde el mismo navegador— veía siempre la misma versión y concluyó
 * que todo el tráfico iba a la B.
 *
 * LO QUE SE CEDE, con números de ese día: el 17,6% de las personas entra más de una
 * vez y el 20% de las visitas son re-visitas. Esa gente puede ver una versión
 * distinta cada vez, y un registro se le anota a la versión donde llenó el
 * formulario aunque la que lo convenció haya sido la otra. La medición sigue siendo
 * honesta sobre lo que mide —visitas y registros POR PÁGINA SERVIDA— porque la
 * variante viaja fija en cada landing (`landingVariant` en el submit y en
 * `LandingVisitTracker`), no sale de ninguna cookie.
 *
 * Para volver al reparto por visitante: ver el commit que introdujo esta función.
 *
 * @param random  el dado, en [0,1). Inyectable para que el test sea determinístico.
 */
export function variantePorClic(
  config: ExperimentConfig | null | undefined,
  random: () => number = Math.random,
): Variant {
  return decideVariant(config, random())
}

/**
 * Decide qué variante servir.
 *
 * @param config  configuración del experimento
 * @param roll    número en [0,1). Se compara contra el split. Inyectado para
 *                que el test sea determinístico.
 * @param sticky  variante ya asignada a este visitante. HOY NADIE LA PASA: el
 *                reparto es por clic (ver `variantePorClic`). Se conserva porque
 *                es la pieza que haría falta para volver al reparto por visitante.
 */
export function decideVariant(
  config: ExperimentConfig | null | undefined,
  roll: number,
  sticky?: string | null,
): Variant {
  const cfg = normalizeConfig(config)

  // 'off' y 'paused' MANDAN sobre la cookie: si el dueño apagó o pausó el test,
  // nadie puede seguir viendo B por tener una cookie vieja. Sin esto, apagar el
  // experimento no lo apagaría de verdad para los que ya habían entrado.
  if (cfg.status === 'off') return cfg.winner ?? 'A'
  if (cfg.status === 'paused') return 'A'

  // 'running': la asignación previa manda, para que quien vuelve vea lo mismo.
  if (sticky === 'A' || sticky === 'B') return sticky

  // Sin asignación previa: se tira el dado. splitB=30 → 30% ve B.
  // OJO con el valor de respaldo: si el roll viene roto NO puede ser 0, porque 0
  // es el número que MÁS empuja hacia B (0 < cualquier split) — justo al revés
  // de la regla de oro. Se usa 1, que cae siempre en A salvo split > 100.
  const r = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 1
  return r * 100 < cfg.splitB ? 'B' : 'A'
}

/**
 * Sanea lo que venga de la base. Un `split_b` fuera de rango o un status
 * desconocido no pueden tumbar la landing: caen al fallback.
 */
export function normalizeConfig(config: ExperimentConfig | null | undefined): ExperimentConfig {
  if (!config) return FALLBACK
  const status: ExperimentStatus =
    config.status === 'running' || config.status === 'paused' || config.status === 'off'
      ? config.status
      : 'off'
  const raw = Number(config.splitB)
  const splitB = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 0), 100) : 0
  const winner = config.winner === 'A' || config.winner === 'B' ? config.winner : null
  return { status, splitB, winner }
}

/**
 * SIN USO desde que el reparto es por clic (nadie recuerda asignaciones). Se
 * conserva, igual que `sticky`, como pieza del reparto por visitante.
 *
 * ¿Hay que persistir la asignación en la cookie? Solo mientras el test corre:
 * con el test apagado la variante se deduce del ganador y guardar una cookie
 * dejaría a la gente clavada en una versión después de terminar el experimento.
 */
export function shouldPersist(config: ExperimentConfig | null | undefined, sticky?: string | null): boolean {
  const cfg = normalizeConfig(config)
  if (cfg.status !== 'running') return false
  return sticky !== 'A' && sticky !== 'B'
}

/**
 * Valida un cambio de configuración pedido desde el panel. Devuelve el error en
 * castellano o null si está bien.
 *
 * Recibe los valores CRUDOS (vienen de un JSON de la red) a propósito: si el
 * parámetro ya estuviera tipado, TypeScript daría por buenos justamente los
 * valores que esta función existe para rechazar.
 */
export function validateConfigChange(next: {
  status?: string
  splitB?: number
  winner?: string | null
}): string | null {
  if (next.status && !['off', 'running', 'paused'].includes(next.status)) {
    return 'Estado inválido.'
  }
  if (next.splitB !== undefined) {
    const n = Number(next.splitB)
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'El reparto tiene que estar entre 0 y 100.'
  }
  if (next.winner !== undefined && next.winner !== null && !['A', 'B'].includes(next.winner)) {
    return 'El ganador tiene que ser A o B.'
  }
  // Apagar el test es la única acción que exige decidir: sin ganador no se sabe
  // qué queda vivo. Para frenar sin decidir está 'paused'.
  if (next.status === 'off' && next.winner === undefined) {
    return 'Para apagar el test hay que elegir con cuál versión te quedás. Si todavía no querés decidir, usá "Pausar".'
  }
  return null
}
