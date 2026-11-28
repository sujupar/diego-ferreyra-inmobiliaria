// Cadencia de llamadas: qué tarea se crea o se cierra sola con cada intento (design.md D2,
// spec crm-cadencia-llamadas). Puro: sin red, sin base y sin reloj; el "ahora" de la
// decisión es el momento en que se CARGÓ la actividad (`cargadoEn`), así un reintento al
// día siguiente agenda igual que lo habría hecho el guardado original.
import { esUltimoIntento, intentosHasta } from './actividades'
import type { SituacionProceso } from './deal-activo'
import { enArgentina, enHorarioOProximo, esDiaHabil, siguienteDiaHabil } from './horario-laboral'
import type { Intento } from './tipos'

/**
 * `Intento` con su anulación opcional. La ruta ya pasa solo los no anulados (D2), pero si
 * uno anulado se cuela se descarta acá: contarlo movería la racha y el orden.
 */
export type IntentoDeCadencia = Intento & { voided_at?: string | null }

/**
 * El proceso de la coordinación (dueño, 2026-11-28, crm-cadencia-paula): tres llamadas antes
 * del WhatsApp; si la primera no atendida de la racha se cargó un día hábil antes de las
 * 12:00, la siguiente va esa misma tarde a las 13:30.
 */
export const LLAMADAS_ANTES_DEL_WHATSAPP = 3
export const CORTE_MISMA_TARDE = '12:00'
export const HORA_MISMA_TARDE = '13:30'

const vivos = <T extends IntentoDeCadencia>(xs: T[]): T[] => xs.filter((i) => !i.voided_at)
const instante = (iso: string) => Date.parse(iso)

function porOrden(a: Intento, b: Intento): number {
  const dif = instante(a.occurred_at) - instante(b.occurred_at)
  return dif !== 0 ? dif : instante(a.created_at) - instante(b.created_at)
}

export interface EstadoCadencia {
  noAtendioSeguidas: number
  whatsappEnLaRacha: boolean
}

/**
 * Racha contada hacia atrás hasta la última llamada atendida (cualquier resultado distinto
 * de "No atendió"). Un WhatsApp no corta la racha; uno anterior a la atendida no cuenta.
 * Recibe `intentosHasta(evaluado)`, nunca el historial entero: así da lo mismo en el
 * guardado y en el reintento.
 */
export function estadoCadencia(intentosHastaElEvaluado: IntentoDeCadencia[]): EstadoCadencia {
  const estado: EstadoCadencia = { noAtendioSeguidas: 0, whatsappEnLaRacha: false }
  const ordenados = [...vivos(intentosHastaElEvaluado)].sort(porOrden)
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const intento = ordenados[i]
    if (intento.kind === 'whatsapp_sent') estado.whatsappEnLaRacha = true
    else if (intento.kind === 'call') {
      if (intento.call_outcome !== 'no_atendio') break
      estado.noAtendioSeguidas += 1
    }
  }
  return estado
}

export interface EntradaCadencia {
  evaluado: IntentoDeCadencia // el intento sobre el que se decide (nuevo o reintentado)
  intentosDelProceso: IntentoDeCadencia[] // no anulados, incluye `evaluado`
  numeroDeIntento: number | null // null si es WhatsApp
  nombreContacto: string
  situacion: SituacionProceso
  puedeConvertir: boolean // de quien HACE EL PEDIDO (solo para `ofrecer`)
  puedeCerrar: boolean // de quien HACE EL PEDIDO (solo para `ofrecer`)
  puedeAbrir: boolean // `esProcesoPropio` de quien HACE EL PEDIDO (solo para `ofrecer`)
  // `esProcesoPropio` de quien REGISTRÓ (para las tareas); sin proceso, true: ahí no hay
  // "proceso ajeno" y lo que un asesor cierra lo limita `soloPropias`.
  procesoPropio: boolean
  // De OTRO intento y de ESTE proceso: nunca la que creó `evaluado` (ver
  // `hayTareaWhatsappDeCadenciaPendiente`).
  hayTareaWhatsappDeCadenciaPendiente: boolean
  volverEl: { fecha: string; hora: string } | null // sale de `callback_at` de la actividad
  cargadoEn: Date // `created_at` de la actividad: el "ahora" de la decisión
}

