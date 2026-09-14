import { describe, it, expect, vi } from 'vitest'
import { materializarFotosIncrustadas, type SubidorDeFotos } from './materializar-fotos'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const URL1 = 'https://s/1.jpg'
const URL2 = 'https://s/2.jpg'

function subidorFalso(opts: { fallaEn?: number } = {}): SubidorDeFotos & { llamadas: { path: string; mime: string; bytes: number }[] } {
  const llamadas: { path: string; mime: string; bytes: number }[] = []
  return {
    llamadas,
    async subir(path, bytes, mime) {
      llamadas.push({ path, mime, bytes: bytes.length })
      if (opts.fallaEn === llamadas.length) throw new Error('storage caído')
      return `https://storage/${path}`
    },
  }
}

describe('materializarFotosIncrustadas', () => {
  it('sube cada foto incrustada y la reemplaza por su URL, en el mismo orden', async () => {
    const subidor = subidorFalso()
    const r = await materializarFotosIncrustadas('prop-1', [URL1, PNG, URL2], subidor)
    expect(r.photos).toHaveLength(3)
    expect(r.photos[0]).toBe(URL1)
    expect(r.photos[1]).toMatch(/^https:\/\/storage\/properties\/prop-1\/photos\/[0-9a-f-]{36}\.png$/)
    expect(r.photos[2]).toBe(URL2)
    expect(r.subidas).toBe(1)
    expect(r.descartadas).toBe(0)
    expect(subidor.llamadas[0].mime).toBe('image/png')
    expect(subidor.llamadas[0].bytes).toBe(70)
  })

  it('sin fotos incrustadas no toca Storage y devuelve el array tal cual', async () => {
    const subidor = subidorFalso()
    const r = await materializarFotosIncrustadas('prop-1', [URL1, URL2], subidor)
    expect(r.photos).toEqual([URL1, URL2])
    expect(r.subidas).toBe(0)
    expect(subidor.llamadas).toHaveLength(0)
  })

  it('una subida que falla descarta ESA foto y sigue con el resto (nunca queda un data: en photos)', async () => {
    const subidor = subidorFalso({ fallaEn: 1 })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await materializarFotosIncrustadas('prop-1', [PNG, URL1, PNG], subidor)
    expect(r.photos).toHaveLength(2)
    expect(r.photos[0]).toBe(URL1)
    expect(r.photos[1]).toMatch(/^https:\/\/storage\//)
    expect(r.subidas).toBe(1)
    expect(r.descartadas).toBe(1)
    expect(r.photos.some(p => p.startsWith('data:'))).toBe(false)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('un data URL que no es imagen soportada se descarta sin subir', async () => {
    const subidor = subidorFalso()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await materializarFotosIncrustadas('prop-1', ['data:text/html;base64,PGh0bWw+', URL1], subidor)
    expect(r.photos).toEqual([URL1])
    expect(r.descartadas).toBe(1)
    expect(subidor.llamadas).toHaveLength(0)
    error.mockRestore()
  })

  it('lo que no es string se descarta', async () => {
    const subidor = subidorFalso()
    const r = await materializarFotosIncrustadas('p', [null as unknown as string, URL1], subidor)
    expect(r.photos).toEqual([URL1])
  })
})
