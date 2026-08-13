/**
 * El guion del agente que atiende a quien pidió una TASACIÓN por la landing.
 *
 * Lógica PURA: sin Supabase, sin WhatsApp, sin IA. Recibe en qué punto va la
 * conversación y qué acaba de escribir la persona, y devuelve qué contestar y
 * cómo queda el estado. Todo lo testeable de esta pieza vive acá.
 *
 * POR QUÉ SIN IA. El dueño lo pidió corto y simple, y este flujo son tres
 * preguntas encadenadas: canal → cuándo → dónde. Eso es una máquina de estados,
 * no un juicio. Además el request del webhook ya gastó su única llamada al
 * modelo en el análisis de la bandeja (ver CLAUDE.md § "nunca encadenar varias
 * llamadas de IA dentro de UN request"), así que una segunda llamada acá
 * arriesgaría el techo de tiempo de Netlify justo cuando hay un cliente
 * esperando respuesta.
 *
 * QUÉ PASA SI LA PERSONA SE SALE DEL GUION. No se improvisa: cualquier cosa que
 * no encaje con el paso actual (una pregunta, una duda, una queja) DERIVA a una
 * persona del equipo y el agente deja de escribir en esa conversación. Un
 * agente que adivina precios o condiciones de venta hace más daño que uno que
 * se calla — y del otro lado hay un cliente real de tráfico pago.
 *
 * LO QUE NUNCA HACE (decisión del dueño, 2026-08-13): NO agenda. Toma los datos
 * y cierra diciendo que un asesor se contacta para confirmar la visita teniendo
 * en cuenta su disponibilidad. Prometerle un horario en firme a alguien sin que
 * el equipo lo haya mirado es exactamente lo que no queremos.
 */

export type PasoTasacion =
  | 'esperando_canal'      // se mandó la plantilla; la persona elige cómo coordinar
  | 'esperando_dia_hora'   // eligió el chat; se le preguntó cuándo le queda cómodo
  | 'esperando_direccion'  // dijo cuándo; se le preguntó dónde queda la propiedad
  | 'cerrado'              // ya se le dijo que el asesor lo contacta
  | 'derivado'             // se salió del guion → sigue una persona

export interface EstadoTasacion {
  paso: PasoTasacion
  canal?: 'chat' | 'llamada'
  diaHora?: string
  direccion?: string
}

export interface TurnoTasacion {
  /** Lo que se le manda al cliente. `null` = no se le escribe nada. */
  respuesta: string | null
  estado: EstadoTasacion
  /** true = hay que avisarle al equipo (tarea + datos nuevos en el trato). */
  avisarEquipo: boolean
  /** Motivo para la nota interna del equipo, cuando corresponde. */
  motivo?: 'pidio_llamada' | 'datos_completos' | 'derivado'
}

/** Sin acentos y en minúsculas — "por acá" y "por aca" son lo mismo. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Los dos botones de la plantilla llegan como mensajes de texto con EXACTAMENTE
 * el texto del botón. Se reconocen esas dos frases y también las formas escritas
 * a mano más obvias, porque nada obliga a la persona a tocar el botón.
 */
function detectarCanal(texto: string): 'chat' | 'llamada' | null {
  const t = normalizar(texto)
  if (/prefiero que me llamen|que me llamen|llamame|llamenme|prefiero.*llamad|por telefono|un llamado/.test(t)) {
    return 'llamada'
  }
  if (/coordinar por aca|por aca|por aqui|por chat|por whatsapp|por este medio|dale|listo|si$|ok$/.test(t)) {
    return 'chat'
  }
  return null
}

/**
 * ¿El mensaje parece una PREGUNTA o un planteo que merece una persona? No busca
 * entender: busca detectar que NO es la respuesta que se pidió. Ante la duda, el
 * guion sigue (el paso siguiente igual vuelve a preguntar lo que falta).
 */
function pareceConsulta(texto: string): boolean {
  const t = normalizar(texto)
  if (t.includes('?')) return true
  return /\b(cuanto|cuánto|precio|comision|comisión|cobran|gratis de verdad|por que|porque|quien|quién|como funciona|no quiero|no me interesa|cancelar|dar de baja)\b/.test(t)
}

const CIERRE =
  'Dale, excelente. Te va a estar contactando el asesor para confirmar la visita ' +
  'para hacer la tasación, teniendo en cuenta tu disponibilidad. ¡Gracias!'

const DERIVACION =
  'Gracias por escribir. Le paso tu consulta a un asesor del equipo y te contacta a la brevedad.'

/**
 * Un turno de la conversación. `mensaje` es lo último que escribió la persona.
 */
export function siguienteTurno(estado: EstadoTasacion, mensaje: string): TurnoTasacion {
  const texto = (mensaje ?? '').trim()

  // Conversación terminada: el agente no vuelve a escribir. Que la persona
  // escriba de nuevo no es motivo para reabrir un guion ya cumplido.
  if (estado.paso === 'cerrado' || estado.paso === 'derivado') {
    return { respuesta: null, estado, avisarEquipo: false }
  }

  if (!texto) return { respuesta: null, estado, avisarEquipo: false }

  // Una consulta real corta el guion en cualquier punto: contesta una persona.
  if (pareceConsulta(texto)) {
    return {
      respuesta: DERIVACION,
      estado: { ...estado, paso: 'derivado' },
      avisarEquipo: true,
      motivo: 'derivado',
    }
  }

  switch (estado.paso) {
    case 'esperando_canal': {
      const canal = detectarCanal(texto)
      if (canal === 'llamada') {
        // No se le pide nada más: el equipo lo llama y coordina en la llamada.
        return {
          respuesta: CIERRE,
          estado: { ...estado, canal, paso: 'cerrado' },
          avisarEquipo: true,
          motivo: 'pidio_llamada',
        }
      }
      // Cualquier otra cosa (incluido el botón "Coordinar por acá") sigue por chat.
      return {
        respuesta: '¡Genial! ¿Qué día y en qué horario te queda cómodo para la visita?',
        estado: { ...estado, canal: 'chat', paso: 'esperando_dia_hora' },
        avisarEquipo: false,
      }
    }

    case 'esperando_dia_hora':
      return {
        respuesta: '¡Perfecto! ¿Cuál es la dirección y el barrio de la propiedad?',
        estado: { ...estado, diaHora: texto, paso: 'esperando_direccion' },
        avisarEquipo: false,
      }

    case 'esperando_direccion':
      return {
        respuesta: CIERRE,
        estado: { ...estado, direccion: texto, paso: 'cerrado' },
        avisarEquipo: true,
        motivo: 'datos_completos',
      }
  }
}

/** Resumen para la nota del equipo en el trato del CRM. */
export function resumenParaEquipo(estado: EstadoTasacion): string {
  if (estado.canal === 'llamada') {
    return 'El cliente prefiere que lo llamen para coordinar la tasación.'
  }
  const partes: string[] = []
  if (estado.diaHora) partes.push(`Disponibilidad: ${estado.diaHora}`)
  if (estado.direccion) partes.push(`Propiedad: ${estado.direccion}`)
  if (partes.length === 0) return 'Conversación de tasación derivada a un asesor.'
  return `Datos que dejó por WhatsApp — ${partes.join(' · ')}`
}
