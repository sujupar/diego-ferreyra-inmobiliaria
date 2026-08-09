// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerarDescripcion } from './GenerarDescripcion'
import type { FormularioAlta } from '@/lib/properties/descripcion-desde-alta'

const form: FormularioAlta = {
  address: 'Junín 1200', neighborhood: 'Recoleta', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  rooms: '3', bedrooms: '2', bathrooms: '1', garages: '',
  covered_area: '85', total_area: '92', floor: '7', age: '15',
  asking_price: '250000', currency: 'USD',
  description: '',
}

const generada = { title: 'Titular del aviso', subtitle: 'Luz todo el día', body: 'Cuerpo del aviso.' }

function respuesta(body: unknown, init: ResponseInit = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => respuesta({ ok: true, generated: generada })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GenerarDescripcion', () => {
  it('sin dirección/barrio/precio no deja generar y dice qué falta', () => {
    render(
      <GenerarDescripcion
        form={{ ...form, address: '', asking_price: '' }}
        onAplicar={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /generar descripción/i })).toBeDisabled()
    expect(screen.getByText(/Completá dirección, precio/i)).toBeInTheDocument()
  })

  it('genera con los datos del formulario y NO pisa lo escrito hasta que se lo acepta', async () => {
    const onAplicar = vi.fn()
    const user = userEvent.setup()
    render(<GenerarDescripcion form={{ ...form, description: 'Lo que escribí a mano.' }} onAplicar={onAplicar} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))

    await screen.findByText('Titular del aviso')
    expect(onAplicar).not.toHaveBeenCalled()

    const [url, opciones] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/properties/generate-description')
    const enviado = JSON.parse((opciones as RequestInit).body as string)
    expect(enviado.datos.address).toBe('Junín 1200')
    expect(enviado.datos.asking_price).toBe(250000)
    expect(enviado.datos.description).toBe('Lo que escribí a mano.')
  })

  it('"Usar esta descripción" carga subtítulo + cuerpo, sin el titular', async () => {
    const onAplicar = vi.fn()
    const user = userEvent.setup()
    render(<GenerarDescripcion form={form} onAplicar={onAplicar} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))
    await screen.findByText('Titular del aviso')
    await user.click(screen.getByRole('button', { name: /usar esta descripción/i }))

    expect(onAplicar).toHaveBeenCalledWith('Luz todo el día\n\nCuerpo del aviso.')
    expect(onAplicar.mock.calls[0][0]).not.toContain('Titular del aviso')
  })

  it('se puede volver atrás: "Deshacer" restaura el texto anterior', async () => {
    const onAplicar = vi.fn()
    const user = userEvent.setup()
    render(<GenerarDescripcion form={{ ...form, description: 'Lo que escribí a mano.' }} onAplicar={onAplicar} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))
    await screen.findByText('Titular del aviso')
    await user.click(screen.getByRole('button', { name: /usar esta descripción/i }))
    await user.click(screen.getByRole('button', { name: /deshacer/i }))

    expect(onAplicar).toHaveBeenLastCalledWith('Lo que escribí a mano.')
  })

  it('al volver a generar NO le devuelve al modelo su propia invención', async () => {
    const user = userEvent.setup()
    // El padre escribe en el campo: simulamos ese ciclo devolviendo el form actualizado.
    const { rerender } = render(<GenerarDescripcion form={form} onAplicar={() => {}} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))
    await screen.findByText('Titular del aviso')
    await user.click(screen.getByRole('button', { name: /usar esta descripción/i }))

    const aplicado = 'Luz todo el día\n\nCuerpo del aviso.'
    rerender(<GenerarDescripcion form={{ ...form, description: aplicado }} onAplicar={() => {}} />)
    await user.click(screen.getByRole('button', { name: /volver a generar/i }))

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
    const segundo = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1] as RequestInit).body as string,
    )
    expect(segundo.datos.description).toBeUndefined()
  })

  it('si el servidor devuelve HTML de error, muestra el motivo real y no "Unexpected token"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta('<HTML><body>Gateway Timeout</body></HTML>', { status: 504 })))
    const user = userEvent.setup()
    render(<GenerarDescripcion form={form} onAplicar={() => {}} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))

    expect(await screen.findByText(/tardó demasiado/i)).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected token/i)).not.toBeInTheDocument()
  })

  it('un error con JSON del servidor se muestra tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'DEEPSEEK_API_KEY no configurada' }, { status: 500 })))
    const user = userEvent.setup()
    render(<GenerarDescripcion form={form} onAplicar={() => {}} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))
    expect(await screen.findByText(/DEEPSEEK_API_KEY no configurada/)).toBeInTheDocument()
  })

  it('avisa mientras genera para que el alta bloquee "Captar Propiedad"', async () => {
    let resolver: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(res => { resolver = res })))
    const onGenerandoChange = vi.fn()
    const user = userEvent.setup()
    render(<GenerarDescripcion form={form} onAplicar={() => {}} onGenerandoChange={onGenerandoChange} />)

    await user.click(screen.getByRole('button', { name: /generar descripción/i }))
    expect(onGenerandoChange).toHaveBeenCalledWith(true)

    resolver(respuesta({ ok: true, generated: generada }))
    await waitFor(() => expect(onGenerandoChange).toHaveBeenLastCalledWith(false))
  })
})
