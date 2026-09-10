import { describe, it, expect } from 'vitest'
import { guardarValuacionIA, elegirTasador, replaceAppraisalComparables } from './appraisals-write'
import type { AiValuationResult } from '@/lib/valuation/ia-tipos'
import type { SaveAppraisalInput } from './appraisals'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente falso: `from(t).select().eq().single()` devuelve `filas[t]`; registra
 * los `update`/`insert`/`delete` con su payload para que las aserciones miren
 * QUÉ se escribió, no cómo.
 */
function clienteFalso(filas: Record<string, unknown>) {
  const escrituras: { tabla: string; op: string; payload?: unknown }[] = []
  const armar = (tabla: string) => {
    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = self; b.eq = self; b.order = self
    b.single = async () => ({ data: filas[tabla] ?? null, error: null })
    b.maybeSingle = b.single
    b.update = (payload: unknown) => { escrituras.push({ tabla, op: 'update', payload }); return { eq: async () => ({ error: null }) } }
    b.insert = async (payload: unknown) => { escrituras.push({ tabla, op: 'insert', payload }); return { error: null } }
    b.delete = () => { escrituras.push({ tabla, op: 'delete' }); return { eq: async () => ({ error: null }) } }
    return b
  }
  return { cliente: { from: armar } as unknown as SupabaseClient, escrituras }
}

const ia = {
  publicationPrice: 200_000, saleValue: 190_000, moneyInHand: 180_000, currency: 'USD', comparableAnalysis: [],
  ai: { inputFingerprint: 'h' },
} as unknown as AiValuationResult
const clasico = { publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, currency: 'USD', comparableAnalysis: [] }

const payloadDe = (e: { payload?: unknown }) => e.payload as Record<string, unknown>

describe('guardarValuacionIA', () => {
  it('ready con tasador clásico en uso: guarda el snapshot y NO toca los precios', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'ready', result: ia })
    const p = payloadDe(escrituras[0])
    expect(p.ai_valuation_status).toBe('ready')
    expect(p.ai_valuation_error).toBeNull()
    expect((p.ai_valuation_result as { comparableAnalysis: unknown[] }).comparableAnalysis).toEqual([])
    expect(p.publication_price).toBeUndefined()
  })
  it('ready con IA en uso: además reescribe los tres precios', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'ai' } })
    await guardarValuacionIA(cliente, 't1', { status: 'ready', result: ia })
    const p = payloadDe(escrituras[0])
    expect(p.publication_price).toBe(200_000); expect(p.sale_value).toBe(190_000); expect(p.money_in_hand).toBe(180_000)
  })
  it('failed guarda el motivo y no toca el snapshot anterior', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'failed', error: 'se cortó' })
    expect(payloadDe(escrituras[0])).toEqual({ ai_valuation_status: 'failed', ai_valuation_error: 'se cortó' })
  })
  it('pending limpia el error', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'pending' })
    expect(payloadDe(escrituras[0])).toEqual({ ai_valuation_status: 'pending', ai_valuation_error: null })
  })
})

describe('elegirTasador', () => {
  it('elegir IA: escribe la fuente, los precios de la IA y borra priceOverrides conservando el resto', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: {
      valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready',
      report_edits: { semaphoreOverrides: {}, coverTitle: 'x', priceOverrides: { noSaleZonePrice: 1 } },
    } })
    const r = await elegirTasador(cliente, 't1', 'ai')
    expect(r.teniaPreciosEditados).toBe(true)
    const p = payloadDe(escrituras[0])
    expect(p.valuation_source).toBe('ai')
    expect(p.publication_price).toBe(200_000)
    expect(p.report_edits).toEqual({ semaphoreOverrides: {}, coverTitle: 'x' })
  })
  it('elegir clásico vuelve a los precios clásicos; sin overrides no reporta nada', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: {
      valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready', report_edits: { semaphoreOverrides: {} },
    } })
    const r = await elegirTasador(cliente, 't1', 'calculator')
    expect(r.teniaPreciosEditados).toBe(false)
    const p = payloadDe(escrituras[0])
    expect(p.valuation_source).toBe('calculator'); expect(p.publication_price).toBe(100_000)
    expect(p.report_edits).toEqual({ semaphoreOverrides: {} })
  })
  it('elegir IA sin resultado listo falla y NO escribe', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: {
      valuation_result: clasico, ai_valuation_result: null, ai_valuation_status: 'failed', report_edits: null,
    } })
    await expect(elegirTasador(cliente, 't1', 'ai')).rejects.toThrow(/no está lista/)
    expect(escrituras).toHaveLength(0)
  })
  it('report_edits null se deja null', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: {
      valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready', report_edits: null,
    } })
    await elegirTasador(cliente, 't1', 'ai')
    expect(payloadDe(escrituras[0]).report_edits).toBeNull()
  })
})

describe('replaceAppraisalComparables respeta al tasador en uso', () => {
  const input = {
    subject: { title: 's', location: 'l', features: {}, images: [], url: '', price: null, currency: null, description: '', portal: '' },
    comparables: [], valuationResult: clasico,
  } as unknown as SaveAppraisalInput
  it('con IA en uso NO reescribe los precios desnormalizados', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'ai' } })
    await replaceAppraisalComparables(cliente, 't1', input)
    const p = payloadDe(escrituras.find(e => e.op === 'update')!)
    expect(p.valuation_result).toBeDefined()
    expect(p.publication_price).toBeUndefined(); expect(p.sale_value).toBeUndefined(); expect(p.money_in_hand).toBeUndefined()
  })
  it('con clásico en uso los reescribe como siempre', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await replaceAppraisalComparables(cliente, 't1', input)
    const p = payloadDe(escrituras.find(e => e.op === 'update')!)
    expect(p.publication_price).toBe(100_000)
  })
})
