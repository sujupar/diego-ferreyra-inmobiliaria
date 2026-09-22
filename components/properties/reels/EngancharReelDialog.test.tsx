// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EngancharReelDialog } from './EngancharReelDialog'

function respuesta(cuerpo: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, text: async () => JSON.stringify(cuerpo) }
}

const REEL_IG = { id: 'm1', permalink: null, descripcion: 'Semipiso Doblas', miniatura: null, fecha: '2026-09-20T15:04:08Z', comentarios: 33, yaEnganchado: false }

afterEach(() => { vi.unstubAllGlobals() })

function montar() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/instagram/media') return respuesta({ reels: [REEL_IG] })
    if (init?.method === 'POST') return respuesta({ reel: { id: 'r1' } })
    return respuesta({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const onListo = vi.fn()
  render(<EngancharReelDialog propertyId="p1" abierto slugLanding="depto" privadosActivos={false} onCerrar={() => {}} onListo={onListo} />)
  return { fetchMock, onListo }
}

describe('EngancharReelDialog', () => {
  it('no deja avanzar sin reel y sin al menos una palabra', async () => {
    montar()
    const siguiente = await screen.findByRole('button', { name: /Siguiente: revisar los mensajes/ })
    expect((siguiente as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: /Semipiso Doblas/ }))
    expect((siguiente as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Palabras que activan la respuesta/), { target: { value: 'doblas' } })
    expect((siguiente as HTMLButtonElement).disabled).toBe(false)
  })

  it('la revisión de mensajes es obligatoria: Enganchar recién aparece en el paso 2', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /Semipiso Doblas/ }))
    fireEvent.change(screen.getByLabelText(/Palabras que activan la respuesta/), { target: { value: 'doblas, info' } })
    expect(screen.queryByRole('button', { name: /^Enganchar$/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente: revisar los mensajes/ }))
    expect(screen.getByText('Revisá los mensajes')).toBeTruthy()
    expect(screen.getByLabelText('Frase 1 cuando el privado sale')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Enganchar$/ })).toBeTruthy()
  })

  it('lo que se engancha incluye los mensajes revisados y editados', async () => {
    const { fetchMock, onListo } = montar()
    fireEvent.click(await screen.findByRole('button', { name: /Semipiso Doblas/ }))
    fireEvent.change(screen.getByLabelText(/Palabras que activan la respuesta/), { target: { value: 'doblas' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente: revisar los mensajes/ }))
    fireEvent.change(screen.getByLabelText('Frase 1 si el privado no sale'), { target: { value: '¡Gracias, Julián! 🙌' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enganchar$/ }))

    await waitFor(() => expect(onListo).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    const cuerpo = JSON.parse(String(post?.[1]?.body))
    expect(cuerpo).toMatchObject({ origen: 'existente', igMediaId: 'm1', palabraClave: 'doblas' })
    expect(cuerpo.mensajes.respuestas_sin_privado[0]).toBe('¡Gracias, Julián! 🙌')
    expect(cuerpo.mensajes.dm_boton).toBe('Sí, pasámela')
  })

  it('Atrás vuelve al paso 1 sin perder lo elegido', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /Semipiso Doblas/ }))
    fireEvent.change(screen.getByLabelText(/Palabras que activan la respuesta/), { target: { value: 'doblas' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente: revisar los mensajes/ }))
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
    expect((screen.getByLabelText(/Palabras que activan la respuesta/) as HTMLInputElement).value).toBe('doblas')
  })
})
