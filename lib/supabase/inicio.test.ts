/**
 * Lecturas del Inicio (crm-inicio, D2). La cartera y la agenda tienen sus propias pruebas:
 * acá se simulan y se prueba lo que suma el Inicio, sobre una base que aplica los filtros.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from './cartera.simulada'
import type { FilaCartera } from '@/lib/crm/cartera'

const m = vi.hoisted(() => ({ cliente: null as unknown, filas: [] as unknown[], carteraFalla: false, fuenteFalla: false, agenda: vi.fn(), cartera: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))
vi.mock('./cartera', () => ({
  cargarCartera: async (...a: unknown[]) => {
    m.cartera(...a)
    if (m.carteraFalla) return { ok: false, motivo: 'error' }
    return { ok: true, datos: { filas: m.filas, truncado: false, fuentes: { ultimoContacto: m.fuenteFalla ? 'error' : 'ok', tareas: 'ok' } } }
  },
}))
vi.mock('./agenda-tareas', () => ({ leerAgenda: m.agenda }))

import { leerInicio } from './inicio'

const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`)
const AHORA = ar('2026-12-02', '10:40') // miércoles
const PAULA = '00000000-0000-4000-8000-0000000000a1'
const JULIA = '00000000-0000-4000-8000-0000000000a4'
const TOMAS = '00000000-0000-4000-8000-0000000000a2'
const BRUNO = '00000000-0000-4000-8000-0000000000a3'

const fila = (o: Partial<FilaCartera>): FilaCartera => ({
  id: 'd1', contactoId: 'c1', nombre: 'Marcela', telefono: '1155550142', email: null, propiedad: 'Depto', direccion: 'Yatay 540',
  etapa: 'solicitud', abierto: true, origen: 'embudo', asesor: null, creadoEn: ar('2026-12-02', '10:12').toISOString(), cerradoEn: null,
  colega: false, anteriorAlRegistro: false, ultimoContacto: null, proximo: null, tasacion: null, ...o,
})

let base: ReturnType<typeof baseSimulada>
function usar(t: Record<string, Record<string, unknown>[]>, o: OpcionesBaseSimulada = {}) {
  base = baseSimulada({
    profiles: [
      { id: PAULA, role: 'coordinador', is_active: true },
      { id: JULIA, role: 'coordinador', is_active: true },
      { id: TOMAS, role: 'asesor', is_active: true },
      { id: BRUNO, role: 'asesor', is_active: true },
    ],
    deals: [], contact_activities: [], property_visits: [], properties: [], tasks: [], ...t,
  }, o)
  m.cliente = base.cliente
}
const agendaVacia = { grupos: { vencidas: [], hoy: [], proximas: [] }, sinFecha: { total: 0, quedan: 0, items: [] }, cantidades: {}, porTipo: {}, resumen: '' }

beforeEach(() => {
  m.filas = []
  m.carteraFalla = false
  m.fuenteFalla = false
  m.cartera.mockReset()
  m.agenda.mockReset()
  m.agenda.mockResolvedValue(agendaVacia)
})

describe('leerInicio', () => {
  it('rol sin Inicio → null', async () => {
    usar({})
    expect(await leerInicio({ id: 'x', role: 'abogado', nombre: 'L' }, AHORA)).toBeNull()
  })

  it('coordinación: bloques, saludo y números del día', async () => {
    m.filas = [fila({})]
    usar({
      deals: [
        { id: 'n1', created_at: ar('2026-12-02', '09:00').toISOString(), stage: 'request', origin: 'embudo' },
        { id: 'n2', created_at: ar('2026-12-02', '09:30').toISOString(), stage: 'clase_gratuita', origin: 'clase_gratuita' },
        { id: 'n3', created_at: ar('2026-12-01', '09:00').toISOString(), stage: 'request', origin: 'embudo' },
        { id: 'n4', created_at: ar('2026-12-02', '09:40').toISOString(), stage: 'request', origin: 'referido' },
      ],
      contact_activities: [
        { id: 'a1', kind: 'call', call_outcome: 'agendo', voided_at: null, occurred_at: ar('2026-12-02', '10:00').toISOString() },
        { id: 'a2', kind: 'call', call_outcome: 'no_atendio', voided_at: null, occurred_at: ar('2026-12-02', '10:10').toISOString() },
        { id: 'a3', kind: 'call', call_outcome: 'agendo', voided_at: ar('2026-12-02', '10:11').toISOString(), occurred_at: ar('2026-12-02', '10:05').toISOString() },
        { id: 'a4', kind: 'call', call_outcome: 'agendo', voided_at: null, occurred_at: ar('2026-12-01', '10:00').toISOString() },
      ],
    })
    const r = (await leerInicio({ id: PAULA, role: 'coordinador', nombre: 'Paula Pandolfo' }, AHORA))!
    expect(r.saludo).toBe('Hola, Paula')
    expect(Object.keys(r.bloques).sort()).toEqual(['numeros', 'paraLlamar', 'sinProximo', 'sinRespuesta', 'tareas', 'tasaciones'])
    expect(r.bloques.numeros).toEqual({ ok: true, datos: { solicitudes: 1, llamadas: 2, agendadas: 1, hasta: '10:40' } })
    expect((r.bloques.paraLlamar as { ok: true; datos: unknown[] }).datos).toHaveLength(1)
    // La cola es una sola: se leen las tareas de TODAS las coordinadoras; "Tareas de hoy", las propias.
    expect(m.agenda.mock.calls.map((c) => [...c[0].asignados].sort())).toEqual(expect.arrayContaining([[PAULA, JULIA].sort(), [PAULA]]))
    // La cartera se lee completa (vista del dueño): los datos no salen del servidor.
    expect(m.cartera.mock.calls[0][0]).toMatchObject({ quien: { id: PAULA, role: 'dueno' } })
  })

  it('una solicitud contactada sin tareas cae en "sin próximo paso"; una tarea solo del contacto la saca', async () => {
    const contactada = { at: ar('2026-11-30', '10:00').toISOString(), que: 'llamada' as const, resultado: 'no_atendio' as const }
    m.filas = [
      fila({ id: 'd1', contactoId: 'c1', nombre: 'Sin tarea', creadoEn: ar('2026-11-27', '10:00').toISOString(), ultimoContacto: contactada }),
      fila({ id: 'd2', contactoId: 'c2', nombre: 'Con tarea de ficha', creadoEn: ar('2026-11-27', '10:00').toISOString(), ultimoContacto: contactada }),
    ]
    usar({
      tasks: [{ id: 't1', deal_id: null, contact_id: 'c2', status: 'pending' }],
      contact_activities: [{ id: 'a1', deal_id: 'd1', kind: 'call', call_outcome: 'no_atendio', voided_at: null, occurred_at: contactada.at, created_at: contactada.at }],
    })
    const r = (await leerInicio({ id: PAULA, role: 'coordinador', nombre: 'Paula' }, AHORA))!
    expect((r.bloques.sinProximo as { ok: true; datos: { nombre: string }[] }).datos.map((x) => x.nombre)).toEqual(['Sin tarea'])
    expect(r.bloques.sinRespuesta).toEqual({ ok: true, datos: [] })
  })

  it('las tareas pendientes se leen todas, aunque pasen de 1000 (sin cortes en silencio)', async () => {
    const contactada = { at: ar('2026-11-30', '10:00').toISOString(), que: 'llamada' as const, resultado: 'no_atendio' as const }
    m.filas = [fila({ id: 'd1', contactoId: 'c1', nombre: 'Con tarea al final', creadoEn: ar('2026-11-27', '10:00').toISOString(), ultimoContacto: contactada })]
    const tasks = Array.from({ length: 1500 }, (_, i) => ({ id: `t${String(i).padStart(5, '0')}`, deal_id: `otro${i}`, contact_id: null, status: 'pending' }))
    tasks.push({ id: 't99999', deal_id: 'd1', contact_id: null, status: 'pending' })
    usar({ tasks }, { tope: 1000 })
    const r = (await leerInicio({ id: PAULA, role: 'coordinador', nombre: 'Paula' }, AHORA))!
    expect(r.bloques.sinProximo).toEqual({ ok: true, datos: [] })
  })

  it('una fuente de la cartera que falló no se muestra como vacía', async () => {
    m.fuenteFalla = true
    usar({})
    const r = (await leerInicio({ id: PAULA, role: 'coordinador', nombre: 'Paula' }, AHORA))!
    expect(r.bloques.paraLlamar).toEqual({ ok: false })
    expect(r.bloques.sinProximo).toEqual({ ok: false })
    expect(r.bloques.numeros.ok).toBe(true)
  })

  it('dueño: tareas de toda la coordinación, leads sin contacto y tiempo medio', async () => {
    m.filas = [fila({})]
    usar({
      deals: [
        { id: 'l1', created_at: ar('2026-11-30', '09:00').toISOString(), stage: 'request', origin: 'embudo' },
        { id: 'l2', created_at: ar('2026-12-01', '09:00').toISOString(), stage: 'scheduled', origin: 'embudo' },
        { id: 'l3', created_at: ar('2026-12-01', '09:00').toISOString(), stage: 'request', origin: 'referido' },
      ],
      contact_activities: [{ id: 'x', deal_id: 'l1', kind: 'call', voided_at: null, occurred_at: ar('2026-11-30', '10:00').toISOString() }],
    })
    const r = (await leerInicio({ id: 'u-d', role: 'dueno', nombre: 'Diego' }, AHORA))!
    expect(r.saludo).toBe('Inicio · vista del dueño')
    expect(Object.keys(r.bloques).sort()).toEqual(['leadsSinContacto', 'numeros', 'paraLlamar', 'sinProximo', 'sinRespuesta', 'tareas', 'tasaciones', 'tiempoMedio'])
    expect(r.bloques.tiempoMedio).toEqual({ ok: true, datos: { n: 1, sinLlamar: 1, reloj: '1 h', habiles: '1 h', pocos: true } })
    expect(m.agenda.mock.calls[0][0].asignados.sort()).toEqual([PAULA, JULIA].sort())
  })

  it('asesor: solo lo suyo (visitas y fechas filtran por él)', async () => {
    m.filas = [fila({ id: 'r1', etapa: 'realizada', asesor: { id: TOMAS, nombre: 'Tomás', activo: true } })]
    usar({
      deals: [{ id: 'r1', assigned_to: TOMAS, visited_at: ar('2026-11-28', '10:00').toISOString(), delivered_at: null }],
      property_visits: [
        { id: 'v1', advisor_id: TOMAS, scheduled_at: ar('2026-12-02', '15:00').toISOString(), client_name: 'Compradores', status: 'pending_confirmation', property_id: 'p1' },
        { id: 'v2', advisor_id: BRUNO, scheduled_at: ar('2026-12-02', '16:00').toISOString(), client_name: 'Ajena', status: 'pending_confirmation', property_id: 'p1' },
        { id: 'v3', advisor_id: TOMAS, scheduled_at: ar('2026-12-02', '17:00').toISOString(), client_name: 'Cancelada', status: 'cancelled', property_id: 'p1' },
      ],
      properties: [{ id: 'p1', address: 'Av. Rivadavia 5240' }],
    })
    const r = (await leerInicio({ id: TOMAS, role: 'asesor', nombre: 'Tomás Agüero' }, AHORA))!
    expect(Object.keys(r.bloques).sort()).toEqual(['procesos', 'tareas', 'visitas'])
    expect(r.bloques.visitas).toEqual({ ok: true, datos: [{ id: 'visita:v1', hora: '15:00', cliente: 'Compradores', direccion: 'Av. Rivadavia 5240', enlace: '/visits/v1' }] })
    expect((r.bloques.procesos as { ok: true; datos: { texto: string }[] }).datos[0].texto).toBe('Entregar la tasación: la visita fue hace 4 días.')
    expect(base.consultas.find((c) => c.tabla === 'deals')!.filtros).toContain(`eq:assigned_to=${TOMAS}`)
  })

  it('un bloque que falla no tapa a los demás', async () => {
    m.carteraFalla = true
    usar({})
    const r = (await leerInicio({ id: PAULA, role: 'coordinador', nombre: 'Paula' }, AHORA))!
    expect(r.bloques.paraLlamar).toEqual({ ok: false })
    expect(r.bloques.numeros.ok).toBe(true)
    expect(r.bloques.tareas.ok).toBe(true) // la cola falló, pero las tareas igual llegan
  })
})
