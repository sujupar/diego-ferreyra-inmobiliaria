import { describe, expect, it } from 'vitest'
import { clienteTiktok, MB, planDePartes } from './subida'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
function falso(respuestas: Response[]) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const r = respuestas.shift()
    if (!r) throw new Error('sin respuesta')
    return r
  }) as typeof fetch
  return { f, llamadas }
}
const llave = async () => 'AT'
const SUBIDA = 'https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=t'

describe('planDePartes', () => {
  it('un video de menos de 5 MB va en una sola parte', () => {
    expect(planDePartes(3 * MB)).toEqual({ tamanoParte: 3 * MB, cantidad: 1, partes: [{ desde: 0, hasta: 3 * MB - 1 }] })
  })

  it('uno grande va en partes de 8 MB y la última se queda con el resto (TikTok lo pide así)', () => {
    const p = planDePartes(20 * MB)
    expect(p.tamanoParte).toBe(8 * MB)
    expect(p.cantidad).toBe(2)
    expect(p.partes).toEqual([
      { desde: 0, hasta: 8 * MB - 1 },
      { desde: 8 * MB, hasta: 20 * MB - 1 },
    ])
  })

  it('las partes cubren el archivo entero sin huecos ni superposiciones', () => {
    for (const total of [5 * MB, 5 * MB + 1, 16 * MB, 199 * MB + 7]) {
      const { partes } = planDePartes(total)
      expect(partes[0].desde).toBe(0)
      expect(partes[partes.length - 1].hasta).toBe(total - 1)
      for (let i = 1; i < partes.length; i++) expect(partes[i].desde).toBe(partes[i - 1].hasta + 1)
    }
  })
})

describe('clienteTiktok', () => {
  it('inicia la subida a borradores declarando el plan de partes', async () => {
    const { f, llamadas } = falso([json({ data: { publish_id: 'P1', upload_url: SUBIDA }, error: { code: 'ok' } })])
    expect(await clienteTiktok(llave, f).iniciar({ total: 20 * MB, tamanoParte: 8 * MB, cantidad: 2 })).toEqual({ publishId: 'P1', uploadUrl: SUBIDA })
    expect(llamadas[0].url).toBe('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/')
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({
      source_info: { source: 'FILE_UPLOAD', video_size: 20 * MB, chunk_size: 8 * MB, total_chunk_count: 2 },
    })
  })

  it('demasiados borradores pendientes se informa con su código', async () => {
    const { f } = falso([json({ error: { code: 'spam_risk_too_many_pending_share', message: 'x' } }, 403)])
    const e = await clienteTiktok(llave, f).iniciar({ total: 1, tamanoParte: 1, cantidad: 1 }).catch((x) => x)
    expect(e).toMatchObject({ httpStatus: 403, motivo: 'spam_risk_too_many_pending_share' })
  })

  it('una dirección de subida que no es de TikTok se rechaza', async () => {
    const { f } = falso([json({ data: { publish_id: 'P', upload_url: 'https://evil.com/x' }, error: { code: 'ok' } })])
    await expect(clienteTiktok(llave, f).iniciar({ total: 1, tamanoParte: 1, cantidad: 1 })).rejects.toThrow()
  })

  it('sube una parte con su rango y distingue parcial de completa', async () => {
    const { f, llamadas } = falso([new Response(null, { status: 206 }), new Response(null, { status: 201 })])
    const c = clienteTiktok(llave, f)
    expect(await c.subirParte(SUBIDA, 0, new Uint8Array(4), 10, 3000)).toBe('parcial')
    expect(new Headers(llamadas[0].init?.headers).get('content-range')).toBe('bytes 0-3/10')
    expect(await c.subirParte(SUBIDA, 4, new Uint8Array(6), 10, 3000)).toBe('completa')
  })

  it('lee el estado de la publicación', async () => {
    const { f } = falso([json({ data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } })])
    expect(await clienteTiktok(llave, f).estado('P1')).toEqual({ status: 'SEND_TO_USER_INBOX', motivo: null })
  })
})
