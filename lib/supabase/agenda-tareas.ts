// Lecturas de Pendientes y de la campanita (crm-tareas-y-campanita, D2). Service role: la
// ruta decide de quién son las tareas que se piden; acá se filtra SIEMPRE por esa selección
// y por `status = 'pending'`. Toda función LANZA si la base falla: un error tragado se vería
// como "nada pendiente".
import { createClient } from '@supabase/supabase-js'
import { textoVencimiento } from '@/lib/crm/formato-fecha'
import {
  estadoDeAviso,
  esperaDesde,
  grupoDeTarea,
  momentoDeAviso,
  resumenDeGrupos,
  tipoDeTarea,
  type GrupoTarea,
  type TipoTarea,
} from '@/lib/tareas/agenda'
import { enlaceDeTarea } from '@/lib/tareas/enlace'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const PAGINA_BASE = 1000
/** Tope de filas: más es un error explícito, nunca una lista cortada en silencio. */
export const TOPE_AGENDA = 5000
export const PAGINA_SIN_FECHA = 25
export const LO_QUE_VIENE = 3

const COLUMNAS =
  'id, type, title, status, assigned_to, contact_id, deal_id, appraisal_id, property_id, source_activity_id, ' +
  'due_date, due_time, all_day, channel, created_at, contacto:contact_id(id, full_name), proceso:deal_id(created_at)'

interface FilaTarea {
  id: string
  type: string
  title: string
  status: string
  assigned_to: string | null
  contact_id: string | null
  deal_id: string | null
  appraisal_id: string | null
  property_id: string | null
  source_activity_id: string | null
  due_date: string | null
  due_time: string | null
  all_day: boolean | null
  channel: string | null
  created_at: string
  contacto: { id: string; full_name: string | null } | null
  /** El alta del proceso: el registro real, para "Espera hace…" (auditoría, hallazgo 6). */
  proceso: { created_at: string | null } | null
}

/** Una tarea como la dibujan Pendientes y la campanita. */
export interface TareaDeAgenda {
  id: string
  /** El proceso de la tarea (el Inicio cruza la cola con las tareas por acá). */
  deal_id: string | null
  title: string
  tipo: TipoTarea
  due_date: string | null
  due_time: string | null
  todoElDia: boolean
  vencimiento: { texto: string; estado: string }
  enlace: string
  contacto: { id: string; nombre: string } | null
  asignado: { id: string; nombre: string } | null
}

function armar(f: FilaTarea, ahora: Date, nombres: ReadonlyMap<string, string>): TareaDeAgenda {
  const todoElDia = !f.due_time
  const espera = esperaDesde(f, f.proceso?.created_at ?? null)
  return {
    id: f.id,
    deal_id: f.deal_id,
    title: f.title,
    tipo: tipoDeTarea(f),
    due_date: f.due_date,
    due_time: f.due_time ? f.due_time.slice(0, 5) : null,
    todoElDia,
    vencimiento: textoVencimiento(f, ahora, { todoElDia, ...(espera ? { espera: { registradoEn: espera } } : {}) }),
    enlace: enlaceDeTarea(f),
    contacto: f.contacto ? { id: f.contacto.id, nombre: f.contacto.full_name?.trim() || 'Sin nombre' } : null,
    asignado: f.assigned_to ? { id: f.assigned_to, nombre: nombres.get(f.assigned_to) ?? 'Sin nombre' } : null,
  }
}

async function nombresDe(ids: string[]): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  if (ids.length === 0) return nombres
  const { data, error } = await getAdmin().from('profiles').select('id, full_name').in('id', ids)
  if (error) throw new Error(`nombres: ${error.message}`)
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) nombres.set(p.id, p.full_name?.trim() || 'Sin nombre')
  return nombres
}

async function leerPendientes(asignados: string[] | 'todos', soloConFecha: boolean): Promise<FilaTarea[]> {
  const todas: FilaTarea[] = []
  for (let desde = 0; ; desde += PAGINA_BASE) {
    let q = getAdmin().from('tasks').select(COLUMNAS).eq('status', 'pending')
    if (asignados !== 'todos') q = q.in('assigned_to', asignados)
    if (soloConFecha) q = q.not('due_date', 'is', null)
    const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(desde, desde + PAGINA_BASE - 1)
    if (error) throw new Error(`tareas pendientes: ${error.message}`)
    const filas = (data ?? []) as unknown as FilaTarea[]
    todas.push(...filas)
    if (filas.length < PAGINA_BASE) return todas
    if (todas.length >= TOPE_AGENDA) throw new Error(`más de ${TOPE_AGENDA} tareas pendientes en la selección`)
  }
}

