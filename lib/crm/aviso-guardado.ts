// El aviso que aparece después de guardar una llamada o un WhatsApp (design.md D2, D5 y
// D7; spec crm-cadencia-llamadas). Puro: recibe la respuesta de la ruta y arma título,
// renglones, botones y el texto del toast. Los textos son los de la spec, palabra por
// palabra. Ninguno nombra «Sin respuesta» del Inicio: ese bloque todavía no existe (D7).
import type { BloqueCadencia } from '@/lib/supabase/cadencia'
import { cuandoEs } from './formato-fecha'
import type { ResultadoLlamada } from './tipos'

export type IconoLinea = 'agenda' | 'cerrada' | 'flecha' | 'aviso' | 'whatsapp'

export type AccionAviso =
  | { tipo: 'coordinar'; etiqueta: 'Coordinar tasación'; href: string }
  | { tipo: 'abrir'; etiqueta: 'Abrir el proceso'; href: string }
  | { tipo: 'perdido'; etiqueta: 'Marcar proceso como perdido'; dealId: string }
  | { tipo: 'dejar_abierto'; etiqueta: 'Dejarlo abierto' }
  | { tipo: 'reintentar'; etiqueta: 'Reintentar' }
  | { tipo: 'ver_tareas'; etiqueta: 'Ver en Tareas' }

export interface Aviso {
  variante: 'normal' | 'pendiente'
  titulo: string
  lineas: { icono: IconoLinea; texto: string }[]
  acciones: AccionAviso[]
  toast: string
}

export interface EntradaAviso {
  tipo: 'call' | 'whatsapp_sent'
  titulo: string // el de la actividad: "Llamada 1 · No atendió"
  intento: number | null
  resultado: ResultadoLlamada | null
  cadencia: BloqueCadencia
  pendiente: boolean
  contactoId: string
  nombreContacto: string
  etiquetaEtapa: string | null // etapa del proceso activo, para "El proceso ya está en …"
  ahora: Date
}

const MAS_TAREA = 'Si querés seguirla, agendá una con «+ Tarea».'

const TEXTO_MOTIVO: Partial<Record<NonNullable<BloqueCadencia['motivoSinTarea']>, string>> = {
  whatsapp_ya_enviado: `Ya se le mandó WhatsApp: no se crea otra tarea. ${MAS_TAREA}`,
  whatsapp_ya_pendiente: 'Ya hay una tarea pendiente de enviarle WhatsApp: no se crea otra.',
  sin_proceso: 'No tiene un proceso abierto: no se agenda la llamada siguiente.',
  secuencia_terminada: 'La secuencia termina acá: no se crea ninguna tarea más.',
  proceso_ajeno:
    'Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona.',
  fuera_de_orden: 'Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea.',
}

/**
 * "Llamada 2 a María López" → "Llamada 2"; "Enviar WhatsApp a María López" → "Enviar
 * WhatsApp" (maqueta `tituloCorto`). "Llamar a María López" queda entero: "Se agendó
 * Llamar para…" no se entiende.
 */
function tituloCorto(titulo: string, nombre: string): string {
  const sufijo = ` a ${nombre}`
  if (!titulo.endsWith(sufijo)) return titulo
  const corto = titulo.slice(0, -sufijo.length)
  return corto === 'Llamar' ? titulo : corto
}

function lineasDeOfrecer(e: EntradaAviso): { lineas: Aviso['lineas']; acciones: AccionAviso[] } {
  const dealId = e.cadencia.dealId
  const yaCoordinada = `El proceso ya está en ${e.etiquetaEtapa ?? 'otra etapa'}: no hace falta coordinar de nuevo.`
  switch (e.cadencia.ofrecer) {
    case 'coordinar_solicitud':
      return {
        lineas: [{ icono: 'flecha', texto: 'Falta coordinar día, hora y asesor de la tasación.' }],
        acciones: dealId
          ? [{ tipo: 'coordinar', etiqueta: 'Coordinar tasación', href: `/pipeline/new?deal=${encodeURIComponent(dealId)}` }]
          : [],
      }
    case 'coordinar_nuevo':
      return {
        lineas: [{ icono: 'flecha', texto: 'Falta coordinar día, hora y asesor de la tasación. Se abre como un proceso nuevo.' }],
        acciones: [{ tipo: 'coordinar', etiqueta: 'Coordinar tasación', href: `/pipeline/new?contact=${encodeURIComponent(e.contactoId)}` }],
      }
    case 'abrir_proceso':
      return {
        lineas: [{ icono: 'flecha', texto: yaCoordinada }],
        acciones: dealId ? [{ tipo: 'abrir', etiqueta: 'Abrir el proceso', href: `/pipeline/${encodeURIComponent(dealId)}` }] : [],
      }
    case 'proceso_ya_coordinado':
      return { lineas: [{ icono: 'flecha', texto: yaCoordinada }], acciones: [] }
    case 'pedir_coordinacion':
      return {
        lineas: [{ icono: 'flecha', texto: 'Falta coordinar día, hora y asesor de la tasación. Pedíselo a la coordinación.' }],
        acciones: [],
      }
    case 'cerrar_proceso':
      return {
        lineas: [{ icono: 'flecha', texto: 'El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo.' }],
        acciones: dealId
          ? [
              { tipo: 'perdido', etiqueta: 'Marcar proceso como perdido', dealId },
              { tipo: 'dejar_abierto', etiqueta: 'Dejarlo abierto' },
            ]
          : [],
      }
    case 'pedir_cierre':
      return {
        lineas: [{ icono: 'flecha', texto: 'El proceso sigue abierto. Si hay que cerrarlo, avisale a la coordinación.' }],
        acciones: [],
      }
    case 'nada_que_cerrar':
      return { lineas: [{ icono: 'flecha', texto: 'No tiene ningún proceso abierto: no hay nada que cerrar.' }], acciones: [] }
    default:
      return { lineas: [], acciones: [] }
  }
}

