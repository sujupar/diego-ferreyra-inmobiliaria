// @vitest-environment happy-dom
/**
 * Panel resumen del mapa de calor, dentro del detalle de un embudo.
 *
 * Lo que se cuida: el embudo de tasación tiene DOS landings (A y B) que registran
 * su calor por separado. El panel tiene que dejar elegir cuál mirar, no mezclar
 * nunca los números de una con la otra, y llevar al visor de la versión elegida.
 */
import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', () => ({
  default: (p: { href: string; children: ReactNode; className?: string }) =>
    createElement('a', { href: p.href, className: p.className }, p.children),
}))

import { HeatmapPanel, type HeatSectionRow, type HeatTotalRow } from './HeatmapPanel'

const total = (page: string, sessions: number): HeatTotalRow => ({
  page, segment: 'no_registrado', stage: null, device: 'mobile', sessions, avg_scroll: 40,
})
const seccion = (page: string, section: string, reached: number, clicks: number): HeatSectionRow => ({
  page, section, segment: 'no_registrado', stage: null, device: 'mobile', reached, avg_visible_ms: 4000, clicks,
})

const TOTALES = [total('tasacion', 200), total('tasacion-neta', 50)]
const SECCIONES = [
  seccion('tasacion', 'hero', 190, 30),
  seccion('tasacion', 'benefits', 80, 5),
  seccion('tasacion-neta', 'hero', 40, 4),
  seccion('tasacion-neta', 'video', 35, 26),
  seccion('tasacion-neta', 'cta-1', 20, 6),
]

/** La fila de una sección, por su nombre visible. */
const fila = (nombre: string) => screen.getByText(nombre).closest('div') as HTMLElement

describe('HeatmapPanel — embudo con dos versiones (tasación)', () => {
  it('muestra el selector con las dos versiones y arranca en la A', () => {
    render(<HeatmapPanel funnel="tasacion" sections={SECCIONES} totals={TOTALES} />)
    expect(screen.getByRole('button', { name: /Versión A/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Versión B/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/200 sesiones/)).toBeInTheDocument()
    // `hero` existe en las DOS versiones: es la fila que delata una mezcla. A: 190 de 200 = 95%.
    expect(within(fila('Hero (video + título)')).getByText('95%')).toBeInTheDocument()
    expect(within(fila('Hero (video + título)')).getByText(/30 clic/)).toBeInTheDocument()
    // Secciones de la A, no de la B.
    expect(screen.getByText('Beneficios')).toBeInTheDocument()
    expect(screen.queryByText('Botón bajo el video')).not.toBeInTheDocument()
  })

  it('al elegir la B muestra SUS secciones y SUS números, sin mezclar con la A', async () => {
    render(<HeatmapPanel funnel="tasacion" sections={SECCIONES} totals={TOTALES} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Versión B/ }))

    expect(screen.getByRole('button', { name: /Versión B/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/50 sesiones/)).toBeInTheDocument()
    expect(screen.queryByText(/200 sesiones/)).not.toBeInTheDocument()
    expect(screen.getByText('Botón bajo el video')).toBeInTheDocument()
    expect(screen.queryByText('Beneficios')).not.toBeInTheDocument()
    // La sección compartida: en la B son 40 de 50 = 80% y 4 clics. Si las filas de la A se
    // colaran serían 230 "llegaron" y 34 clics. Y en la B se llama distinto: no tiene el video adentro.
    expect(within(fila('Título y texto')).getByText('80%')).toBeInTheDocument()
    expect(within(fila('Título y texto')).getByText(/^4 clic/)).toBeInTheDocument()
    expect(screen.queryByText('Hero (video + título)')).not.toBeInTheDocument()
    // 35 de 50 sesiones llegaron al video = 70%, con sus 26 clics (no los 30 del hero de la A).
    expect(within(fila('Video')).getByText('70%')).toBeInTheDocument()
    expect(within(fila('Video')).getByText(/26 clic/)).toBeInTheDocument()
  })

  it('el enlace al visor sigue a la versión elegida', async () => {
    render(<HeatmapPanel funnel="tasacion" sections={SECCIONES} totals={TOTALES} />)
    const enlace = () => screen.getByRole('link', { name: /Ver mapa de calor/ })
    expect(enlace()).toHaveAttribute('href', '/embudos/heatmap/tasacion')
    await userEvent.setup().click(screen.getByRole('button', { name: /Versión B/ }))
    expect(enlace()).toHaveAttribute('href', '/embudos/heatmap/tasacion-neta')
  })

  it('una versión sin datos lo dice, pero deja el selector y el enlace al visor a mano', async () => {
    render(<HeatmapPanel funnel="tasacion" sections={SECCIONES.filter((s) => s.page === 'tasacion')} totals={[total('tasacion', 200)]} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Versión B/ }))
    expect(screen.getByText(/Sin datos de mapa de calor/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Versión A/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver mapa de calor/ })).toHaveAttribute('href', '/embudos/heatmap/tasacion-neta')
  })
})

describe('HeatmapPanel — el filtro de etapa no sobrevive al cambio de versión', () => {
  it('pasar de la A (filtrada por una etapa que la B no tiene) a la B muestra TODAS las sesiones de la B', async () => {
    // La A tiene registrados en "Seguimiento"; la B todavía no tiene ninguno en esa etapa.
    const totales = [
      total('tasacion', 200),
      { ...total('tasacion', 10), segment: 'registrado', stage: 'followup' },
      total('tasacion-neta', 50),
    ]
    render(<HeatmapPanel funnel="tasacion" sections={SECCIONES} totals={totales} />)
    const u = userEvent.setup()
    await u.selectOptions(screen.getByLabelText('Segmento'), 'stage:followup')
    expect(screen.getByText(/10 sesiones/)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Versión B/ }))
    // Sin el reseteo: "0 sesiones" con el desplegable mostrando "Todos" (la opción ya no existe).
    expect(screen.getByText(/50 sesiones/)).toBeInTheDocument()
    expect(screen.getByLabelText('Segmento')).toHaveValue('all')
  })
})

describe('HeatmapPanel — embudo con una sola landing (clase)', () => {
  it('no muestra selector de versión', () => {
    render(
      <HeatmapPanel
        funnel="clase"
        sections={[seccion('clase', 'hero', 90, 10)]}
        totals={[total('clase', 100)]}
      />,
    )
    expect(screen.queryByRole('group', { name: /Versión de la landing/ })).not.toBeInTheDocument()
    expect(screen.getByText(/100 sesiones/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver mapa de calor/ })).toHaveAttribute('href', '/embudos/heatmap/clase')
  })
})
