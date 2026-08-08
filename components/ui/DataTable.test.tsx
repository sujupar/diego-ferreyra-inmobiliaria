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
})
