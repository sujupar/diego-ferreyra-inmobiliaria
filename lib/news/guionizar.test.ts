import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guionizarPieza } from './guionizar'
import type { NewsScript } from './scripts-repo'

const pieza: NewsScript = {
  id: 'abc',
  created_at: '2026-10-29T00:00:00Z',
  updated_at: '2026-10-29T00:00:00Z',
  titulo: 'Bajan las tasas de los créditos hipotecarios',
  medio: 'Infobae',
  fecha_articulo: '2026-10-28',
  url: 'https://example.com/nota',
  resumen: 'Los bancos reducen tasas y se reactiva el crédito.',
  formato: 'A cámara',
  guion: null,
  estado: 'guionizando',
  error_msg: null,
  avisado_at: null,
  creado_por: null,
}

const okResponse = (text: string) => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
})

describe('guionizarPieza', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key-ficticia')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('arma un prompt con la voz de Diego y devuelve el guion de Gemini', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('  [a cámara] Mirá, bajaron las tasas.  '))
    vi.stubGlobal('fetch', fetchMock)

    const guion = await guionizarPieza(pieza)

    expect(guion).toBe('[a cámara] Mirá, bajaron las tasas.')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('generativelanguage.googleapis.com')
    const body = String(init.body)
    const reglas = readFileSync(join(process.cwd(), 'lib/guion/voz/REGLAS-VOZ-DIEGO.md'), 'utf8')
    const prompt = JSON.parse(body).systemInstruction.parts[0].text as string
    expect(prompt).toContain(reglas.trim())
    expect(prompt).toContain('Mirá')
    expect(body).toContain('Bajan las tasas')
    expect(body).toContain('https://example.com/nota')
  })

  it('throw si Gemini devuelve vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('   ')))
    await expect(guionizarPieza(pieza)).rejects.toThrow()
  })

  it('throw si Gemini responde ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }),
    )
    await expect(guionizarPieza(pieza)).rejects.toThrow(/500/)
  })

  it('throw si fetch rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(guionizarPieza(pieza)).rejects.toThrow('network')
  })
})
