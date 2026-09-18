import { describe, it, expect } from 'vitest'
import { planificarReparacion, type PropiedadR, type ProcesoR } from './reparacion-procesos'

const prop = (p: Partial<PropiedadR> & { id: string }): PropiedadR => ({
  appraisal_id: null, created_at: '2026-09-01T00:00:00Z', status: 'approved', commercial_status: 'disponible',
  address: 'Calle 1', expensas: null, portal_data: null, landing_answers: null, ...p,
})
const proc = (d: Partial<ProcesoR> & { id: string }): ProcesoR => ({
  appraisal_id: null, property_id: null, stage: 'appraisal_sent', property_address: 'Calle 1',
  assigned_to: 'asesor-1', contactoNombre: 'Marta Gómez', contactoTelefono: '1155554444', contactoEmail: 'marta@example.com', visit_data: null, ...d,
})

describe('planificarReparacion — vínculos', () => {
  it('vincula una captación con el proceso de su tasación', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1' })],
      procesos: [proc({ id: 'd1', appraisal_id: 't1' })],
      tasaciones: [{ id: 't1', titulo: 'Salta 297' }],
    })
    expect(plan.vincular).toEqual([expect.objectContaining({ dealId: 'd1', propertyId: 'p1', etapaAntes: 'appraisal_sent' })])
    expect(plan.descartar).toEqual([])
  })

  it('Hipólito: dos fichas de la misma tasación → se queda la MÁS NUEVA y la otra se descarta', () => {
    const plan = planificarReparacion({
      propiedades: [
        prop({ id: 'vieja', appraisal_id: 't1', created_at: '2026-09-14T10:00:00Z' }),
        prop({ id: 'nueva', appraisal_id: 't1', created_at: '2026-09-17T13:16:00Z' }),
      ],
      procesos: [proc({ id: 'd1', appraisal_id: 't1' })],
      tasaciones: [{ id: 't1', titulo: 'Av. Hipólito Yrigoyen 1550' }],
    })
    expect(plan.vincular.map(v => v.propertyId)).toEqual(['nueva'])
    expect(plan.descartar).toEqual([expect.objectContaining({ propertyId: 'vieja', conservaId: 'nueva' })])
    expect(plan.descartar[0].motivo).toMatch(/más nueva/)
  })

  it('una ficha ya descartada no cuenta como duplicado', () => {
    const plan = planificarReparacion({
      propiedades: [
        prop({ id: 'vieja', appraisal_id: 't1', status: 'descartada', commercial_status: 'descartada' }),
        prop({ id: 'nueva', appraisal_id: 't1', created_at: '2026-09-17T00:00:00Z' }),
      ],
      procesos: [proc({ id: 'd1', appraisal_id: 't1' })],
      tasaciones: [],
    })
    expect(plan.vincular.map(v => v.propertyId)).toEqual(['nueva'])
    expect(plan.descartar).toEqual([])
  })

  it('un proceso ya vinculado a una ficha activa no se toca, y la otra ficha es un conflicto (no se descarta sola)', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1' }), prop({ id: 'p2', appraisal_id: 't1', created_at: '2026-09-20T00:00:00Z' })],
      procesos: [proc({ id: 'd1', appraisal_id: 't1', property_id: 'p1', stage: 'captured' })],
      tasaciones: [],
    })
    expect(plan.vincular).toEqual([])
    expect(plan.descartar).toEqual([])
    expect(plan.conflictos).toEqual([expect.objectContaining({ tipo: 'ya_vinculado_a_otra' })])
  })

  it('ya vinculado a la única ficha: no hay nada que hacer', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1' })],
      procesos: [proc({ id: 'd1', appraisal_id: 't1', property_id: 'p1', stage: 'captured' })],
      tasaciones: [],
    })
    expect(plan.vincular).toEqual([])
    expect(plan.conflictos).toEqual([])
  })

  it('si la tasación tiene dos procesos no adivina: conflicto', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1' })],
      procesos: [proc({ id: 'd1', appraisal_id: 't1' }), proc({ id: 'd2', appraisal_id: 't1' })],
      tasaciones: [],
    })
    expect(plan.vincular).toEqual([])
    expect(plan.conflictos).toEqual([expect.objectContaining({ tipo: 'varios_procesos' })])
  })

  it('un proceso DESCARTADO con captación no se reabre solo: lo decide una persona', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1' })],
      procesos: [proc({ id: 'd1', appraisal_id: 't1', stage: 'lost' })],
      tasaciones: [],
    })
    expect(plan.vincular).toEqual([])
    expect(plan.conflictos).toEqual([expect.objectContaining({ tipo: 'proceso_descartado' })])
  })

  it('hereda lo de la visita SOLO en lo que la ficha tiene vacío', () => {
    const plan = planificarReparacion({
      propiedades: [prop({ id: 'p1', appraisal_id: 't1', expensas: 50000 })],
      procesos: [proc({
        id: 'd1', appraisal_id: 't1',
        visit_data: { sale: null, portales: { expensas: 85000, ml: { HAS_LIFT: { value_name: 'Sí' } }, ap: {} }, landing: { q1: 'Pareja' } },
      })],
      tasaciones: [],
    })
    const h = plan.vincular[0].heredar
    expect(h).not.toHaveProperty('expensas') // la ficha ya tenía: no se pisa
    expect(h.portal_data?.ml).toHaveProperty('HAS_LIFT')
    expect(h.landing_answers).toEqual({ q1: 'Pareja' })
  })
})

