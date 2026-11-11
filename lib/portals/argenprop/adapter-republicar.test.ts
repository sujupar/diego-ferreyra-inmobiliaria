import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { access_token: 'tok' } }) }) }),
      upsert: async () => ({}),
    }),
  }),
}))

import { ArgenpropAdapter } from './adapter'

const creds = { apiBase: 'https://ap.test', tokenCrm: 'crm', usr: 'u', psd: 'p', idAnunciante: 7 }
const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function nuevo() {
  const a = new ArgenpropAdapter(true)
  ;(a as unknown as { creds: unknown }).creds = creds
  return a
}

describe('adapter Argenprop: wiring de republicar / caracteristicasDeCategoria', () => {
  let calls: { url: string; method: string }[]
  beforeEach(() => { calls = [] })
  afterEach(() => { vi.unstubAllGlobals() })

  it('caracteristicasDeCategoria: array vacío lanza y no cachea', async () => {
    let respuesta: unknown = []
    vi.stubGlobal('fetch', vi.fn(async () => resp(200, respuesta)))
    const a = nuevo()
    await expect(a.caracteristicasDeCategoria('TIPO_X')).rejects.toThrow()
    respuesta = [{ Id: 'AMBIENTES' }]
    expect([...(await a.caracteristicasDeCategoria('TIPO_X'))]).toEqual(['AMBIENTES'])
  })

  it('republicar: PUT eliminado y luego POST; devuelve el IdAviso', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' })
      return init?.method === 'POST' ? resp(201, { Result: 4242 }) : resp(200, {})
    }))
    const r = await nuevo().republicar('COD1', { Codigo: 'COD1' })
    expect(r).toEqual({ avisoId: 4242, codigo: 'COD1' })
    expect(calls[0]).toEqual({ url: 'https://ap.test/v1/avisos/COD1/estado/eliminado', method: 'PUT' })
    expect(calls[1]).toEqual({ url: 'https://ap.test/v1/avisos', method: 'POST' })
  })

  it('republicar con el código ocupado por un aviso ELIMINADO → lee, y publica con …r2', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' })
      if (init?.method === 'POST') {
        const b = JSON.parse(String(init.body)) as Record<string, unknown>
        bodies.push(b)
        return b.Codigo === 'COD1'
          ? resp(400, { ErrorCode: 'ENT002', Detail: 'Ya existe un aviso con ese código' })
          : resp(201, { Result: 5151 })
      }
      if (!init?.method) {
        return resp(200, { Result: { Codigo: 'COD1', IdAviso: 10, Categoria: { Tipo: 'DEPARTAMENTO' }, Publicacion: { EstadoPublicacion: 'ELIMINADO', Visible: false } } })
      }
      return resp(200, {})
    }))
    const r = await nuevo().republicar('COD1', { Codigo: 'COD1', Categoria: { Tipo: 'CASA' } })
    expect(r).toEqual({ avisoId: 5151, codigo: 'COD1r2' })
    expect(bodies.map(b => b.Codigo)).toEqual(['COD1', 'COD1r2'])
    expect(calls.some(c => c.url === 'https://ap.test/v1/avisos/COD1' && c.method === 'GET')).toBe(true)
  })
})
