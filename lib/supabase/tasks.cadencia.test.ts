import { describe, it, expect, vi, beforeEach } from 'vitest'

// Base simulada: cada `from(tabla)` arma un pedido que anota sus operaciones; al
// resolverse (await, .single(), .maybeSingle()) le pregunta a `responder` qué devolver.
type Op = [string, unknown[]]
interface Pedido { tabla: string; ops: Op[] }
type Respuesta = { data: unknown; error: { code?: string; message: string } | null }
let responder: (p: Pedido) => Respuesta
const pedidos: Pedido[] = []

function armarPedido(tabla: string) {
  const p: Pedido = { tabla, ops: [] }
  pedidos.push(p)
  const resolver = () => Promise.resolve(responder(p))
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'in', 'or', 'order', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      p.ops.push([m, args])
      return builder
    }
  }
  builder.single = () => { p.ops.push(['single', []]); return resolver() }
  builder.maybeSingle = () => { p.ops.push(['maybeSingle', []]); return resolver() }
  builder.then = (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) => resolver().then(ok, ko)
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => armarPedido(t) }),
}))

const {
  createTask,
  getPendingTasksForContact,
  createCadenceTask,
  closeTasksByActivity,
  undoTasksOfActivity,
  getTasksOfActivity,
} = await import('./tasks')

const tiene = (p: Pedido, metodo: string) => p.ops.some(([m]) => m === metodo)
const args = (p: Pedido, metodo: string) => p.ops.filter(([m]) => m === metodo).map(([, a]) => a)
const ok = (data: unknown): Respuesta => ({ data, error: null })
const filtraPor = (p: Pedido, col: string) => args(p, 'eq').some(([c]) => c === col)

beforeEach(() => {
  pedidos.length = 0
  responder = () => ok(null)
})

const entrada = {
  type: 'follow_up' as const,
  title: 'Llamada 2 a [TEST] Ana',
  assigned_to: 'coord-1',
  created_by: 'coord-1',
  deal_id: 'deal-1',
  contact_id: 'cont-1',
  channel: 'call' as const,
  due_date: '2026-11-27',
  due_time: '09:00',
  all_day: false,
  source_activity_id: 'act-1',
}

describe('createTask', () => {
  it('sin source_activity_id inserta la fila sin esa columna (una tarea a mano no apunta a ningún intento)', async () => {
    responder = () => ok({ id: 't-1' })
    const aMano = { ...entrada }
    delete (aMano as Partial<typeof entrada>).source_activity_id
    await createTask(aMano)
    const [fila] = args(pedidos[0], 'insert')[0] as [Record<string, unknown>]
    expect('source_activity_id' in fila).toBe(false)
  })
  it('con source_activity_id lo inserta', async () => {
    responder = () => ok({ id: 't-1' })
    await createTask(entrada)
    const [fila] = args(pedidos[0], 'insert')[0] as [Record<string, unknown>]
    expect(fila.source_activity_id).toBe('act-1')
  })
})

describe('createCadenceTask', () => {
  it('crea la tarea y devuelve yaExistia en falso', async () => {
    responder = () => ok({ id: 't-nueva' })
    expect(await createCadenceTask(entrada)).toEqual({ id: 't-nueva', yaExistia: false })
  })
  it('ante el choque 23505 devuelve la tarea que ya existía', async () => {
    responder = (p) =>
      tiene(p, 'insert')
        ? { data: null, error: { code: '23505', message: 'duplicate key uq_tasks_source_activity' } }
        : ok({ id: 't-vieja' })
    expect(await createCadenceTask(entrada)).toEqual({ id: 't-vieja', yaExistia: true })
    expect(args(pedidos[1], 'eq')).toContainEqual(['source_activity_id', 'act-1'])
  })
  it('si choca y no encuentra la existente, tira', async () => {
    responder = (p) =>
      tiene(p, 'insert') ? { data: null, error: { code: '23505', message: 'dup' } } : ok(null)
    await expect(createCadenceTask(entrada)).rejects.toThrow()
  })
  it('otro error de la base tira (no se traga)', async () => {
    responder = () => ({ data: null, error: { code: '42501', message: 'sin permiso' } })
    await expect(createCadenceTask(entrada)).rejects.toThrow('sin permiso')
  })
})

