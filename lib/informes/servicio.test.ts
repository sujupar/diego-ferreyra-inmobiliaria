import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, traerMock } = vi.hoisted(() => ({
  traerMock: vi.fn(),
  datosMock: {
    leerPropiedad: vi.fn(), crearInforme: vi.fn(), guardarFuente: vi.fn(), guardarCaptura: vi.fn(), marcarListo: vi.fn(),
    crearSubidaFirmada: vi.fn(), primerosBytes: vi.fn(), urlFirmada: vi.fn(), borrarArchivos: vi.fn(),
  },
}))
vi.mock('./datos', () => datosMock)
vi.mock('./fuentes', () => ({ traerFuente: traerMock }))

import { crearInformeManual, refrescarFuente, confirmarCaptura, marcarInformeListo, prepararPdf, ErrorInforme, fuentesPendientes } from './servicio'
import type { Informe } from './tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const AHORA = new Date('2026-10-22T15:00:00Z')
const ok = { estado: 'ok' as const, actualizadoEn: '', datos: {}, error: null }

function informe(extra: Partial<Informe> = {}): Informe {
  const fuentes = Object.fromEntries(Object.keys(fuentesPendientes()).map(k => [k, ok]))
  return {
    id: ID, propertyId: 'p', desde: '2026-10-01', hasta: '2026-10-15', origen: 'manual', estado: 'borrador',
    fuentes: { ...fuentes, mercadolibre: { ...ok, datos: { avisoId: 'MLA1', visitas: 1 } } } as never,
    manual: { zonaprop: { exposicion: 1, visualizaciones: 1 }, argenprop: { publicado: false }, textos: { accionesRealizadas: 'a', accionesARealizar: 'b' } },
    competidoras: [], capturas: {}, pdfPath: null, listoAt: null, createdAt: '', updatedAt: 'v1', ...extra,
  }
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  traerMock.mockReset()
  datosMock.leerPropiedad.mockResolvedValue({ id: 'p', direccion: 'Roque Pérez 3059' })
  datosMock.crearInforme.mockImplementation(async (f: Record<string, unknown>) => ({ informe: f, nuevo: true }))
  datosMock.guardarFuente.mockResolvedValue(true)
})

describe('crearInformeManual', () => {
  it('valida el rango y crea el borrador con todas las fuentes pendientes', async () => {
    await crearInformeManual('p', '2026-10-01', '2026-10-15', 'u1', AHORA)
    const pedido = datosMock.crearInforme.mock.calls[0][0]
    expect(pedido).toMatchObject({ propertyId: 'p', desde: '2026-10-01', hasta: '2026-10-15', origen: 'manual', creadoPor: 'u1' })
    expect(Object.values(pedido.fuentes).every((f: unknown) => (f as { estado: string }).estado === 'pendiente')).toBe(true)
  })
  it('rango inválido → 400 sin tocar la base', async () => {
    await expect(crearInformeManual('p', '2026-10-15', '2026-10-01', 'u1', AHORA)).rejects.toMatchObject({ status: 400 })
    expect(datosMock.crearInforme).not.toHaveBeenCalled()
  })
})

describe('refrescarFuente', () => {
  it('le pasa a la fuente el aviso de ML que cargó Paula y guarda el resultado', async () => {
    traerMock.mockResolvedValue(ok)
    await refrescarFuente(informe({ manual: { mercadolibre: { aviso: 'MLA3968141346' } } }), 'mercadolibre', AHORA)
    expect(traerMock).toHaveBeenCalledWith('mercadolibre', expect.objectContaining({ avisoMercadoLibre: 'MLA3968141346', desde: '2026-10-01' }))
    expect(datosMock.guardarFuente).toHaveBeenCalledWith(ID, 'mercadolibre', ok)
  })
  it('un informe listo no se toca (409)', async () => {
    await expect(refrescarFuente(informe({ estado: 'listo' }), 'meta', AHORA)).rejects.toMatchObject({ status: 409 })
    expect(traerMock).not.toHaveBeenCalled()
  })
})

