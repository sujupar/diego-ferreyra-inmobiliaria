import { describe, it, expect } from 'vitest'
import { sanearEdicion, validarRangoDeContrato } from './editable-fields'

describe('sanearEdicion', () => {
  it('acepta un precio válido', () => {
    const r = sanearEdicion({ asking_price: 1290000 })
    expect(r).toEqual({ ok: true, patch: { asking_price: 1290000 } })
  })

  it('acepta cambiar la moneda', () => {
    const r = sanearEdicion({ currency: 'ARS' })
    expect(r.ok && r.patch.currency).toBe('ARS')
  })

  it('rechaza un precio de cero o negativo', () => {
    expect(sanearEdicion({ asking_price: 0 }).ok).toBe(false)
    expect(sanearEdicion({ asking_price: -5 }).ok).toBe(false)
  })

  it('rechaza un precio absurdo (techo defensivo contra el cero de más)', () => {
    expect(sanearEdicion({ asking_price: 100_000_001 }).ok).toBe(false)
  })

  it('rechaza una moneda inventada', () => {
    expect(sanearEdicion({ currency: 'BTC' }).ok).toBe(false)
  })

  it('IGNORA campos fuera de la lista blanca — no los deja pasar al UPDATE', () => {
    // Es la razón de existir de este módulo: sin él, el body del navegador llega
    // entero al UPDATE y quien edita un precio podría cambiar de paso el estado
    // legal de la ficha o a quién está asignada.
    const r = sanearEdicion({
      asking_price: 100,
      legal_status: 'approved',
      assigned_to: 'otro-usuario',
      status: 'approved',
      commercial_status: 'vendida',
    })
    expect(r).toEqual({ ok: true, patch: { asking_price: 100 } })
  })

  it('un body sin ningún campo editable es error, no un UPDATE vacío', () => {
    expect(sanearEdicion({ legal_status: 'approved' }).ok).toBe(false)
    expect(sanearEdicion({}).ok).toBe(false)
  })

  it('rechaza un body que no es objeto', () => {
    expect(sanearEdicion(null).ok).toBe(false)
    expect(sanearEdicion('hola').ok).toBe(false)
    expect(sanearEdicion([1, 2]).ok).toBe(false)
  })

  it('el precio no acepta texto ni NaN aunque venga como número', () => {
    expect(sanearEdicion({ asking_price: '1350000' }).ok).toBe(false)
    expect(sanearEdicion({ asking_price: Number.NaN }).ok).toBe(false)
    expect(sanearEdicion({ asking_price: Number.POSITIVE_INFINITY }).ok).toBe(false)
  })

  it('deja pasar precio y moneda juntos (cambio de USD a ARS con su valor)', () => {
    const r = sanearEdicion({ asking_price: 900_000_00, currency: 'ARS' })
    expect(r).toEqual({ ok: true, patch: { asking_price: 90000000, currency: 'ARS' } })
  })
})

