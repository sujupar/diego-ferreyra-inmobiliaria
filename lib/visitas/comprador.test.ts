import { describe, it, expect } from 'vitest'
import { decidirComprador } from './comprador'

const existente = (p: Partial<{ id: string; phone: string | null; email: string | null; created_at: string }>) =>
  ({ id: 'l1', phone: '+5491158234521', email: null, created_at: '2026-10-01T00:00:00Z', ...p })

describe('decidirComprador', () => {
  it('reusa por teléfono aunque esté escrito distinto', () => {
    expect(decidirComprador([existente({})], { telefono: '11 5823-4521', email: null }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: {} })
  })
  it('completa SOLO los huecos (nunca pisa)', () => {
    expect(decidirComprador([existente({ email: null })], { telefono: '1158234521', email: 'ana@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: { email: 'ana@mail.com' } })
    expect(decidirComprador([existente({ email: 'vieja@mail.com' })], { telefono: '1158234521', email: 'nueva@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: {} })
  })
  it('sin teléfono coincidente busca por email (sin importar mayúsculas)', () => {
    expect(decidirComprador([existente({ phone: null, email: 'Ana@Mail.com' })], { telefono: '1199999999', email: 'ana@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: { phone: '1199999999' } })
  })
  it('con dos coincidencias se queda con la más nueva', () => {
    const r = decidirComprador([
      existente({ id: 'viejo', created_at: '2026-01-01T00:00:00Z' }),
      existente({ id: 'nuevo', created_at: '2026-09-01T00:00:00Z' }),
    ], { telefono: '1158234521', email: null })
    expect(r).toMatchObject({ accion: 'reusar', leadId: 'nuevo' })
  })
  it('si no hay nadie, crea', () => {
    expect(decidirComprador([], { telefono: '1158234521', email: null })).toEqual({ accion: 'crear' })
    expect(decidirComprador([existente({ phone: '1100000000' })], { telefono: '1158234521', email: null })).toEqual({ accion: 'crear' })
  })
})