describe('confirmarCaptura', () => {
  const PATH = `informes/${ID}/captura-zonaprop-${U}.png`
  it('una imagen de verdad se guarda SOLO en su clave (atómico en la base) y borra la anterior que devuelve la base', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), tamano: 1000 })
    datosMock.guardarCaptura.mockResolvedValue({ capturas: { zonaprop: PATH, argenprop: 'de-otra-pestaña' }, anterior: 'vieja' })
    const c = await confirmarCaptura(informe({ capturas: {} }), 'zonaprop', PATH)
    expect(datosMock.guardarCaptura).toHaveBeenCalledWith(ID, 'zonaprop', PATH)
    expect(c).toEqual({ zonaprop: PATH, argenprop: 'de-otra-pestaña' })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith(['vieja'])
  })
  it('si el informe ya está listo (la base no lo toca) → 409 y la captura subida se borra', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), tamano: 1000 })
    datosMock.guardarCaptura.mockResolvedValue(null)
    await expect(confirmarCaptura(informe(), 'zonaprop', PATH)).rejects.toMatchObject({ status: 409 })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PATH])
  })
  it('un archivo que no es imagen se borra y se rechaza', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x4d, 0x5a]), tamano: 10 })
    await expect(confirmarCaptura(informe(), 'zonaprop', PATH)).rejects.toMatchObject({ status: 400 })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PATH])
    expect(datosMock.guardarCaptura).not.toHaveBeenCalled()
  })
  it('un path de otro informe o de otra captura → 400 sin tocar Storage', async () => {
    await expect(confirmarCaptura(informe(), 'argenprop', PATH)).rejects.toBeInstanceOf(ErrorInforme)
    expect(datosMock.primerosBytes).not.toHaveBeenCalled()
  })
  it('Storage no responde → 503 y NO se borra nada', async () => {
    datosMock.primerosBytes.mockResolvedValue(null)
    await expect(confirmarCaptura(informe(), 'zonaprop', PATH)).rejects.toMatchObject({ status: 503 })
    expect(datosMock.borrarArchivos).not.toHaveBeenCalled()
  })
})

describe('listo', () => {
  const PDF = `informes/${ID}/informe-${U}.pdf`
  it('con algo sin completar no se puede (ni preparar el PDF ni marcar)', async () => {
    const incompleto = informe({ manual: {} })
    await expect(prepararPdf(incompleto)).rejects.toMatchObject({ status: 400 })
    await expect(marcarInformeListo(incompleto, PDF, 'u1', 'v1')).rejects.toMatchObject({ status: 400 })
    expect(datosMock.marcarListo).not.toHaveBeenCalled()
  })
  it('completo + PDF de verdad → listo, condicionado a la versión con la que se armó el PDF', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tamano: 50000 })
    datosMock.marcarListo.mockResolvedValue(true)
    await marcarInformeListo(informe(), PDF, 'u1', 'v1')
    expect(datosMock.marcarListo).toHaveBeenCalledWith(ID, PDF, 'u1', 'v1')
  })
  it('si el informe cambió después de armar el PDF → 409 y el PDF viejo se borra', async () => {
    await expect(marcarInformeListo(informe({ updatedAt: 'v2' }), PDF, 'u1', 'v1')).rejects.toMatchObject({ status: 409 })
    expect(datosMock.marcarListo).not.toHaveBeenCalled()
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PDF])
  })
  it('si cambia justo entre la lectura y la escritura (la base no encuentra la versión) → 409', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tamano: 50000 })
    datosMock.marcarListo.mockResolvedValue(false)
    await expect(marcarInformeListo(informe(), PDF, 'u1', 'v1')).rejects.toMatchObject({ status: 409 })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PDF])
  })
  it('un archivo que no es PDF se borra y no marca listo', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x89, 0x50]), tamano: 10 })
    await expect(marcarInformeListo(informe(), PDF, 'u1', 'v1')).rejects.toMatchObject({ status: 400 })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PDF])
    expect(datosMock.marcarListo).not.toHaveBeenCalled()
  })
})
