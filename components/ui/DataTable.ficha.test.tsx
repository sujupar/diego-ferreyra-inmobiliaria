// @vitest-environment happy-dom
/**
 * Contrato de la FICHA: qué pasa cuando la tabla se dibuja en una caja angosta.
 *
 * Acá hay una limitación honesta que conviene decir de entrada: **el dibujo de
 * la ficha vive entero en CSS** (`app/globals.css`, bloque "FASE 2"), y en
 * estos tests no hay ningún navegador ni ninguna hoja de estilos cargada —
 * Turbopack ni siquiera compila el proyecto en local por el acento de
 * "Gestión" en la ruta. O sea: **ningún test puede ver la ficha apilada.**
 *
 * Lo que sí se puede fijar, y es lo que hace este archivo, son las DOS mitades
 * del contrato que el CSS necesita para poder dibujarla:
 *
 *   1. que el HTML traiga las marcas correctas (`data-celda`, `data-primero`,
 *      la clase `.tabla-ficha` del contenedor, las celdas de salto y flecha);
 *   2. que las funciones que en la tabla viven en la cabecera —ordenar y
 *      seleccionar todo— existan también en la barra de la ficha, porque la
 *      cabecera es justo lo que la ficha no dibuja.
 *
 * La otra mitad —que el CSS exista y diga lo que tiene que decir— está en
 * `app/globals.ficha.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, rolesDeFicha, type Column } from './DataTable'

interface Fila {
  id: string
  direccion: string
  barrio: string
  precio: number
  estado: string
  alta: string
}

const FILAS: Fila[] = [
  { id: 'a', direccion: 'Agüero 950', barrio: 'Palermo', precio: 300, estado: 'Publicada', alta: '01/08' },
  { id: 'b', direccion: 'Mistral 2750', barrio: 'Balvanera', precio: 100, estado: 'Captada', alta: '02/08' },
]

const COLS: Column<Fila>[] = [
  { key: 'direccion', label: 'Dirección', sortable: true, card: 'title', render: r => r.direccion },
  { key: 'barrio', label: 'Barrio', sortable: true, card: 'meta', render: r => r.barrio },
  { key: 'precio', label: 'Precio', sortable: true, card: 'meta', render: r => r.precio },
  { key: 'estado', label: 'Estado', sortable: true, card: 'badge', render: r => r.estado },
  { key: 'alta', label: 'Fecha', sortable: true, card: 'none', render: r => r.alta },
]

/** Las celdas de la primera fila de datos, con su rol. */
function celdasDeLaPrimeraFila(): { rol: string | null; texto: string }[] {
  const filas = document.querySelectorAll('tbody tr')
  return Array.from(filas[0].querySelectorAll('td')).map(td => ({
    rol: td.getAttribute('data-celda'),
    texto: td.textContent ?? '',
  }))
}

describe('rolesDeFicha — qué papel juega cada columna', () => {
  it('sin declarar nada, la PRIMERA columna es el título y el resto son datos', () => {
    // Es el default que importa: una pantalla que todavía no se migró tiene que
    // dar una ficha legible igual. Con todo en "dato" quedaría una lista de
    // metadatos sin sujeto — imposible saber de qué fila se está hablando.
    const sinDeclarar: Column<Fila>[] = [
      { key: 'direccion', label: 'Dirección', render: r => r.direccion },
      { key: 'barrio', label: 'Barrio', render: r => r.barrio },
    ]
    expect(rolesDeFicha(sinDeclarar)).toEqual(['title', 'meta'])
  })

  it('si alguna columna declara ser el título, la primera NO se lo queda', () => {
    const conTitulo: Column<Fila>[] = [
      { key: 'alta', label: 'Fecha', render: r => r.alta },
      { key: 'direccion', label: 'Dirección', card: 'title', render: r => r.direccion },
    ]
    expect(rolesDeFicha(conTitulo)).toEqual(['meta', 'title'])
  })

  it('respeta lo declarado, incluso en la primera columna', () => {
    expect(rolesDeFicha(COLS)).toEqual(['title', 'meta', 'meta', 'badge', 'none'])
  })
})

