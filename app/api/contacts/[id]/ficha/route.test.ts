/**
 * GET /api/contacts/[id]/ficha (tarea 7.1). Las reglas de qué se ve están en
 * `lib/crm/ficha.test.ts`; acá: permisos, que el historial se lea solo para los
 * descartados recientes, y que la respuesta salga de `armarFicha` con lo leído.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DatosFicha, ProcesoDeFicha } from '@/lib/crm/ficha'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  canAccessContact: vi.fn(),
  leerDatosDeFicha: vi.fn(),
  ultimoCambioDeEtapa: vi.fn(),
  nombresDePerfiles: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: 'Quien mira', is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/contactos', () => ({ leerDatosDeFicha: m.leerDatosDeFicha }))
vi.mock('@/lib/supabase/deals', () => ({ ultimoCambioDeEtapa: m.ultimoCambioDeEtapa }))
vi.mock('@/lib/supabase/actividades', () => ({ nombresDePerfiles: m.nombresDePerfiles }))

import { GET } from './route'

const AHORA = new Date('2026-11-25T15:00:00.000Z')
const haceMin = (n: number) => new Date(AHORA.getTime() - n * 60_000).toISOString()
const get = (id = 'c-1') => GET(new Request(`http://local/api/contacts/${id}/ficha`) as never, { params: Promise.resolve({ id }) })
const como = (role: string, id: string) => {
  m.estado.role = role
  m.estado.id = id
}

const proceso = (p: Partial<ProcesoDeFicha> & { id: string }): ProcesoDeFicha => ({
  stage: 'request', created_at: '2026-11-20T10:00:00.000Z', assigned_to: null, scheduled_date: null, scheduled_time: null,
  origin: null, property_address: 'Calle 1', neighborhood: null, property_type: null, property_type_other: null, rooms: null,
  covered_area: null, meta_campaign_name: null, meta_adset_name: null, meta_ad_name: null,
  stage_changed_at: '2026-11-20T10:00:00.000Z', lost_at: null, visited_at: null, ...p,
})
const datos = (procesos: ProcesoDeFicha[] = [], ultimoIntentoEn: string | null = null): DatosFicha => ({
  contacto: { id: 'c-1', full_name: '[TEST] Ana', phone: null, email: null, origin: null, notes: null, assigned_to: null, created_by: null },
  procesos,
  tasaciones: [],
  propiedades: [],
  ultimoIntentoEn,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  m.canAccessContact.mockResolvedValue(true)
  m.leerDatosDeFicha.mockResolvedValue(datos())
  m.ultimoCambioDeEtapa.mockResolvedValue(null)
  m.nombresDePerfiles.mockResolvedValue(new Map())
})
afterEach(() => vi.useRealTimers())

describe('GET /api/contacts/[id]/ficha — permisos', () => {
  it('abogado → 403 sin leer nada', async () => {
    como('abogado', 'abo-1')
    expect((await get()).status).toBe(403)
    expect(m.leerDatosDeFicha).not.toHaveBeenCalled()
  })
  it('rol viejo agent → 403', async () => {
    como('agent', 'ag-1')
    expect((await get()).status).toBe(403)
  })
  it('asesor que no puede ver el contacto → 404 con el texto de siempre, sin leer la ficha', async () => {
    como('asesor', 'asesor-1')
    m.canAccessContact.mockResolvedValue(false)
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.leerDatosDeFicha).not.toHaveBeenCalled()
  })
  it('contacto inexistente → 404', async () => {
    m.leerDatosDeFicha.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })
  it('asesor con acceso → 200', async () => {
    como('asesor', 'asesor-1')
    expect((await get()).status).toBe(200)
  })
  it('falla la lectura → 500 sin el detalle', async () => {
    m.leerDatosDeFicha.mockRejectedValue(new Error('detalle interno'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await get()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('detalle interno')
    err.mockRestore()
  })
})

describe('GET /api/contacts/[id]/ficha — datos', () => {
  it('contacto sin procesos → 200 con listas vacías y sin contacto todavía', async () => {
    const body = await (await get()).json()
    expect(body).toMatchObject({ procesoActivo: null, procesos: [], tasacionesAgendadas: [], ultimoContacto: { texto: 'Sin contacto todavía' } })
    expect(m.ultimoCambioDeEtapa).not.toHaveBeenCalled()
  })

  it('el historial se lee SOLO para los procesos en lost con cambio reciente', async () => {
    m.leerDatosDeFicha.mockResolvedValue(
      datos([
        proceso({ id: 'lost-reciente', stage: 'lost', stage_changed_at: haceMin(2), lost_at: haceMin(2) }),
        proceso({ id: 'lost-viejo', stage: 'lost', stage_changed_at: haceMin(40) }),
        proceso({ id: 'abierto', stage: 'request', stage_changed_at: haceMin(1) }),
      ]),
    )
    m.ultimoCambioDeEtapa.mockResolvedValue({ from_stage: 'request', to_stage: 'lost', changed_at: haceMin(2) })
    const body = await (await get()).json()
    expect(m.ultimoCambioDeEtapa.mock.calls).toEqual([['lost-reciente']])
    const reciente = body.procesos.find((p: { id: string }) => p.id === 'lost-reciente')
    expect(reciente.deshacer_hasta).toBe(new Date(Date.parse(haceMin(2)) + 10 * 60_000).toISOString())
    expect(body.procesos.find((p: { id: string }) => p.id === 'lost-viejo').deshacer_hasta).toBeNull()
  })

  it('pide los nombres del asesor del contacto y de los procesos, y los usa', async () => {
    m.leerDatosDeFicha.mockResolvedValue(datos([proceso({ id: 'd-1', assigned_to: 'asesor-2' })]))
    m.nombresDePerfiles.mockResolvedValue(new Map([['asesor-2', 'Berta Asesora']]))
    const body = await (await get()).json()
    expect(m.nombresDePerfiles).toHaveBeenCalledWith(['asesor-2'])
    expect(body.detalles.asesor).toEqual({ mostrar: true, id: 'asesor-2', nombre: 'Berta Asesora' })
  })

  it('último contacto por persona: llamada de ayer de un proceso viejo + solicitud nueva → "ayer", sin alerta', async () => {
    m.leerDatosDeFicha.mockResolvedValue(datos([proceso({ id: 'd-nueva' })], '2026-11-24T15:00:00.000Z'))
    const body = await (await get()).json()
    expect(body.ultimoContacto).toMatchObject({ texto: 'Último contacto: ayer', alerta: false })
  })

  it('asesor con un proceso suyo y otro activo ajeno: en la respuesta no viaja nada del ajeno', async () => {
    como('asesor', 'asesor-1')
    m.leerDatosDeFicha.mockResolvedValue(
      datos([
        proceso({ id: 'd-mio', stage: 'lost', assigned_to: 'asesor-1', created_at: '2026-10-01T00:00:00.000Z' }),
        proceso({ id: 'd-otro', assigned_to: 'asesor-2', property_address: 'Calle Ajena 99', meta_campaign_name: 'Campaña Ajena', origin: 'embudo' }),
      ]),
    )
    m.nombresDePerfiles.mockResolvedValue(new Map([['asesor-2', 'Berta Asesora']]))
    const texto = await (await get()).text()
    // El id y la etapa del activo sí viajan (la cabecera y la cadencia los necesitan).
    for (const ajeno of ['Calle Ajena', 'Campaña Ajena', 'Berta Asesora', 'embudo']) expect(texto).not.toContain(ajeno)
    const body = JSON.parse(texto)
    expect(body.procesos.map((p: { id: string }) => p.id)).toEqual(['d-mio'])
    expect(body.detalles.etapa).toEqual({ clave: 'solicitud', etiqueta: 'Solicitud' })
  })
})