describe('closeTasksByActivity', () => {
  it('con la lista vacía no toca la base', async () => {
    expect(await closeTasksByActivity([], 'act-1')).toEqual([])
    expect(pedidos).toHaveLength(0)
  })
  it('cierra solo pendientes y marca la actividad que las cerró', async () => {
    responder = () => ok([{ id: 't-1' }])
    expect(await closeTasksByActivity(['t-1', 't-2'], 'act-1')).toEqual(['t-1'])
    const p = pedidos[0]
    const [cambios] = args(p, 'update')[0] as [Record<string, unknown>]
    expect(cambios.status).toBe('completed')
    expect(cambios.closed_by_activity_id).toBe('act-1')
    expect(typeof cambios.completed_at).toBe('string')
    expect(args(p, 'in')).toContainEqual(['id', ['t-1', 't-2']])
    expect(args(p, 'eq')).toContainEqual(['status', 'pending'])
  })
  it('un error de la base tira', async () => {
    responder = () => ({ data: null, error: { message: 'caída' } })
    await expect(closeTasksByActivity(['t-1'], 'act-1')).rejects.toThrow('caída')
  })
})

describe('undoTasksOfActivity', () => {
  it('descarta la creada y reabre las cerradas con pending, completed_at y closed_by vacíos', async () => {
    responder = (p) => {
      if (tiene(p, 'update') && filtraPor(p, 'source_activity_id')) return ok([{ id: 'creada' }])
      if (tiene(p, 'update')) return ok([{ id: 'x' }])
      return ok([{ id: 'c-1' }, { id: 'c-2' }])
    }
    expect(await undoTasksOfActivity('act-1')).toEqual({ descartadas: 1, reabiertas: 2 })
    const descarte = pedidos[0]
    expect((args(descarte, 'update')[0] as [Record<string, unknown>])[0].status).toBe('dismissed')
    expect(args(descarte, 'eq')).toContainEqual(['status', 'pending'])
    const reapertura = pedidos.filter((p) => tiene(p, 'update')).slice(1)
    expect(reapertura).toHaveLength(2)
    for (const p of reapertura) {
      expect(args(p, 'update')[0]).toEqual([{ status: 'pending', completed_at: null, closed_by_activity_id: null }])
      expect(args(p, 'eq')).toContainEqual(['status', 'completed'])
    }
  })
  it('saltea la que choca con un índice único de pendientes y sigue con las demás', async () => {
    responder = (p) => {
      if (tiene(p, 'update') && filtraPor(p, 'source_activity_id')) return ok([])
      if (tiene(p, 'update') && args(p, 'eq').some(([c, v]) => c === 'id' && v === 'c-1'))
        return { data: null, error: { code: '23505', message: 'dup' } }
      if (tiene(p, 'update')) return ok([{ id: 'c-2' }])
      return ok([{ id: 'c-1' }, { id: 'c-2' }])
    }
    expect(await undoTasksOfActivity('act-1')).toEqual({ descartadas: 0, reabiertas: 1 })
  })
  it('deshacer por segunda vez no cambia nada', async () => {
    responder = () => ok([])
    expect(await undoTasksOfActivity('act-1')).toEqual({ descartadas: 0, reabiertas: 0 })
    expect(pedidos.filter((p) => tiene(p, 'update'))).toHaveLength(1)
  })
  it('después de un fallo a mitad completa solo lo que faltaba', async () => {
    // La primera corrida descartó la creada y reabrió c-1; quedó cerrada solo c-2.
    responder = (p) => {
      if (tiene(p, 'update') && filtraPor(p, 'source_activity_id')) return ok([])
      if (tiene(p, 'update')) return ok([{ id: 'c-2' }])
      return ok([{ id: 'c-2' }])
    }
    expect(await undoTasksOfActivity('act-1')).toEqual({ descartadas: 0, reabiertas: 1 })
  })
  it('otro error al reabrir tira', async () => {
    responder = (p) => {
      if (tiene(p, 'update') && filtraPor(p, 'source_activity_id')) return ok([])
      if (tiene(p, 'update')) return { data: null, error: { code: '42P01', message: 'tabla' } }
      return ok([{ id: 'c-1' }])
    }
    await expect(undoTasksOfActivity('act-1')).rejects.toThrow('tabla')
  })
})

