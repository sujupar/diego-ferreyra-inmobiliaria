// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type Column } from './DataTable'

interface Fila { id: string; direccion: string; precio: number }
const FILAS: Fila[] = [
  { id: 'a', direccion: 'Agüero 950', precio: 300 },
  { id: 'b', direccion: 'Mistral 2750', precio: 100 },
]
const COLS: Column<Fila>[] = [
  { key: 'direccion', label: 'Dirección', render: r => r.direccion, sortable: true },
  { key: 'precio', label: 'Precio', render: r => r.precio, sortable: true },
]

describe('DataTable', () => {
  it('dibuja una fila por dato', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(screen.getAllByRole('row')).toHaveLength(3) // cabecera + 2
  })

  it('sin datos muestra el mensaje de vacío', () => {
    render(<DataTable data={[]} columns={COLS} getRowKey={(r: Fila) => r.id} emptyMessage="No hay propiedades" />)
    expect(screen.getByText('No hay propiedades')).toBeInTheDocument()
  })

  it('sin onSortChange ordena en memoria', async () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    await userEvent.click(screen.getByText('Precio'))
    const celdas = screen.getAllByRole('cell').map(c => c.textContent)
    expect(celdas[0]).toBe('Agüero 950') // desc: 300 primero
  })

  // Este modo existe porque con datos paginados ordenar en memoria solo reordena
  // la página cargada — ver el comentario de DataTable.tsx.
  it('con onSortChange NO reordena: solo avisa del click', async () => {
    const onSortChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        sort={{ key: 'precio', dir: 'asc' }} onSortChange={onSortChange} />,
    )
    await userEvent.click(screen.getByText('Precio'))
    expect(onSortChange).toHaveBeenCalledWith('precio', 'desc')
    const celdas = screen.getAllByRole('cell').map(c => c.textContent)
    expect(celdas[0]).toBe('Agüero 950') // el orden lo manda el padre, no la tabla
  })

  it('seleccionar todo devuelve las claves de todas las filas', async () => {
    const onSelectionChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set()} onSelectionChange={onSelectionChange} />,
    )
    await userEvent.click(screen.getByLabelText('Seleccionar todo'))
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a', 'b']))
  })

  it('el click en una fila avisa con su dato', async () => {
    const onRowClick = vi.fn()
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByText('Agüero 950'))
    expect(onRowClick).toHaveBeenCalledWith(FILAS[0])
  })

  // Ronda de arreglos 1 — I1: `hover:bg-secondary/60` (especificidad 0,2,0) y
  // un `bg-[color:var(--brand-soft)]` suelto (0,1,0) NO son un empate parejo:
  // el hover gana siempre, orden de generación de Tailwind mediante, no por
  // intención. Con el mouse encima, una fila seleccionada se veía igual que
  // una sin seleccionar. El fix usa el mismo patrón que sidebar.tsx
  // (`data-[active=true]:hover:*`): un atributo `data-selected` + un
  // selector compuesto `data-[selected=true]:hover:*` que gana por
  // especificidad (0,3,0), no por orden.
  it('una fila seleccionada conserva el fondo de marca aunque el mouse esté encima', () => {
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={() => {}}
        selectable selectedIds={new Set(['a'])} onSelectionChange={() => {}} />,
    )
    const fila = screen.getByText('Agüero 950').closest('tr')!
    expect(fila).toHaveAttribute('data-selected', 'true')
    // El selector compuesto tiene que existir en la clase: es lo que le da
    // más especificidad que `hover:bg-secondary/60` y gana SIEMPRE, no según
    // el orden en que Tailwind generó el CSS.
    expect(fila.className).toContain('data-[selected=true]:hover:bg-[color:var(--brand-soft)]')
  })

  // Ronda de arreglos 1 — I3: mutation testing encontró dos comportamientos
  // sin ningún test que los proteja. Los dos siguen igual de correctos que
  // antes (no hubo fix de lógica) — lo nuevo es la red.
  it('el checkbox maestro queda indeterminado con selección parcial', () => {
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set(['a'])} onSelectionChange={() => {}} />,
    )
    const master = screen.getByLabelText('Seleccionar todo') as HTMLInputElement
    expect(master.indeterminate).toBe(true)
  })

  it('tildar el checkbox de una fila no dispara onRowClick (conviven selectable y onRowClick)', async () => {
    const onRowClick = vi.fn()
    const onSelectionChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={onRowClick}
        selectable selectedIds={new Set()} onSelectionChange={onSelectionChange} />,
    )
    await userEvent.click(screen.getAllByLabelText('Seleccionar fila')[0])
    expect(onSelectionChange).toHaveBeenCalled()
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