describe('DataTable — las marcas que el CSS de la ficha necesita', () => {
  it('el contenedor declara el contenedor CSS `tabla-ficha`', () => {
    const { container } = render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    // Sin esta clase no existe el contenedor llamado `tabla` y NINGUNA regla de
    // la ficha puede activarse: es el interruptor, no un adorno.
    expect(container.firstElementChild).toHaveClass('tabla-ficha')
  })

  it('cada celda lleva el rol de su columna', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(celdasDeLaPrimeraFila().map(c => c.rol)).toEqual([
      'titulo', 'dato', 'dato', 'insignia', 'oculto', 'salto',
    ])
  })

  it('el PRIMER dato va sin separación a la izquierda y el segundo con ella', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    const datos = document.querySelectorAll('tbody tr:first-child [data-celda="dato"]')
    expect(datos).toHaveLength(2)
    expect(datos[0].hasAttribute('data-primero')).toBe(true)
    expect(datos[1].hasAttribute('data-primero')).toBe(false)
  })

  it('la flecha de "esto se toca" aparece solo si la fila navega', () => {
    const { rerender } = render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(document.querySelector('[data-celda="chevron"]')).toBeNull()
    rerender(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={() => {}} />)
    expect(document.querySelector('[data-celda="chevron"]')).not.toBeNull()
  })

  it('el salto y la flecha no le dicen NADA al lector de pantalla', () => {
    // Son puro dibujo. Si contaran como celdas, cada fila leería dos celdas
    // vacías al final. `aria-hidden` las saca del árbol de accesibilidad — y de
    // paso mantiene estable el `getAllByRole('cell')` del resto de los tests.
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={() => {}} />)
    expect(screen.getAllByRole('cell')).toHaveLength(COLS.length * FILAS.length)
  })

  it('la tabla declara sus roles a mano, porque en la ficha deja de ser una tabla', () => {
    // Al pasar a `display: block/flex` los navegadores le sacan la semántica de
    // tabla a `<table>/<tr>/<td>`. Con el rol escrito, el lector de pantalla
    // sigue leyendo filas y celdas en las dos anchuras.
    const { container } = render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(container.querySelector('table')).toHaveAttribute('role', 'table')
    expect(container.querySelector('tbody')).toHaveAttribute('role', 'rowgroup')
    expect(container.querySelector('tbody tr')).toHaveAttribute('role', 'row')
    expect(container.querySelector('tbody td')).toHaveAttribute('role', 'cell')
  })

  it('`wrap` es lo único que le saca el `whitespace-nowrap` a una celda', () => {
    // Es la columna que estira la tabla a 900px: una dirección o un email no
    // tienen por qué ir en un solo renglón.
    render(
      <DataTable
        data={FILAS}
        getRowKey={r => r.id}
        columns={[
          { key: 'direccion', label: 'Dirección', wrap: true, render: r => r.direccion },
          { key: 'precio', label: 'Precio', render: r => r.precio },
        ]}
      />,
    )
    const [direccion, precio] = Array.from(document.querySelectorAll('tbody tr:first-child td'))
    expect(direccion.className).not.toContain('whitespace-nowrap')
    expect(precio.className).toContain('whitespace-nowrap')
  })
})

