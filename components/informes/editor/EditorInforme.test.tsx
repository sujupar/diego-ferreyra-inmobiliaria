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
  subirCaptura: vi.fn(), quitarCaptura: vi.fn(), subirPdfYMarcarListo: vi.fn(), volverABorrador: vi.fn(), buscarCompetidora: vi.fn(), escribirTextos: vi.fn(),
  buscarCompetencia: vi.fn(), abrirCandidata: vi.fn(), guardarAlSalir: vi.fn(),
}))
const { ErrorDePedido } = vi.hoisted(() => ({
  ErrorDePedido: class extends Error { constructor(m: string, public status: number) { super(m) } },
}))
vi.mock('./api', () => ({ ...api, ErrorDePedido }))
const { generar } = vi.hoisted(() => ({ generar: vi.fn(async () => new Blob(['%PDF-'])) }))
vi.mock('../pdf/generar', () => ({ generarPdfDelInforme: generar }))

import { EditorInforme } from './EditorInforme'

const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: 'x', datos, error: null })
const pendiente = { estado: 'pendiente' as const, actualizadoEn: null, datos: null, error: null }

/** La búsqueda de competidoras ya se hizo (si no, cada prueba dispararía la búsqueda automática). */
const YA_BUSCADO: Informe['candidatas'] = {
  detalles: {},
  argenprop: { estado: 'ok', error: null, buscadoEn: 'x', url: null, avisos: [] },
  mercadolibre: { estado: 'sin_busqueda', error: 'fuera de Capital', buscadoEn: 'x', url: null, avisos: [] },
}

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
    competidoras: [], candidatas: YA_BUSCADO, capturas: {}, pdfPath: null, listoAt: null, createdAt: 'x', updatedAt: 'x', ...cambios,
  }
}

