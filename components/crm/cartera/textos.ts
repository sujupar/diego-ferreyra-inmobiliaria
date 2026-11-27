// Los textos fijos de la cartera, tal cual la spec (crm-cartera, "Grupos de la coordinación",
// "Vista del asesor", "Cada rol abre el CRM…"). En un solo lugar: los usan las pantallas y
// la sonda de render, que verifica que estén todos.
import type { ClaveGrupo } from '@/lib/crm/cartera'

export type TipoVista = 'coordinacion' | 'asesor' | 'dueno'

export const SUBTITULO: Record<TipoVista, string> = {
  coordinacion: 'Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero.',
  asesor: 'Tus procesos, ordenados por el próximo paso.',
  dueno: 'El embudo completo, lo que está trabado y la lista de todos los procesos.',
}

export const SUBTITULO_CONTACTOS = {
  equipo: 'Todas las personas cargadas, con su proceso, el último contacto y el próximo paso.',
  asesor: 'Tus contactos: asignados a vos, cargados por vos o con un proceso o tasación tuyos.',
}

/** Con "Ver como" puesto en un asesor, el subtítulo nombra a esa persona (spec "Ver como"). */
export function subtituloDe(tipo: TipoVista, mirando: { nombre: string } | null): string {
  if (mirando && tipo === 'asesor') return `Los procesos de ${mirando.nombre}, ordenados por el próximo paso.`
  return SUBTITULO[tipo]
}

export interface MetaGrupo {
  titulo: string
  texto: string | null
  /** Número en la cabecera: burbuja de alerta, neutra o ninguno (spec "Número en la cabecera"). */
  numero: 'alerta' | 'neutro' | null
  /** Muestra el renglón de la tasación cercana (spec "Tasación cercana en la fila"). */
  conTasacion: boolean
}

export function metaDeGrupo(clave: ClaveGrupo, tipo: TipoVista): MetaGrupo {
  switch (clave) {
    case 'sin-contacto':
      return { titulo: 'Sin primer contacto', texto: 'Nadie las llamó todavía. Primero la que más espera.', numero: 'alerta', conTasacion: false }
    case 'vencidas':
      return tipo === 'coordinacion'
        ? { titulo: 'Llamada o mensaje vencido', texto: 'Tenían una tarea para antes de ahora.', numero: 'alerta', conTasacion: false }
        : { titulo: 'Tareas vencidas', texto: 'Tenían que estar hechas antes de ahora.', numero: 'alerta', conTasacion: false }
    case 'tasaciones':
      return { titulo: 'Tasaciones de hoy y mañana', texto: 'Para confirmar el horario con la persona y con el asesor.', numero: 'neutro', conTasacion: true }
    case 'resto':
      return {
        titulo: 'El resto de las solicitudes y coordinadas',
        texto: 'Ordenadas por el próximo paso. Al final, las que no tienen nada agendado.',
        numero: null,
        conTasacion: false,
      }
    case 'hoy':
      return { titulo: 'Tasaciones de hoy', texto: 'Las que tenés hoy, por hora.', numero: 'neutro', conTasacion: true }
    case 'proximos':
      return { titulo: 'Con próximo paso', texto: 'Ordenados por fecha.', numero: 'neutro', conTasacion: false }
    case 'nada':
      return {
        titulo: 'Sin nada pendiente',
        texto: 'No tienen ninguna tarea ni visita. Poneles un próximo paso o cerrá el proceso.',
        numero: null,
        conTasacion: false,
      }
    case 'cerrados':
      return { titulo: 'Cerrados', texto: 'Los más recientes primero. Para volver a abrir uno, entrá a su ficha.', numero: null, conTasacion: false }
    case 'todos':
      // En la vista del asesor solo aparece si fallaron las tareas: no se puede decir "Sin
      // nada pendiente" de lo que no se sabe (notas del grupo 3, diferencia 4).
      return { titulo: 'Todos los procesos', texto: null, numero: null, conTasacion: tipo === 'dueno' }
  }
}

export const TEXTO_ERROR_ULTIMO = 'No se pudo cargar el último contacto de cada persona.'
export const TEXTO_ERROR_TAREAS = 'No se pudieron cargar las tareas.'
export const TEXTO_TOPE = 'Se muestran los 3.000 más recientes: hay más procesos de los que esta pantalla puede traer.'
// En Contactos el corte puede ser de personas, de procesos o de tasaciones: el texto no afirma cuál (H6, A3-5).
export const TEXTO_TOPE_CONTACTOS = 'Esta lista quedó incompleta: hay más datos de los que esta pantalla puede traer.'
export const TEXTO_PERSONA_INVALIDA = 'Esa persona no tiene una vista del CRM.'

/** "No se aplicó Etapa: ese valor no es válido." (spec "Valor inventado en la dirección"). */
export function textoNoSeAplico(nombreFiltro: string): string {
  return `No se aplicó ${nombreFiltro}: ese valor no es válido.`
}
