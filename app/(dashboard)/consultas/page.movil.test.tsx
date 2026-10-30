// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { leerTelefono } from '@/lib/consultas/telefono'
import type { ConsultaEnBandeja, PeriodoConsultas } from '@/lib/consultas/tipos'

/**
 * Piso móvil de la bandeja: todo lo tocable mide al menos 44 px (`min-h-11`/`h-11`
 * o más), también lo que aparece al abrir el detalle y la hoja de filtros.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/consultas',
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/visitas/agendar/AgendarVisitaDialog', () => ({ AgendarVisitaDialog: () => null }))

import { ConsultasClient } from './ConsultasClient'

const ALTO_TACTIL = /(^|\s)(min-h|h|size)-(1[1-9]|[2-9]\d)(\s|$)/

function c(p: Partial<ConsultaEnBandeja>): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '+5491161400496' : p.telefono
  return {
    id: 'c-1', tipo: 'portal', numero: 1, recibida_at: '2026-10-29T12:24:00Z', canal: 'whatsapp',
    portal: 'zonaprop', nombre: 'Martina Gómez', telefono, email: null, mensaje: 'Hola',
    property_id: '33333333-3333-4333-8333-333333333333', assigned_to: null, asesor_propiedad: null,
    aviso_codigo: null, aviso_url: 'https://www.zonaprop.com.ar/x', aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 2, accion: 'agendar',
    propiedad: { address: 'Entre Ríos 2333', neighborhood: null }, asesor_nombre: null, ...p,
  }
}

// 30 consultas: con 25 a la vista aparece "Ver más" (también tiene que medir 44 px).
const data: PeriodoConsultas = {
  consultas: [
    c({ id: 'a' }),
    c({ id: 'b', telefono: '541161400496', estado: { tipo: 'con_visita', visitaId: 'v', scheduled_at: '2026-10-30T20:00:00Z' } }),
    c({ id: 'sp', property_id: null, propiedad: null, aviso_codigo: '2DLPOM', accion: 'elegir_propiedad' }),
    ...Array.from({ length: 27 }, (_, i) => c({ id: `r-${i}`, nombre: `Persona ${i}`, recibida_at: '2026-10-27T12:00:00Z' })),
  ],
  periodo: { desde: '2026-10-23', hasta: '2026-10-29', etiqueta: 'Últimos 7 días' },
  truncado: false,
}

function montar() {
  return render(<ConsultasClient yo={{ id: '11111111-1111-4111-8111-111111111111', rol: 'admin' }}
    asesores={[]} inicial={data} errorInicial={null} />)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('la bandeja no debería pedir nada al montar')
  }))
})

function sinAltoTactil(raiz: HTMLElement | Document): string[] {
  return [...raiz.querySelectorAll('button, a[href]')]
    .filter((el) => !ALTO_TACTIL.test(el.getAttribute('class') ?? ''))
    .map((el) => el.outerHTML.slice(0, 120))
}

describe('/consultas en el celular', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = montar()
    await screen.findByText('Mostrando 25 de 30')
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })

  it('todos los botones y enlaces de la bandeja miden al menos 44 px', async () => {
    montar()
    await screen.findByText('Mostrando 25 de 30')
    expect(sinAltoTactil(document)).toEqual([])
  })

  it('también los del detalle', async () => {
    montar()
    await userEvent.click((await screen.findAllByRole('button', { name: /Ver la consulta de/ }))[0])
    await screen.findByRole('dialog')
    expect(sinAltoTactil(document)).toEqual([])
  })

  it('los filtros van en una hoja inferior "Filtros · N", y también miden 44 px', async () => {
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /^Filtros/ }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByRole('combobox', { name: 'Estado' })).toBeInTheDocument()
    expect(sinAltoTactil(document)).toEqual([])
  })

  it('la fila de tarjetas scrollea de costado en su propio contenedor', async () => {
    montar()
    const tarjetas = await screen.findByRole('region', { name: 'Para atender' })
    expect(tarjetas.className).toContain('overflow-x-auto')
  })
})

describe('/consultas en el celular — estadísticas', () => {
  it('la pestaña Estadísticas tampoco tiene botones de menos de 44 px', async () => {
    montar()
    await userEvent.click(await screen.findByRole('tab', { name: 'Estadísticas' }))
    await screen.findByRole('region', { name: 'De la consulta a la visita' })
    expect(sinAltoTactil(document)).toEqual([])
  })
})
