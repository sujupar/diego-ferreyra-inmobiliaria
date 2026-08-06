import { describe, it, expect } from 'vitest'
import {
  COMMERCIAL_STATUSES, commercialStatusDef, isCommercialStatus,
  validateStatusChange, buildStatusPatch,
} from './commercial-status'

const HOY = '2026-08-06'

describe('catálogo', () => {
  it('tiene exactamente los cinco estados acordados, en orden', () => {
    expect(COMMERCIAL_STATUSES.map(s => s.key)).toEqual([
      'disponible', 'reservada', 'vendida', 'dada_de_baja', 'descartada',
    ])
  })

  it('cada estado tiene etiqueta y explicación en castellano', () => {
    for (const s of COMMERCIAL_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(10)
    }
  })

  it('un valor desconocido cae en disponible en vez de romper la pantalla', () => {
    expect(commercialStatusDef('cualquier-cosa').key).toBe('disponible')
    expect(commercialStatusDef('vendida').label).toBe('Vendida')
  })

  it('reconoce los valores válidos', () => {
    expect(isCommercialStatus('reservada')).toBe(true)
    expect(isCommercialStatus('alquilada')).toBe(false)
    expect(isCommercialStatus(null)).toBe(false)
  })
})

describe('validateStatusChange', () => {
  it('rechaza cambiar al mismo estado', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'disponible', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ya está')
  })

  it('vendida exige precio real', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldAt: HOY, soldCurrency: 'USD', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('precio')
  })

  it('vendida rechaza precio cero o negativo', () => {
    for (const p of [0, -5]) {
      const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: p, soldAt: HOY, soldCurrency: 'USD', today: HOY })
      expect(r.ok).toBe(false)
    }
  })

  it('vendida exige fecha de operación', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('fecha')
  })

  it('vendida rechaza una fecha futura', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: '2026-12-31', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('futuro')
  })

  it('vendida con todo cargado pasa', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: HOY, today: HOY })
    expect(r.ok).toBe(true)
  })

  it('salir de vendida exige motivo', () => {
    const sin = validateStatusChange({ from: 'vendida', to: 'disponible', today: HOY })
    expect(sin.ok).toBe(false)
    expect(sin.error).toContain('motivo')

    const enBlanco = validateStatusChange({ from: 'vendida', to: 'disponible', reason: '   ', today: HOY })
    expect(enBlanco.ok).toBe(false)

    const con = validateStatusChange({ from: 'vendida', to: 'disponible', reason: 'La operación se cayó', today: HOY })
    expect(con.ok).toBe(true)
  })

  it('el resto de los cambios no exige motivo', () => {
    expect(validateStatusChange({ from: 'disponible', to: 'reservada', today: HOY }).ok).toBe(true)
    expect(validateStatusChange({ from: 'reservada', to: 'dada_de_baja', today: HOY }).ok).toBe(true)
    expect(validateStatusChange({ from: 'descartada', to: 'disponible', today: HOY }).ok).toBe(true)
  })
})

describe('buildStatusPatch', () => {
  it('vendida guarda precio, moneda y fecha', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: HOY, today: HOY })
    expect(p).toEqual({
      commercial_status: 'vendida', sold_price: 180000, sold_currency: 'USD', sold_at: HOY,
    })
  })

  it('salir de vendida limpia los datos de la venta', () => {
    const p = buildStatusPatch({ from: 'vendida', to: 'disponible', reason: 'Se cayó', today: HOY })
    expect(p.sold_price).toBeNull()
    expect(p.sold_currency).toBeNull()
    expect(p.sold_at).toBeNull()
  })

  it('descartada escribe también el espejo heredado en status', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'descartada', today: HOY })
    expect(p.status).toBe('descartada')
  })

  it('salir de descartada devuelve status a borrador', () => {
    const p = buildStatusPatch({ from: 'descartada', to: 'disponible', today: HOY })
    expect(p.status).toBe('draft')
  })

  it('los cambios que no involucran descartada no tocan status', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'reservada', today: HOY })
    expect(p.status).toBeUndefined()
  })
})
