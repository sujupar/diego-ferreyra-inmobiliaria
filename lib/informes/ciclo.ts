/**
 * Reglas del ciclo automático (spec §"Qué pasa por detrás", 1 y 5). Puro: el cron (servicio) lee la base y le
 * pasa los datos; acá se decide qué propiedades entran, qué período, qué fuente traer después y cuándo avisar.
 */
import { quincenaQueCerro, recortarALaCaptacion, type Periodo } from './periodo'
import type { NombreFuente } from './tipos'

export interface PropiedadParaCiclo {
  id: string
  titulo: string | null
  status: string
  commercialStatus: string | null
}

/**
 * Captada (`status='approved'`) y disponible o reservada. `commercial_status` vacío es "disponible" (es el
 * default de la columna). Las fichas `[TEST` quedan afuera: generarían una tarea real para Paula cada 15 días.
 */
export function entraEnElCiclo(p: PropiedadParaCiclo): boolean {
  if (p.status !== 'approved') return false
  if ((p.titulo ?? '').trim().toUpperCase().startsWith('[TEST')) return false
  return p.commercialStatus === null || p.commercialStatus === 'disponible' || p.commercialStatus === 'reservada'
}

/** La quincena que cerró a la fecha `hoy`, recortada a la captación. El 2 y el 17 (repechaje) dan la misma. */
export function periodoDelCiclo(hoy: string, capturadaEl: string | null): Periodo | null {
  return recortarALaCaptacion(quincenaQueCerro(hoy), capturadaEl)
}

export interface InformeDelCiclo {
  id: string
  propertyId: string
  creadoEn: string
  avisadoEn: string | null
  pendientes: NombreFuente[]
}

/** Las próximas fuentes a traer: un informe entero antes que el siguiente, así van quedando completos de a uno. */
export function proximasFuentes(informes: InformeDelCiclo[], max: number): Array<{ informeId: string; fuente: NombreFuente }> {
  const r: Array<{ informeId: string; fuente: NombreFuente }> = []
  for (const i of informes) {
    for (const fuente of i.pendientes) {
      if (r.length >= max) return r
      r.push({ informeId: i.id, fuente })
    }
  }
  return r
}

/**
 * Pasado este tiempo desde que se creó la tanda se avisa igual, aunque alguna fuente siga pendiente: una API
 * trabada no puede dejar a Paula sin enterarse. El editor vuelve a traer lo pendiente al abrirse.
 */
export const ESPERA_MAXIMA_MS = 6 * 60 * 60 * 1000

export type MotivoAviso = 'sin_informes' | 'faltan_fuentes' | 'tanda_completa' | 'tiempo_cumplido' | 'ya_avisado'

/** Qué informes avisar ahora. Un solo aviso por tanda: hasta que la tanda no termina, no sale nada. */
export function tandaParaAvisar(informes: InformeDelCiclo[], ahora: Date): { avisar: string[]; motivo: MotivoAviso } {
  if (!informes.length) return { avisar: [], motivo: 'sin_informes' }
  const sinAvisar = informes.filter(i => !i.avisadoEn)
  if (!sinAvisar.length) return { avisar: [], motivo: 'ya_avisado' }
  const completa = informes.every(i => i.pendientes.length === 0)
  const primero = Math.min(...informes.map(i => Date.parse(i.creadoEn)))
  const tiempoCumplido = ahora.getTime() - primero >= ESPERA_MAXIMA_MS
  if (!completa && !tiempoCumplido) return { avisar: [], motivo: 'faltan_fuentes' }
  return { avisar: sinAvisar.map(i => i.id), motivo: completa ? 'tanda_completa' : 'tiempo_cumplido' }
}
