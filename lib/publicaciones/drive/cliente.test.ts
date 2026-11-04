import { describe, expect, it } from 'vitest'
import { ErrorHttp } from '../servidor/http'
import { clienteDrive } from './cliente'

type Llamada = { url: string; init?: RequestInit }

function falso(respuestas: Array<Response | (() => Response)>) {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const r = respuestas.shift()
    if (!r) throw new Error('sin respuesta preparada')
    return typeof r === 'function' ? r() : r
  }) as typeof fetch
  return { f, llamadas }
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
const errorGoogle = (status: number, reason: string) => json({ error: { code: status, message: reason, errors: [{ reason }] } }, status)

describe('listarCarpeta', () => {
  it('trae los archivos de todas las páginas y cuenta las subcarpetas aparte', async () => {
    const { f, llamadas } = falso([
      json({ id: 'C1', name: 'Videos semana', mimeType: 'application/vnd.google-apps.folder' }),
      json({
        nextPageToken: 'p2',
        files: [
          { id: 'a', name: 'uno.mp4', mimeType: 'video/mp4', size: '100' },
          { id: 'sub', name: 'otra', mimeType: 'application/vnd.google-apps.folder' },
        ],
      }),
      json({ files: [{ id: 'b', name: 'dos.webm', mimeType: 'video/webm', size: '50' }] }),
    ])
    const r = await clienteDrive('CLAVE', f).listar({ id: 'C1', tipo: 'carpeta' })
    expect(r.nombre).toBe('Videos semana')
    expect(r.archivos.map((a) => [a.id, a.apto])).toEqual([['a', true], ['b', false]])
    expect(r.subcarpetas).toBe(1)
    const lista = new URL(llamadas[1].url)
    expect(lista.searchParams.get('q')).toBe("'C1' in parents and trashed = false")
    expect(lista.searchParams.get('supportsAllDrives')).toBe('true')
    expect(lista.searchParams.get('key')).toBe('CLAVE')
    expect(new URL(llamadas[2].url).searchParams.get('pageToken')).toBe('p2')
  })

  it('un enlace a un archivo devuelve ese solo archivo', async () => {
    const { f } = falso([json({ id: 'v', name: 'solo.mov', mimeType: 'video/quicktime', size: '10' })])
    const r = await clienteDrive('K', f).listar({ id: 'v', tipo: 'archivo' })
    expect(r.nombre).toBeNull()
    expect(r.archivos).toHaveLength(1)
    expect(r.archivos[0]).toMatchObject({ id: 'v', apto: true })
  })

  it('un enlace "open?id=" se resuelve mirando qué es', async () => {
    const { f } = falso([
      json({ id: 'C', name: 'Carpeta', mimeType: 'application/vnd.google-apps.folder' }),
      json({ files: [] }),
    ])
    const r = await clienteDrive('K', f).listar({ id: 'C', tipo: 'desconocido' })
    expect(r).toMatchObject({ nombre: 'Carpeta', archivos: [] })
  })

  it('manda la clave de recurso de los enlaces viejos', async () => {
    const { f, llamadas } = falso([json({ id: 'v', name: 'a.mp4', mimeType: 'video/mp4', size: '1' })])
    await clienteDrive('K', f).listar({ id: 'v', tipo: 'archivo', resourceKey: '0-xyz' })
    expect(new Headers(llamadas[0].init?.headers).get('x-goog-drive-resource-keys')).toBe('v/0-xyz')
  })

  it('una carpeta privada o inexistente pide compartirla con el enlace', async () => {
    const { f } = falso([errorGoogle(404, 'notFound')])
    const e = await clienteDrive('K', f).listar({ id: 'C', tipo: 'carpeta' }).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorHttp)
    expect(e.status).toBe(404)
    expect(e.message).toMatch(/Cualquier persona con el enlace/)
  })

  it('una clave de Google mal cargada se le avisa al administrador, no a quien pegó el enlace', async () => {
    const { f } = falso([errorGoogle(400, 'badRequest')])
    const e = await clienteDrive('K', f).listar({ id: 'C', tipo: 'carpeta' }).catch((x) => x)
    expect(e.status).toBe(503)
    expect(e.message).toMatch(/administrador/)
  })

  it('un límite de Google pide esperar', async () => {
    const { f } = falso([errorGoogle(403, 'userRateLimitExceeded')])
    const e = await clienteDrive('K', f).listar({ id: 'C', tipo: 'carpeta' }).catch((x) => x)
    expect(e.status).toBe(503)
    expect(e.message).toMatch(/esperar/)
  })

  it('sin la clave configurada no llama a Google', async () => {
    const { f, llamadas } = falso([])
    const e = await clienteDrive('', f).listar({ id: 'C', tipo: 'carpeta' }).catch((x) => x)
    expect(e.status).toBe(503)
    expect(llamadas).toHaveLength(0)
  })

  it('Drive que no responde da un mensaje legible', async () => {
    const f = (async () => {
      throw new DOMException('timeout', 'TimeoutError')
    }) as typeof fetch
    const e = await clienteDrive('K', f).listar({ id: 'C', tipo: 'carpeta' }).catch((x) => x)
    expect(e.status).toBe(503)
    expect(e.message).toMatch(/Drive no respondió/)
  })
})

describe('descargarParte', () => {
  it('pide el rango exacto y devuelve los bytes', async () => {
    const { f, llamadas } = falso([new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 })])
    const parte = await clienteDrive('K', f).descargarParte('v', 10, 13)
    expect(Array.from(parte)).toEqual([1, 2, 3, 4])
    expect(new Headers(llamadas[0].init?.headers).get('range')).toBe('bytes=10-13')
    expect(new URL(llamadas[0].url).searchParams.get('alt')).toBe('media')
  })

  it('una parte más corta que lo pedido es un error (no se copia un archivo roto)', async () => {
    const { f } = falso([new Response(new Uint8Array([1, 2]), { status: 206 })])
    await expect(clienteDrive('K', f).descargarParte('v', 10, 13)).rejects.toThrow(/incompleta/)
  })

  it('un 200 entero en medio del archivo es un error (ignoró el rango)', async () => {
    const { f } = falso([new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })])
    await expect(clienteDrive('K', f).descargarParte('v', 10, 13)).rejects.toThrow(/rango/)
  })

  it('el dueño que no deja descargar se explica', async () => {
    const { f } = falso([errorGoogle(403, 'cannotDownloadFile')])
    const e = await clienteDrive('K', f).descargarParte('v', 0, 3).catch((x) => x)
    expect(e.message).toMatch(/descargar/)
  })
})
