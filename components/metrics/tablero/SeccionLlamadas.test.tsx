// @vitest-environment happy-dom
// Sección 5 del Tablero (crm-estadisticas-llamadas, D3): estados y textos de cada número.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderCrudo, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { metricasLlamadas, type IntentoMedido } from '@/lib/crm/metricas-llamadas'
import { SeccionLlamadas, horasHabiles } from './SeccionLlamadas'

afterEach(cleanup)
// En la app el layout pone el TooltipProvider (lo usa el ícono de "de dónde sale").
const render = (ui: React.ReactElement) => renderCrudo(<TooltipProvider>{ui}</TooltipProvider>)

const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()
const sol = (id: string) => ({ dealId: id, contactId: `c-${id}`, creadoEn: ar('2026-11-30', '10:00') })
const llamada = (deal: string, hora: string, resultado: string): IntentoMedido => ({
  id: `${deal}-${hora}`, deal_id: deal, contact_id: `c-${deal}`, kind: 'call', call_outcome: resultado,
  occurred_at: ar('2026-11-30', hora), created_at: ar('2026-11-30', hora), voided_at: null,
})
const ok = (datos: ReturnType<typeof metricasLlamadas>, o: { medicionRecortada?: boolean; antesDeLaMedicion?: boolean } = {}) =>
  ({ ok: true as const, medicionRecortada: false, antesDeLaMedicion: false, datos, ...o })

describe('horas hábiles', () => {
  it('nunca en días: una semana hábil son 45 h', () => {
    expect(horasHabiles(2700)).toBe('45 h')
    expect(horasHabiles(90)).toBe('1 h 30 min')
    expect(horasHabiles(12)).toBe('12 min')
    expect(horasHabiles(null)).toBe('—')
  })
})

describe('SeccionLlamadas', () => {
  it('con llamadas: los cuatro números con su base, "Pocos casos" y las tablas', () => {
    const datos = metricasLlamadas([sol('a'), sol('b'), sol('c')], [
      llamada('a', '11:00', 'agendo'),
      llamada('b', '13:00', 'no_atendio'),
      llamada('b', '14:00', 'agendo'),
    ])
    render(<SeccionLlamadas s={ok(datos, { medicionRecortada: true })} onReintentar={() => {}} />)
    expect(screen.getByRole('heading', { name: /Llamadas a las solicitudes/ })).toBeInTheDocument()
    expect(screen.getByText(/Sin comparar\. La medición empieza el 26\/11\/2026 a las 21:04/)).toBeInTheDocument()
    // Primera llamada: a a la hora, b a las 3 h → mediana 2 h.
    expect(screen.getByText('2 h')).toBeInTheDocument()
    expect(screen.getByText('Sobre 2 solicitudes · Pocos casos · 1 todavía sin llamar no entra en la cuenta')).toBeInTheDocument()
    expect(screen.getAllByText('2 de 3 solicitudes · Pocos casos')).toHaveLength(2)
    expect(screen.getByText(/No es lo mismo que «Agendadas» del embudo/)).toBeInTheDocument()
    expect(screen.getByText('Sin llamada ni WhatsApp registrado')).toBeInTheDocument()
    expect(screen.getByText(/Hábiles: mediana/)).toBeInTheDocument()
    expect(screen.getByText('Sobre 3 llamadas · Pocos casos')).toBeInTheDocument()
    const fila = screen.getByText('No atendió').closest('tr')!
    expect(fila).toHaveTextContent('No atendió133%')
  })

  it('con solicitudes y sin llamadas: solo la cuenta, sin bloques vacíos', () => {
    render(<SeccionLlamadas s={ok(metricasLlamadas([sol('a'), sol('b')], []))} onReintentar={() => {}} />)
    expect(screen.getByText('2 solicitudes · todavía no hay llamadas registradas')).toBeInTheDocument()
    expect(screen.getByText('Sin llamada ni WhatsApp registrado: 2')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('sin solicitudes: una línea', () => {
    render(<SeccionLlamadas s={ok(metricasLlamadas([], []))} onReintentar={() => {}} />)
    expect(screen.getByText('No hay solicitudes de tasación en este período.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('período anterior a la medición', () => {
    render(<SeccionLlamadas s={ok(metricasLlamadas([], []), { antesDeLaMedicion: true, medicionRecortada: true })} onReintentar={() => {}} />)
    expect(screen.getByText('La medición de llamadas empieza el 26/11/2026 a las 21:04: este período es anterior.')).toBeInTheDocument()
  })

  it('si falló: "No se pudo cargar" y "Reintentar" dentro de la sección', () => {
    const reintentar = vi.fn()
    render(<SeccionLlamadas s={{ ok: false }} onReintentar={reintentar} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar')
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(reintentar).toHaveBeenCalledOnce()
  })
})