export interface TareaACrear {
  title: string
  channel: 'call' | 'message'
  due_date: string
  due_time: string
}

export type MotivoSinTarea =
  | 'whatsapp_ya_enviado'
  | 'whatsapp_ya_pendiente'
  | 'sin_proceso'
  | 'secuencia_terminada'
  | 'fuera_de_orden'
  | 'proceso_ajeno'
  | 'no_corresponde'

export type Ofrecer =
  | 'coordinar_solicitud'
  | 'coordinar_nuevo'
  | 'abrir_proceso'
  | 'pedir_coordinacion'
  | 'cerrar_proceso'
  | 'pedir_cierre'
  | 'nada_que_cerrar'
  | 'proceso_ya_coordinado'
  | null

export interface DecisionCadencia {
  aplica: boolean // false = intento fuera de orden: no se crea ni se cierra nada
  tarea: TareaACrear | null
  motivoSinTarea: MotivoSinTarea | null // null exactamente cuando hay tarea
  cerrarWhatsapp: boolean // WhatsApp marcado, o llamada atendida
  ofrecer: Ofrecer
}

/**
 * El paso siguiente que muestra el aviso (tabla de D2). Siempre con los permisos de quien
 * HACE EL PEDIDO: en "Reintentar" puede no ser quien registró, y los botones son para quien
 * los ve (ninguno lleva a una pantalla que le daría 403 o 404).
 */
function calcularOfrecer(e: EntradaCadencia): Ofrecer {
  const resultado = e.evaluado.kind === 'call' ? e.evaluado.call_outcome : null
  if (resultado === 'agendo') {
    switch (e.situacion) {
      case 'solicitud':
        return e.puedeConvertir ? 'coordinar_solicitud' : 'pedir_coordinacion'
      case 'clase_gratuita':
      case 'sin_proceso':
        return 'coordinar_nuevo'
      case 'coordinada_o_posterior':
        return e.puedeAbrir ? 'abrir_proceso' : 'proceso_ya_coordinado'
    }
  }
  if (resultado === 'no_interesa' || resultado === 'numero_equivocado') {
    if (e.situacion === 'sin_proceso') return 'nada_que_cerrar'
    return e.puedeCerrar ? 'cerrar_proceso' : 'pedir_cierre'
  }
  return null
}

const sinTarea = (motivo: MotivoSinTarea) => ({ tarea: null, motivoSinTarea: motivo })

/** La parte de tarea/motivo, suponiendo que el intento está en orden. */
function tareaOMotivo(e: EntradaCadencia): { tarea: TareaACrear | null; motivoSinTarea: MotivoSinTarea | null } {
  const { evaluado } = e

  if (evaluado.kind === 'whatsapp_sent') {
    // Nunca crea tarea. Sobre un proceso ajeno el aviso dice eso, no "secuencia terminada".
    return sinTarea(e.procesoPropio ? 'secuencia_terminada' : 'proceso_ajeno')
  }
  if (evaluado.kind !== 'call') {
    throw new Error(`La cadencia solo decide sobre llamadas y WhatsApp; llegó "${evaluado.kind}" (${evaluado.id})`)
  }

  switch (evaluado.call_outcome) {
    case 'volver_a_llamar': {
      // Pedido explícito de la persona: con o sin proceso, y también sobre un proceso
      // ajeno, a nombre de quien registró. Solo lo frena el orden (ya mirado antes).
      if (!e.volverEl) {
        throw new Error(`"Volver a llamar" sin día ni hora pedidos (actividad ${evaluado.id}): falta callback_at`)
      }
      return {
        tarea: { title: `Llamar a ${e.nombreContacto}`, channel: 'call', due_date: e.volverEl.fecha, due_time: e.volverEl.hora },
        motivoSinTarea: null,
      }
    }
    case 'no_atendio':
      return siguienteDeNoAtendio(e)
    case 'agendo':
    case 'no_interesa':
    case 'numero_equivocado':
      return sinTarea('no_corresponde')
    default:
      throw new Error(`Llamada sin resultado conocido (actividad ${evaluado.id}): ${String(evaluado.call_outcome)}`)
  }
}

