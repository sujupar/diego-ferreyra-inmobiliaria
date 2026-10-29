import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
const selectMock = vi.fn()
const updateMock = vi.fn()
const eqMock = vi.fn()
const orderMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}))

import { createPendingScripts, markListo, markError, listScripts, getPendingScripts } from './scripts-repo'

const cand = (n: number) => ({
  titulo: `T${n}`, medio: 'M', fecha: '2026-10-28', url: `https://x.com/${n}`, resumen: `R${n}`,
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('createPendingScripts', () => {
  it('inserta filas guionizando con mapeo fecha->fecha_articulo y devuelve los ids', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })

    const res = await createPendingScripts([cand(1), cand(2)], 'user-1')

    expect(fromMock).toHaveBeenCalledWith('news_scripts')
    expect(insertMock).toHaveBeenCalledWith([
      { titulo: 'T1', medio: 'M', fecha_articulo: '2026-10-28', url: 'https://x.com/1', resumen: 'R1', formato: null, estado: 'guionizando', creado_por: 'user-1' },
      { titulo: 'T2', medio: 'M', fecha_articulo: '2026-10-28', url: 'https://x.com/2', resumen: 'R2', formato: null, estado: 'guionizando', creado_por: 'user-1' },
    ])
    expect(res.ids).toEqual(['a', 'b'])
  })

  it('lanza si supabase devuelve error', async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
    await expect(createPendingScripts([cand(1)], 'u')).rejects.toThrow('boom')
  })

  it('no inserta con lista vacía', async () => {
    const res = await createPendingScripts([], 'u')
    expect(res.ids).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('listScripts / getPendingScripts', () => {
  it('listScripts ordena por created_at desc', async () => {
    orderMock.mockResolvedValue({ data: [{ id: 'x' }], error: null })
    selectMock.mockReturnValue({ order: orderMock })
    fromMock.mockReturnValue({ select: selectMock })
    expect(await listScripts()).toEqual([{ id: 'x' }])
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })
  it('getPendingScripts filtra estado guionizando', async () => {
    eqMock.mockResolvedValue({ data: [], error: null })
    selectMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ select: selectMock })
    await getPendingScripts()
    expect(eqMock).toHaveBeenCalledWith('estado', 'guionizando')
  })
})

describe('markListo / markError', () => {
  it('markListo setea guion, estado listo y updated_at', async () => {
    eqMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
    await markListo('id1', 'guion')
    const patch = updateMock.mock.calls[0][0]
    expect(patch).toMatchObject({ guion: 'guion', estado: 'listo' })
    expect(typeof patch.updated_at).toBe('string')
    expect(eqMock).toHaveBeenCalledWith('id', 'id1')
  })
  it('markError setea estado error y error_msg', async () => {
    eqMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
    await markError('id2', 'fallo')
    expect(updateMock.mock.calls[0][0]).toMatchObject({ estado: 'error', error_msg: 'fallo' })
  })
})
