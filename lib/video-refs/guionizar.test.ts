import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { guionizarReferencia } from './guionizar'
import type { VideoRef } from './repo'

const ref: VideoRef = {
  id: 'r1',
  created_at: '2026-11-04T00:00:00Z',
  updated_at: '2026-11-04T00:00:00Z',
  cuenta: '@tapiola',
  plataforma: 'tiktok',
  url_video: 'https://example.com/video/1',
  fecha_video: null,
  vistas: null,
  likes: null,
  comentarios: null,
  multiplicador: null,
  baseline_cuenta: null,
  seguidores: null,
  tema: 'Cuánto cuesta realmente comprar una propiedad',
  por_que: 'Muestra el costo oculto',
  gancho: 'Nadie te dice esto antes de comprar',
  adaptacion_diego: null,
  tipo: 'video_cuenta',
  estado_uso: 'guionizando',
  thumbnail_url: null,
  ficha_slug: 'ar-tapiola-x',
  guion: null,
  guion_error: null,
  avisado_at: null,
  creado_por: null,
  fuente: 'openclaw',
  ig_shortcode: null,
  video_storage_path: null,
  portada_storage_path: null,
  formato: null,
  comentarios_analisis: null,
  transcripcion: null,
  categoria: null,
  tema_categoria: null,
  puntaje: null,
  oculta: false,
  no_sirve_motivo: null,
  no_sirve_at: null,
  radar_run_id: null,
}

const okResponse = (text: string, finishReason = 'STOP') => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }),
})

describe('guionizarReferencia', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key-ficticia')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('devuelve el guion y arma payload con los campos no nulos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('  Mirá, esto nadie te lo cuenta.  '))
    vi.stubGlobal('fetch', fetchMock)
    const guion = await guionizarReferencia(ref)
    expect(guion).toBe('Mirá, esto nadie te lo cuenta.')
    const parsed = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    const user = parsed.contents[0].parts[0].text as string
    expect(user).toContain('Cuánto cuesta realmente')
    expect(user).toContain('Nadie te dice esto')
    expect(user).toContain('@tapiola')
    expect(user).toContain('https://example.com/video/1')
    expect(user).not.toMatch(/adaptaci/i)
    expect(parsed.systemInstruction.parts[0].text).toContain('REFERENCIA')
  })

  it('una fila vieja (campos nuevos null) arma exactamente el mismo pedido de siempre', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'))
    vi.stubGlobal('fetch', fetchMock)
    await guionizarReferencia(ref)
    const user = JSON.parse(String(fetchMock.mock.calls[0][1].body)).contents[0].parts[0].text as string
    expect(user).toBe(
      [
        'Tema: Cuánto cuesta realmente comprar una propiedad',
        'Por qué funcionó: Muestra el costo oculto',
        'Gancho: Nadie te dice esto antes de comprar',
        'Cuenta de origen: @tapiola',
        'URL del video: https://example.com/video/1',
      ].join('\n'),
    )
  })

  it('incluye formato y comentarios cuando existen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'))
    vi.stubGlobal('fetch', fetchMock)
    await guionizarReferencia({ ...ref, formato: 'Noticia con foto', comentarios_analisis: 'Piden el link' })
    const user = JSON.parse(String(fetchMock.mock.calls[0][1].body)).contents[0].parts[0].text as string
    expect(user).toContain('Formato: Noticia con foto')
    expect(user).toContain('Qué dicen los comentarios: Piden el link')
  })

  it('recorta la transcripción a 2.000 caracteres', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'))
    vi.stubGlobal('fetch', fetchMock)
    await guionizarReferencia({ ...ref, transcripcion: 'a'.repeat(5000) })
    const user = JSON.parse(String(fetchMock.mock.calls[0][1].body)).contents[0].parts[0].text as string
    const linea = user.split('\n').find((l) => l.startsWith('Transcripción del original: '))!
    expect(linea.length).toBe('Transcripción del original: '.length + 2000)
  })

  it('throw si falta GEMINI_API_KEY', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(guionizarReferencia(ref)).rejects.toThrow(/GEMINI_API_KEY/)
  })

  it('throw si finishReason != STOP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('a medias', 'MAX_TOKENS')))
    await expect(guionizarReferencia(ref)).rejects.toThrow(/MAX_TOKENS/)
  })

  it('throw si el texto viene vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('   ')))
    await expect(guionizarReferencia(ref)).rejects.toThrow()
  })
})
