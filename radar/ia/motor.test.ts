import { describe, it, expect, vi, afterEach } from 'vitest'
import { crearPedirJSON } from './motor'

const opts = { system: 's', partes: [{ texto: 't' }], nivel: 'rapido' as const, timeoutMs: 1000 }

function dobles() {
  return {
    claude: vi.fn(async () => '{"de":"claude"}'),
    gemini: vi.fn(async () => '{"de":"gemini"}'),
  }
}

describe('pedirJSON (motor intercambiable)', () => {
  const original = process.env.RADAR_IA
  afterEach(() => {
    if (original === undefined) delete process.env.RADAR_IA
    else process.env.RADAR_IA = original
  })

  it('usa Claude por defecto', async () => {
    delete process.env.RADAR_IA
    const m = dobles()
    expect(await crearPedirJSON(m)(opts)).toBe('{"de":"claude"}')
    expect(m.claude).toHaveBeenCalledTimes(1)
    expect(m.gemini).not.toHaveBeenCalled()
  })
  it('usa Gemini con RADAR_IA=gemini', async () => {
    process.env.RADAR_IA = 'gemini'
    const m = dobles()
    expect(await crearPedirJSON(m)(opts)).toBe('{"de":"gemini"}')
    expect(m.claude).not.toHaveBeenCalled()
  })
  it('tira con un mensaje claro ante otro valor', async () => {
    process.env.RADAR_IA = 'otra'
    const m = dobles()
    await expect(crearPedirJSON(m)(opts)).rejects.toThrow(/RADAR_IA.*otra/)
    expect(m.claude).not.toHaveBeenCalled()
    expect(m.gemini).not.toHaveBeenCalled()
  })
  it('le pasa el modelo según el nivel', async () => {
    delete process.env.RADAR_IA
    const m = dobles()
    await crearPedirJSON(m)({ ...opts, nivel: 'profundo' })
    expect(m.claude).toHaveBeenCalledWith(expect.objectContaining({ modelo: 'sonnet', system: 's' }))
  })
})