describe('planificarReparacion — listados para el equipo', () => {
  it('lista los procesos incompletos, pero no las solicitudes del embudo (todavía no tienen asesor por diseño)', () => {
    const plan = planificarReparacion({
      propiedades: [],
      procesos: [
        proc({ id: 'manual', contactoNombre: 'Formosa 5176', contactoTelefono: null, property_address: 'Formosa 5176, CABA', assigned_to: null }),
        proc({ id: 'solicitud', stage: 'request', assigned_to: null }),
        proc({ id: 'perdido', stage: 'lost', assigned_to: null }),
      ],
      tasaciones: [],
    })
    expect(plan.incompletos.map(i => i.dealId)).toEqual(['manual'])
    expect(plan.incompletos[0].faltan).toContain('el asesor')
  })

  it('lista las tasaciones sin ningún proceso', () => {
    const plan = planificarReparacion({
      propiedades: [],
      procesos: [proc({ id: 'd1', appraisal_id: 't1' })],
      tasaciones: [{ id: 't1', titulo: 'Con proceso' }, { id: 't2', titulo: 'Miranda 5217' }],
    })
    expect(plan.tasacionesSinProceso).toEqual([{ appraisalId: 't2', titulo: 'Miranda 5217' }])
  })

  it('lista las direcciones con más de un proceso abierto, sin importar tildes ni mayúsculas', () => {
    const plan = planificarReparacion({
      propiedades: [],
      procesos: [
        proc({ id: 'a', property_address: 'Estado de Israel 4550' }),
        proc({ id: 'b', property_address: 'estado de israel 4550' }),
        proc({ id: 'c', property_address: 'Estado de Israel 4550', stage: 'lost' }),
        proc({ id: 'd', property_address: 'Otra 1' }),
      ],
      tasaciones: [],
    })
    expect(plan.direccionesDuplicadas).toEqual([{ direccion: 'Estado de Israel 4550', dealIds: ['a', 'b'] }])
  })
})

describe('planificarReparacion — direcciones repetidas', () => {
  it('los textos que el embudo guarda en "dirección" no son direcciones: no se comparan', () => {
    const plan = planificarReparacion({
      propiedades: [],
      procesos: [
        proc({ id: 'a', property_address: 'Solicitud de tasación — Daniel De Tanti' }),
        proc({ id: 'b', property_address: 'Solicitud de tasación — Daniel De Tanti' }),
        proc({ id: 'c', property_address: '[Importado GHL] liliana' }),
        proc({ id: 'd', property_address: '[Importado GHL] liliana' }),
        proc({ id: 'e', property_address: 'Palermo' }),
        proc({ id: 'f', property_address: 'Palermo' }),
      ],
      tasaciones: [],
    })
    expect(plan.direccionesDuplicadas).toEqual([])
  })
})

describe('planificarReparacion — el email cuenta', () => {
  it('un proceso sin email aparece en la lista de incompletos', () => {
    const plan = planificarReparacion({ propiedades: [], procesos: [proc({ id: 'sin-mail', contactoEmail: null })], tasaciones: [] })
    expect(plan.incompletos).toEqual([expect.objectContaining({ dealId: 'sin-mail', faltan: ['el email'] })])
  })
})
