// @vitest-environment happy-dom
/**
 * El formulario de las landings DENTRO del visor del mapa de calor no envía.
 *
 * El visor embebe la landing real con `?hm_preview=1`. Eso ya apagaba la visita, el
 * calor, el video y el Píxel, pero el formulario seguía vivo: llenarlo "para probar"
 * desde el mapa de calor creaba un lead real, avisaba al equipo, mandaba la conversión
 * a Meta y sumaba un registro a esa versión del test A/B.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
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

// El formulario consulta /api/geo para adivinar el país: acá no hay servidor.
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 }))))
afterEach(() => { irA(''); vi.unstubAllGlobals() })

describe('FunnelLeadForm dentro del visor del mapa de calor (?hm_preview=1)', () => {
  it('con datos perfectos NO envía, y explica por qué', async () => {
    irA('?hm_preview=1&lp=B')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<FunnelLeadForm variant="tasacion" submitLabel="SOLICITAR" onSubmit={onSubmit} />)
    await llenarYEnviar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/mapa de calor/i)
    // "Enviando..." se pone de forma SINCRÓNICA apenas el formulario decide enviar, antes de
    // cargar la librería del teléfono. Que no aparezca prueba que cortó antes, sin depender
    // de cuánto tarde esa carga (con `setError` pero sin `return`, esto se pone rojo).
    expect(screen.queryByText('Enviando...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SOLICITAR' })).toBeEnabled()
    await new Promise((r) => setTimeout(r, 300))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/no se envía/i)
    // Le dice por dónde probarlo de verdad: el botón del visor que abre la landing sin el modo visor.
    expect(screen.getByRole('alert')).toHaveTextContent(/Abrir la landing real/)
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
