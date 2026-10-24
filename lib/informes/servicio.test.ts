import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, traerMock, openaiMock, listadoMock, scrapeMock } = vi.hoisted(() => ({
  traerMock: vi.fn(),
  openaiMock: vi.fn(),
  listadoMock: vi.fn(),
  scrapeMock: vi.fn(),
  datosMock: {
    leerPropiedad: vi.fn(), crearInforme: vi.fn(), guardarFuente: vi.fn(), guardarCaptura: vi.fn(), marcarListo: vi.fn(),
    crearSubidaFirmada: vi.fn(), primerosBytes: vi.fn(), urlFirmada: vi.fn(), borrarArchivos: vi.fn(),
    leerInforme: vi.fn(), leerInformeAnterior: vi.fn(), guardarCambios: vi.fn(), guardarCandidatas: vi.fn(),
    cerrarTareasDelInforme: vi.fn(),
  },
}))
vi.mock('./datos', () => datosMock)
vi.mock('./fuentes', () => ({ traerFuente: traerMock }))
vi.mock('@/lib/ai/openai-responses', () => ({ respuestaOpenAI: openaiMock }))
vi.mock('./competencia/traer', () => ({ traerListado: listadoMock }))
vi.mock('@/lib/scraper', () => ({ scrapeProperty: scrapeMock }))

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { crearInformeManual, refrescarFuente, confirmarCaptura, marcarInformeListo, prepararPdf, ErrorInforme, fuentesPendientes, escribirTextos, buscarCompetencia, abrirCandidata } from './servicio'
import type { Informe } from './tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const AHORA = new Date('2026-10-22T15:00:00Z')
const ok = { estado: 'ok' as const, actualizadoEn: '', datos: {}, error: null }

function informe(extra: Partial<Informe> = {}): Informe {
  return informeBase(extra)
}

