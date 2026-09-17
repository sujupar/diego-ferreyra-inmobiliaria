import { describe, it, expect, vi } from 'vitest'
import { modoDeVisita, puedeAbrirDatosDeVisita, guardarDatosDeVisita } from './visita-datos'

describe('modoDeVisita', () => {
  it('antes de la visita el botón la finaliza', () => {
    expect(modoDeVisita('scheduled')).toBe('finalizar')
    expect(modoDeVisita('not_visited')).toBe('finalizar')
  })

  it('después de la visita se edita, sin mover la etapa', () => {
    expect(modoDeVisita('visited')).toBe('editar')
    expect(modoDeVisita('appraisal_sent')).toBe('editar')
    expect(modoDeVisita('followup')).toBe('editar')
    // Captada: los datos siguen alimentando los portales y la landing.
    expect(modoDeVisita('captured')).toBe('editar')
  })

  it('en las etapas donde no hay visita, no se abre', () => {
    for (const s of ['request', 'clase_gratuita', 'lost', 'comprador', '', null, undefined]) {
      expect(modoDeVisita(s)).toBeNull()
      expect(puedeAbrirDatosDeVisita(s)).toBe(false)
    }
  })
})

describe('guardarDatosDeVisita', () => {
  it('avisa cuando el servidor rechaza, con el motivo que dio', async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ error: 'No tenés acceso a este proceso' }), { status: 403 }))
    const r = await guardarDatosDeVisita('deal-1', { snapshot: {}, complete: true }, buscar as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('No tenés acceso a este proceso')
  })

  it('con un cuerpo que no es JSON igual dice algo entendible', async () => {
    const buscar = vi.fn(async () => new Response('<HTML>504</HTML>', { status: 504 }))
    const r = await guardarDatosDeVisita('deal-1', { snapshot: {} }, buscar as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('504')
    expect(r.error).not.toContain('Unexpected token')
  })

  it('si se cae la red, no se pierde el aviso', async () => {
    const buscar = vi.fn(async () => { throw new Error('Failed to fetch') })
    const r = await guardarDatosDeVisita('deal-1', { snapshot: {} }, buscar as unknown as typeof fetch)
    expect(r).toEqual({ ok: false, error: 'Failed to fetch' })
  })

  it('editar NO manda `complete`: la etapa no se toca', async () => {
    const buscar = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await guardarDatosDeVisita('deal-1', { snapshot: { sale: null } }, buscar as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    const cuerpo = JSON.parse((buscar.mock.calls[0][1] as RequestInit).body as string)
    expect(cuerpo).not.toHaveProperty('complete')
  })
})
