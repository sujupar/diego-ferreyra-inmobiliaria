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
