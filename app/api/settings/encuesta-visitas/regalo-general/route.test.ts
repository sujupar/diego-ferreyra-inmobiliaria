import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'admin', logueado: true, activo: true },
  datosMock: {
    leerRegaloGeneral: vi.fn(), guardarRegaloGeneral: vi.fn(), borrarRegaloGeneral: vi.fn(),
    infoArchivo: vi.fn(), primerosBytes: vi.fn(), urlFirmada: vi.fn(), borrarArchivos: vi.fn(), crearSubidaFirmada: vi.fn(),
  },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: 'u1', email: 'a@b.c', profile: { id: 'u1', role: estado.role, is_active: estado.activo } } : null),
}))
vi.mock('@/lib/properties/acceso-media', () => ({ puedeGestionarMedia: vi.fn(async () => true) }))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { GET, PUT, DELETE } from './route'
import { POST as SUBIDA } from './subida/route'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const PROP = '33333333-3333-4333-8333-333333333333'
const ARCHIVO = `general/regalo-${U1}.pdf`
const ARCHIVO_NUEVO = `general/regalo-${U2}.pdf`
const PORTADA_NUEVA = `general/portada-${U2}.jpg`
const GENERAL = { titulo: 'Guía de gastos para compradores', archivoPath: ARCHIVO, archivoNombre: 'guia.pdf', archivoBytes: 1000, portadaPath: `general/portada-${U1}.jpg`, actualizadoEl: '' }
const PUT_OK = { titulo: 'Guía de gastos para compradores', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'guía nueva.pdf', archivoBytes: 2000, portadaPath: PORTADA_NUEVA }
const req = (method: string, body?: unknown) => new Request('http://local', { method, ...(body ? { body: JSON.stringify(body) } : {}) }) as never
const BYTES_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
const BYTES_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

beforeEach(() => {
  estado.role = 'admin'; estado.logueado = true; estado.activo = true
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerRegaloGeneral.mockResolvedValue(GENERAL)
  datosMock.infoArchivo.mockImplementation(async (p: string) => (p.includes('/portada-') ? { bytes: 300, mimetype: 'image/jpeg' } : { bytes: 2048, mimetype: 'application/pdf' }))
  datosMock.primerosBytes.mockImplementation(async (p: string) => (p.includes('/portada-') ? BYTES_JPEG : BYTES_PDF))
  datosMock.urlFirmada.mockResolvedValue('https://firmada')
  datosMock.crearSubidaFirmada.mockImplementation(async (path: string) => ({ signedUrl: 'https://subida', token: 't', path }))
})

describe('GET /api/settings/encuesta-visitas/regalo-general', () => {
  it('cualquier rol del equipo (menos abogado) ve el regalo general, con URLs firmadas', async () => {
    for (const rol of ['admin', 'dueno', 'coordinador', 'asesor']) {
      estado.role = rol
      const body = await (await GET()).json()
      expect(body.data).toMatchObject({ titulo: 'Guía de gastos para compradores', archivoNombre: 'guia.pdf', portadaUrl: 'https://firmada', descargaUrl: 'https://firmada' })
    }
  })
  it('sin regalo general: data null', async () => {
    datosMock.leerRegaloGeneral.mockResolvedValue(null)
    expect((await (await GET()).json()).data).toBeNull()
  })
  it('abogado 403, sin sesión o inactivo 401', async () => {
    estado.role = 'abogado'
    expect((await GET()).status).toBe(403)
    estado.role = 'admin'; estado.logueado = false
    expect((await GET()).status).toBe(401)
    estado.logueado = true; estado.activo = false
    expect((await GET()).status).toBe(401)
  })
})

describe('escribir el regalo general: solo admin y dueño', () => {
  it('coordinador y asesor: 403 en subida, PUT y DELETE, sin tocar Storage ni la base', async () => {
    for (const rol of ['coordinador', 'asesor', 'abogado']) {
      estado.role = rol
      expect((await SUBIDA(req('POST', { archivo: { nombre: 'g.pdf', bytes: 10 } }))).status).toBe(403)
      expect((await PUT(req('PUT', PUT_OK))).status).toBe(403)
      expect((await DELETE())).toHaveProperty('status', 403)
    }
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
    expect(datosMock.guardarRegaloGeneral).not.toHaveBeenCalled()
    expect(datosMock.borrarRegaloGeneral).not.toHaveBeenCalled()
  })
  it('subida: firma paths en general/, nunca en una propiedad', async () => {
    const body = await (await SUBIDA(req('POST', { archivo: { nombre: 'g.pdf', bytes: 10 }, portada: { nombre: 'tapa.png', bytes: 10 } }))).json()
    expect(body.data.archivo.path).toMatch(/^general\/regalo-[0-9a-f-]{36}\.pdf$/)
    expect(body.data.portada.path).toMatch(/^general\/portada-[0-9a-f-]{36}\.png$/)
  })
  it('subida: rechaza lo que no es PDF antes de firmar', async () => {
    expect((await SUBIDA(req('POST', { archivo: { nombre: 'g.docx', bytes: 10 } }))).status).toBe(400)
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
  })
  it('PUT: guarda el tamaño REAL y borra los archivos viejos', async () => {
    const res = await PUT(req('PUT', PUT_OK))
    expect(res.status).toBe(200)
    expect(datosMock.guardarRegaloGeneral).toHaveBeenCalledWith({
      titulo: 'Guía de gastos para compradores', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'guía nueva.pdf',
      archivoBytes: 2048, portadaPath: PORTADA_NUEVA, actorId: 'u1',
    })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO, `general/portada-${U1}.jpg`])
  })
  it('PUT: un path de propiedad o con recorrido de carpeta se rechaza sin tocar Storage', async () => {
    for (const archivoPath of [`properties/${PROP}/regalo-${U2}.pdf`, `general/regalo-${U2}.pdf/../x`]) {
      expect((await PUT(req('PUT', { ...PUT_OK, archivoPath }))).status).toBe(400)
    }
    expect((await PUT(req('PUT', { ...PUT_OK, portadaPath: `properties/${PROP}/portada-${U2}.jpg` }))).status).toBe(400)
    expect(datosMock.infoArchivo).not.toHaveBeenCalled()
    expect(datosMock.guardarRegaloGeneral).not.toHaveBeenCalled()
  })
  it('PUT: un archivo que dice ser PDF pero no lo es se borra y se rechaza', async () => {
    datosMock.primerosBytes.mockResolvedValue(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))
    const res = await PUT(req('PUT', { ...PUT_OK, portadaPath: null }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('El archivo no es un PDF válido.')
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO_NUEVO])
    expect(datosMock.guardarRegaloGeneral).not.toHaveBeenCalled()
  })
  it('PUT: título corto → 400', async () => {
    expect((await PUT(req('PUT', { ...PUT_OK, titulo: 'G' }))).status).toBe(400)
  })
  it('DELETE: borra la fila y los archivos', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(datosMock.borrarRegaloGeneral).toHaveBeenCalled()
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO, `general/portada-${U1}.jpg`])
  })
})