describe('getTasksOfActivity', () => {
  it('devuelve la creada (sin las descartadas) y las cerradas (solo completadas)', async () => {
    responder = (p) =>
      filtraPor(p, 'source_activity_id')
        ? ok({ id: 't-c', title: 'Llamada 2 a Ana', due_date: '2026-11-27', due_time: '09:00:00', channel: 'call' })
        : ok([{ id: 't-x', title: 'Contactar a Ana' }])
    expect(await getTasksOfActivity('act-1')).toEqual({
      creada: { id: 't-c', title: 'Llamada 2 a Ana', due_date: '2026-11-27', due_time: '09:00:00', channel: 'call' },
      cerradas: [{ id: 't-x', title: 'Contactar a Ana' }],
    })
    const creada = pedidos.find((p) => filtraPor(p, 'source_activity_id'))
    expect(creada && args(creada, 'neq')).toContainEqual(['status', 'dismissed'])
    const cerradas = pedidos.find((p) => filtraPor(p, 'closed_by_activity_id'))
    expect(cerradas && args(cerradas, 'eq')).toContainEqual(['status', 'completed'])
  })
  it('una tarea reabierta no figura como cerrada (el filtro por completed la saca)', async () => {
    responder = (p) => (filtraPor(p, 'source_activity_id') ? ok(null) : ok([]))
    expect(await getTasksOfActivity('act-1')).toEqual({ creada: null, cerradas: [] })
  })
  it('un error de la base tira', async () => {
    responder = () => ({ data: null, error: { message: 'red' } })
    await expect(getTasksOfActivity('act-1')).rejects.toThrow('red')
  })
})

describe('getPendingTasksForContact', () => {
  const fila = (id: string, assigned_to: string | null) => ({
    id, title: `Tarea ${id}`, type: 'follow_up', channel: 'call', assigned_to, created_at: '2026-11-25T12:00:00Z',
    deal_id: null, contact_id: 'cont-1', appraisal_id: null, source_activity_id: null, description: null,
    due_date: '2026-11-26', due_time: '09:00:00', all_day: false, status: 'pending',
  })
  it('completa nombre y rol del asignado con una segunda consulta a profiles', async () => {
    responder = (p) =>
      p.tabla === 'profiles'
        ? ok([
            { id: 'coord-1', full_name: 'Paula', role: 'coordinador' },
            { id: 'ase-1', full_name: 'Lucas', role: 'asesor' },
          ])
        : ok([fila('a', 'coord-1'), fila('b', 'ase-1'), fila('c', null), fila('d', 'borrado')])
    const r = await getPendingTasksForContact('cont-1', ['deal-1'])
    expect(r.map((t) => [t.id, t.assigned_role, t.assigned_name])).toEqual([
      ['a', 'coordinador', 'Paula'],
      ['b', 'asesor', 'Lucas'],
      ['c', null, null],
      ['d', null, null],
    ])
    expect(pedidos.map((p) => p.tabla)).toEqual(['tasks', 'profiles'])
    expect(args(pedidos[0], 'eq')).toContainEqual(['status', 'pending'])
    expect(args(pedidos[0], 'or')[0]).toEqual(['contact_id.eq.cont-1,deal_id.in.(deal-1)'])
    expect(args(pedidos[1], 'in')).toContainEqual(['id', ['coord-1', 'ase-1', 'borrado']])
  })
  it('sin procesos filtra solo por contacto', async () => {
    responder = () => ok([])
    await getPendingTasksForContact('cont-1', [])
    expect(args(pedidos[0], 'eq')).toContainEqual(['contact_id', 'cont-1'])
    expect(tiene(pedidos[0], 'or')).toBe(false)
  })
  it('sin tareas no consulta profiles', async () => {
    responder = () => ok([])
    expect(await getPendingTasksForContact('cont-1', ['deal-1'])).toEqual([])
    expect(pedidos).toHaveLength(1)
  })
  it('ids de proceso que no son uuid ni texto simple se rechazan (no se meten en el filtro)', async () => {
    await expect(getPendingTasksForContact('cont-1', ['a),contact_id.neq.(x'])).rejects.toThrow()
  })
  it('un error al leer las tareas tira', async () => {
    responder = () => ({ data: null, error: { message: 'red' } })
    await expect(getPendingTasksForContact('cont-1', [])).rejects.toThrow('red')
  })
  it('un error al leer profiles tira (no devuelve roles vacíos que cambiarían el cierre)', async () => {
    responder = (p) => (p.tabla === 'profiles' ? { data: null, error: { message: 'perfiles' } } : ok([fila('a', 'x')]))
    await expect(getPendingTasksForContact('cont-1', [])).rejects.toThrow('perfiles')
  })
})
