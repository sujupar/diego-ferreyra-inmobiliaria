import { beforeEach, describe, expect, it, vi } from 'vitest'

const paginaFetch = vi.fn()
vi.mock('@/lib/integrations/instagram/client', () => ({
  paginaFetch: (...a: unknown[]) => paginaFetch(...a),
  paginaDeLaCuenta: async () => ({ pageId: 'PAG', pageToken: 't' }),
}))

const { esComentarioDeLaPagina, responderComentarioFb } = await import('./comentarios')

beforeEach(() => paginaFetch.mockReset().mockResolvedValue({ id: 'r1' }))

describe('responderComentarioFb', () => {
  it('responde en el hilo del comentario con el token de la Página', async () => {
    await responderComentarioFb('1092_555', '¡Gracias! Te escribí al privado 🙌')
    const [ruta, init] = paginaFetch.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe('/1092_555/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ message: '¡Gracias! Te escribí al privado 🙌' })
  })

  it('no manda una respuesta vacía', async () => {
    await expect(responderComentarioFb('c', '  ')).rejects.toThrow(/vacía/)
    expect(paginaFetch).not.toHaveBeenCalled()
  })

  it('un identificador con caracteres raros no viaja en la ruta', async () => {
    await expect(responderComentarioFb('../me/feed', 'hola')).rejects.toThrow()
    expect(paginaFetch).not.toHaveBeenCalled()
  })
})

describe('esComentarioDeLaPagina', () => {
  it('reconoce los comentarios de la propia Página (nuestras respuestas)', async () => {
    expect(await esComentarioDeLaPagina('PAG')).toBe(true)
    expect(await esComentarioDeLaPagina('7788')).toBe(false)
    expect(await esComentarioDeLaPagina(null)).toBe(false)
  })
})
