// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))

import { HojaAvisosSinPropiedad } from './HojaAvisosSinPropiedad'

const CAPTADOR = '22222222-2222-4222-8222-222222222222'
const MUESTRA = '66666666-6666-4666-8666-666666666666'
const ASESORES = [{ id: CAPTADOR, full_name: 'Diego' }, { id: MUESTRA, full_name: 'Lucas' }]
const TARIJA = { id: '33333333-3333-4333-8333-333333333333', address: 'Tarija 4000', neighborhood: 'Boedo', foto: null, assigned_to: CAPTADOR }
const FOTO = 'https://imgar.zonapropcdn.com/avisos/1/00/60/36/03/54/290x180/2083536250.jpg'
const AVISO = {
  portal: 'zonaprop', codigo: '2EFH1O', titulo: 'Departamento 2 ambientes en Boedo', n: 4, ultima: '2026-10-30T13:41:59Z',
  url: 'https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-departamento-60360354.html', foto: FOTO,
}

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status })
}

let aviso = AVISO
let muestraPropuesta: string | null = null
function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/consultas/avisos' && init?.method === 'POST') return respuesta({ actualizadas: 4, recordado: true })
    if (url === '/api/consultas/avisos') return respuesta({ avisos: [aviso], sueltas: 0 })
    if (url.startsWith('/api/consultas/avisos/quien-muestra')) return respuesta({ muestraId: muestraPropuesta })
    if (url.startsWith('/api/visits/propiedades')) return respuesta({ data: [TARIJA] })
    if (url.startsWith('/api/portal-inquiries/resolve-link')) {
      return respuesta({ portal: 'zonaprop', externalId: '60360354', property: { id: TARIJA.id, address: TARIJA.address, assignedTo: CAPTADOR } })
    }
    return respuesta({}, 404)
  })
}

let fetchMock: ReturnType<typeof mockFetch>
beforeEach(() => {
  aviso = AVISO
  muestraPropuesta = null
  fetchMock = mockFetch()
  vi.stubGlobal('fetch', fetchMock)
})

function montar() {
  const onConectado = vi.fn()
  render(<HojaAvisosSinPropiedad asesores={ASESORES} onConectado={onConectado} onCerrar={vi.fn()} />)
  return { onConectado }
}

function cuerpoDelPost(): unknown {
  const llamada = fetchMock.mock.calls.find(([u, init]) => u === '/api/consultas/avisos' && (init as RequestInit | undefined)?.method === 'POST')
  return llamada ? JSON.parse((llamada[1] as RequestInit).body as string) : null
}

describe('HojaAvisosSinPropiedad', () => {
  it('cada aviso muestra su foto y "Ver aviso en ZonaProp" con el enlace del aviso', async () => {
    montar()
    const ver = await screen.findByRole('link', { name: /Ver aviso en ZonaProp/ })
    expect(ver).toHaveAttribute('href', AVISO.url)
    expect(ver).toHaveAttribute('target', '_blank')
    expect(document.querySelector(`img[src="${FOTO}"]`)).not.toBeNull()
  })

  it('una foto de otro host no se dibuja', async () => {
    aviso = { ...AVISO, foto: 'https://imgar.zonapropcdn.com.evil.com/avisos/x.jpg' }
    montar()
    await screen.findByRole('link', { name: /Ver aviso en ZonaProp/ })
    expect(document.querySelector('img')).toBeNull()
  })

  it('conectar: propiedad → quién la muestra (obligatorio) → manda muestraId', async () => {
    const { onConectado } = montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar' }))
    // Lo principal es la lista de propiedades; el link va como salida secundaria.
    expect(await screen.findByRole('button', { name: '¿No la encontrás? Pegá el link del aviso' })).toBeInTheDocument()
    // La dirección no se pide nunca.
    expect(screen.queryByLabelText(/Dirección/i)).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    const conectar = screen.getByRole('button', { name: 'Conectar 4 consultas' })
    expect(conectar).toBeDisabled()
    // Nunca se propone a quien la captó.
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Quién la muestra/ })).toHaveValue(''))

    fireEvent.change(screen.getByRole('combobox', { name: /Quién la muestra/ }), { target: { value: MUESTRA } })
    expect(screen.getByRole('status')).toHaveTextContent('las recibe Lucas')
    expect(conectar).toBeEnabled()
    fireEvent.click(conectar)

    await waitFor(() => expect(onConectado).toHaveBeenCalled())
    expect(cuerpoDelPost()).toEqual({ portal: 'zonaprop', codigo: '2EFH1O', propertyId: TARIJA.id, muestraId: MUESTRA })
  })

  it('propone a quien ya muestra otro aviso de la propiedad', async () => {
    muestraPropuesta = MUESTRA
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar' }))
    fireEvent.click(await screen.findByRole('radio', { name: /Tarija 4000/ }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Quién la muestra/ })).toHaveValue(MUESTRA))
    expect(screen.getByRole('button', { name: 'Conectar 4 consultas' })).toBeEnabled()
  })

  it('pegar el link elige la propiedad si el aviso se publicó desde la plataforma', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar' }))
    fireEvent.click(await screen.findByRole('button', { name: '¿No la encontrás? Pegá el link del aviso' }))
    fireEvent.change(screen.getByLabelText('Link del aviso'), { target: { value: AVISO.url } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar la propiedad' }))
    expect(await screen.findByText('Es Tarija 4000.')).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: /Quién la muestra/ })).toBeInTheDocument()
  })
})
