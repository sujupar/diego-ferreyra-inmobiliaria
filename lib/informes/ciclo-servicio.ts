/**
 * Una corrida del ciclo automático (la dispara pg_cron cada 2 minutos el 1, 2, 16 y 17). Cada corrida:
 *   1. crea los borradores que falten de la quincena que cerró;
 *   2. trae fuentes pendientes, UNA por vez, hasta gastar el presupuesto (regla de Netlify: ~26 s por función);
 *   3. cuando la tanda terminó, reclama los informes (`avisado_at`), crea una tarea por propiedad y manda UN email.
 * Las dependencias se inyectan (base, fuentes, tareas, email): así se prueba sin tocar nada real.
 */
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { entraEnElCiclo, periodoDelCiclo, proximasFuentes, tandaParaAvisar, type InformeDelCiclo, type MotivoAviso } from './ciclo'
import { textoDelPeriodo } from './periodo'
import type { NombreFuente } from './tipos'

/**
 * No se ARRANCA una fuente nueva pasados estos ms. La peor fuente tarda ~15 s (`TOPE_FUENTE_MS`): 8 + 15 + el
 * aviso final quedan debajo de los ~26 s de Netlify.
 */
export const PRESUPUESTO_MS = 8_000

/** Días en que corre: el del ciclo y el siguiente (repechaje si la API de algún servicio estuvo caída). */
const DIAS_DEL_CICLO = new Set([1, 2, 16, 17])

export interface PropiedadDelCiclo {
  id: string
  titulo: string | null
  direccion: string
  status: string
  commercialStatus: string | null
  /** 'AAAA-MM-DD' en hora de Argentina. */
  capturadaEl: string | null
}

export interface InformeDelPeriodo extends InformeDelCiclo {
  desde: string
  origen: 'ciclo' | 'manual'
  estado: 'borrador' | 'listo'
}

export interface DependenciasCiclo {
  propiedades(): Promise<PropiedadDelCiclo[]>
  /** Todos los informes que cierran en `hasta` (de ciclo y manuales). */
  informesDelPeriodo(hasta: string): Promise<InformeDelPeriodo[]>
  crear(propertyId: string, desde: string, hasta: string): Promise<void>
  refrescar(informeId: string, fuente: NombreFuente): Promise<void>
  /** Marca `avisado_at` SOLO en los que todavía no lo tenían; devuelve los que reclamó esta corrida. */
  reclamar(ids: string[]): Promise<string[]>
  crearTarea(t: { propertyId: string; direccion: string; informeId: string }): Promise<void>
  avisar(periodo: string, informes: Array<{ id: string; direccion: string }>): Promise<{ ok: boolean; detalle: string }>
  reloj(): number
}

export interface ResultadoCiclo {
  hoy: string
  periodo: { desde: string; hasta: string } | null
  motivo: 'fuera_de_fecha' | MotivoAviso
  creados: number
  fuentes: number
  errores: string[]
  avisados: number
  email: { ok: boolean; detalle: string } | null
}

export async function correrCiclo(d: DependenciasCiclo, ahora: Date, opciones: { propiedades?: string[] } = {}): Promise<ResultadoCiclo> {
  const inicio = d.reloj()
  const hoy = fechaEnArgentina(ahora)
  const dia = Number(hoy.slice(8, 10))
  const r: ResultadoCiclo = { hoy, periodo: null, motivo: 'fuera_de_fecha', creados: 0, fuentes: 0, errores: [], avisados: 0, email: null }
  // Con propiedades elegidas es una corrida de PRUEBA: puede ser cualquier día y no excluye las [TEST].
  const dePrueba = !!opciones.propiedades?.length
  if (!dePrueba && !DIAS_DEL_CICLO.has(dia)) return r

  const elegidas = (await d.propiedades()).filter(p => dePrueba
    ? opciones.propiedades?.includes(p.id) && entraEnElCiclo({ ...p, titulo: null })
    : entraEnElCiclo(p))
  const conPeriodo = elegidas
    .map(p => ({ p, periodo: periodoDelCiclo(hoy, p.capturadaEl) }))
    .filter((x): x is { p: PropiedadDelCiclo; periodo: { desde: string; hasta: string } } => x.periodo !== null)
  // Todas cierran el mismo día (el recorte por captación solo mueve el `desde`).
  const hasta = periodoDelCiclo(hoy, null)?.hasta ?? null
  if (!hasta) return r
  r.periodo = { desde: periodoDelCiclo(hoy, null)?.desde ?? hasta, hasta }

  // 1. Borradores que falten. Una propiedad que ya tiene un informe de ese cierre (aunque sea manual) no se toca.
  let informes = await d.informesDelPeriodo(hasta)
  const conInforme = new Set(informes.map(i => i.propertyId))
  for (const { p, periodo } of conPeriodo) {
    if (conInforme.has(p.id)) continue
    if (d.reloj() - inicio > PRESUPUESTO_MS) break
    try {
      await d.crear(p.id, periodo.desde, periodo.hasta)
      r.creados++
    } catch (e) {
      r.errores.push(`crear ${p.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (r.creados) informes = await d.informesDelPeriodo(hasta)

  const elegidasIds = new Set(elegidas.map(p => p.id))
  const delCiclo = informes.filter(i => i.origen === 'ciclo' && elegidasIds.has(i.propertyId))
  const borradores = delCiclo.filter(i => i.estado === 'borrador')

  // 2. Fuentes, de a una, mientras quede presupuesto.
  for (const { informeId, fuente } of proximasFuentes(borradores, Number.MAX_SAFE_INTEGER)) {
    if (d.reloj() - inicio > PRESUPUESTO_MS) break
    try {
      await d.refrescar(informeId, fuente)
      r.fuentes++
    } catch (e) {
      // Una fuente nunca lanza (queda `error` con su motivo); esto es la base o el informe que pasó a listo.
      r.errores.push(`${fuente} de ${informeId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 3. Aviso: solo cuando la tanda terminó (o pasaron 6 horas). Se relee: las fuentes de recién cambiaron.
  const actuales = (await d.informesDelPeriodo(hasta)).filter(i => i.origen === 'ciclo' && elegidasIds.has(i.propertyId))
  const { avisar, motivo } = tandaParaAvisar(actuales.map(i => (i.estado === 'listo' ? { ...i, pendientes: [] } : i)), ahora)
  r.motivo = motivo
  if (!avisar.length) return r
  const reclamados = new Set(await d.reclamar(avisar))
  if (!reclamados.size) return r
  const direccion = new Map(elegidas.map(p => [p.id, p.direccion]))
  const aAvisar = actuales.filter(i => reclamados.has(i.id)).map(i => ({ id: i.id, propertyId: i.propertyId, direccion: direccion.get(i.propertyId) ?? '' }))
  for (const i of aAvisar) {
    try {
      await d.crearTarea({ propertyId: i.propertyId, direccion: i.direccion, informeId: i.id })
    } catch (e) {
      r.errores.push(`tarea de ${i.propertyId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  r.avisados = aAvisar.length
  r.email = await d.avisar(textoDelPeriodo(r.periodo.desde, r.periodo.hasta), aAvisar.map(i => ({ id: i.id, direccion: i.direccion })))
  return r
}
