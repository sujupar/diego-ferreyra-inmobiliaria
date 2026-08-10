// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DateRangeFilter } from './DateRangeFilter'

/**
 * Arnés CONTROLADO: reproduce lo que hacen las cinco pantallas de listado
 * (`value={{from, to}}` + `onChange` que reescribe ese value). Cuando estos
 * tests se escribieron por primera vez ninguna pasaba `value`, y por eso el
 * bug de A2 pasó desapercibido — todo lo de acá abajo corre en el modo que
 * la app usa DE VERDAD.
 */
function ArnesControlado({ inicial = { from: '', to: '' } }: { inicial?: { from: string; to: string } }) {
  const [rango, setRango] = useState(inicial)
  return (
    <div>
      <DateRangeFilter value={rango} onChange={setRango} />
      {/* Equivalente al "Limpiar todo" de FilterBar: reescribe el rango DESDE
          AFUERA, sin pasar por ningún botón del componente. */}
      <button onClick={() => setRango({ from: '', to: '' })}>Limpiar todo</button>
    </div>
  )
}

function presionados() {
  return screen
    .getAllByRole('button')
    .filter(b => b.getAttribute('aria-pressed') === 'true')
    .map(b => b.textContent)
}

/** El botón "Aplicar" solo existe dentro del panel custom. */
function hayPanelCustom() {
  return !!screen.queryByRole('button', { name: 'Aplicar' })
}

describe('DateRangeFilter', () => {
  it('sin value se comporta como siempre: elegir un preset avisa un rango', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    )
  })

  it('con value vacío no marca ningún preset', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '', to: '' }} />)
    for (const p of ['Hoy', '7d', '30d']) {
      expect(screen.getByRole('button', { name: p })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  // Este es el caso que importa: volver de la URL después de un refresco.
  // NOTA: Este test es blind al bug de zona horaria porque usa el MISMO método
  // que el componente. El test correcto está abajo con vi.setSystemTime.
  it('con un value que coincide con un preset, ese preset queda marcado', () => {
    // Usar getFullYear/getMonth/getDate para obtener local time, no UTC
    const hoy = new Date()
    const y = hoy.getFullYear()
    const m = String(hoy.getMonth() + 1).padStart(2, '0')
    const d = String(hoy.getDate()).padStart(2, '0')
    const hoyLocal = `${y}-${m}-${d}`
    render(<DateRangeFilter onChange={() => {}} value={{ from: hoyLocal, to: hoyLocal }} />)
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con un rango que no coincide con ningún preset, muestra las fechas cargadas', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '2026-01-05', to: '2026-02-10' }} />)
    expect(screen.getByDisplayValue('2026-01-05')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-02-10')).toBeInTheDocument()
  })

  // I2: Zona horaria — "Hoy" devuelve el día LOCAL, no UTC
  // 2026-08-08T02:30 UTC = 2026-08-07 23:30 Argentina (UTC-3)
  // Con el código viejo, esto fallaría porque toISO() usaría toISOString() (UTC)
  it('zona horaria: "Hoy" devuelve la fecha local, no UTC', async () => {
    // Congelar tiempo en 2026-08-08T02:30 UTC = 2026-08-07 23:30 Argentina
    vi.setSystemTime(new Date('2026-08-08T02:30:00Z'))
    try {
      const onChange = vi.fn()
      render(<DateRangeFilter onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: 'Hoy' }))
      // Debe devolver 2026-08-07 (local), no 2026-08-08 (UTC)
      expect(onChange).toHaveBeenCalledWith({ from: '2026-08-07', to: '2026-08-07' })
    } finally {
      vi.useRealTimers()
    }
  })

  // I1: Custom siempre renderiza el botón Aplicar (incluso con value controlado)
  // Antes: el botón solo se mostraba si !value
  // Ahora: siempre existe para que el usuario pueda aplicar un rango custom
  // A2 (revisión final Fase 2): el panel custom quedaba PEGADO en modo
  // controlado — `setShowCustom(false)` vivía adentro de un `if (!value)`.
  it('modo controlado: elegir un preset con el panel custom abierto lo cierra y deja UN solo botón presionado', async () => {
    render(<ArnesControlado />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(hayPanelCustom()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(presionados()).toEqual(['7d'])
    expect(hayPanelCustom()).toBe(false)
  })

  it('modo controlado: "Todo" con el panel custom abierto también lo cierra', async () => {
    render(<ArnesControlado inicial={{ from: '2026-01-05', to: '2026-02-10' }} />)
    expect(hayPanelCustom()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
    expect(presionados()).toEqual(['Todo'])
    expect(hayPanelCustom()).toBe(false)
  })

  it('modo controlado: limpiar el rango DESDE AFUERA (Limpiar todo) cierra el panel abierto a mano', async () => {
    render(<ArnesControlado inicial={{ from: '2026-01-05', to: '2026-02-10' }} />)
    // El asesor abre el panel a mano (showCustom local pasa a true).
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(hayPanelCustom()).toBe(true)

    // "Limpiar todo" de FilterBar: el rango se reescribe desde afuera, sin
    // tocar ningún botón de este componente.
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(presionados()).toEqual(['Todo'])
    expect(hayPanelCustom()).toBe(false)
  })

  // El modo NO controlado no cambió: hay pantallas que podrían no pasar `value`.
  it('modo no controlado: elegir un preset con el panel abierto sigue cerrándolo y dejando un solo botón presionado', async () => {
    render(<DateRangeFilter onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(hayPanelCustom()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '15d' }))
    expect(presionados()).toEqual(['15d'])
    expect(hayPanelCustom()).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
    expect(presionados()).toEqual(['Todo'])
    expect(hayPanelCustom()).toBe(false)
  })

  it('modo controlado: abrir el panel custom NO se cierra solo (el guard por ref no es una jaula)', async () => {
    render(<ArnesControlado inicial={{ from: '', to: '' }} />)
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(presionados()).toEqual(['7d'])

    // Con un preset vigente, abrir "Custom" tiene que dejar el panel abierto:
    // el rango todavía es el del preset, y un cierre por render lo haría
    // inabrible.
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(hayPanelCustom()).toBe(true)

    // Y sigue abierto tras escribir el borrador.
    const [desde, hasta] = screen.getAllByDisplayValue('') as HTMLInputElement[]
    await userEvent.type(desde, '2026-03-01')
    await userEvent.type(hasta, '2026-03-15')
    expect(hayPanelCustom()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(presionados()).toEqual(['Custom'])
    expect(hayPanelCustom()).toBe(true)
  })

  it('con value seteado a un rango custom, el botón "Aplicar" existe y es clickeable', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} value={{ from: '2026-01-05', to: '2026-02-10' }} />)
    // El preset Custom debería estar activo
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    // El botón Aplicar debe existir
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
  })
})

