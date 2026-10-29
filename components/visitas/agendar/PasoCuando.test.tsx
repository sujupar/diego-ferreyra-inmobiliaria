// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PasoCuando } from './PasoCuando'
import { estadoInicial, type EstadoAgendar } from '@/lib/visitas/agendar-estado'
import { construirInstante, fechaEnArgentina, sumarDias } from '@/lib/visitas/horario'

/**
 * Revisión final, grupo G: el paso "¿Cuándo?" pide la agenda del asesor para
 * avisar choques. Si ese pedido falla (red caída, error del servidor), los avisos
 * simplemente no aparecen — pero sin dejar una promesa rechazada sin atrapar (el
 * `fetch` no tenía `.catch`) y dejando rastro en la consola.
 */
const PROP = '33333333-3333-4333-8333-333333333333'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const MANIANA = sumarDias(fechaEnArgentina(new Date()), 1)

function estado(): EstadoAgendar {
  return {
    ...estadoInicial({ propiedad: { id: PROP, address: 'Doblas 248', neighborhood: null, foto: null, asesorId: ASESOR } }),
    paso: 'cuando', fecha: MANIANA, hora: '11:00',
  }
}

const AVISO = /El asesor ya tiene una visita a las 11:00/

let rechazosSinAtrapar: unknown[] = []
const anotar = (motivo: unknown) => { rechazosSinAtrapar.push(motivo) }
beforeEach(() => { rechazosSinAtrapar = []; process.on('unhandledRejection', anotar) })
afterEach(() => { process.off('unhandledRejection', anotar) })

describe('PasoCuando — modo rápido', () => {
  const PROPIEDAD = { id: PROP, address: 'Doblas 248', neighborhood: null, foto: null, asesorId: ASESOR }
  function rapido(telefonoGuardado: string | null, telefono?: string): EstadoAgendar {
    return estadoInicial({ propiedad: PROPIEDAD, rapido: {
      origen: 'portal',
      persona: { tipo: 'consulta', id: 'c1', nombre: 'Ana Gómez', telefono: telefonoGuardado, detalle: 'Zonaprop' },
      ...(telefono ? { telefono } : {}),
    } })
  }
  const datos = { nombreAsesor: 'Lucas', puedeElegirAsesor: false, onCambiarAsesor: vi.fn() }
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))) })

  it('muestra persona con el teléfono formateado, la propiedad y el asesor', () => {
    render(<PasoCuando estado={rapido('1158234521', '+5491158234521')} despachar={vi.fn()} rapido={datos} />)
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('+54 9 11 5823-4521')).toBeInTheDocument()
    expect(screen.getByText('Doblas 248')).toBeInTheDocument()
    expect(screen.getByText('Lucas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument()
  })
  it('un teléfono que no se puede leer se muestra tal cual', () => {
    render(<PasoCuando estado={rapido('4941-0027')} despachar={vi.fn()} rapido={datos} />)
    expect(screen.getByText('4941-0027')).toBeInTheDocument()
  })
  it('con teléfono guardado incompleto ofrece completarlo y lo despacha', () => {
    const despachar = vi.fn()
    render(<PasoCuando estado={rapido('123')} despachar={despachar} rapido={datos} />)
    fireEvent.change(screen.getByLabelText(/Teléfono de Ana Gómez/), { target: { value: '11 4444-5555' } })
    expect(despachar).toHaveBeenCalledWith({ tipo: 'telefonoFaltante', texto: '11 4444-5555' })
  })
  it('"Cambiar" aparece solo si se puede elegir asesor y lleva al paso', () => {
    const onCambiarAsesor = vi.fn()
    render(<PasoCuando estado={rapido('1158234521')} despachar={vi.fn()} rapido={{ ...datos, puedeElegirAsesor: true, onCambiarAsesor }} />)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar/ }))
    expect(onCambiarAsesor).toHaveBeenCalled()
  })
  it('la casilla "Ya la confirmé con la persona" arranca marcada y despacha al desmarcarla', () => {
    const despachar = vi.fn()
    render(<PasoCuando estado={rapido('1158234521')} despachar={despachar} rapido={datos} />)
    const casilla = screen.getByRole('checkbox', { name: 'Ya la confirmé con la persona' })
    expect(casilla).toBeChecked()
    fireEvent.click(casilla)
    expect(despachar).toHaveBeenCalledWith({ tipo: 'confirmada', valor: false })
  })
  it('fuera del modo rápido no hay tarjeta ni casilla', () => {
    render(<PasoCuando estado={estado()} despachar={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Doblas 248')).not.toBeInTheDocument()
  })
})

describe('PasoCuando — la agenda del asesor', () => {
  it('con la agenda cargada avisa el choque (control: el aviso SÍ puede aparecer)', async () => {
    const instante = construirInstante(MANIANA, '11:00') as Date
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: 'v1', scheduled_at: instante.toISOString(), property_id: 'otra', advisor_id: ASESOR, address: 'Gascón 900' },
    ] }), { status: 200 })))
    render(<PasoCuando estado={estado()} despachar={vi.fn()} />)
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })
  it('si el pedido de la agenda RECHAZA, no hay avisos ni promesa sin atrapar, y queda rastro', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
      vi.stubGlobal('fetch', fetchMock)
      render(<PasoCuando estado={estado()} despachar={vi.fn()} />)
      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      await waitFor(() => expect(aviso).toHaveBeenCalled())
      // Un tick más para que un rechazo sin atrapar llegue al proceso.
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(rechazosSinAtrapar).toEqual([])
      expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '¿Cuándo?' })).toBeInTheDocument()
    } finally { aviso.mockRestore() }
  })
  it('si el servidor responde error, tampoco hay avisos y queda rastro', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })))
      render(<PasoCuando estado={estado()} despachar={vi.fn()} />)
      await waitFor(() => expect(aviso).toHaveBeenCalled())
      expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
    } finally { aviso.mockRestore() }
  })
  it('con una fecha a medio tipear ("0020-10-13") no pide la agenda (visto en el QA: cada una daba 400)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<PasoCuando estado={{ ...estado(), fecha: '0020-10-13' }} despachar={vi.fn()} />)
    await new Promise(r => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
