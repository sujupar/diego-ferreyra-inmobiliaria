import { describe, expect, it } from 'vitest'
import { clienteYoutube } from './subida'

type Llamada = { url: string; init?: RequestInit }
function falso(respuestas: Response[]) {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const r = respuestas.shift()
    if (!r) throw new Error('sin respuesta')
    return r
  }) as typeof fetch
  return { f, llamadas }
}
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
const SESION = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=XYZ'
const llave = async () => 'AT'

describe('crearSesion', () => {
  it('abre la subida con título, descripción, público y "no es para chicos"', async () => {
    const { f, llamadas } = falso([new Response(null, { status: 200, headers: { location: SESION } })])
    const url = await clienteYoutube(llave, f).crearSesion({ titulo: 'Hola', descripcion: 'Texto', total: 1000, tipo: 'video/mp4' })
    expect(url).toBe(SESION)
    const h = new Headers(llamadas[0].init?.headers)
    expect(h.get('authorization')).toBe('Bearer AT')
    expect(h.get('x-upload-content-length')).toBe('1000')
    const cuerpo = JSON.parse(String(llamadas[0].init?.body))
    expect(cuerpo.snippet).toMatchObject({ title: 'Hola', description: 'Texto' })
    expect(cuerpo.status).toEqual({ privacyStatus: 'public', selfDeclaredMadeForKids: false })
  })

  it('una dirección de subida que no es de Google se rechaza', async () => {
    const { f } = falso([new Response(null, { status: 200, headers: { location: 'https://evil.com/x' } })])
    await expect(clienteYoutube(llave, f).crearSesion({ titulo: 'a', descripcion: '', total: 1, tipo: 'video/mp4' })).rejects.toThrow()
  })

  it('el límite diario de YouTube queda marcado como esperar', async () => {
    const { f } = falso([json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403)])
    const e = await clienteYoutube(llave, f).crearSesion({ titulo: 'a', descripcion: '', total: 1, tipo: 'video/mp4' }).catch((x) => x)
    expect(e).toMatchObject({ httpStatus: 403, motivo: 'quotaExceeded' })
  })
})

describe('estadoSubida', () => {
  it('con parte subida devuelve desde dónde seguir', async () => {
    const { f, llamadas } = falso([new Response(null, { status: 308, headers: { range: 'bytes=0-8388607' } })])
    expect(await clienteYoutube(llave, f).estadoSubida(SESION, 20_000_000)).toEqual({ tipo: 'parcial', offset: 8388608 })
    expect(new Headers(llamadas[0].init?.headers).get('content-range')).toBe('bytes */20000000')
  })

  it('sin nada subido arranca de cero', async () => {
    const { f } = falso([new Response(null, { status: 308 })])
    expect(await clienteYoutube(llave, f).estadoSubida(SESION, 10)).toEqual({ tipo: 'parcial', offset: 0 })
  })

  it('ya terminada devuelve el video (la función murió después del último pedazo)', async () => {
    const { f } = falso([json({ id: 'VID1' }, 200)])
    expect(await clienteYoutube(llave, f).estadoSubida(SESION, 10)).toEqual({ tipo: 'terminada', videoId: 'VID1' })
  })

  it('una sesión vencida se informa', async () => {
    const { f } = falso([new Response(null, { status: 404 })])
    expect(await clienteYoutube(llave, f).estadoSubida(SESION, 10)).toEqual({ tipo: 'vencida' })
  })
})

describe('privacidad', () => {
  it('lee con qué privacidad quedó el video', async () => {
    const { f, llamadas } = falso([json({ items: [{ status: { privacyStatus: 'private' } }] })])
    expect(await clienteYoutube(llave, f).privacidad('VID')).toBe('private')
    expect(llamadas[0].url).toBe('https://www.googleapis.com/youtube/v3/videos?part=status&id=VID')
  })
})

describe('subirParte', () => {
  it('manda el rango exacto y devuelve el nuevo punto', async () => {
    const { f, llamadas } = falso([new Response(null, { status: 308, headers: { range: 'bytes=0-3' } })])
    expect(await clienteYoutube(llave, f).subirParte(SESION, 0, new Uint8Array(4), 10, 3000)).toEqual({ tipo: 'parcial', offset: 4 })
    expect(new Headers(llamadas[0].init?.headers).get('content-range')).toBe('bytes 0-3/10')
  })

  it('el último pedazo devuelve el video', async () => {
    const { f } = falso([json({ id: 'VID2' }, 201)])
    expect(await clienteYoutube(llave, f).subirParte(SESION, 6, new Uint8Array(4), 10, 3000)).toEqual({ tipo: 'terminada', videoId: 'VID2' })
  })
})
