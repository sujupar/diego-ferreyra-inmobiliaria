// @vitest-environment happy-dom
/**
 * El formulario de las landings DENTRO del visor del mapa de calor no envía.
 *
 * El visor embebe la landing real con `?hm_preview=1`. Eso ya apagaba la visita, el
 * calor, el video y el Píxel, pero el formulario seguía vivo: llenarlo "para probar"
 * desde el mapa de calor creaba un lead real, avisaba al equipo, mandaba la conversión
 * a Meta y sumaba un registro a esa versión del test A/B.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunnelLeadForm } from './FunnelLeadForm'

const irA = (busqueda: string) => window.history.replaceState({}, '', `/tasacion-directa${busqueda}`)

async function llenarYEnviar() {
  const u = userEvent.setup()
  await u.type(screen.getByLabelText('Nombre'), 'Juan Pérez')
  await u.type(screen.getByPlaceholderText('11 XXXX XXXX'), '1133224455')
  await u.type(screen.getByLabelText('Email'), 'juan@mail.com')
  await u.click(screen.getByRole('button', { name: 'SOLICITAR' }))
}

afterEach(() => irA(''))

describe('FunnelLeadForm dentro del visor del mapa de calor (?hm_preview=1)', () => {
  it('con datos perfectos NO envía, y explica por qué', async () => {
    irA('?hm_preview=1&lp=B')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<FunnelLeadForm variant="tasacion" submitLabel="SOLICITAR" onSubmit={onSubmit} />)
    await llenarYEnviar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/mapa de calor/i)
    // Se le da tiempo al camino asíncrono del envío: si fuera a enviar, ya lo habría hecho.
    await new Promise((r) => setTimeout(r, 400))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/no se envía/i)
  })
})

describe('FunnelLeadForm en una visita normal (control)', () => {
  it('con los mismos datos SÍ envía', async () => {
    irA('?utm_source=meta')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<FunnelLeadForm variant="tasacion" submitLabel="SOLICITAR" onSubmit={onSubmit} />)
    await llenarYEnviar()
    // El envío valida el teléfono con una librería que se carga aparte: es asíncrono.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })
})
