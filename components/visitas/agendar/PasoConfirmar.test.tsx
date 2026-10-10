// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { PasoConfirmar } from './PasoConfirmar'
import { estadoInicial, type EstadoAgendar } from '@/lib/visitas/agendar-estado'
import { fechaEnArgentina, sumarDias } from '@/lib/visitas/horario'

/**
 * Revisión final, grupo D: el servidor NO manda "tu visita está confirmada" si la
 * visita ya pasó. La pantalla lo dice ANTES de agendar, sin sacar la pregunta de
 * si está confirmada (que igual se guarda). Reloj real, sin temporizadores
 * simulados: las fechas se arman relativas a hoy.
 */
const AVISO = 'Es una visita que ya ocurrió: no le mandamos confirmación a la persona.'

function estado(fecha: string, hora: string): EstadoAgendar {
  return {
    ...estadoInicial({ propiedad: { id: 'p1', address: 'Doblas 248', neighborhood: null, foto: null, asesorId: 'a1' } }),
    paso: 'confirmar', origen: 'cartel',
    persona: { tipo: 'nueva', nombre: 'Sofía Benítez', telefono: '11 5823-4521', email: '' },
    fecha, hora,
  }
}

function pintar(e: EstadoAgendar) {
  render(<PasoConfirmar estado={e} despachar={vi.fn()} nombreAsesor="Lucas" duplicado={null} error={null} />)
}

describe('PasoConfirmar — visita que ya ocurrió', () => {
  it('si el día y la hora elegidos ya pasaron, avisa que no se manda confirmación', () => {
    pintar(estado(sumarDias(fechaEnArgentina(new Date()), -1), '11:00'))
    expect(screen.getByText(AVISO)).toBeInTheDocument()
    // La pregunta sigue: la visita igual se registra como confirmada o no.
    expect(screen.getByText('¿Ya está confirmada con la persona?')).toBeInTheDocument()
  })
  it('si es futura, no hay aviso', () => {
    pintar(estado(sumarDias(fechaEnArgentina(new Date()), 1), '11:00'))
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })
  it('sin día u hora elegidos todavía, no hay aviso', () => {
    pintar({ ...estado(sumarDias(fechaEnArgentina(new Date()), -1), '11:00'), hora: null })
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })
})
