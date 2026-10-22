// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { VistaInforme } from '@/lib/informes/servicio'
import { resumenDeMetricas } from '@/lib/informes/resumen'
import type { Informe } from '@/lib/informes/tipos'

const api = vi.hoisted(() => ({
  leerVista: vi.fn(), traerFuente: vi.fn(), guardarManual: vi.fn(), guardarCompetidoras: vi.fn(),
  subirCaptura: vi.fn(), quitarCaptura: vi.fn(), subirPdfYMarcarListo: vi.fn(), volverABorrador: vi.fn(), buscarCompetidora: vi.fn(),
}))
vi.mock('./api', () => api)
const { generar } = vi.hoisted(() => ({ generar: vi.fn(async () => new Blob(['%PDF-'])) }))
vi.mock('../pdf/generar', () => ({ generarPdfDelInforme: generar }))

import { EditorInforme } from './EditorInforme'

const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: 'x', datos, error: null })
const pendiente = { estado: 'pendiente' as const, actualizadoEn: null, datos: null, error: null }

function informe(cambios: Partial<Informe> = {}): Informe {
  return {
    id: 'inf-1', propertyId: 'prop-1', desde: '2026-10-01', hasta: '2026-10-15', origen: 'ciclo', estado: 'borrador',
    fuentes: {
      consultas: ok({ total: 2, porPortal: { zonaprop: 2, argenprop: 0, mercadolibre: 0, redes: 0, otros: 0 } }),
      visitas: pendiente, reserva: pendiente, mercadolibre: pendiente,
      meta: { estado: 'error', actualizadoEn: 'x', datos: null, error: 'Meta no respondió' },
      instagram: { estado: 'sin_datos', actualizadoEn: 'x', datos: null, error: 'La propiedad no tiene reels' },
    },
    manual: { zonaprop: { interesados: 1 }, textos: { accionesRealizadas: 'Publicamos' } },
    competidoras: [], capturas: {}, pdfPath: null, listoAt: null, createdAt: 'x', updatedAt: 'x', ...cambios,
  }
}

function vista(i: Informe, faltantes: string[] = ['Zonaprop: exposición']): VistaInforme {
  return {
    informe: i, propiedad: { id: 'prop-1', direccion: 'Roque Pérez 3059', barrio: 'Coghlan', ciudad: null, tipo: null, precio: null, moneda: null, capturadaEl: null, foto: null },
    resumen: resumenDeMetricas(i.fuentes, i.manual),
    paginas: [], faltantes, capturasUrl: {}, pdfUrl: null,
  }
}

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  generar.mockClear()
  api.traerFuente.mockResolvedValue(ok({}))
  api.guardarManual.mockResolvedValue({ ok: true })
})

describe('EditorInforme', () => {
  it('al abrir un borrador trae las fuentes pendientes DE A UNA, en orden, y después relee', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
    expect(api.traerFuente.mock.calls.map(c => c[1])).toEqual(['visitas', 'reserva', 'mercadolibre'])
  })

  it('una fuente caída se dice como caída (nunca un cero) y se puede reintentar', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    expect(await screen.findByText('No se pudo traer: Meta no respondió')).toBeInTheDocument()
    expect(screen.getByText('La propiedad no tiene reels')).toBeInTheDocument()
    // Sale en la fila de la fuente y como ayuda del campo "Resumen de las consultas".
    expect(screen.getAllByText('2 consultas (Zonaprop 2)')).toHaveLength(2)
    await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
    api.traerFuente.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /Volver a traer: Campaña de Meta Ads/ }))
    await waitFor(() => expect(api.traerFuente).toHaveBeenCalledWith('inf-1', 'meta'))
  })

  it('al salir de un campo guarda el `manual` COMPLETO (el servidor lo reemplaza entero)', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    const exposicion = await screen.findByLabelText(/Exposición/)
    expect(screen.getByText(/Exposición.*\(falta\)/)).toBeInTheDocument()
    await userEvent.type(exposicion, '930')
    await userEvent.tab()
    await waitFor(() => expect(api.guardarManual).toHaveBeenCalled())
    expect(api.guardarManual).toHaveBeenLastCalledWith('inf-1', {
      zonaprop: { interesados: 1, exposicion: 930 }, textos: { accionesRealizadas: 'Publicamos' },
    })
  })

  it('"Marcar como listo" está deshabilitado mientras falte algo', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    expect(await screen.findByRole('button', { name: /Marcar como listo/ })).toBeDisabled()
    expect(screen.getByText('Falta completar para marcarlo como listo:')).toBeInTheDocument()
  })

  it('sin faltantes: arma el PDF con el informe RELEÍDO y lo sube', async () => {
    const completo = informe({ fuentes: { consultas: ok({ total: 0, porPortal: { zonaprop: 0, argenprop: 0, mercadolibre: 0, redes: 0, otros: 0 } }) } })
    api.leerVista.mockResolvedValue(vista(completo, []))
    api.subirPdfYMarcarListo.mockResolvedValue(undefined)
    render(<EditorInforme informeId="inf-1" />)
    const boton = await screen.findByRole('button', { name: /Marcar como listo/ })
    await waitFor(() => expect(boton).toBeEnabled())
    const lecturasAntes = api.leerVista.mock.calls.length
    await userEvent.click(boton)
    await waitFor(() => expect(api.subirPdfYMarcarListo).toHaveBeenCalledWith('inf-1', expect.any(Blob)))
    expect(api.leerVista.mock.calls.length).toBeGreaterThan(lecturasAntes)
    expect(generar).toHaveBeenCalledTimes(1)
  })

  it('un informe listo no se edita: muestra Descargar y Volver a borrador, y no trae fuentes', async () => {
    const v = vista(informe({ estado: 'listo', pdfPath: 'informes/x/informe-y.pdf', listoAt: 'x' }), [])
    v.pdfUrl = 'https://storage.example/firmada.pdf'
    api.leerVista.mockResolvedValue(v)
    render(<EditorInforme informeId="inf-1" />)
    expect(await screen.findByRole('link', { name: /Descargar PDF/ })).toHaveAttribute('href', 'https://storage.example/firmada.pdf')
    expect(screen.getByRole('button', { name: /Volver a borrador/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/Exposición/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Marcar como listo/ })).not.toBeInTheDocument()
    expect(api.traerFuente).not.toHaveBeenCalled()
  })

  it('si no se puede abrir, lo dice y deja volver', async () => {
    api.leerVista.mockRejectedValue(new Error('No encontramos el informe'))
    render(<EditorInforme informeId="inf-1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos el informe')
    expect(screen.getByRole('link', { name: /Volver/ })).toBeInTheDocument()
  })
})