describe('DataTable — la barra de la ficha (ordenar y seleccionar sin cabecera)', () => {
  it('ofrece ordenar por cada columna ordenable, menos por las que la ficha esconde', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    const opciones = Array.from(
      screen.getByLabelText('Ordenar la lista').querySelectorAll('option'),
    ).map(o => o.textContent)
    // "Fecha" es `card: 'none'`: ordenar por algo que la ficha no muestra no le
    // dice nada a nadie.
    expect(opciones).toEqual([
      'Ordenar por…',
      'Ordenar por Dirección',
      'Ordenar por Barrio',
      'Ordenar por Precio',
      'Ordenar por Estado',
    ])
  })

  it('pero SÍ ofrece la escondida si el orden ya es ese (se eligió en la cabecera)', () => {
    // Al achicar la ventana con la lista ordenada por una columna que la ficha
    // no muestra, el desplegable quedaría en blanco: diría "sin orden" sobre
    // una lista ordenada.
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        sort={{ key: 'alta', dir: 'desc' }} onSortChange={() => {}} />,
    )
    const elegido = screen.getByLabelText('Ordenar la lista') as HTMLSelectElement
    expect(elegido.value).toBe('alta')
    expect(Array.from(elegido.querySelectorAll('option')).map(o => o.value)).toContain('alta')
  })

  it('elegir una columna en el desplegable ordena de verdad', async () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    await userEvent.selectOptions(screen.getByLabelText('Ordenar la lista'), 'precio')
    const primera = document.querySelectorAll('tbody tr')[0]
    expect(primera.textContent).toContain('Agüero 950') // desc: 300 primero
  })

  it('el botón de dirección invierte el orden ya elegido', async () => {
    const onSortChange = vi.fn()
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        sort={{ key: 'precio', dir: 'desc' }} onSortChange={onSortChange} />,
    )
    await userEvent.click(screen.getByLabelText(/Orden descendente/))
    expect(onSortChange).toHaveBeenCalledWith('precio', 'asc')
  })

  it('sin orden elegido no hay botón de dirección que invertir', () => {
    render(<DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} />)
    expect(screen.queryByLabelText(/^Orden /)).toBeNull()
  })

  it('"Todas" selecciona todas las filas, y con todas puestas las saca', async () => {
    // El checkbox maestro vive en la cabecera, que la ficha no dibuja: sin esta
    // barra, seleccionar todo es inalcanzable desde un teléfono.
    const onSelectionChange = vi.fn()
    const { rerender } = render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set()} onSelectionChange={onSelectionChange} />,
    )
    await userEvent.click(screen.getByText('Todas'))
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a', 'b']))

    rerender(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set(['a', 'b'])} onSelectionChange={onSelectionChange} />,
    )
    await userEvent.click(screen.getByText('Ninguna'))
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set())
  })

  it('no se llama igual que el checkbox de la cabecera (son dos controles distintos)', () => {
    // Si los dos dijeran "Seleccionar todo", un lector de pantalla anunciaría
    // dos controles idénticos en la misma tabla.
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id}
        selectable selectedIds={new Set()} onSelectionChange={() => {}} />,
    )
    expect(screen.getAllByLabelText('Seleccionar todo')).toHaveLength(1)
  })
})

describe('DataTable — apagar la ficha (`cardMode={false}`)', () => {
  it('no declara el contenedor: sin él, ninguna regla de la ficha puede activarse', () => {
    const { container } = render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} cardMode={false} />,
    )
    expect(container.firstElementChild).not.toHaveClass('tabla-ficha')
    // Pero sigue deslizándose de costado, con el aviso de que hay más a la
    // derecha: una tabla de números en un teléfono se lee deslizando.
    expect(container.firstElementChild).toHaveClass('tabla-desliza')
  })

  it('no dibuja ni la barra, ni el salto, ni la flecha', () => {
    render(
      <DataTable data={FILAS} columns={COLS} getRowKey={r => r.id} onRowClick={() => {}}
        selectable selectedIds={new Set()} onSelectionChange={() => {}} cardMode={false} />,
    )
    expect(screen.queryByLabelText('Ordenar la lista')).toBeNull()
    expect(screen.queryByText('Todas')).toBeNull()
    expect(document.querySelector('[data-celda="salto"]')).toBeNull()
    expect(document.querySelector('[data-celda="chevron"]')).toBeNull()
  })
})
