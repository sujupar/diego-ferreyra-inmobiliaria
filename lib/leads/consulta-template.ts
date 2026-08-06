/**
 * Qué plantilla se le manda a quien deja una consulta en un portal.
 *
 * La persona nunca nos escribió, así que no hay ventana de 24hs abierta: fuera
 * de ventana WhatsApp solo admite plantillas aprobadas. Y una plantilla PUEDE
 * llevar el archivo en su encabezado, así que el plano o el video van en el
 * PRIMER mensaje, sin esperar a que conteste.
 *
 * De ahí salen tres plantillas con el MISMO cuerpo y distinto encabezado. Cuál
 * se usa depende solo de lo que la propiedad tenga cargado — por eso esto es una
 * función pura y se testea sola.
 *
 * Estado real de los datos al escribir esto (2026-08-06): de 145 consultas con
 * teléfono y propiedad, 123 tienen video y NINGUNA tiene plano. La rama del
 * plano existe porque el dueño va a cargarlos, no porque hoy se use.
 */

export type PlantillaConsulta = 'consulta_plano' | 'consulta_video' | 'consulta_simple'

export interface MediaDeLaPropiedad {
  plans?: string[] | null
  /** Archivo propio. Un link de YouTube NO sirve: Meta descarga el archivo desde la URL. */
  video_file_url?: string | null
  photos?: string[] | null
}

export interface EleccionPlantilla {
  plantilla: PlantillaConsulta
  /** El archivo que va en el encabezado. `null` en la plantilla sin encabezado. */
  header: { tipo: 'document' | 'video'; link: string } | null
  /** Cómo se nombra ese material en el cuerpo ({{2}}). */
  queMando: string
  /**
   * Material que quedó sin mandar en el primer mensaje y conviene ofrecer
   * después, ya en ventana. Con plano Y video, el video va acá.
   */
  pendiente: Array<'video' | 'fotos'>
}

const primero = (v: string[] | null | undefined): string | null => {
  const arr = (v ?? []).filter(x => typeof x === 'string' && x.trim())
  return arr.length > 0 ? arr[0] : null
}

/**
 * Prioriza el PLANO sobre el video cuando están los dos: es lo que Diego manda
 * primero y lo que más rápido responde "¿cómo es?". El video queda ofrecido para
 * el mensaje siguiente.
 */
export function elegirPlantilla(p: MediaDeLaPropiedad): EleccionPlantilla {
  const plano = primero(p.plans)
  const video = (p.video_file_url ?? '').trim() || null
  const hayFotos = (p.photos ?? []).length > 0

  if (plano) {
    return {
      plantilla: 'consulta_plano',
      header: { tipo: 'document', link: plano },
      queMando: 'el plano',
      pendiente: [...(video ? (['video'] as const) : []), ...(hayFotos ? (['fotos'] as const) : [])],
    }
  }
  if (video) {
    return {
      plantilla: 'consulta_video',
      header: { tipo: 'video', link: video },
      queMando: 'un video',
      pendiente: hayFotos ? ['fotos'] : [],
    }
  }
  return {
    plantilla: 'consulta_simple',
    header: null,
    queMando: '',
    pendiente: hayFotos ? ['fotos'] : [],
  }
}

/**
 * El cuerpo, en UN solo lugar para las tres plantillas.
 *
 * `{{1}}` nombre de pila · `{{2}}` qué se manda ("el plano" / "un video") ·
 * `{{3}}` la propiedad.
 *
 * "por la consulta que dejaste recién" no es relleno: es lo que sostiene la
 * clasificación UTILITY ante Meta (notificación de un trámite, no publicidad).
 * Mismo patrón que `recorrido_acceso_v4`, ya aprobada.
 *
 * El ofrecimiento de las fotos tampoco: le da una razón concreta para contestar
 * "dale", y contestar es lo que abre la ventana de 24hs.
 */
export const CUERPO_CON_MATERIAL = `Hola {{1}}, ¿cómo estás? Soy del equipo de Diego Ferreyra Inmobiliaria.

Te paso {{2}} de {{3}}, por la consulta que dejaste recién. Si querés te mando las fotos también.

Contame, ¿cómo te puedo ayudar?`

/**
 * Sin material que mandar, el cuerpo no puede decir "te paso": cambia. Y OJO —
 * las variables van numeradas de corrido desde {{1}}: esta plantilla tiene DOS,
 * no tres. Meta rechaza la creación si el numerador salta.
 */
export const CUERPO_SIN_MATERIAL = `Hola {{1}}, ¿cómo estás? Soy del equipo de Diego Ferreyra Inmobiliaria.

Te escribo por la consulta que dejaste recién sobre {{2}}. Tengo fotos y todos los datos, si querés te los paso.

Contame, ¿cómo te puedo ayudar?`

/** Las variables del cuerpo, en orden, para `bodyParams`. */
export function parametrosDelCuerpo(
  eleccion: EleccionPlantilla,
  datos: { nombre: string; propiedad: string },
): string[] {
  const nombre = datos.nombre.trim().split(/\s+/)[0] || 'Hola'
  // La plantilla sin material NO tiene {{2}}: si le pasáramos tres parámetros,
  // Meta rechaza el envío entero.
  return eleccion.header
    ? [nombre, eleccion.queMando, datos.propiedad]
    : [nombre, datos.propiedad]
}