/** Precedencia de "No atendió" (D2, pasos 2 a 7; el 1, fuera de orden, va antes). */
function siguienteDeNoAtendio(e: EntradaCadencia): { tarea: TareaACrear | null; motivoSinTarea: MotivoSinTarea | null } {
  if (e.situacion === 'sin_proceso') return sinTarea('sin_proceso')
  if (!e.procesoPropio) return sinTarea('proceso_ajeno')

  const racha = estadoCadencia(intentosHasta(e.evaluado, vivos(e.intentosDelProceso)))
  if (racha.whatsappEnLaRacha) return sinTarea('whatsapp_ya_enviado')

  // Con una tarea "Enviar WhatsApp" de la cadencia todavía pendiente, el próximo paso ya
  // existe: no se crea otra tarea, sea cual sea la racha (spec, "Qué regla gana cuando se
  // cruzan dos"). Pasa con racha 1 si, por ejemplo, un asesor registró "Atendió" sobre un
  // proceso ajeno y no cerró la tarea de la coordinación: crear "Llamada N+1" le dejaría a
  // la coordinadora dos tareas para la misma persona.
  if (e.hayTareaWhatsappDeCadenciaPendiente) return sinTarea('whatsapp_ya_pendiente')
  if (racha.noAtendioSeguidas >= LLAMADAS_ANTES_DEL_WHATSAPP) {
    // Una tarea "Enviar WhatsApp" completada con el tilde no cuenta: el tilde no prueba que
    // el mensaje salió, así que mientras nadie lo marque cada "No atendió" lo vuelve a pedir.
    // Vence ya si es horario de la coordinación (D2).
    const { fecha, hora } = enHorarioOProximo(e.cargadoEn)
    return {
      tarea: { title: `Enviar WhatsApp a ${e.nombreContacto}`, channel: 'message', due_date: fecha, due_time: hora },
      motivoSinTarea: null,
    }
  }

  if (e.numeroDeIntento === null) {
    throw new Error(`"No atendió" sin número de intento (actividad ${e.evaluado.id})`)
  }
  const { fecha, hora } = cuandoLaSiguienteLlamada(e.cargadoEn, racha.noAtendioSeguidas)
  return {
    tarea: {
      title: `Llamada ${e.numeroDeIntento + 1} a ${e.nombreContacto}`,
      channel: 'call',
      due_date: fecha,
      due_time: hora,
    },
    motivoSinTarea: null,
  }
}

/**
 * Cuándo va la llamada siguiente (D2), por la racha y no por el número: tras la primera no
 * atendida cargada un día hábil antes de las 12:00, esa tarde a las 13:30; si no, el día
 * hábil siguiente a las 10:00. Siempre con la hora de CARGA (un reintento agenda igual).
 */
export function cuandoLaSiguienteLlamada(cargadoEn: Date, noAtendioSeguidas: number): { fecha: string; hora: string } {
  const a = enArgentina(cargadoEn)
  if (noAtendioSeguidas === 1 && esDiaHabil(a.fecha) && a.hora.slice(0, 5) < CORTE_MISMA_TARDE) {
    return { fecha: a.fecha, hora: HORA_MISMA_TARDE }
  }
  return siguienteDiaHabil(cargadoEn)
}

export function decidirCadencia(e: EntradaCadencia): DecisionCadencia {
  const { evaluado } = e
  const cerrarWhatsapp =
    evaluado.kind === 'whatsapp_sent' || (evaluado.kind === 'call' && evaluado.call_outcome !== 'no_atendio')
  const ofrecer = calcularOfrecer(e)

  // Primero el orden, con cualquier resultado: un intento que no es el último del proceso
  // se guarda y se numera, pero no crea ni cierra nada (diferencia 21, confirmada por el
  // dueño el 2026-11-26). `cerrarWhatsapp` queda con su valor de siempre: lo que impide
  // cerrar es `aplica: false`.
  if (!esUltimoIntento(evaluado, vivos(e.intentosDelProceso))) {
    return { aplica: false, ...sinTarea('fuera_de_orden'), cerrarWhatsapp, ofrecer }
  }
  return { aplica: true, ...tareaOMotivo(e), cerrarWhatsapp, ofrecer }
}

export interface TareaPendiente {
  id: string
  title: string
  type: string
  channel: string | null
  assigned_to: string | null
  // NO es columna de `tasks`: el rol del asignado (D3). `null` si no hay asignado o el
  // perfil no existe; así la manual de otra coordinadora no se cierra por error.
  assigned_role: string | null
  created_at: string
  deal_id: string | null
  contact_id: string | null
  appraisal_id: string | null
  source_activity_id: string | null
}

