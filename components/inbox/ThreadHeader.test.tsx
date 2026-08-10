// @vitest-environment happy-dom
/**
 * La cabecera del hilo en un teléfono (Fase 1 del sistema responsive).
 *
 * El defecto que cierra este archivo: los cinco botones de acciones
 * (`ThreadActionsBar`) son `shrink-0` y suman ~527px de ancho mínimo, adentro de
 * una tarjeta de ~356px con `overflow-hidden`. Resultado real en el teléfono:
 * "Estado" no existía y "Etiquetas" se veía a medias, sin scroll ni forma de
 * llegar — cambiar el estado del embudo desde el celular era IMPOSIBLE. Y el
 * botón de volver, que es el único camino de regreso a la lista, era una flecha
 * de 32px sin etiqueta.
 */
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ThreadHeader } from './ThreadHeader'

function cabecera(extra: Partial<Parameters<typeof ThreadHeader>[0]> = {}) {
  return render(
    <ThreadHeader
      onBack={() => {}}
      contactName="Juana Pérez"
      phone="5491122334455"
      leadNumber={12}
      advisorName="Diego"
      pipelineState={null}
      tags={[]}
      property={null}
      onOpenContact={() => {}}
      {...extra}
    />,
  )
}

describe('ThreadHeader — el botón de volver', () => {
  it('tiene etiqueta: es una flecha sola, sin texto que leer', () => {
    cabecera()
    expect(screen.getByRole('button', { name: 'Volver a la lista de chats' })).toBeInTheDocument()
  })

  it('mide 44px en celular (es el control que más se toca de la pantalla)', () => {
    cabecera()
    const clases = screen.getByRole('button', { name: 'Volver a la lista de chats' }).className
    // `size="icon"` → `size-9 max-md:size-11` (44px). `icon-sm` daría 40px.
    expect(clases).toContain('max-md:size-11')
  })

  it('solo existe en celular: en escritorio la lista y el hilo se ven juntos', () => {
    cabecera()
    expect(screen.getByRole('button', { name: 'Volver a la lista de chats' }).className).toContain('md:hidden')
  })

  it('sin `onBack` (escritorio, hilo suelto) no se dibuja', () => {
    cabecera({ onBack: undefined })
    expect(screen.queryByRole('button', { name: 'Volver a la lista de chats' })).toBeNull()
  })
})

describe('ThreadHeader — las acciones dejan de quedar recortadas', () => {
  it('el contenedor de acciones puede encoger (`min-w-0`)', () => {
    cabecera({ actionsSlot: <button type="button">acciones</button> })
    const envoltorio = screen.getByText('acciones').parentElement
    expect(envoltorio?.className).toContain('min-w-0')
  })

  it('en celular la cabecera es UNA fila que no envuelve', () => {
    // Con `flex-wrap`, los botones bajaban a una segunda y tercera línea y se
    // comían el alto que le hace falta al hilo.
    const { container } = cabecera()
    expect((container.firstElementChild as HTMLElement).className).toContain('max-md:flex-nowrap')
  })
})
