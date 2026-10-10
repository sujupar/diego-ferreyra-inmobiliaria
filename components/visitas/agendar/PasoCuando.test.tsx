// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