function vista(i: Informe, faltantes: string[] = ['Zonaprop: exposición']): VistaInforme {
  return {
    informe: i, propiedad: { id: 'prop-1', direccion: 'Roque Pérez 3059', barrio: 'Coghlan', ciudad: null, tipo: null, precio: null, moneda: null, capturadaEl: null, foto: null },
    resumen: resumenDeMetricas(i.fuentes, i.manual),
    paginas: [], faltantes, capturasUrl: {}, pdfUrl: null, candidatas: [],
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

  describe('autoguardado (pedido del dueño: no perder nunca lo escrito)', () => {
    it('guarda a la pausa al tipear, sin tener que salir del campo, y una sola vez', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Exposición/), '930')
      await waitFor(() => expect(api.guardarManual).toHaveBeenCalled(), { timeout: 4_000 })
      expect(api.guardarManual).toHaveBeenCalledTimes(1)
      expect(api.guardarManual.mock.calls[0][1].zonaprop).toEqual({ interesados: 1, exposicion: 930 })
      expect(await screen.findByText(/Guardado \d\d:\d\d/)).toBeInTheDocument()
    })

    it('si se corta la red, lo escrito NO se pierde: queda en pantalla, dice "Sin guardar" y reintenta solo', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      api.guardarManual.mockRejectedValueOnce(new ErrorDePedido('No hay conexión. Probá de nuevo.', 0)).mockResolvedValue({ ok: true })
      render(<EditorInforme informeId="inf-1" />)
      const exposicion = await screen.findByLabelText(/Exposición/)
      await userEvent.type(exposicion, '930')
      await userEvent.tab()
      expect(await screen.findByText(/Sin guardar — reintentando/)).toBeInTheDocument()
      expect(exposicion).toHaveValue('930')
      expect(screen.getByRole('button', { name: /Marcar como listo/ })).toBeDisabled()
      await waitFor(() => expect(api.guardarManual).toHaveBeenCalledTimes(2), { timeout: 5_000 })
      expect(api.guardarManual.mock.calls[1][1].zonaprop).toEqual({ interesados: 1, exposicion: 930 })
      expect(await screen.findByText(/Guardado \d\d:\d\d/)).toBeInTheDocument()
    }, 10_000)

    it('al cerrar o recargar la pestaña escribiendo, manda lo escrito igual (keepalive)', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Análisis final/), 'Bajó el interés')
      window.dispatchEvent(new Event('pagehide'))
      expect(api.guardarAlSalir).toHaveBeenCalledWith('inf-1', expect.objectContaining({
        manual: expect.objectContaining({ textos: expect.objectContaining({ analisisFinal: 'Bajó el interés', accionesRealizadas: 'Publicamos' }) }),
      }))
    })

    it('en el celular, cambiar de app (la pestaña pasa a oculta) también manda lo escrito', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Análisis final/), 'Desde el celu')
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      expect(api.guardarAlSalir).toHaveBeenCalledWith('inf-1', expect.objectContaining({
        manual: expect.objectContaining({ textos: expect.objectContaining({ analisisFinal: 'Desde el celu' }) }),
      }))
    })

    it('salir a otra pantalla de la plataforma con algo sin guardar lo manda igual', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      const { unmount } = render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Análisis final/), 'Antes de irme')
      unmount()
      expect(api.guardarAlSalir).toHaveBeenCalledWith('inf-1', expect.objectContaining({
        manual: expect.objectContaining({ textos: expect.objectContaining({ analisisFinal: 'Antes de irme' }) }),
      }))
    })

    it('sesión vencida (401): no descarta nada, dice "Sin guardar" y reintenta', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      api.guardarManual.mockRejectedValueOnce(new ErrorDePedido('Iniciá sesión de nuevo', 401)).mockResolvedValue({ ok: true })
      render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Exposición/), '930')
      await userEvent.tab()
      expect(await screen.findByText(/Sin guardar — reintentando \(Iniciá sesión de nuevo\)/)).toBeInTheDocument()
      await waitFor(() => expect(api.guardarManual).toHaveBeenCalledTimes(2), { timeout: 5_000 })
      expect(api.guardarManual.mock.calls[1][1].zonaprop).toEqual({ interesados: 1, exposicion: 930 })
    }, 10_000)

    it('un rechazo del dato vuelve atrás y el campo MUESTRA lo que quedó (no un valor que no está guardado)', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      api.guardarManual.mockRejectedValueOnce(new ErrorDePedido('Datos del informe inválidos', 400))
      render(<EditorInforme informeId="inf-1" />)
      await userEvent.type(await screen.findByLabelText(/Exposición/), '930')
      await userEvent.tab()
      expect(await screen.findByText('Datos del informe inválidos')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/Exposición/)).toHaveValue(''))
      expect(screen.queryByText(/Guardado \d\d:\d\d/)).not.toBeInTheDocument()
    })

    it('si la plataforma escribe los textos mientras se carga un número, el número NO se pierde', async () => {
      const sinTextos = informe({ manual: { zonaprop: { interesados: 1 } }, fuentes: { ...informe().fuentes, visitas: ok({ realizadas: 0, ficha: { respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 }, ofertas: [], moneda: null, masGusto: [], menosGusto: [], comentariosMenosGusto: [] } }), reserva: ok({ reservada: false, fecha: null }), mercadolibre: { estado: 'sin_datos', actualizadoEn: 'x', datos: null, error: 'sin aviso' } } })
      api.leerVista.mockResolvedValue(vista(sinTextos))
      let terminar: (v: unknown) => void = () => {}
      api.escribirTextos.mockReturnValue(new Promise(r => { terminar = r }))
      render(<EditorInforme informeId="inf-1" />)
      await waitFor(() => expect(api.escribirTextos).toHaveBeenCalled())
      // Mientras la plataforma escribe, el número cargado justo antes ya está en camino.
      terminar({ manual: { zonaprop: { interesados: 1 }, textos: { analisisFinal: 'Escrito por la plataforma' }, redaccion: { generadoEn: 'x', original: { analisisFinal: 'Escrito por la plataforma' }, revisar: [] } } })
      await waitFor(() => expect(screen.getByLabelText(/Análisis final/)).toHaveValue('Escrito por la plataforma'))
      await userEvent.type(screen.getByLabelText(/Exposición/), '930')
      await userEvent.tab()
      await waitFor(() => expect(api.guardarManual).toHaveBeenCalled())
      const ultimo = api.guardarManual.mock.calls.at(-1)?.[1]
      expect(ultimo.zonaprop).toEqual({ interesados: 1, exposicion: 930 })
      expect(ultimo.textos.analisisFinal).toBe('Escrito por la plataforma')
    })

    it('con algo sin guardar, el navegador avisa antes de salir; con todo guardado, no', async () => {
      api.leerVista.mockResolvedValue(vista(informe()))
      render(<EditorInforme informeId="inf-1" />)
      const campo = await screen.findByLabelText(/Análisis final/)
      await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
      const sinCambios = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(sinCambios)
      expect(sinCambios.defaultPrevented).toBe(false)
      await userEvent.type(campo, 'Hola')
      const conCambios = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(conCambios)
      expect(conCambios.defaultPrevented).toBe(true)
    })
  })

  it('un aviso de ML inválido no se aplica ni se manda, y no traba el guardado de los demás campos', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    await userEvent.type(await screen.findByLabelText('Agregar otro aviso de MercadoLibre'), 'cualquier cosa')
    await userEvent.tab()
    expect(await screen.findByText(/No reconocemos ese aviso/)).toBeInTheDocument()
    expect(api.guardarManual).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/Exposición/), '930')
    await userEvent.tab()
    await waitFor(() => expect(api.guardarManual).toHaveBeenCalledTimes(1))
    expect(api.guardarManual.mock.calls[0][1].mercadolibre).toBeUndefined()
  })

  it('si el servidor rechaza un guardado, la pantalla vuelve a lo último confirmado (el siguiente no arrastra el dato)', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    api.guardarManual.mockRejectedValueOnce(new Error('Datos del informe inválidos')).mockResolvedValue({ ok: true })
    render(<EditorInforme informeId="inf-1" />)
    await userEvent.type(await screen.findByLabelText(/Exposición/), '930')
    await userEvent.tab()
    expect(await screen.findByText('Datos del informe inválidos')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Interesados/), '{backspace}2')
    await userEvent.tab()
    await waitFor(() => expect(api.guardarManual).toHaveBeenCalledTimes(2))
    expect(api.guardarManual.mock.calls[1][1].zonaprop).toEqual({ interesados: 2 })
  })

  it('MercadoLibre: muestra los avisos que se suman y "No es de esta propiedad" lo saca y vuelve a traer la fuente', async () => {
    const i = informe()
    i.fuentes.mercadolibre = ok({
      avisos: [
        { id: 'MLA2185347399', titulo: 'Departamento 3 Amb Belgrano', url: 'https://articulo.mercadolibre.com.ar/MLA-2185347399', origen: 'plataforma' as const },
        { id: 'MLA4071627624', titulo: 'Depto de calidad', url: 'https://articulo.mercadolibre.com.ar/MLA-4071627624', origen: 'cuenta' as const },
      ],
      visitas: 7,
    })
    api.leerVista.mockResolvedValue(vista(i))
    render(<EditorInforme informeId="inf-1" />)
    expect(await screen.findByText('Avisos que se suman (2)')).toBeInTheDocument()
    expect(screen.getByText(/MLA4071627624 · encontrado en la cuenta por la dirección/)).toBeInTheDocument()
    await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
    api.traerFuente.mockClear()
    await userEvent.click(screen.getAllByRole('button', { name: 'No es de esta propiedad' })[1])
    await waitFor(() => expect(api.guardarManual).toHaveBeenCalled())
    expect(api.guardarManual.mock.calls[0][1].mercadolibre).toEqual({ excluidos: ['MLA4071627624'] })
    await waitFor(() => expect(api.traerFuente).toHaveBeenCalledWith('inf-1', 'mercadolibre'))
  })

  it('con los textos vacíos, al terminar de llegar los datos la plataforma los escribe y aparecen en los campos', async () => {
    const sinTextos = informe({ manual: { zonaprop: { interesados: 1 } } })
    const listos = informe({ manual: { zonaprop: { interesados: 1 } }, fuentes: Object.fromEntries(Object.keys(informe().fuentes).map(k => [k, { estado: 'sin_datos' as const, actualizadoEn: 'x', datos: null, error: null }])) as Informe['fuentes'] })
    api.leerVista.mockResolvedValueOnce(vista(sinTextos)).mockResolvedValue(vista(listos))
    const escrito = { zonaprop: { interesados: 1 }, textos: { resumenMetricas: 'La están viendo muchos compradores.', analisisFinal: 'Tuvo 1.139 apariciones.' },
      redaccion: { generadoEn: '2026-10-22T15:00:00.000Z', original: { analisisFinal: 'Tuvo 1.139 apariciones.' }, revisar: ['analisisFinal' as const] } }
    api.escribirTextos.mockResolvedValue({ manual: escrito })
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.escribirTextos).toHaveBeenCalledWith('inf-1', false))
    expect(await screen.findByDisplayValue('La están viendo muchos compradores.')).toBeInTheDocument()
    expect(screen.getByText(/no encontré en los datos/)).toBeInTheDocument()
    expect(api.escribirTextos).toHaveBeenCalledTimes(1)
  })

  it('con textos ya cargados no los escribe solo', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
    expect(api.escribirTextos).not.toHaveBeenCalled()
  })

  it('sin búsqueda de competencia, busca en los dos portales y abre las candidatas para leer disposición y estado', async () => {
    const sinBuscar = informe({ candidatas: { detalles: {} } })
    const candidata = { portal: 'argenprop' as const, url: 'https://www.argenprop.com/x--1', titulo: null, direccion: 'Quesada 3250, Coghlan', precio: 200000,
      moneda: 'USD' as const, m2: 70, ambientes: 3, dormitorios: 2, banos: 1, cocheras: null, antiguedad: 10, foto: null, vistas: null, inmobiliaria: null,
      puntaje: 90, porque: ['mismos ambientes'], disposicion: null, estado: null, orientacion: null, publicadoHace: null, abierta: false }
    api.leerVista.mockResolvedValueOnce(vista(sinBuscar)).mockResolvedValue({ ...vista(sinBuscar), candidatas: [candidata] })
    api.buscarCompetencia.mockResolvedValue({ estado: 'ok', error: null, buscadoEn: 'x', url: null, avisos: [] })
    api.abrirCandidata.mockResolvedValue({})
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.abrirCandidata).toHaveBeenCalledWith('inf-1', 'https://www.argenprop.com/x--1'))
    expect(api.buscarCompetencia.mock.calls.map(c => c[1])).toEqual(['argenprop', 'mercadolibre'])
    expect(await screen.findByText('Quesada 3250, Coghlan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver en el portal/ })).toHaveAttribute('href', 'https://www.argenprop.com/x--1')
    await userEvent.click(screen.getByRole('button', { name: /Agregar al informe/ }))
    await waitFor(() => expect(api.guardarCompetidoras).toHaveBeenCalledWith('inf-1', [expect.objectContaining({ url: 'https://www.argenprop.com/x--1', direccion: 'Quesada 3250', barrio: 'Coghlan' })]))
  })

  it('un portal que falla se reintenta una vez sola (Argenprop falló así en la vista previa y anduvo al rato)', async () => {
    const sinBuscar = informe({ candidatas: { detalles: {} } })
    api.leerVista.mockResolvedValue(vista(sinBuscar))
    const ok = { estado: 'ok', error: null, buscadoEn: 'x', url: null, avisos: [] }
    api.buscarCompetencia.mockResolvedValueOnce({ ...ok, estado: 'error', error: 'no reconoce' }).mockResolvedValue(ok)
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.buscarCompetencia).toHaveBeenCalledTimes(3))
    expect(api.buscarCompetencia.mock.calls.map(c => c[1])).toEqual(['argenprop', 'argenprop', 'mercadolibre'])
  })

  it('con la búsqueda ya hecha, no vuelve a buscar sola', async () => {
    api.leerVista.mockResolvedValue(vista(informe()))
    render(<EditorInforme informeId="inf-1" />)
    await waitFor(() => expect(api.leerVista).toHaveBeenCalledTimes(2))
    expect(api.buscarCompetencia).not.toHaveBeenCalled()
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
    await waitFor(() => expect(api.subirPdfYMarcarListo).toHaveBeenCalledWith('inf-1', expect.any(Blob), 'x'))
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