function informeBase(extra: Partial<Informe> = {}): Informe {
  const fuentes = Object.fromEntries(Object.keys(fuentesPendientes()).map(k => [k, ok]))
  return {
    id: ID, propertyId: 'p', desde: '2026-10-01', hasta: '2026-10-15', origen: 'manual', estado: 'borrador',
    fuentes: { ...fuentes, mercadolibre: { ...ok, datos: { avisos: [{ id: 'MLA1', titulo: null, url: null, origen: 'plataforma' as const }], visitas: 1 } } } as never,
    manual: { zonaprop: { exposicion: 1, visualizaciones: 1 }, argenprop: { publicado: false }, textos: { accionesRealizadas: 'a', accionesARealizar: 'b' } },
    competidoras: [], candidatas: { detalles: {} }, capturas: {}, pdfPath: null, listoAt: null, createdAt: '', updatedAt: 'v1', ...extra,
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
  it('al marcarlo listo se cierra la tarea de Pendientes de esa propiedad (si no le queda otro del ciclo)', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tamano: 50000 })
    datosMock.marcarListo.mockResolvedValue(true)
    datosMock.cerrarTareasDelInforme.mockResolvedValue(1)
    await marcarInformeListo(informe(), PDF, 'u1', 'v1')
    expect(datosMock.cerrarTareasDelInforme).toHaveBeenCalledWith(informe().propertyId)
  })
  it('si cerrar la tarea falla, el informe igual queda listo (la tarea se cierra a mano)', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tamano: 50000 })
    datosMock.marcarListo.mockResolvedValue(true)
    datosMock.cerrarTareasDelInforme.mockRejectedValue(new Error('base caída'))
    await expect(marcarInformeListo(informe(), PDF, 'u1', 'v1')).resolves.toBeUndefined()
  })
  it('si no llegó a quedar listo, la tarea no se toca', async () => {
    datosMock.primerosBytes.mockResolvedValue({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tamano: 50000 })
    datosMock.marcarListo.mockResolvedValue(false)
    await expect(marcarInformeListo(informe(), PDF, 'u1', 'v1')).rejects.toMatchObject({ status: 409 })
    expect(datosMock.cerrarTareasDelInforme).not.toHaveBeenCalled()
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

describe('escribirTextos', () => {
  const salida = {
    resumenMetricas: 'La están viendo muchos compradores.',
    accionesRealizadas: ['Se publicó la propiedad en todos los portales'],
    accionesARealizar: ['Seguir con la máxima difusión.'],
    resumenConsultas: 'En este último periodo se obtuvieron 45 consultas.',
    analisisFinal: 'Análisis.',
  }
  // Fuentes respondidas pero sin datos (estado real): los datos de las otras pruebas son objetos vacíos.
  const sinDatos = { estado: 'sin_datos' as const, actualizadoEn: 'x', datos: null, error: null }
  const fuentesListas = Object.fromEntries(Object.keys(fuentesPendientes()).map(k => [k, sinDatos])) as Informe['fuentes']
  const informe = (extra: Partial<Informe> = {}) => informeBase({ fuentes: fuentesListas, ...extra })
  beforeEach(() => {
    openaiMock.mockReset()
    datosMock.leerPropiedad.mockResolvedValue({ id: 'p', direccion: 'Roque Pérez 3059', barrio: null, ciudad: null, tipo: null, precio: null, moneda: null, capturadaEl: null, foto: null })
    datosMock.leerInformeAnterior.mockResolvedValue(null)
    datosMock.guardarCambios.mockResolvedValue(true)
  })

  it('con datos todavía llegando no escribe (409) y no llama al modelo', async () => {
    const i = informe({ fuentes: { ...fuentesListas, meta: { estado: 'pendiente', actualizadoEn: null, datos: null, error: null } } })
    await expect(escribirTextos(i, AHORA, false)).rejects.toMatchObject({ status: 409 })
    expect(openaiMock).not.toHaveBeenCalled()
  })

  it('guarda los textos, respeta lo que Paula corrigió y marca lo que tiene números sin respaldo', async () => {
    openaiMock.mockResolvedValue({ texto: JSON.stringify(salida) })
    const fresco = informe({ manual: { ...informe().manual, textos: { accionesRealizadas: 'Lo escribió Paula' } } })
    datosMock.leerInforme.mockResolvedValue(fresco)
    const r = await escribirTextos(informe(), AHORA, false)
    const guardado = datosMock.guardarCambios.mock.calls[0][1].manual
    expect(guardado.textos.accionesRealizadas).toBe('Lo escribió Paula')
    expect(guardado.textos.resumenMetricas).toBe('La están viendo muchos compradores.')
    expect(guardado.redaccion.revisar).toEqual(['resumenConsultas'])
    expect(guardado.zonaprop).toEqual(fresco.manual.zonaprop)
    expect(r.manual.textos?.accionesRealizadas).toBe('Lo escribió Paula')
  })

  it('si el modelo falla o devuelve otra cosa, error legible (503) y no se guarda nada', async () => {
    openaiMock.mockRejectedValueOnce(new Error('OpenAI 500'))
    await expect(escribirTextos(informe(), AHORA, false)).rejects.toMatchObject({ status: 503 })
    openaiMock.mockResolvedValueOnce({ texto: '{"otra":"cosa"}' })
    await expect(escribirTextos(informe(), AHORA, false)).rejects.toMatchObject({ status: 503 })
    expect(datosMock.guardarCambios).not.toHaveBeenCalled()
  })
})

describe('competidoras que busca la plataforma', () => {
  const capital = { id: 'p', direccion: 'Roque Pérez 3059', barrio: 'Coghlan', ciudad: null, provincia: 'CABA', tipo: 'Departamento', precio: 200000, moneda: 'USD', capturadaEl: null, foto: null, ambientes: 3 }
  beforeEach(() => {
    listadoMock.mockReset(); scrapeMock.mockReset()
    datosMock.guardarCandidatas.mockResolvedValue(true)
  })

  it('busca en Argenprop por barrio y ambientes y guarda los avisos', async () => {
    datosMock.leerPropiedad.mockResolvedValue(capital)
    listadoMock.mockResolvedValue(readFileSync(path.join(__dirname, 'competencia', '__fixtures__', 'argenprop-listado.html'), 'utf8'))
    const r = await buscarCompetencia(informe(), 'argenprop', AHORA)
    expect(listadoMock).toHaveBeenCalledWith('https://www.argenprop.com/departamentos/venta/coghlan/3-ambientes')
    expect(r.estado).toBe('ok')
    expect(datosMock.guardarCandidatas).toHaveBeenCalledWith(ID, ['argenprop'], expect.objectContaining({ estado: 'ok' }))
    expect(r.avisos.length).toBeGreaterThan(0)
  })

  it('si el portal falla, queda guardado como error con su motivo (no como "no hay competencia")', async () => {
    datosMock.leerPropiedad.mockResolvedValue(capital)
    listadoMock.mockRejectedValue(new Error('El portal tardó demasiado en responder'))
    const r = await buscarCompetencia(informe(), 'mercadolibre', AHORA)
    expect(r).toMatchObject({ estado: 'error', error: 'El portal tardó demasiado en responder', avisos: [] })
    expect(datosMock.guardarCandidatas).toHaveBeenCalledWith(ID, ['mercadolibre'], expect.objectContaining({ estado: 'error' }))
  })

  it('fuera de Capital no busca en MercadoLibre y dice por qué', async () => {
    datosMock.leerPropiedad.mockResolvedValue({ ...capital, provincia: 'Buenos Aires', barrio: 'Villa Ballester' })
    const r = await buscarCompetencia(informe(), 'mercadolibre', AHORA)
    expect(r).toMatchObject({ estado: 'sin_busqueda', error: expect.stringMatching(/solo se puede armar en Capital/) })
    expect(listadoMock).not.toHaveBeenCalled()
  })

  it('solo abre avisos que encontró la propia búsqueda (no cualquier URL)', async () => {
    await expect(abrirCandidata(informe(), 'https://evil.example/x')).rejects.toMatchObject({ status: 400 })
    expect(scrapeMock).not.toHaveBeenCalled()
  })

  it('abre una candidata y guarda disposición y estado', async () => {
    const url = 'https://www.argenprop.com/x--1'
    const i = informe({ candidatas: { detalles: {}, argenprop: { estado: 'ok', error: null, buscadoEn: 'x', url: null, avisos: [{ url } as never] } } })
    scrapeMock.mockResolvedValue({ success: true, data: { features: { disposal: 'Frente', condition: 'Muy bueno', orientation: 'Norte', age: 12, garages: 1 } } })
    const d = await abrirCandidata(i, url)
    expect(d).toMatchObject({ disposicion: 'Frente', estado: 'Muy bueno', antiguedad: 12, cocheras: 1 })
    expect(datosMock.guardarCandidatas).toHaveBeenCalledWith(ID, ['detalles', url], expect.objectContaining({ disposicion: 'Frente' }))
  })
})
