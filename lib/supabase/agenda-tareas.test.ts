/**
 * Lecturas de Pendientes y de la campanita (crm-tareas-y-campanita, D2) contra la base
 * simulada que aplica los filtros de verdad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from './cartera.simulada'

const m = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))

import { leerAgenda, leerAvisos } from './agenda-tareas'

const PAULA = '00000000-0000-4000-8000-0000000000a1'
const TOMAS = '00000000-0000-4000-8000-0000000000a2'
const C1 = '00000000-0000-4000-8000-0000000000c1'
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`)
const AHORA = ar('2026-11-24', '11:00') // martes
const CORTE = ar('2026-11-01', '00:00')

let n = 0
function tarea(o: Record<string, unknown>) {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    type: 'follow_up', title: `Tarea ${n}`, description: null, status: 'pending', assigned_to: PAULA,
    contact_id: null, deal_id: null, appraisal_id: null, property_id: null, source_activity_id: null,
    due_date: null, due_time: null, all_day: true, channel: 'call',
    created_at: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(), ...o,
  }
}

let base: ReturnType<typeof baseSimulada>
function usar(tasks: Record<string, unknown>[], o: OpcionesBaseSimulada = {}) {
  base = baseSimulada(
    {
      tasks,
      profiles: [
        { id: PAULA, full_name: 'Paula', role: 'coordinador', is_active: true },
        { id: TOMAS, full_name: 'Tomás', role: 'asesor', is_active: true },
      ],
      contacts: [{ id: C1, full_name: 'Marcela Ibáñez' }],
    },
    o,
  )
  m.cliente = base.cliente
}

beforeEach(() => {
  n = 0
})

describe('leerAgenda', () => {
  it('grupos completos, sin fecha paginado de a 25 y cantidades exactas', async () => {
    usar([
      tarea({ due_date: '2026-11-24', due_time: '10:30:00', all_day: false, contact_id: C1 }), // vencida
      tarea({ due_date: '2026-11-24', due_time: '15:00:00', all_day: false }), // hoy
      tarea({ due_date: '2026-12-01' }), // próxima
      ...Array.from({ length: 30 }, () => tarea({ type: 'update_contact', channel: null })), // sin fecha
      tarea({ assigned_to: TOMAS, due_date: '2026-11-24' }), // de otro
      tarea({ status: 'completed', due_date: '2026-11-24' }), // cerrada
    ])
    const r = await leerAgenda({ asignados: [PAULA], tipo: null, sinFechaDesde: 0 }, AHORA)
    expect(r.grupos.vencidas.map((x) => x.title)).toEqual(['Tarea 1'])
    expect(r.grupos.vencidas[0]).toMatchObject({ contacto: { id: C1, nombre: 'Marcela Ibáñez' }, asignado: { id: PAULA, nombre: 'Paula' }, tipo: 'llamada' })
    expect(r.grupos.hoy).toHaveLength(1)
    expect(r.grupos.proximas).toHaveLength(1)
    expect(r.sinFecha).toMatchObject({ total: 30, quedan: 5 })
    expect(r.sinFecha.items).toHaveLength(25)
    // Más nueva primero.
    expect(r.sinFecha.items[0].title).toBe('Tarea 33')
    expect(r.cantidades).toEqual({ vencidas: 1, hoy: 1, proximas: 1, sin_fecha: 30 })
    expect(r.porTipo).toEqual({ llamada: 33 })
    expect(r.resumen).toBe('1 vencida · 1 para hoy · 1 próxima · 30 sin fecha')
  })

  it('"Mostrar 25 más" trae las que siguen', async () => {
    usar(Array.from({ length: 30 }, () => tarea({})))
    const r = await leerAgenda({ asignados: [PAULA], tipo: null, sinFechaDesde: 25 }, AHORA)
    expect(r.sinFecha.items).toHaveLength(5)
    expect(r.sinFecha.quedan).toBe(0)
  })

  it('filtro de tipo: la lista y el resumen se filtran; las cantidades por tipo, no', async () => {
    usar([tarea({ channel: 'call', due_date: '2026-11-25' }), tarea({ channel: 'visit', due_date: '2026-11-25' })])
    const r = await leerAgenda({ asignados: [PAULA], tipo: 'visita', sinFechaDesde: 0 }, AHORA)
    expect(r.grupos.proximas.map((x) => x.tipo)).toEqual(['visita'])
    expect(r.resumen).toBe('1 próxima')
    expect(r.porTipo).toEqual({ llamada: 1, visita: 1 })
  })

  it('todo el equipo: también las de otros', async () => {
    usar([tarea({}), tarea({ assigned_to: TOMAS })])
    const r = await leerAgenda({ asignados: 'todos', tipo: null, sinFechaDesde: 0 }, AHORA)
    expect(r.sinFecha.total).toBe(2)
    expect(base.consultas.find((c) => c.tabla === 'tasks')!.filtros.some((f) => f.startsWith('in:assigned_to'))).toBe(false)
  })

  it('pide solo las pendientes y de a 1000', async () => {
    usar(Array.from({ length: 1200 }, () => tarea({})), { tope: 1000 })
    const r = await leerAgenda({ asignados: [PAULA], tipo: null, sinFechaDesde: 0 }, AHORA)
    expect(r.sinFecha.total).toBe(1200)
    const qs = base.consultas.filter((c) => c.tabla === 'tasks')
    expect(qs.every((c) => c.filtros.includes('eq:status=pending'))).toBe(true)
    expect(qs.flatMap((c) => c.rangos)).toEqual([[0, 999], [1000, 1999]])
  })

  it('si la base falla, lanza (la ruta lo muestra como error, nunca como vacío)', async () => {
    usar([], { fallar: ['tasks'] })
    await expect(leerAgenda({ asignados: [PAULA], tipo: null, sinFechaDesde: 0 }, AHORA)).rejects.toThrow()
  })
})

describe('leerAvisos', () => {
  it('vencidas y ahora suman; lo que viene son las 3 próximas sin acciones', async () => {
    usar([
      tarea({ due_date: '2026-11-24', due_time: '10:30:00', all_day: false }), // vencida
      tarea({ due_date: '2026-11-24' }), // todo el día de hoy: ahora (son las 11)
      tarea({ due_date: '2026-11-24', due_time: '15:00:00', all_day: false }), // viene
      tarea({ due_date: '2026-11-25' }),
      tarea({ due_date: '2026-11-26' }),
      tarea({ due_date: '2026-11-27' }), // cuarta que viene: no entra
      tarea({ due_date: '2026-10-10' }), // vencida antes del corte: no suena
      tarea({}), // sin fecha: nunca
      tarea({ assigned_to: TOMAS, due_date: '2026-11-24' }), // de otro
    ])
    const r = await leerAvisos(PAULA, AHORA, CORTE)
    expect(r.vencidas.map((x) => x.title)).toEqual(['Tarea 1'])
    expect(r.ahora.map((x) => x.title)).toEqual(['Tarea 2'])
    expect(r.loQueViene.map((x) => x.title)).toEqual(['Tarea 3', 'Tarea 4', 'Tarea 5'])
    expect(r.total).toBe(2)
    const q = base.consultas.find((c) => c.tabla === 'tasks')!
    expect(q.filtros).toContain(`in:assigned_to=${PAULA}`)
  })
})