const porVencimiento = (a: FilaTarea, b: FilaTarea) =>
  (momentoDeAviso(a)?.getTime() ?? 0) - (momentoDeAviso(b)?.getTime() ?? 0) || a.id.localeCompare(b.id)

/** Personas para el filtro "De quién": las activas, incluido quien no puede recibir tareas nuevas. */
export async function leerPersonas(): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await getAdmin().from('profiles').select('id, full_name').eq('is_active', true)
  if (error) throw new Error(`personas: ${error.message}`)
  return ((data ?? []) as { id: string; full_name: string | null }[])
    .map((p) => ({ id: p.id, nombre: p.full_name?.trim() || 'Sin nombre' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export interface Agenda {
  grupos: Record<'vencidas' | 'hoy' | 'proximas', TareaDeAgenda[]>
  sinFecha: { total: number; quedan: number; items: TareaDeAgenda[] }
  cantidades: Record<GrupoTarea, number>
  /** Por tipo, ANTES del filtro de tipo (los botones muestran cuántas hay de cada uno). */
  porTipo: Partial<Record<TipoTarea, number>>
  resumen: string
}

export async function leerAgenda(
  sel: { asignados: string[] | 'todos'; tipo: TipoTarea | null; sinFechaDesde: number },
  ahora: Date,
): Promise<Agenda> {
  const filas = await leerPendientes(sel.asignados, false)
  const porTipo: Partial<Record<TipoTarea, number>> = {}
  for (const f of filas) {
    const t = tipoDeTarea(f)
    porTipo[t] = (porTipo[t] ?? 0) + 1
  }
  const elegidas = sel.tipo ? filas.filter((f) => tipoDeTarea(f) === sel.tipo) : filas
  const enGrupo: Record<GrupoTarea, FilaTarea[]> = { vencidas: [], hoy: [], proximas: [], sin_fecha: [] }
  for (const f of elegidas) enGrupo[grupoDeTarea(f, ahora)].push(f)
  const desde = Math.max(0, Math.floor(sel.sinFechaDesde))
  // Las sin fecha ya vienen de la más nueva a la más vieja.
  const pagina = enGrupo.sin_fecha.slice(desde, desde + PAGINA_SIN_FECHA)
  const conFecha = [...enGrupo.vencidas, ...enGrupo.hoy, ...enGrupo.proximas]
  const nombres = await nombresDe([...new Set([...conFecha, ...pagina].map((f) => f.assigned_to).filter((x): x is string => !!x))])
  const cantidades = {
    vencidas: enGrupo.vencidas.length,
    hoy: enGrupo.hoy.length,
    proximas: enGrupo.proximas.length,
    sin_fecha: enGrupo.sin_fecha.length,
  }
  return {
    grupos: {
      vencidas: [...enGrupo.vencidas].sort(porVencimiento).map((f) => armar(f, ahora, nombres)),
      hoy: [...enGrupo.hoy].sort(porVencimiento).map((f) => armar(f, ahora, nombres)),
      proximas: [...enGrupo.proximas].sort(porVencimiento).map((f) => armar(f, ahora, nombres)),
    },
    sinFecha: {
      total: enGrupo.sin_fecha.length,
      quedan: Math.max(0, enGrupo.sin_fecha.length - desde - pagina.length),
      items: pagina.map((f) => armar(f, ahora, nombres)),
    },
    cantidades,
    porTipo,
    resumen: resumenDeGrupos(cantidades),
  }
}

export interface Avisos {
  vencidas: TareaDeAgenda[]
  ahora: TareaDeAgenda[]
  loQueViene: TareaDeAgenda[]
  total: number
}

/** La campanita de una persona: solo sus tareas con fecha. */
export async function leerAvisos(usuarioId: string, ahora: Date, corte: Date): Promise<Avisos> {
  const filas = (await leerPendientes([usuarioId], true)).sort(porVencimiento)
  const nombres = new Map<string, string>()
  const vencidas: TareaDeAgenda[] = []
  const enHora: TareaDeAgenda[] = []
  const loQueViene: TareaDeAgenda[] = []
  for (const f of filas) {
    const estado = estadoDeAviso(f, ahora, corte)
    if (estado === 'vencida') vencidas.push(armar(f, ahora, nombres))
    else if (estado === 'ahora') enHora.push(armar(f, ahora, nombres))
    else if (loQueViene.length < LO_QUE_VIENE && (momentoDeAviso(f)?.getTime() ?? 0) > ahora.getTime()) loQueViene.push(armar(f, ahora, nombres))
  }
  return { vencidas, ahora: enHora, loQueViene, total: vencidas.length + enHora.length }
}