describe('sanearEdicion — características', () => {
  it('acepta los conteos de la ficha', () => {
    const r = sanearEdicion({ rooms: 6, bedrooms: 6, bathrooms: 4, garages: 4 })
    expect(r).toEqual({ ok: true, patch: { rooms: 6, bedrooms: 6, bathrooms: 4, garages: 4 } })
  })

  it('acepta superficies con decimales pero NO dormitorios fraccionados', () => {
    expect(sanearEdicion({ covered_area: 84.5 }).ok).toBe(true)
    const r = sanearEdicion({ bedrooms: 2.5 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/entero/i)
  })

  it('acepta PB (0) y subsuelo (negativo) como piso', () => {
    expect(sanearEdicion({ floor: 0 })).toEqual({ ok: true, patch: { floor: 0 } })
    expect(sanearEdicion({ floor: -2 })).toEqual({ ok: true, patch: { floor: -2 } })
    expect(sanearEdicion({ floor: -50 }).ok).toBe(false)
  })

  it('vaciar un campo lo pone en null: "no sé la antigüedad" no es "0 años"', () => {
    expect(sanearEdicion({ age: null })).toEqual({ ok: true, patch: { age: null } })
    expect(sanearEdicion({ age: '' })).toEqual({ ok: true, patch: { age: null } })
    expect(sanearEdicion({ description: '' })).toEqual({ ok: true, patch: { description: null } })
  })

  it('rechaza valores fuera de rango con un mensaje que nombra el campo', () => {
    const r = sanearEdicion({ rooms: 500 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/ambientes/i)
    expect(sanearEdicion({ age: 400 }).ok).toBe(false)
    expect(sanearEdicion({ total_area: 100_001 }).ok).toBe(false)
    expect(sanearEdicion({ expensas: -1 }).ok).toBe(false)
  })

  it('recorta una descripción larguísima en vez de rechazarla', () => {
    const r = sanearEdicion({ description: 'x'.repeat(6000) })
    expect(r.ok && (r.patch.description as string).length).toBe(5000)
  })

  it('acepta varios campos a la vez y sigue filtrando los prohibidos', () => {
    const r = sanearEdicion({
      rooms: 4, total_area: 180, description: 'Casa con jardín',
      legal_status: 'approved', public_slug: 'hackeado',
    })
    expect(r).toEqual({ ok: true, patch: { rooms: 4, total_area: 180, description: 'Casa con jardín' } })
  })

  it('un número que llega como texto se rechaza (no se adivina)', () => {
    expect(sanearEdicion({ rooms: '4' }).ok).toBe(false)
  })
})

describe('sanearEdicion — la ficha completa (tipo, operación y datos comerciales)', () => {
  it('acepta el tipo de propiedad y la operación', () => {
    const r = sanearEdicion({ property_type: 'casa', operation_type: 'alquiler' })
    expect(r).toEqual({ ok: true, patch: { property_type: 'casa', operation_type: 'alquiler' } })
  })

  it('rechaza un tipo inventado', () => {
    const r = sanearEdicion({ property_type: 'castillo' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/tipo/i)
  })

  it('rechaza una operación inventada', () => {
    const r = sanearEdicion({ operation_type: 'permuta' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/venta|alquiler/i)
  })

  it('acepta la comisión y la deja vaciar', () => {
    expect(sanearEdicion({ commission_percentage: 3.5 })).toEqual({ ok: true, patch: { commission_percentage: 3.5 } })
    expect(sanearEdicion({ commission_percentage: null })).toEqual({ ok: true, patch: { commission_percentage: null } })
  })

  it('rechaza una comisión fuera de rango', () => {
    expect(sanearEdicion({ commission_percentage: 150 }).ok).toBe(false)
    expect(sanearEdicion({ commission_percentage: -1 }).ok).toBe(false)
  })

  it('acepta fechas de contrato bien formadas y las deja vaciar', () => {
    expect(sanearEdicion({ contract_start_date: '2026-08-21' }))
      .toEqual({ ok: true, patch: { contract_start_date: '2026-08-21' } })
    expect(sanearEdicion({ contract_end_date: null }))
      .toEqual({ ok: true, patch: { contract_end_date: null } })
  })

  it('rechaza una fecha con formato raro', () => {
    expect(sanearEdicion({ contract_start_date: '21/08/2026' }).ok).toBe(false)
    expect(sanearEdicion({ contract_start_date: '2026-13-45' }).ok).toBe(false)
  })

  it('los campos fuera de la lista siguen sin viajar', () => {
    const r = sanearEdicion({ property_type: 'casa', legal_status: 'approved', assigned_to: 'otro' })
    expect(r).toEqual({ ok: true, patch: { property_type: 'casa' } })
  })
})

describe('validarRangoDeContrato', () => {
  it('un fin anterior al inicio es un error', () => {
    expect(validarRangoDeContrato('2026-08-21', '2026-08-01')).toMatch(/anterior/i)
  })
  it('un rango correcto pasa', () => {
    expect(validarRangoDeContrato('2026-08-21', '2026-11-21')).toBeNull()
    expect(validarRangoDeContrato('2026-08-21', '2026-08-21')).toBeNull()
  })
  it('si falta alguna fecha no hay nada que comparar', () => {
    expect(validarRangoDeContrato(null, '2026-08-01')).toBeNull()
    expect(validarRangoDeContrato('2026-08-21', null)).toBeNull()
    expect(validarRangoDeContrato(undefined, undefined)).toBeNull()
  })
})
