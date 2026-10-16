// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { subirMock, quitarMock } = vi.hoisted(() => ({ subirMock: vi.fn(), quitarMock: vi.fn() }))
vi.mock('@/lib/visitas/encuesta/subir-regalo', () => ({ subirRegalo: subirMock, quitarRegalo: quitarMock, cambiarTitulo: vi.fn() }))

import { RegaloDeLaEncuesta } from './RegaloDeLaEncuesta'

const PROP = '33333333-3333-4333-8333-333333333333'
const VISTA = { titulo: 'Guía de Caballito', archivoNombre: 'Guía.pdf', archivoBytes: 2_500_000, archivoPath: 'a', portadaPath: null, portadaUrl: null, descargaUrl: 'https://firmada/pdf' }
let respuesta: { status: number; body: unknown }

beforeEach(() => {
  subirMock.mockReset(); quitarMock.mockReset()
  respuesta = { status: 200, body: { data: null } }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(respuesta.body), { status: respuesta.status })))
})

describe('RegaloDeLaEncuesta', () => {
  it('sin regalo: explica para qué es y no deja subir hasta tener título y PDF', async () => {
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    expect(await screen.findByRole('heading', { name: 'Regalo de la encuesta' })).toBeInTheDocument()
    expect(screen.getByText(/recibe quien responde la encuesta de esta propiedad/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir regalo' })).toBeDisabled()
  })
  it('un archivo que no es PDF avisa y no sube', async () => {
    // applyAccept:false: sin esto userEvent descarta el .docx por el `accept` y el test no prueba nada.
    const usuario = userEvent.setup({ applyAccept: false })
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await usuario.type(await screen.findByLabelText('Título'), 'Guía de Caballito')
    await usuario.upload(screen.getByLabelText('Archivo PDF'), new File(['x'], 'guia.docx', { type: 'application/msword' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El regalo tiene que ser un PDF')
    expect(subirMock).not.toHaveBeenCalled()
  })
  it('sube y muestra el regalo cargado', async () => {
    subirMock.mockResolvedValue(VISTA)
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await userEvent.type(await screen.findByLabelText('Título'), 'Guía de Caballito')
    const pdf = new File(['%PDF'], 'Guía.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Archivo PDF'), pdf)
    await userEvent.click(screen.getByRole('button', { name: 'Subir regalo' }))
    expect(subirMock).toHaveBeenCalledWith(PROP, { titulo: 'Guía de Caballito', archivo: pdf, portada: null }, expect.any(Function))
    expect(await screen.findByText('Guía de Caballito')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute('href', 'https://firmada/pdf')
  })
  it('quitar pide confirmación en la misma tarjeta', async () => {
    respuesta = { status: 200, body: { data: VISTA } }
    quitarMock.mockResolvedValue(undefined)
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))
    expect(quitarMock).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sí, quitar el regalo' }))
    expect(quitarMock).toHaveBeenCalledWith(PROP)
    expect(await screen.findByRole('button', { name: 'Subir regalo' })).toBeInTheDocument()
  })
  it('sin permiso (403) no muestra nada', async () => {
    respuesta = { status: 403, body: { error: 'Solo quien gestiona la propiedad puede cargar el regalo' } }
    const { container } = render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
  it('error de carga: el mensaje y "Reintentar"', async () => {
    respuesta = { status: 500, body: { error: 'No pudimos cargar el regalo' } }
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    expect(await screen.findByText('No pudimos cargar el regalo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
