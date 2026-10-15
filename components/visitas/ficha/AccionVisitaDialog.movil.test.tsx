// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { AccionVisitaDialog, type VisitaConHistorial } from './AccionVisitaDialog'

/**
 * El diálogo de acción de la ficha es el formulario que se completa parado en
 * la puerta de la propiedad (reemplazó a `CompleteVisitDialog`, que tenía los
 * mismos dos problemas que acá se vuelven a fijar):
 *
 *  1. Traía (en el viejo) `max-h-[85vh] overflow-y-auto` propio. `cn()` es
 *     tailwind-merge, así que una clase `max-h-*` del consumidor PISA a la del
 *     primitivo, y `85vh` en iOS se mide contra el viewport GRANDE (miente
 *     ~110px). Acá el diálogo no declara ningún `max-h`/`vh` propio: el techo
 *     lo pone `components/ui/dialog.tsx` (`max-h-[calc(var(--app-vh)-2rem)]`).
 *  2. Las opciones son `<button role="radio">`, no `<input type="radio">`: sin
 *     un alto mínimo explícito no llegan a los 44px táctiles, y sin `w-full`
 *     la etiqueta (que es el propio contenido del botón) no ocupa el renglón.
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const VISITA: VisitaConHistorial = {
  id: '66666666-6666-4666-8666-666666666666', property_id: 'p1', advisor_id: null, created_by: null,
  lead_id: null, portal_inquiry_id: null, client_name: 'Cliente Uno', client_email: null, client_phone: null,
  scheduled_at: '2026-08-05T15:00:00Z', status: 'scheduled', origin: null, origin_detail: null, notes: null,
  completion_notes: null, outcome_reason: null, advisor_interest: null, confirmed_at: null, outcome_at: null,
  reschedule_count: 0, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T12:00:00Z', created_by_ai: false,
  propiedad: null, asesor: null, comprador: null, consulta: null,
  eventos: [], acciones: ['no_realizada'],
}

function abrir() {
  render(
    <AccionVisitaDialog visita={VISITA} accion="no_realizada" onClose={() => {}} onHecho={() => {}} onRecargar={() => {}} />,
  )
  return document.querySelector('[data-slot="dialog-content"]') as HTMLElement
}

describe('AccionVisitaDialog — el techo de altura lo pone el primitivo', () => {
  it('no declara un max-h propio que pise al del sistema', () => {
    const contenido = abrir()
    // Si el consumidor volviera a poner un `max-h-*`, tailwind-merge borraría
    // ESTA clase: que siga presente es la prueba de que no hay override.
    expect(contenido).toHaveClass('max-h-[calc(var(--app-vh)-2rem)]')
    expect(contenido.className).not.toContain('max-h-[85vh]')
  })

  it('nunca se mide en `vh` (en iOS miente ~110px)', () => {
    const contenido = abrir()
    expect(contenido.className).not.toMatch(/max-h-\[\d+vh\]/)
  })
})

describe('AccionVisitaDialog — las opciones se pueden tocar con el pulgar', () => {
  it('cada opción de motivo llega a 44px en celular', () => {
    abrir()
    for (const etiqueta of ['No vino', 'Canceló la persona', 'Otro']) {
      const opcion = screen.getByRole('radio', { name: etiqueta })
      expect(opcion.className, `la opción "${etiqueta}" no llega al mínimo táctil`).toContain('min-h-11')
    }
  })

  it('la etiqueta ocupa el renglón entero (es el propio contenido del botón táctil)', () => {
    abrir()
    const opcion = screen.getByRole('radio', { name: 'No vino' })
    expect(opcion.className).toContain('w-full')
  })
})
