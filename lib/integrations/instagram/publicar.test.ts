import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  crearContenedorReel,
  estadoContenedor,
  listarReelsPublicados,
  publicarContenedor,
} from './publicar'

const IG = '17841421542114621'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = IG
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function responde(texto: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, text: async () => texto })
}

describe('crearContenedorReel', () => {
  it('pide un contenedor de tipo REELS con el video y la descripción', async () => {
    const espia = responde('{"id":"18140439997718071"}')
    vi.stubGlobal('fetch', espia)

    const id = await crearContenedorReel({
      videoUrl: 'https://ejemplo.com/reel.mp4',
      descripcion: 'Departamento en Almagro',
    })

    expect(id).toBe('18140439997718071')
    const [url, init] = espia.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/${IG}/media`)
    expect(init.method).toBe('POST')
    const cuerpo = JSON.parse(init.body as string)
    expect(cuerpo.media_type).toBe('REELS')
    expect(cuerpo.video_url).toBe('https://ejemplo.com/reel.mp4')
    expect(cuerpo.caption).toBe('Departamento en Almagro')
  })

  it('el reel también aparece en el perfil, no solo en la pestaña de reels', async () => {
    // Sin `share_to_feed`, el reel no se ve al entrar al perfil de la
    // inmobiliaria — que es adonde llega la gente desde los anuncios.
    const espia = responde('{"id":"x"}')
    vi.stubGlobal('fetch', espia)
    await crearContenedorReel({ videoUrl: 'https://e.com/r.mp4', descripcion: 'x' })
    expect(JSON.parse((espia.mock.calls[0][1] as RequestInit).body as string).share_to_feed).toBe(true)
  })

  it('si Instagram no devuelve un id, falla en vez de seguir con un id vacío', async () => {
    vi.stubGlobal('fetch', responde('{"sin_id":true}'))
    await expect(
      crearContenedorReel({ videoUrl: 'https://e.com/r.mp4', descripcion: 'x' }),
    ).rejects.toThrow(/identificador/i)
  })

  it('rechaza una URL que no sea https ANTES de llamar a Instagram', async () => {
    // El video se sirve desde nuestro almacenamiento. Una URL que no sea https
    // no la va a poder bajar Instagram, y además es la puerta por la que se
    // cuelan destinos raros si alguna vez esto se arma con datos de afuera.
    const espia = responde('{"id":"x"}')
    vi.stubGlobal('fetch', espia)
    await expect(
      crearContenedorReel({ videoUrl: 'http://ejemplo.com/reel.mp4', descripcion: 'x' }),
    ).rejects.toThrow(/https/i)
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('estadoContenedor', () => {
  const casos = [
    ['IN_PROGRESS', 'EN_PROCESO'],
    ['FINISHED', 'LISTO'],
    // PUBLISHED NO es LISTO. "Listo" significa "terminé de procesarlo,
    // publicalo"; PUBLISHED significa "esto YA está publicado". Confundirlos
    // hacía que el cron llamara a media_publish sobre algo ya publicado → el
    // reel quedaba marcado fallido estando online, y un "Reintentar" publicaba
    // un SEGUNDO reel idéntico en la cuenta.
    ['PUBLISHED', 'YA_PUBLICADO'],
    ['ERROR', 'ERROR'],
    ['EXPIRED', 'VENCIDO'],
  ] as const

  for (const [deMeta, nuestro] of casos) {
    it(`traduce ${deMeta} a ${nuestro}`, async () => {
      vi.stubGlobal('fetch', responde(JSON.stringify({ status_code: deMeta })))
      expect(await estadoContenedor('c1')).toBe(nuestro)
    })
  }

  it('un estado desconocido se trata como EN_PROCESO, nunca como listo', async () => {
    // Falla cerrado: dar por listo algo que no entendemos publicaría un reel a
    // medio procesar, o rompería el paso siguiente con un id vacío.
    vi.stubGlobal('fetch', responde('{"status_code":"ALGO_NUEVO"}'))
    expect(await estadoContenedor('c1')).toBe('EN_PROCESO')
  })

  it('sin status_code tampoco se da por listo', async () => {
    vi.stubGlobal('fetch', responde('{}'))
    expect(await estadoContenedor('c1')).toBe('EN_PROCESO')
  })
})

describe('publicarContenedor', () => {
  it('publica y devuelve el id del reel con su enlace', async () => {
    const espia = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"id":"17999"}' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"permalink":"https://instagram.com/reel/abc"}' })
    vi.stubGlobal('fetch', espia)

    expect(await publicarContenedor('c1')).toEqual({
      igMediaId: '17999',
      permalink: 'https://instagram.com/reel/abc',
    })
    expect(espia.mock.calls[0][0]).toContain(`/${IG}/media_publish`)
  })

  it('si el enlace no se puede leer, el reel igual queda publicado', async () => {
    // El enlace es una comodidad. Fallar acá dejaría el reel publicado en
    // Instagram pero marcado como fallido en la plataforma: lo peor de los dos
    // mundos, porque el reintento publicaría un segundo reel.
    const espia = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"id":"17999"}' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'ups' })
    vi.stubGlobal('fetch', espia)

    expect(await publicarContenedor('c1')).toEqual({ igMediaId: '17999', permalink: null })
  })

  it('sin id de publicación falla ruidoso', async () => {
    vi.stubGlobal('fetch', responde('{}'))
    await expect(publicarContenedor('c1')).rejects.toThrow(/identificador/i)
  })
})

describe('listarReelsPublicados', () => {
  it('devuelve solo los REELS, no las fotos ni los carruseles', async () => {
    const cuerpo = JSON.stringify({
      data: [
        { id: '1', media_product_type: 'REELS', media_type: 'VIDEO', timestamp: '2026-09-20T15:04:08+0000', comments_count: 33, permalink: 'p1', caption: 'uno' },
        { id: '2', media_product_type: 'FEED', media_type: 'IMAGE', timestamp: '2026-09-19T10:00:00+0000', comments_count: 2, permalink: 'p2', caption: 'dos' },
      ],
    })
    vi.stubGlobal('fetch', responde(cuerpo))

    const reels = await listarReelsPublicados()
    expect(reels).toHaveLength(1)
    expect(reels[0].id).toBe('1')
    expect(reels[0].comentarios).toBe(33)
  })

  it('no rompe si Instagram devuelve una lista vacía o rara', async () => {
    vi.stubGlobal('fetch', responde('{}'))
    expect(await listarReelsPublicados()).toEqual([])
  })

  it('los campos que faltan quedan en null, no en undefined', async () => {
    vi.stubGlobal('fetch', responde('{"data":[{"id":"1","media_product_type":"REELS"}]}'))
    const [reel] = await listarReelsPublicados()
    expect(reel.descripcion).toBeNull()
    expect(reel.miniatura).toBeNull()
    expect(reel.comentarios).toBe(0)
  })
})
