// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 7.2: la hoja "Filtros" y la de "Elegir fechas" del celular.
// El foco entra al primer campo al abrir y vuelve al botón que la abrió al cerrar.
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FiltrosLista, HojaFechas, type ConfigFiltros } from './FiltrosCartera'
import { FILTROS_DEFECTO } from '@/lib/crm/cartera-url'
import type { FiltrosCartera } from '@/lib/crm/cartera'
import { TOMAS } from './datos-prueba'

const CONFIG: ConfigFiltros = { lista: 'crm', etapas: ['solicitud', 'coordinada', 'no_realizada'], asesores: [{ ...TOMAS, activo: true }] }

/** Los filtros con estado propio, como los tendría la pantalla. */
function ConEstado({ inicial = {} }: { inicial?: Partial<FiltrosCartera> }) {
  const [f, setF] = useState<FiltrosCartera>({ ...FILTROS_DEFECTO, ...inicial })
  return <FiltrosLista config={CONFIG} filtros={f} aplicar={(p) => setF((x) => ({ ...x, ...p }))} />
}

const dialogo = () => screen.getByRole('dialog')

describe('HojaFiltros', () => {
  it('"Filtros" muestra cuántos hay puestos, sin contar la búsqueda', () => {
    render(<ConEstado inicial={{ q: 'pinto', origen: 'referido', etapa: 'solicitud' }} />)
    const boton = screen.getByRole('button', { name: 'Filtros (2 puestos)' })
    expect(boton).toHaveTextContent('Filtros2')
  })

  it('al abrir, el foco va al primer filtro; elegir "Referido" y "Ver resultados" cierra y el botón dice 1', async () => {
    render(<ConEstado />)
    const boton = screen.getByRole('button', { name: 'Filtros' })
    await userEvent.click(boton)
    await waitFor(() => expect(document.activeElement).toBe(within(dialogo()).getByLabelText('Etapa')))
    await userEvent.selectOptions(within(dialogo()).getByLabelText('Origen'), 'referido')
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Ver resultados' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Filtros (1 puesto)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sacar el filtro Origen: Referido' })).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filtros (1 puesto)' })))
  })

  it('"Limpiar filtros" de la hoja saca los filtros y deja la búsqueda', async () => {
    render(<ConEstado inicial={{ q: 'pinto', origen: 'referido', etapa: 'solicitud' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Filtros (2 puestos)' }))
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Limpiar filtros' }))
    // La hoja queda abierta (se ven los campos ya vacíos) hasta "Ver resultados".
    expect(within(dialogo()).getByLabelText('Etapa')).toHaveValue('')
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Ver resultados' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
    expect(screen.getAllByRole('searchbox', { name: 'Buscar' })[0]).toHaveValue('pinto')
  })

  it('la cerradura con la X también devuelve el foco al botón', async () => {
    render(<ConEstado />)
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filtros' })))
  })
})

describe('HojaFechas', () => {
  it('"Elegir fechas…" la abre con el foco en "Desde"; "Aplicar" pone "Entró: Del 01/11 al 25/11"', async () => {
    render(<ConEstado />)
    const entro = screen.getAllByLabelText('Entró al CRM')[0]
    entro.focus()
    await userEvent.selectOptions(entro, 'elegir')
    await waitFor(() => expect(document.activeElement).toBe(within(dialogo()).getByLabelText('Desde')))
    await userEvent.type(within(dialogo()).getByLabelText('Desde'), '2026-11-01')
    await userEvent.type(within(dialogo()).getByLabelText('Hasta'), '2026-11-25')
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Sacar el filtro Entró: Del 01/11 al 25/11' })).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByLabelText('Entró al CRM')[0]))
  })

  it('"Aplicar" sin ninguna fecha dice "Elegí al menos una fecha" y no cambia nada', async () => {
    const alAplicar = vi.fn()
    const onAbierta = vi.fn()
    render(<HojaFechas abierta onAbierta={onAbierta} desde="" hasta="" alAplicar={alAplicar} />)
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Aplicar' }))
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('Elegí al menos una fecha')
    expect(alAplicar).not.toHaveBeenCalled()
    expect(onAbierta).not.toHaveBeenCalledWith(false)
  })

  it('"Cancelar" cierra sin aplicar', async () => {
    const alAplicar = vi.fn()
    const onAbierta = vi.fn()
    render(<HojaFechas abierta onAbierta={onAbierta} desde="2026-11-01" hasta="" alAplicar={alAplicar} />)
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    expect(onAbierta).toHaveBeenCalledWith(false)
    expect(alAplicar).not.toHaveBeenCalled()
  })

  it('una fecha "desde" posterior a "hasta" no se aplica', async () => {
    const alAplicar = vi.fn()
    render(<HojaFechas abierta onAbierta={() => {}} desde="2026-11-25" hasta="2026-11-01" alAplicar={alAplicar} />)
    await userEvent.click(within(dialogo()).getByRole('button', { name: 'Aplicar' }))
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('La primera fecha tiene que ser anterior a la segunda.')
    expect(alAplicar).not.toHaveBeenCalled()
  })
})
