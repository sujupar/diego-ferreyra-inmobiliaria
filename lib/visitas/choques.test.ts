import { describe, it, expect } from 'vitest'
import { avisosDeChoque } from './choques'

const ASESOR = '11111111-1111-4111-8111-111111111111'
const PROP = '33333333-3333-4333-8333-333333333333'

describe('avisosDeChoque', () => {
  const instante = new Date('2026-10-12T14:00:00Z') // lunes 11:00
  it('avisa si el asesor tiene otra visita dentro de una hora', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v1', scheduled_at: '2026-10-12T14:30:00Z', property_id: 'otra', advisor_id: ASESOR, address: 'Tarija 4000' },
    ] })).toEqual(['El asesor ya tiene una visita a las 11:30 en Tarija 4000'])
  })
  it('avisa si la propiedad tiene otra visita ese día (día argentino)', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v2', scheduled_at: '2026-10-12T21:00:00Z', property_id: PROP, advisor_id: 'otro', address: 'Doblas 248' },
    ] })).toEqual(['La propiedad ya tiene otra visita ese día a las 18:00'])
  })
  it('una visita a las 23:30 del día anterior en Argentina NO es "ese día"', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v3', scheduled_at: '2026-10-12T02:30:00Z', property_id: PROP, advisor_id: 'otro', address: 'Doblas 248' },
    ] })).toEqual([])
  })
  it('ignora la propia visita (al reprogramar) y no repite avisos', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, excluirId: 'v1', visitas: [
      { id: 'v1', scheduled_at: '2026-10-12T14:00:00Z', property_id: PROP, advisor_id: ASESOR, address: 'Doblas 248' },
    ] })).toEqual([])
  })
})
