// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BotonGenerarDescripcion } from './BotonGenerarDescripcion'
import { DescripcionDelAviso } from './DescripcionDelAviso'
import type { EstadoDescripcion } from '@/lib/descripcion/servicio'

const estadoBase: EstadoDescripcion = {
  faltan: [], cantidadFotos: 22, pendientes: [], conocidas: [], fotosListas: false, zonaLista: false,
  compradorSugerido: null, notas: null, portalesPublicados: [], tieneDescripcion: false,
}

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => respuesta(200, estadoBase))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('BotonGenerarDescripcion', () => {
  it('sin descripción dice "Generar descripción" y queda habilitado', async () => {
    render(<BotonGenerarDescripcion propertyId="p1" tieneDescripcion={false} onGuardado={() => {}} />)
    const boton = await screen.findByRole('button', { name: /^generar descripción$/i })
    await waitFor(() => expect(boton).toBeEnabled())
    expect(fetchMock).toHaveBeenCalledWith('/api/properties/p1/descripcion')
  })

  it('con descripción dice "Regenerar descripción"', async () => {
    render(<BotonGenerarDescripcion propertyId="p1" tieneDescripcion onGuardado={() => {}} />)
    expect(await screen.findByRole('button', { name: /^regenerar descripción$/i })).toBeInTheDocument()
  })

  it('si falta algo queda deshabilitado y dice exactamente qué', async () => {
    fetchMock.mockImplementation(async () => respuesta(200, { ...estadoBase, faltan: ['fotos (tiene 2, mínimo 5)', 'precio'] }))
    render(<BotonGenerarDescripcion propertyId="p1" tieneDescripcion={false} onGuardado={() => {}} />)
    expect(await screen.findByText('Falta: fotos (tiene 2, mínimo 5), precio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar descripción/i })).toBeDisabled()
  })

  it('si el servidor dice que esta persona no puede (abogado), no se muestra', async () => {
    fetchMock.mockImplementation(async () => respuesta(403, { error: 'forbidden' }))
    const { container } = render(<BotonGenerarDescripcion propertyId="p1" tieneDescripcion={false} onGuardado={() => {}} />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('al tocarlo abre el panel y arranca por las fotos', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init) return respuesta(200, estadoBase)
      return new Promise(() => {}) // la etapa queda "en curso"
    })
    render(<BotonGenerarDescripcion propertyId="p1" tieneDescripcion={false} onGuardado={() => {}} />)
    const boton = await screen.findByRole('button', { name: /generar descripción/i })
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)
    expect(await screen.findByText('Mirando las 22 fotos…')).toBeInTheDocument()
    const cuerpo = JSON.parse(String(fetchMock.mock.calls.find(c => c[1])?.[1]?.body))
    expect(cuerpo).toEqual({ etapa: 'fotos', forzar: false })
  })
})

describe('DescripcionDelAviso (paso de los portales)', () => {
  it('con descripción en la ficha la trae para retocar y NO ofrece generar', () => {
    render(
      <DescripcionDelAviso propertyId="p1" title="Depto" description="Texto ya escrito en la ficha." tituloMax={60}
        onChange={() => {}} onValidityChange={() => {}} />,
    )
    expect(screen.getByDisplayValue('Texto ya escrito en la ficha.')).toBeInTheDocument()
    expect(screen.getByText(/Tomada de la ficha/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generar descripción/i })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin descripción ofrece generarla con el mismo botón de la ficha', async () => {
    render(
      <DescripcionDelAviso propertyId="p1" title="" description="" tituloMax={60}
        onChange={() => {}} onValidityChange={() => {}} />,
    )
    expect(screen.getByText(/todavía no tiene descripción/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^generar descripción$/i })).toBeInTheDocument()
  })

  it('valida el mínimo de 100 caracteres', () => {
    const onValidityChange = vi.fn()
    render(
      <DescripcionDelAviso propertyId="p1" title="" description={'x'.repeat(100)} tituloMax={60}
        onChange={() => {}} onValidityChange={onValidityChange} />,
    )
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
  })
})
