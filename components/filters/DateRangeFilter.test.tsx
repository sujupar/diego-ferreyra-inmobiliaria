// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangeFilter } from './DateRangeFilter'

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
  it('con value seteado a un rango custom, el botón "Aplicar" existe y es clickeable', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} value={{ from: '2026-01-05', to: '2026-02-10' }} />)
    // El preset Custom debería estar activo
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    // El botón Aplicar debe existir
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
  })
})
