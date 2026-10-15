import { describe, it, expect, vi, beforeEach } from 'vitest'

const { accesoMock, datosMock } = vi.hoisted(() => ({
  accesoMock: vi.fn(),
  datosMock: { leerRegalo: vi.fn(), guardarRegalo: vi.fn(), borrarRegalo: vi.fn(), infoArchivo: vi.fn(), urlFirmada: vi.fn(), borrarArchivos: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/acceso-regalo', () => ({ autorizarRegalo: accesoMock }))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { GET, PUT, DELETE } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const ARCHIVO = `properties/${PROP}/regalo-${U1}.pdf`
const ARCHIVO_NUEVO = `properties/${PROP}/regalo-${U2}.pdf`
const PORTADA_NUEVA = `properties/${PROP}/portada-${U2}.jpg`
const ctx = { params: Promise.resolve({ id: PROP }) }
const req = (method: string, body?: unknown) => new Request('http://local', { method, ...(body ? { body: JSON.stringify(body) } : {}) }) as never
const REGALO = { propertyId: PROP, titulo: 'Guía', archivoPath: ARCHIVO, archivoNombre: 'Guía.pdf', archivoBytes: 1000, portadaPath: null, actualizadoEl: '' }
// El cuerpo DECLARA 2000 bytes; Storage, en el beforeEach, dice que el objeto real pesa 2048: la
// ruta tiene que guardar el REAL (2048), no el declarado — es justamente lo que prueban los tests.
const PUT_OK = { titulo: 'Guía de Caballito', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'Guía nueva.pdf', archivoBytes: 2000, portadaPath: null }
const INFO_PDF_REAL = { bytes: 2048, mimetype: 'application/pdf' }

beforeEach(() => {
  accesoMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1' })
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.infoArchivo.mockResolvedValue(INFO_PDF_REAL)
  datosMock.urlFirmada.mockResolvedValue('https://firmada')
})

describe('/api/properties/[id]/regalo', () => {
  it('GET: la vista con URLs firmadas (nunca públicas)', async () => {
    const body = await (await GET(req('GET'), ctx)).json()
    expect(body.data).toMatchObject({ titulo: 'Guía', archivoNombre: 'Guía.pdf', descargaUrl: 'https://firmada', portadaUrl: null })
  })
  it('PUT: guarda con el tamaño REAL de Storage (no el declarado), nombre saneado, y borra el PDF viejo reemplazado', async () => {
    expect((await PUT(req('PUT', PUT_OK), ctx)).status).toBe(200)
    expect(datosMock.guardarRegalo).toHaveBeenCalledWith({
      propertyId: PROP, titulo: 'Guía de Caballito', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'Guía nueva.pdf',
      archivoBytes: 2048, portadaPath: null, actorId: 'u1',
    })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO])
  })
  it('PUT: un path de otra propiedad o con trucos se rechaza sin tocar Storage', async () => {
    expect((await PUT(req('PUT', { ...PUT_OK, archivoPath: `properties/${U2}/regalo-${U1}.pdf` }), ctx)).status).toBe(400)
    expect((await PUT(req('PUT', { ...PUT_OK, archivoPath: `${ARCHIVO_NUEVO}/../x` }), ctx)).status).toBe(400)
    expect(datosMock.infoArchivo).not.toHaveBeenCalled()
  })
  it('PUT: un archivo que no terminó de subir (sin metadatos en Storage) se rechaza y se borra el objeto', async () => {
    datosMock.infoArchivo.mockResolvedValue(null)
    const res = await PUT(req('PUT', PUT_OK), ctx)
    expect([res.status, (await res.json()).error]).toEqual([400, 'El archivo no terminó de subir. Probá de nuevo.'])
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO_NUEVO])
    expect(datosMock.guardarRegalo).not.toHaveBeenCalled()
  })
  it('PUT: el objeto subido NO es un PDF real (mimetype real distinto al declarado) → 400, se borra y no se guarda', async () => {
    datosMock.infoArchivo.mockResolvedValue({ bytes: 2000, mimetype: 'application/octet-stream' })
    const res = await PUT(req('PUT', PUT_OK), ctx)
    expect([res.status, (await res.json()).error]).toEqual([400, 'El regalo tiene que ser un PDF'])
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO_NUEVO])
    expect(datosMock.guardarRegalo).not.toHaveBeenCalled()
  })
  it('PUT: la portada real no es una imagen válida → 400, se borra SOLO la portada y no se guarda nada', async () => {
    datosMock.infoArchivo.mockImplementation(async (path: string) =>
      path === PORTADA_NUEVA ? { bytes: 100, mimetype: 'application/pdf' } : INFO_PDF_REAL)
    const res = await PUT(req('PUT', { ...PUT_OK, portadaPath: PORTADA_NUEVA }), ctx)
    expect([res.status, (await res.json()).error]).toEqual([400, 'La portada tiene que ser JPG, PNG o WEBP'])
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([PORTADA_NUEVA])
    expect(datosMock.guardarRegalo).not.toHaveBeenCalled()
  })
  it('PUT: título corto → 400', async () => {
    expect((await PUT(req('PUT', { ...PUT_OK, titulo: 'ab' }), ctx)).status).toBe(400)
  })
  it('DELETE: borra la fila y los archivos', async () => {
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(200)
    expect(datosMock.borrarRegalo).toHaveBeenCalledWith(PROP)
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO])
  })
  it('sin permiso: ningún método toca la base', async () => {
    accesoMock.mockResolvedValue({ ok: false, status: 403, error: 'El regalo no está disponible para tu rol' })
    for (const r of [await GET(req('GET'), ctx), await PUT(req('PUT', PUT_OK), ctx), await DELETE(req('DELETE'), ctx)]) expect(r.status).toBe(403)
    expect(datosMock.leerRegalo).not.toHaveBeenCalled()
  })
})
