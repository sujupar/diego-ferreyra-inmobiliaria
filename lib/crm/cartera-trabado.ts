// "Lo que está trabado" de la vista del dueño (crm-cartera-por-rol, design.md D5). Puro.
// Usa las MISMAS reglas que las filas y los grupos (`sinPrimerContacto`, `sinAsesor`,
// `sinMovimiento` de cartera.ts): un proceso trabado en el bloque es el mismo que se
// marca en su fila y el que deja la lista al tocar "Ver los N en la lista".
import { diasSinMovimiento, sinAsesor, sinMovimiento, sinPrimerContacto, type FilaCartera } from './cartera'
import type { EtapaCRM } from './etapas'
import { duracion } from './formato-fecha'
import { minutosHabilesEntre } from './horario-laboral'

export { diasSinMovimiento }

export interface Trabado {
  // base = solicitudes abiertas desde el registro; las anteriores sin dato van aparte.
  sinContacto: { filas: FilaCartera[]; base: number; anterioresAlRegistro: number }
  // base = abiertos en Coordinada, No realizada, Realizada, Entregada o Seguimiento.
  sinAsesor: { filas: FilaCartera[]; base: number }
  // base = seguimientos abiertos.
  sinMovimiento: { filas: FilaCartera[]; base: number }
}

const ETAPAS_BASE_SIN_ASESOR: readonly EtapaCRM[] = ['coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento']
// "La etapa más avanzada primero" (spec "Hasta cinco nombres por columna").
const AVANCE: Record<string, number> = { seguimiento: 0, entregada: 1, realizada: 2, no_realizada: 3, coordinada: 4 }

const ms = (s: string) => {
  const v = Date.parse(s)
  return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v
}

/**
 * Se calcula sobre TODOS los abiertos sin colegas, sin los filtros de la lista (spec "Los
 * filtros no cambian lo trabado"). Si alguna de esas filas trae el último contacto en
 * 'error', devuelve 'error': un bloque que cuenta lo que no sabe diría números falsos.
 * Las listas van completas y ordenadas (la pantalla muestra 5 y el total en el botón).
 */
export function calcularTrabado(filas: FilaCartera[], ahora: Date): Trabado | 'error' {
  const vivas = filas.filter((f) => f.abierto && !f.colega)
  if (vivas.some((f) => f.ultimoContacto === 'error')) return 'error'

  const solicitudes = vivas.filter((f) => f.etapa === 'solicitud')
  const sinContacto = solicitudes
    .filter(sinPrimerContacto)
    .sort((a, b) => ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id))

  const conAsesorDebido = vivas.filter((f) => ETAPAS_BASE_SIN_ASESOR.includes(f.etapa))
  const sinAsesorFilas = conAsesorDebido
    .filter(sinAsesor)
    .sort((a, b) => (AVANCE[a.etapa] ?? 9) - (AVANCE[b.etapa] ?? 9) || ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id))

  const seguimientos = vivas.filter((f) => f.etapa === 'seguimiento')
  const sinMov = seguimientos
    .filter((f) => sinMovimiento(f, ahora))
    .sort((a, b) => (diasSinMovimiento(b, ahora) ?? 0) - (diasSinMovimiento(a, ahora) ?? 0) || ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id))

  return {
    sinContacto: {
      filas: sinContacto,
      base: solicitudes.filter((f) => !f.anteriorAlRegistro).length,
      anterioresAlRegistro: solicitudes.filter((f) => f.anteriorAlRegistro && f.ultimoContacto === null).length,
    },
    sinAsesor: { filas: sinAsesorFilas, base: conAsesorDebido.length },
    sinMovimiento: { filas: sinMov, base: seguimientos.length },
  }
}

/**
 * "Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles", o solo "Espera hace 28 min" si
 * esperó todo en horario laboral. Es una cuenta distinta del vencimiento de la tarea (la
 * fila dice "Vencida hace 1 h" desde las 10:00): el dueño quiere ver cuánto esperó la persona.
 */
export function textoEspera(registradoEn: string, ahora: Date): string {
  const desde = new Date(registradoEn)
  if (Number.isNaN(desde.getTime())) return ''
  const reloj = duracion((ahora.getTime() - desde.getTime()) / 60_000)
  const habiles = duracion(minutosHabilesEntre(desde, ahora))
  return reloj === habiles ? `Espera hace ${reloj}` : `Espera hace ${reloj} de reloj · ${habiles} hábiles`
}