describe('rango con UNA sola punta', () => {
  // "Todo lo captado a partir del 1 de agosto" es un pedido normal y el resto
  // del sistema ya lo soporta (la consulta aplica `from` y `to` con ifs
  // independientes). Antes, cargar solo "Desde" y apretar "Aplicar" no hacía
  // NADA: ni filtro, ni mensaje, ni el botón deshabilitado.
  it('con solo "Desde" cargado, Aplicar filtra de verdad', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} value={{ from: '', to: '' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))

    const [desde] = screen.getAllByDisplayValue('') as HTMLInputElement[]
    await userEvent.type(desde, '2026-08-01')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(onChange).toHaveBeenCalledWith({ from: '2026-08-01', to: '' })
  })

  it('con solo "Hasta" cargado también', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} value={{ from: '', to: '' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))

    const [, hasta] = screen.getAllByDisplayValue('') as HTMLInputElement[]
    await userEvent.type(hasta, '2026-08-31')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(onChange).toHaveBeenCalledWith({ from: '', to: '2026-08-31' })
  })

  it('sin ninguna punta el botón se ve deshabilitado, no se traga el clic en silencio', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} value={{ from: '', to: '' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))

    const aplicar = screen.getByRole('button', { name: 'Aplicar' })
    expect(aplicar).toBeDisabled()
    await userEvent.click(aplicar)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('en cuanto se carga una punta, el botón se habilita', async () => {
    render(<DateRangeFilter onChange={vi.fn()} value={{ from: '', to: '' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()

    const [desde] = screen.getAllByDisplayValue('') as HTMLInputElement[]
    await userEvent.type(desde, '2026-08-01')
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  })
})
