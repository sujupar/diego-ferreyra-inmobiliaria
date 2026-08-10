// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import EmailTestClient from './EmailTestClient'

/**
 * D50 — el Test de emails no ofrecía `appraisal_request` ("Nueva solicitud de
 * tasación"), que es la pieza de MAYOR volumen del sistema: sale en cada
 * registro de la landing del embudo. La API sí la sabía enviar desde f0e63d1;
 * la lista de la pantalla nunca se actualizó. Sin ese renglón, la única forma
 * de probarla era disparar un registro real en la landing.
 *
 * El segundo test es el que evita que vuelva a pasar: compara la lista de la
 * pantalla contra los `case` de la ruta.
 */

let pedidos: { url: string; body: string }[]

beforeEach(() => {
  pedidos = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      pedidos.push({ url, body: init?.body ?? '' })
      if (url.startsWith('/api/settings/notifications')) {
        return { ok: true, status: 200, json: async () => ({ data: { test_mode_enabled: true, test_recipient_email: 'yo@inmodf.com.ar', alert_admins_on_lawyer_failure: true } }) }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Test de emails — la solicitud de tasación del embudo se puede probar', () => {
  it('ofrece "Solicitud de tasación (embudo)" y avisa que no es la tasación agendada', async () => {
    render(<EmailTestClient />)

    expect(await screen.findByText('Solicitud de tasación (embudo)')).toBeInTheDocument()
    expect(screen.getByText(/NO va al asesor/)).toBeInTheDocument()
    // Sigue existiendo la pieza distinta con la que se confunde.
    expect(screen.getByText('Tasación agendada')).toBeInTheDocument()
  })

  it('el botón dispara el POST al tipo correcto con el Deal ID', async () => {
    render(<EmailTestClient />)

    const titulo = await screen.findByText('Solicitud de tasación (embudo)')
    const tarjeta = titulo.closest('div[data-slot="card"]') ?? titulo.parentElement!.parentElement!.parentElement!
    fireEvent.change(
      tarjeta.querySelector('input')!,
      { target: { value: '11111111-2222-3333-4444-555555555555' } },
    )
    fireEvent.click(
      Array.from(tarjeta.querySelectorAll('button')).find(b => b.textContent?.includes('Enviar'))!,
    )

    await waitFor(() =>
      expect(pedidos.some(p => p.url === '/api/admin/email-test/appraisal_request')).toBe(true),
    )
    const pedido = pedidos.find(p => p.url === '/api/admin/email-test/appraisal_request')!
    expect(JSON.parse(pedido.body)).toEqual({ dealId: '11111111-2222-3333-4444-555555555555' })
  })
})

describe('Test de emails — la lista de la pantalla no puede quedar atrás de la API', () => {
  it('todo `case` de la ruta está ofrecido en la pantalla', () => {
    const raizDelRepo = path.resolve(__dirname, '../../../..')
    const ruta = readFileSync(
      path.join(raizDelRepo, 'app/api/admin/email-test/[type]/route.ts'),
      'utf8',
    )
    const cliente = readFileSync(path.join(__dirname, 'EmailTestClient.tsx'), 'utf8')

    const tiposDeLaApi = [...ruta.matchAll(/case '([a-z_]+)':/g)].map(m => m[1])
    expect(tiposDeLaApi.length).toBeGreaterThan(5) // el regex encontró algo real

    const tiposDeLaPantalla = [...cliente.matchAll(/id: '([a-z_]+)'/g)].map(m => m[1])
    const faltantes = tiposDeLaApi.filter(t => !tiposDeLaPantalla.includes(t))
    expect(faltantes).toEqual([])
  })
})