export function armarAviso(e: EntradaAviso): Aviso {
  const { cadencia } = e
  const esWhatsapp = e.tipo === 'whatsapp_sent'
  const lineas: Aviso['lineas'] = []
  const acciones: AccionAviso[] = []

  if (e.pendiente) {
    lineas.push({
      icono: 'aviso',
      texto: esWhatsapp
        ? 'El WhatsApp quedó anotado, pero no se pudieron completar sus tareas.'
        : 'La llamada quedó guardada, pero no se pudo agendar la siguiente.',
    })
  }

  let fraseTarea = ''
  if (cadencia.tareaCreada) {
    const t = cadencia.tareaCreada
    fraseTarea = `Se agendó ${tituloCorto(t.title, e.nombreContacto)} para ${cuandoEs(t.due_date, t.due_time, e.ahora)}.`
    lineas.push({ icono: 'agenda', texto: fraseTarea })
  } else if (cadencia.motivoSinTarea && TEXTO_MOTIVO[cadencia.motivoSinTarea]) {
    let texto = TEXTO_MOTIVO[cadencia.motivoSinTarea] as string
    if (cadencia.motivoSinTarea === 'fuera_de_orden' && e.resultado === 'volver_a_llamar') {
      texto += ' Si hace falta, agendala con «+ Tarea».'
    }
    lineas.push({ icono: esWhatsapp ? 'whatsapp' : 'aviso', texto })
  }

  for (const t of cadencia.tareasCerradas) {
    lineas.push({ icono: 'cerrada', texto: `Se completó sola la tarea «${t.title}».` })
  }
  if (esWhatsapp && cadencia.motivoSinTarea === 'secuencia_terminada') {
    lineas.push({ icono: 'flecha', texto: `Si no contesta y querés seguirla, agendá una con «+ Tarea».` })
  }

  // Lo que se ofrece no aplica a un intento fuera de orden: no movió nada.
  if (cadencia.aplica) {
    const o = lineasDeOfrecer(e)
    lineas.push(...o.lineas)
    acciones.push(...o.acciones)
  }
  if (cadencia.tareaCreada && !acciones.some((a) => a.tipo === 'coordinar')) {
    acciones.push({ tipo: 'ver_tareas', etiqueta: 'Ver en Tareas' })
  }
  if (e.pendiente) acciones.unshift({ tipo: 'reintentar', etiqueta: 'Reintentar' })

  const titulo = esWhatsapp ? 'WhatsApp marcado como enviado' : e.titulo
  const guardada = e.intento === null ? 'Llamada guardada.' : `Llamada ${e.intento} guardada.`
  const toast = esWhatsapp
    ? 'WhatsApp marcado como enviado. No se crea ninguna tarea más.'
    : fraseTarea
      ? `${guardada} ${fraseTarea}`
      : guardada

  return { variante: e.pendiente ? 'pendiente' : 'normal', titulo, lineas, acciones, toast }
}

/** El toast del "perdido" (D5): suma la frase de la tasación agendada si la había. */
export function textoToastPerdido(teniaTasacionAgendada: boolean): string {
  return teniaTasacionAgendada
    ? 'Proceso marcado como perdido. Se quitó la tasación agendada.'
    : 'Proceso marcado como perdido.'
}

export const DESCRIPCION_TOAST_PERDIDO = 'Se puede deshacer durante 10 minutos desde «Procesos» (en el celular, pestaña Tareas).'
