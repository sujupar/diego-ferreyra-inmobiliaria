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

import { createPendingScripts, markListo, markError, listScripts, getPendingScripts, expireStaleScripts } from './scripts-repo'

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

describe('createPendingScripts fecha inválida', () => {
  it('mapea fecha vacía/inválida a null', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
    await createPendingScripts([{ ...cand(1), fecha: '' }, { ...cand(2), fecha: 'hace 2 días' }], 'u')
    const rows = insertMock.mock.calls[0][0]
    expect(rows[0].fecha_articulo).toBeNull()
    expect(rows[1].fecha_articulo).toBeNull()
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
    orderMock.mockResolvedValue({ data: [], error: null })
    eqMock.mockReturnValue({ order: orderMock })
    selectMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ select: selectMock })
    await getPendingScripts()
    expect(eqMock).toHaveBeenCalledWith('estado', 'guionizando')
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

describe('markListo / markError / expireStaleScripts', () => {
  // update().eq('id').eq('estado','guionizando')
  const setup = () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    eqMock.mockReturnValue({ eq: eq2 })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
    return eq2
  }
  it('markListo setea guion, estado listo y solo si sigue guionizando', async () => {
    const eq2 = setup()
    await markListo('id1', 'guion')
    const patch = updateMock.mock.calls[0][0]
    expect(patch).toMatchObject({ guion: 'guion', estado: 'listo' })
    expect(typeof patch.updated_at).toBe('string')
    expect(eqMock).toHaveBeenCalledWith('id', 'id1')
    expect(eq2).toHaveBeenCalledWith('estado', 'guionizando')
  })
  it('markError setea estado error y solo si sigue guionizando', async () => {
    const eq2 = setup()
    await markError('id2', 'fallo')
    expect(updateMock.mock.calls[0][0]).toMatchObject({ estado: 'error', error_msg: 'fallo' })
    expect(eq2).toHaveBeenCalledWith('estado', 'guionizando')
  })
  it('expireStaleScripts pasa a error las guionizando viejas', async () => {
    const ltMock = vi.fn().mockResolvedValue({ error: null })
    eqMock.mockReturnValue({ lt: ltMock })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
    await expireStaleScripts(6, 'viejo')
    expect(updateMock.mock.calls[0][0]).toMatchObject({ estado: 'error', error_msg: 'viejo' })
    expect(eqMock).toHaveBeenCalledWith('estado', 'guionizando')
    expect(ltMock.mock.calls[0][0]).toBe('created_at')
  })
})
