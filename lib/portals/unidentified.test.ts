import { describe, it, expect } from 'vitest'
import { groupUnidentified, type UnidentifiedInquiryRow } from './unidentified'

const row = (over: Partial<UnidentifiedInquiryRow>): UnidentifiedInquiryRow => ({
  portal: 'zonaprop',
  property_external_code: '2DLPOM',
  raw_subject: '📩 ¡Recibiste una nueva consulta por el aviso Departamento 2 Ambientes en Excelente Estado! CÓD:2DLPOM - REF:#308621506#',
  lead_name: 'Marcelo',
  created_at: '2026-07-29T17:55:00Z',
  received_at: '2026-07-29T17:50:00Z',
  ...over,
})

describe('groupUnidentified', () => {
  it('agrupa varias consultas del mismo aviso en un solo ítem', () => {
    const out = groupUnidentified([
      row({ lead_name: 'Marcelo', created_at: '2026-07-29T17:55:00Z' }),
      row({ lead_name: 'Ana', created_at: '2026-07-28T10:00:00Z' }),
      row({ lead_name: 'Luis', created_at: '2026-07-27T09:00:00Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].externalCode).toBe('2DLPOM')
    expect(out[0].inquiryCount).toBe(3)
  })

  it('usa la consulta más reciente para la fecha y el nombre mostrados', () => {
    const out = groupUnidentified([
      row({ lead_name: 'Ana', created_at: '2026-07-28T10:00:00Z' }),
      row({ lead_name: 'Marcelo', created_at: '2026-07-29T17:55:00Z' }),
    ])
    expect(out[0].lastLeadName).toBe('Marcelo')
    expect(out[0].lastInquiryAt).toBe('2026-07-29T17:55:00Z')
  })

  it('saca el título legible del asunto del email', () => {
    const out = groupUnidentified([row({})])
    expect(out[0].title).toBe('Departamento 2 Ambientes en Excelente Estado')
  })

  it('deja el título en null si el asunto no tiene el formato conocido', () => {
    const out = groupUnidentified([row({ raw_subject: 'Guido te ha enviado un mensaje' })])
    expect(out[0].title).toBeNull()
  })

  it('separa avisos distintos y ordena por cantidad de consultas', () => {
    const out = groupUnidentified([
      row({ property_external_code: 'AAA1', created_at: '2026-07-20T10:00:00Z' }),
      row({ property_external_code: 'BBB2', created_at: '2026-07-21T10:00:00Z' }),
      row({ property_external_code: 'BBB2', created_at: '2026-07-22T10:00:00Z' }),
    ])
    expect(out.map(a => a.externalCode)).toEqual(['BBB2', 'AAA1'])
  })

  it('a igual cantidad de consultas, primero el aviso con actividad más reciente', () => {
    const out = groupUnidentified([
      row({ property_external_code: 'VIEJO', created_at: '2026-07-01T10:00:00Z' }),
      row({ property_external_code: 'NUEVO', created_at: '2026-07-29T10:00:00Z' }),
    ])
    expect(out.map(a => a.externalCode)).toEqual(['NUEVO', 'VIEJO'])
  })

  it('descarta las consultas sin código (no hay aviso que identificar)', () => {
    const out = groupUnidentified([row({ property_external_code: null })])
    expect(out).toEqual([])
  })

  it('trata el mismo código en portales distintos como avisos distintos', () => {
    const out = groupUnidentified([
      row({ portal: 'zonaprop', property_external_code: 'X123456' }),
      row({ portal: 'argenprop', property_external_code: 'X123456' }),
    ])
    expect(out).toHaveLength(2)
  })
})
