// @vitest-environment happy-dom
/**
 * La barra de filtros del chat en un teléfono (Fase 1 del sistema responsive).
 *
 * En 390px, la barra de escritorio se apilaba en TRES filas —buscador a ancho
 * completo, cuatro desplegables envueltos, cuatro botones— y se llevaba ~164px
 * permanentes de una pantalla donde al hilo le quedaban entre 0 y 50px. Ahora es
 * UNA fila: buscador + un botón "Filtros" que abre una hoja inferior.
 *
 * Lo que estos tests protegen de verdad es que la hoja y la barra de escritorio
 * NO SE SEPAREN: se arman de la misma lista de filtros, así que un filtro nuevo
 * entra en los dos lados o en ninguno.
 */
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ConversationFilterBar } from './ConversationFilterBar'

const opciones = (todas: string, ...resto: string[]) => [
  { value: 'all', label: todas },
  ...resto.map((label, i) => ({ value: `v${i}`, label })),
]

function barra(extra: Partial<Parameters<typeof ConversationFilterBar>[0]> = {}) {
  return render(
    <ConversationFilterBar
      search=""
      onSearchChange={() => {}}
      onlyUnanswered={false}
      onToggleUnanswered={() => {}}
      onlyUnread={false}
      onToggleUnread={() => {}}
      propertyOptions={opciones('Todas las propiedades', 'Av. Siempreviva 742')}
      filterPropertyId="all"
      onPropertyChange={() => {}}
      showAdvisorFilter
      advisorOptions={opciones('Todos los asesores', 'Diego')}
      filterAdvisorId="all"
      onAdvisorChange={() => {}}
      showTagFilter
      tagOptions={opciones('Todas las etiquetas', 'Caliente')}
      filterTagSlug="all"
      onTagChange={() => {}}
      stateOptions={opciones('Todos los estados', 'Negociando')}
      filterPipelineState="all"
      onPipelineStateChange={() => {}}
      {...extra}
    />,
  )
}

const abrirHoja = () => fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))

describe('ConversationFilterBar — una sola fila en el teléfono', () => {
  it('hay un botón "Filtros" que solo existe en celular', () => {
    barra()
    expect(screen.getByRole('button', { name: /Filtros/ }).className).toContain('md:hidden')
  })

  it('los desplegables y los interruptores de la barra son SOLO de escritorio', () => {
    const { container } = barra()
    const grupos = [...container.querySelectorAll('div')].filter(d => d.className.includes('md:flex'))
    expect(grupos.length, 'faltan los dos grupos de escritorio').toBeGreaterThanOrEqual(2)
    // Si alguno perdiera el `hidden`, en el teléfono vuelven las tres filas.
    for (const g of grupos) expect(g.className).toContain('hidden')
  })

  it('el buscador se ve siempre: es lo único que se usa con el pulgar sin abrir nada', () => {
    barra()
    expect(screen.getByRole('textbox', { name: 'Buscar conversaciones' })).toBeInTheDocument()
  })
})

describe('ConversationFilterBar — la hoja inferior tiene TODO lo que se escondió', () => {
  it('trae los cuatro desplegables como selectores nativos', async () => {
    barra()
    abrirHoja()
    const hoja = await screen.findByRole('dialog')
    const selectores = within(hoja).getAllByRole('combobox')
    expect(selectores).toHaveLength(4)
    expect(within(hoja).getByText('Propiedad')).toBeInTheDocument()
    expect(within(hoja).getByText('Asesor')).toBeInTheDocument()
    expect(within(hoja).getByText('Etiqueta')).toBeInTheDocument()
    expect(within(hoja).getByText('Estado')).toBeInTheDocument()
  })

  it('trae los cuatro interruptores', async () => {
    barra()
    abrirHoja()
    const hoja = await screen.findByRole('dialog')
    for (const etiqueta of ['Sin responder', 'No leídas', 'Ventana por cerrar', 'Orden IA']) {
      expect(within(hoja).getByRole('button', { name: etiqueta })).toBeInTheDocument()
    }
  })

  it('elegir en la hoja avisa hacia arriba, igual que en escritorio', async () => {
    const onPropertyChange = vi.fn()
    barra({ onPropertyChange })
    abrirHoja()
    const hoja = await screen.findByRole('dialog')
    fireEvent.change(within(hoja).getAllByRole('combobox')[0], { target: { value: 'v0' } })
    expect(onPropertyChange).toHaveBeenCalledWith('v0')
  })

  it('los filtros que NO corresponden al rol tampoco aparecen en la hoja', async () => {
    // Un asesor no filtra por asesor: son sus propias conversaciones.
    barra({ showAdvisorFilter: false, showTagFilter: false })
    abrirHoja()
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getAllByRole('combobox')).toHaveLength(2)
    expect(within(hoja).queryByText('Asesor')).toBeNull()
  })
})

describe('ConversationFilterBar — esconder los filtros no esconde que están puestos', () => {
  it('sin filtros, el botón dice solo "Filtros"', () => {
    barra()
    expect(screen.getByRole('button', { name: /Filtros/ }).textContent).toBe('Filtros')
  })

  it('con filtros puestos, los cuenta', () => {
    barra({ filterPropertyId: 'v0', onlyUnread: true, onlyAiOrder: true })
    expect(screen.getByRole('button', { name: /Filtros/ }).textContent).toContain('(3)')
  })
})