/** Del proceso de la actividad, o (sin proceso) ligada solo a este contacto. */
function esDelMismoLugar(t: TareaPendiente, dealId: string | null, contactId: string): boolean {
  return dealId ? t.deal_id === dealId : !t.deal_id && t.contact_id === contactId
}

/**
 * Para CERRAR (D2): del proceso de la actividad **o** ligada solo a este contacto, también
 * cuando hay proceso. Toda tarea creada con "+ Tarea" desde la ficha nace ligada solo al
 * contacto (AddTaskDialog manda una entidad), así que sin esto la llamada que alguien se
 * agendó a mano no se cerraba nunca al llamar sobre la solicitud. No se usa para
 * `hayTareaWhatsappDeCadenciaPendiente`, que a propósito mira solo el mismo proceso.
 */
function seCierraDesde(t: TareaPendiente, dealId: string | null, contactId: string): boolean {
  return (dealId !== null && t.deal_id === dealId) || (!t.deal_id && t.contact_id === contactId)
}

const creadaAntes = (t: TareaPendiente, corte: string) => instante(t.created_at) < instante(corte)

/**
 * Qué tareas pendientes cierra el intento (D2): (a) `update_contact` sin tasación, (b)
 * llamadas de la cadencia, de quien registra o de cualquier coordinador, (c) con
 * `incluirWhatsapp`, la "Enviar WhatsApp" de la cadencia. El corte por `created_at` impide
 * que un reintento tardío cierre lo que creó un intento posterior. Con `soloPropias` queda
 * solo lo asignado a quien registra, sea del tipo que sea.
 */
export function tareasACerrar(
  pendientes: TareaPendiente[],
  c: {
    dealId: string | null
    contactId: string
    registranteId: string
    incluirWhatsapp: boolean
    creadasAntesDe: string
    soloPropias: boolean // ver `cierraSoloPropias`
  },
): TareaPendiente[] {
  return pendientes.filter((t) => {
    if (!creadaAntes(t, c.creadasAntesDe) || !seCierraDesde(t, c.dealId, c.contactId)) return false
    if (c.soloPropias && t.assigned_to !== c.registranteId) return false
    if (t.type === 'update_contact') return !t.appraisal_id
    if (t.type !== 'follow_up') return false
    if (t.channel === 'call') {
      return !!t.source_activity_id || t.assigned_to === c.registranteId || t.assigned_role === 'coordinador'
    }
    if (t.channel === 'message') return c.incluirWhatsapp && !!t.source_activity_id
    return false
  })
}

/**
 * `soloPropias` de `tareasACerrar` (D2): el proceso no es de quien registró, o un asesor
 * registra sin proceso (si no, cerraría las tareas de la coordinación ligadas al contacto).
 */
export function cierraSoloPropias(c: { procesoPropio: boolean; rolRegistrante: string; dealId: string | null }): boolean {
  return !c.procesoPropio || (c.rolRegistrante === 'asesor' && !c.dealId)
}

/**
 * El dato `hayTareaWhatsappDeCadenciaPendiente` de la entrada (D2): una "Enviar WhatsApp"
 * de la cadencia (mensaje con `source_activity_id`), de OTRO intento, del MISMO proceso (o,
 * sin proceso, del mismo contacto sin proceso) y creada antes del evaluado. Sin excluir la
 * propia, el reintento de la segunda "No atendió" diría "ya hay una pendiente" por la tarea
 * que creó ella misma; sin filtrar por proceso, una tarea vieja de un proceso cerrado
 * frenaría la del proceso nuevo.
 */
export function hayTareaWhatsappDeCadenciaPendiente(
  pendientes: TareaPendiente[],
  c: { evaluadoId: string; dealId: string | null; contactId: string; creadasAntesDe: string },
): boolean {
  return pendientes.some(
    (t) =>
      t.channel === 'message' &&
      !!t.source_activity_id &&
      t.source_activity_id !== c.evaluadoId &&
      esDelMismoLugar(t, c.dealId, c.contactId) &&
      creadaAntes(t, c.creadasAntesDe),
  )
}
