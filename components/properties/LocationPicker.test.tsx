// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocationPicker } from './LocationPicker'

/** Catálogo mínimo con los datos REALES del probe en vivo (2026-08-24). */
const CATALOGO: Record<string, { id: string; nombre: string }[]> = {
  'provincias|': [
    { id: 'PROVINCIA_1', nombre: 'Buenos Aires' },
    { id: 'PROVINCIA_2', nombre: 'Capital Federal' },
  ],
  'partidos|PROVINCIA_1': [
    { id: 'PARTIDO_58', nombre: 'Partido de General San Martín' },
    { id: 'PARTIDO_107', nombre: 'Partido de Roque Pérez' },
  ],
  'partidos|PROVINCIA_2': [{ id: 'PARTIDO_135', nombre: 'Capital Federal' }],
  'localidades|PARTIDO_58': [
    { id: 'LOCALIDAD_928', nombre: 'General San Martin' },
    { id: 'LOCALIDAD_931', nombre: 'Villa Ballester' },
  ],
  'localidades|PARTIDO_135': [{ id: 'LOCALIDAD_2102', nombre: 'CABA' }],
  'barrios|LOCALIDAD_928': [
    { id: 'BARRIO_323', nombre: 'Villa Libertad' },
    { id: 'BARRIO_328', nombre: 'Centro' },
  ],
  'barrios|LOCALIDAD_931': [],
  'barrios|LOCALIDAD_2102': [
    { id: 'BARRIO_20', nombre: 'Palermo' },
    { id: 'BARRIO_35', nombre: 'Villa Pueyrredon' },
  ],
}

function fetchDelCatalogo() {
  return vi.fn(async (url: string) => {
    const u = new URL(url, 'http://x')
    const clave = `${u.searchParams.get('nivel')}|${u.searchParams.get('padre') ?? ''}`
    return {
      ok: true,
      text: async () => JSON.stringify({ items: CATALOGO[clave] ?? [] }),
    } as unknown as Response
  })
}

beforeEach(() => { vi.stubGlobal('fetch', fetchDelCatalogo()) })

describe('LocationPicker', () => {
  it('arranca ofreciendo las provincias del catálogo', async () => {
    render(<LocationPicker onChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Buenos Aires' })).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Capital Federal' })).toBeInTheDocument()
  })

  it('encadena provincia → partido → localidad → barrio y avisa la selección completa', async () => {
    const onChange = vi.fn()
    render(<LocationPicker onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Buenos Aires' })).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), 'PROVINCIA_1')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Partido de General San Martín' })).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByLabelText('Partido'), 'PARTIDO_58')
    await waitFor(() => expect(screen.getByRole('option', { name: 'General San Martin' })).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByLabelText('Localidad'), 'LOCALIDAD_928')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Villa Libertad' })).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByLabelText('Barrio'), 'BARRIO_323')
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        provincia: { id: 'PROVINCIA_1', nombre: 'Buenos Aires' },
        partido: { id: 'PARTIDO_58', nombre: 'Partido de General San Martín' },
        localidad: { id: 'LOCALIDAD_928', nombre: 'General San Martin' },
        barrio: { id: 'BARRIO_323', nombre: 'Villa Libertad' },
      })
    })
  })

  it('fuera de Capital, sin barrio la selección ya sirve', async () => {
    const onChange = vi.fn()
    render(<LocationPicker onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Buenos Aires' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Provincia'), 'PROVINCIA_1')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Partido de General San Martín' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Partido'), 'PARTIDO_58')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Villa Ballester' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Localidad'), 'LOCALIDAD_931')

    await waitFor(() => {
      const ultima = onChange.mock.calls.at(-1)?.[0]
      expect(ultima?.localidad?.id).toBe('LOCALIDAD_931')
    })
  })

  it('en Capital NO da por buena la selección hasta que se elige el barrio', async () => {
    const onChange = vi.fn()
    render(<LocationPicker onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Capital Federal' })).toBeInTheDocument())

    // Partido y localidad son únicos en Capital: se eligen solos.
    await userEvent.selectOptions(screen.getByLabelText('Provincia'), 'PROVINCIA_2')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Palermo' })).toBeInTheDocument())
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByText(/en capital el barrio es obligatorio/i)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Barrio'), 'BARRIO_20')
    await waitFor(() => {
      const ultima = onChange.mock.calls.at(-1)?.[0]
      expect(ultima?.localidad?.id).toBe('LOCALIDAD_2102')
      expect(ultima?.barrio?.id).toBe('BARRIO_20')
    })
  })

  it('preselecciona a partir de lo que ya dice la ficha (incluido "CABA" → Capital Federal)', async () => {
    render(<LocationPicker onChange={() => {}} pista={{ province: 'CABA', city: 'CABA', neighborhood: 'Villa Pueyrredón' }} />)
    await waitFor(() => {
      expect((screen.getByLabelText('Provincia') as HTMLSelectElement).value).toBe('PROVINCIA_2')
      // La ficha lo escribe con tilde y el catálogo sin tilde: igual lo encuentra.
      expect((screen.getByLabelText('Barrio') as HTMLSelectElement).value).toBe('BARRIO_35')
    })
  })

  it('preselecciona la ficha que rompió: General San Martín / Villa Libertad', async () => {
    render(<LocationPicker onChange={() => {}} pista={{ province: 'Buenos Aires', city: 'General San Martín', neighborhood: 'Villa Libertad' }} />)
    await waitFor(() => {
      expect((screen.getByLabelText('Partido') as HTMLSelectElement).value).toBe('PARTIDO_58')
      expect((screen.getByLabelText('Localidad') as HTMLSelectElement).value).toBe('LOCALIDAD_928')
      expect((screen.getByLabelText('Barrio') as HTMLSelectElement).value).toBe('BARRIO_323')
    })
  })

  it('si el catálogo no está disponible, avisa hacia arriba para caer al texto libre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      text: async () => JSON.stringify({ error: 'Argenprop no está configurado', catalogoNoDisponible: true }),
    } as unknown as Response)))
    const onCatalogoNoDisponible = vi.fn()
    render(<LocationPicker onChange={() => {}} onCatalogoNoDisponible={onCatalogoNoDisponible} />)
    await waitFor(() => expect(onCatalogoNoDisponible).toHaveBeenCalled())
  })

  it('no explota si el servidor contesta HTML en vez de JSON (función pasada de tiempo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, text: async () => '<HTML><body>504 Gateway Timeout</body></HTML>',
    } as unknown as Response)))
    render(<LocationPicker onChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/no se pudo traer la lista/i)).toBeInTheDocument())
  })
})
