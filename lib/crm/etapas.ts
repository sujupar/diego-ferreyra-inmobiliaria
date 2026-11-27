// Una sola definición de las etapas del CRM (crm-cartera-por-rol, design.md D5). Puro.
// La cartera, la ficha y los contadores de `getDeals` escriben y clasifican las etapas con
// esto; si cada uno tuviera su `switch`, la ficha diría "No Realizada" y la lista "No
// realizada" de la misma persona (pasaba con `crm-stages.ts`).

export type EtapaCRM =
  | 'solicitud'
  | 'coordinada'
  | 'no_realizada'
  | 'realizada'
  | 'entregada'
  | 'seguimiento'
  | 'clase_gratuita'
  | 'comprador'
  | 'captada'
  | 'descartado'

/** Los textos de la plataforma (spec crm-cartera, "Nombres de etapa"). */
export const NOMBRE_ETAPA: Record<EtapaCRM, string> = {
  solicitud: 'Solicitud',
  coordinada: 'Coordinada',
  no_realizada: 'No realizada',
  realizada: 'Realizada',
  entregada: 'Entregada',
  seguimiento: 'Seguimiento',
  clase_gratuita: 'Clase gratuita',
  comprador: 'Comprador',
  captada: 'Captada',
  descartado: 'Descartado',
}

export const ETAPAS_EMBUDO: readonly EtapaCRM[] = [
  'solicitud',
  'coordinada',
  'no_realizada',
  'realizada',
  'entregada',
  'seguimiento',
]
export const ETAPAS_FUERA_DEL_EMBUDO: readonly EtapaCRM[] = ['clase_gratuita', 'comprador']
export const ETAPAS_CERRADAS_CARTERA: readonly EtapaCRM[] = ['captada', 'descartado']

/**
 * El mismo criterio que `deriveCRMStage`: `scheduled` sin día todavía es una Solicitud (53
 * procesos el 2026-11-26), y una etapa que no conocemos cae en Solicitud en vez de romper
 * la lista: preferimos mostrarla a esconder un proceso.
 */
export function etapaCRM(d: { stage: string; scheduled_date: string | null }): EtapaCRM {
  switch (d.stage) {
    case 'request':
      return 'solicitud'
    case 'scheduled':
      return d.scheduled_date ? 'coordinada' : 'solicitud'
    case 'not_visited':
      return 'no_realizada'
    case 'visited':
      return 'realizada'
    case 'appraisal_sent':
      return 'entregada'
    case 'followup':
      return 'seguimiento'
    case 'clase_gratuita':
      return 'clase_gratuita'
    case 'comprador':
      return 'comprador'
    case 'captured':
      return 'captada'
    case 'lost':
      return 'descartado'
    default:
      return 'solicitud'
  }
}

/**
 * Abierto = todo lo que no es Captada ni Descartado. Comprador ES abierto acá, aunque
 * `elegirDealActivo` (deal-activo.ts) lo trate como cerrado: allá la pregunta es "¿a qué
 * proceso le registro la llamada?" (la cadencia es de la tasación); acá es "¿sigue vivo
 * en la cartera?". Son dos preguntas distintas y no se deben unificar.
 */
export function estaAbierto(e: EtapaCRM): boolean {
  return !ETAPAS_CERRADAS_CARTERA.includes(e)
}
