// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

/**
 * El botón "Siguiente" tiene que volver a habilitarse SIEMPRE, incluso si el
 * guardado explota.
 *
 * `next()` hacía `setSaving(true)` → `await save()` → `setSaving(false)` sin
 * try/finally. Una excepción de `save()` se llevaba puesto el `setSaving(false)`
 * y, como el botón es `disabled={!stepValid || saving}`, quedaba muerto en
 * "Guardando…" con el spinner girando, sin ningún toast, para siempre.
 *
 * Acá el `save()` mockeado TIRA a propósito: es la garantía de que el arreglo no
 * depende de que `save()` se porte bien. Sacar el try/finally de `next()` (en
 * cualquiera de los dos asistentes) tiene que poner este test en rojo.
 */

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: () => {}, info: () => {} } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

const saveMl = vi.fn()
const saveAp = vi.fn()

const PROPERTY = {
  id: 'prop-1', title: 'Depto en Palermo', address: 'Calle 1', neighborhood: 'Palermo',
  description: 'x', asking_price: 100000, currency: 'USD', photos: ['a.jpg', 'b.jpg', 'c.jpg'],
  video_url: null, tour_3d_url: null, latitude: null, longitude: null,
}
const DRAFT = {
  photos: ['a.jpg', 'b.jpg', 'c.jpg'], videoUrl: null, tour3dUrl: null, mediaChoice: 'none',
  mlAttributes: {}, apAttributes: {}, listingType: 'free', title: 'Depto en Palermo',
  description: 'x', askingPrice: 100000, latitude: null, longitude: null, address: 'Calle 1',
  geoConfidence: undefined,
}
const BASE = {
  loading: false, property: PROPERTY, attrs: null, attrsError: null, listing: null,
  validation: { ok: true, errors: [], warnings: [] }, draft: DRAFT,
  patch: () => {}, reload: () => {},
}

vi.mock('./ml/useMlPublishDraft', () => ({ useMlPublishDraft: () => ({ ...BASE, save: saveMl }) }))
vi.mock('./ap/useApPublishDraft', () => ({ useApPublishDraft: () => ({ ...BASE, save: saveAp }) }))

import { MercadoLibreWizard } from './ml/MercadoLibreWizard'
import { ArgenpropWizard } from './ap/ArgenpropWizard'

const CASOS = [
  { nombre: 'MercadoLibre', Wizard: MercadoLibreWizard, save: saveMl },
  { nombre: 'Argenprop', Wizard: ArgenpropWizard, save: saveAp },
] as const

beforeEach(() => { toastError.mockClear(); saveMl.mockReset(); saveAp.mockReset() })

describe.each(CASOS)('$nombre — botón "Siguiente"', ({ Wizard, save }) => {
  it('vuelve a habilitarse (y avisa) aunque el guardado TIRE', async () => {
    save.mockRejectedValue(new Error('El servidor tardó demasiado'))
    render(<Wizard propertyId="prop-1" />)

    const boton = await screen.findByRole('button', { name: /Siguiente/i })
    await waitFor(() => expect(boton).toBeEnabled())
    fireEvent.click(boton)

    await waitFor(() => expect(save).toHaveBeenCalled())
    // Sin el try/finally el botón se queda acá, deshabilitado y en "Guardando…".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Siguiente/i })).toBeEnabled()
    })
    expect(screen.queryByText(/Guardando…/i)).not.toBeInTheDocument()
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('no avanza de paso cuando el guardado devuelve false', async () => {
    save.mockResolvedValue(false)
    render(<Wizard propertyId="prop-1" />)

    const boton = await screen.findByRole('button', { name: /Siguiente/i })
    await waitFor(() => expect(boton).toBeEnabled())
    fireEvent.click(boton)

    await waitFor(() => expect(save).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /Siguiente/i })).toBeEnabled())
    // Seguimos en el paso 1: no apareció el botón "Atrás".
    expect(screen.queryByRole('button', { name: /Atrás/i })).not.toBeInTheDocument()
  })
})
