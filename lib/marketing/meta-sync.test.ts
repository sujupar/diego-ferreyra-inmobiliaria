import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapMetaCampaignStatus, adsManagerUrl, syncCampaignState } from './meta-sync'

describe('mapMetaCampaignStatus', () => {
  it('ACTIVE → active', () => {
    expect(mapMetaCampaignStatus('ACTIVE', true)).toBe('active')
  })

  it('PAUSED → paused', () => {
    expect(mapMetaCampaignStatus('PAUSED', true)).toBe('paused')
  })

  it('ARCHIVED → archived', () => {
    expect(mapMetaCampaignStatus('ARCHIVED', true)).toBe('archived')
  })

  it('DELETED → archived', () => {
    expect(mapMetaCampaignStatus('DELETED', true)).toBe('archived')
  })

  it('inexistente (exists:false) → archived, sin importar metaStatus', () => {
    expect(mapMetaCampaignStatus(null, false)).toBe('archived')
    expect(mapMetaCampaignStatus('ACTIVE', false)).toBe('archived')
    expect(mapMetaCampaignStatus('PAUSED', false)).toBe('archived')
  })

  it('desconocido → paused (conservador: no decimos que gasta si no sabemos)', () => {
    expect(mapMetaCampaignStatus(null, true)).toBe('paused')
    expect(mapMetaCampaignStatus('', true)).toBe('paused')
    expect(mapMetaCampaignStatus('IN_PROCESS', true)).toBe('paused')
    expect(mapMetaCampaignStatus('WITH_ISSUES', true)).toBe('paused')
    expect(mapMetaCampaignStatus('CAMPAIGN_PAUSED', true)).toBe('paused')
  })

  it('es case-insensitive', () => {
    expect(mapMetaCampaignStatus('active', true)).toBe('active')
    expect(mapMetaCampaignStatus('archived', true)).toBe('archived')
  })
})

describe('adsManagerUrl', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV, META_AD_ACCOUNT_ID: 'act_853173985153585' }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('incluye el act_ sin el prefijo, el campaign id y un filtro de delivery que incluye ARCHIVED', () => {
    const url = adsManagerUrl('120246877453230656')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://business.facebook.com/adsmanager/manage/campaigns',
    )
    expect(parsed.searchParams.get('act')).toBe('853173985153585')
    expect(parsed.searchParams.get('selected_campaign_ids')).toBe('120246877453230656')
    const filterSet = JSON.parse(parsed.searchParams.get('filter_set') ?? '[]')
    expect(filterSet[0].value).toContain('ARCHIVED')
    expect(filterSet[0].value).toContain('DELETED')
  })
})

// syncCampaignState: mockeamos Meta (fetch global) y Supabase (createClient)
// para probar la lógica de decisión/escritura SIN pegarle a la red real ni a
// la base real. La prueba de lectura real contra Meta (los 4 IDs conocidos)
// se corrió aparte con un script tsx read-only — ver reporte de la tarea.
const updateEqMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn((_payload: { status: string; last_error: string }) => ({ eq: updateEqMock }))
const maybeSingleMock = vi.fn()
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json: unknown }>) {
  let call = 0
  global.fetch = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)]
    call++
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      text: async () => JSON.stringify(r.json),
    } as Response
  }) as unknown as typeof fetch
}

describe('syncCampaignState (Meta + Supabase mockeados)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.META_ACCESS_TOKEN = 'test-token'
    process.env.META_AD_ACCOUNT_ID = 'act_853173985153585'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  })

  it('campaña ARCHIVED en Meta con fila status=paused en DB → sync a archived, changed=true, escribe update', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { campaign_id: '1', status: 'paused' } })
    mockFetchSequence([{ ok: true, json: { status: 'ARCHIVED', effective_status: 'ARCHIVED' } }])

    const result = await syncCampaignState('1')

    expect(result.status).toBe('archived')
    expect(result.changed).toBe(true)
    // exists=true (Meta respondió el objeto, solo que archivado) → 0 llamadas
    // extra a adsets/ads porque "exists" es true, así que SÍ se consultan.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' }),
    )
    expect(updateEqMock).toHaveBeenCalledWith('campaign_id', '1')
  })

  it('objeto inexistente en Meta (subcode 33) con fila status=provisioning → archived, changed=true', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { campaign_id: '2', status: 'provisioning' } })
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: { code: 100, error_subcode: 33, message: 'Unsupported get request.' } },
      },
    ])

    const result = await syncCampaignState('2')

    expect(result.status).toBe('archived')
    expect(result.adsetCount).toBe(0)
    expect(result.adCount).toBe(0)
    expect(result.changed).toBe(true)
    const updatePayload = updateMock.mock.calls[0]?.[0]
    expect(updatePayload?.last_error).toContain('eliminada desde Ads Manager')
  })

  it('sin cambio de status → no escribe (changed=false)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { campaign_id: '3', status: 'active' } })
    mockFetchSequence([
      { ok: true, json: { status: 'ACTIVE', effective_status: 'ACTIVE' } },
      { ok: true, json: { data: [{ id: 'as1' }] } },
      { ok: true, json: { data: [{ id: 'ad1' }, { id: 'ad2' }] } },
    ])

    const result = await syncCampaignState('3')

    expect(result.status).toBe('active')
    expect(result.adsetCount).toBe(1)
    expect(result.adCount).toBe(2)
    expect(result.changed).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('fila no encontrada en DB → no escribe, changed=false, igual devuelve el status calculado', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null })
    mockFetchSequence([{ ok: true, json: { status: 'PAUSED' } }])

    const result = await syncCampaignState('no-existe-en-db')

    expect(result.status).toBe('paused')
    expect(result.changed).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('error de Meta que NO es "objeto inexistente" (ej. rate limit) propaga excepción en vez de asumir archived', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { campaign_id: '4', status: 'active' } })
    mockFetchSequence([
      { ok: false, status: 500, json: { error: { code: 2, message: 'An unknown error occurred' } } },
    ])

    await expect(syncCampaignState('4')).rejects.toThrow(/Meta 500/)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('dryRun:true calcula el resultado pero no escribe en la base', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { campaign_id: '5', status: 'paused' } })
    mockFetchSequence([{ ok: true, json: { status: 'ARCHIVED' } }])

    const result = await syncCampaignState('5', { dryRun: true })

    expect(result.status).toBe('archived')
    expect(result.changed).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
