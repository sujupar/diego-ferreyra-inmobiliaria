// @vitest-environment happy-dom
// Cargar el contacto en modo edición (revisión 12.1, hallazgo 6): antes se ignoraba
// `!r.ok` y un 403/404/500 abría el formulario VACÍO, sin aviso. Guardar ese formulario
// habría pisado el teléfono, el email y las notas de la persona con vacíos.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContactEditor } from './ContactEditor'

afterEach(() => vi.unstubAllGlobals())

function red(respuestas: Array<{ status: number; body: unknown } | Error>) {
  const espia = vi.fn(async () => {
    const r = respuestas.shift()
    if (!r) throw new Error('sin respuesta simulada')
    if (r instanceof Error) throw r
    return new Response(JSON.stringify(r.body), { status: r.status })
  })
  vi.stubGlobal('fetch', espia)
  return espia
}

const abrir = () => render(<ContactEditor open onOpenChange={() => {}} contactId="c-1" />)

describe('ContactEditor: cargar el contacto', () => {
  it('200 → el formulario sale con los datos', async () => {
    red([{ status: 200, body: { contact: { full_name: 'Ana Gómez', phone: '1155550142', email: 'ana@x.com', origin: 'referido', notes: null } } }])
    abrir()
    expect(await screen.findByDisplayValue('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ana@x.com')).toBeInTheDocument()
  })

  it('403 → dice el error del servidor y NO muestra el formulario vacío', async () => {
    red([{ status: 403, body: { error: 'No tenés acceso a los contactos.' } }])
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a los contactos.')
    expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar Cambios' })).not.toBeInTheDocument()
  })

  it('500 con una página HTML → mensaje legible, sin formulario', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>504</html>', { status: 504 })))
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor tardó demasiado. Probá de nuevo.')
    expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
    consola.mockRestore()
  })

  it('red cortada → "No se pudo cargar el contacto." y "Reintentar" lo vuelve a pedir', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const espia = red([new TypeError('Failed to fetch'), { status: 200, body: { contact: { full_name: 'Ana Gómez' } } }])
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el contacto.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByDisplayValue('Ana Gómez')).toBeInTheDocument()
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2))
    consola.mockRestore()
  })
})
