// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Competidoras } from './Competidoras'
import type { Competidora } from '@/lib/informes/tipos'

const LINK = 'https://www.zonaprop.com.ar/propiedades/x-1.html'
const aviso = {
  url: LINK, title: 'Casa', price: 695000, currency: 'USD', location: 'Quesada 3250, Coghlan, Capital Federal', description: '',
  features: { bedrooms: 5, bathrooms: 4, coveredArea: 300, uncoveredArea: null, totalArea: 436, age: 50, floor: null, totalFloors: null,
    expenses: null, orientation: null, disposal: null, condition: null, rooms: 6, garages: 3, views: 346, publishedDate: 'Publicado hace 84 días' },
  images: ['https://img.zonaprop.com.ar/1.jpg'], portal: 'zonaprop',
}

let respuesta: { status: number; body: unknown } = { status: 200, body: aviso }
const pedidos: string[] = []
beforeEach(() => {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    pedidos.push(url)
    return new Response(JSON.stringify(respuesta.body), { status: respuesta.status, headers: { 'content-type': 'application/json' } })
  }))
})

describe('Competidoras', () => {
  it('pegar el link completa los datos con el scraper y guarda la lista', async () => {
    respuesta = { status: 200, body: aviso }
    const onGuardar = vi.fn<(l: Competidora[]) => Promise<void>>(async () => {})
    render(<Competidoras iniciales={[]} onGuardar={onGuardar} deshabilitado={false} />)
    await userEvent.type(screen.getByLabelText(/link de una propiedad/i), LINK)
    await userEvent.click(screen.getByRole('button', { name: 'Traer datos' }))
    expect(await screen.findByDisplayValue('Quesada 3250')).toBeInTheDocument()
    expect(pedidos).toEqual(['/api/scrape'])
    expect(screen.getByLabelText('Barrio')).toHaveValue('Coghlan')
    expect(screen.getByLabelText('Valor del m²')).toHaveValue('1.594')
    expect(onGuardar).toHaveBeenCalledWith([expect.objectContaining({ url: LINK, precio: 695000, m2: 436, cocheras: 3 })])
  })

  it('un link que no es https se rechaza sin llamar al scraper', async () => {
    render(<Competidoras iniciales={[]} onGuardar={vi.fn()} deshabilitado={false} />)
    await userEvent.type(screen.getByLabelText(/link de una propiedad/i), 'zonaprop.com/x')
    await userEvent.click(screen.getByRole('button', { name: 'Traer datos' }))
    expect(screen.getByRole('alert')).toHaveTextContent('https://')
    expect(pedidos).toEqual([])
  })

  it('si el portal no responde ofrece cargarla a mano, y no guarda hasta que tenga dirección', async () => {
    respuesta = { status: 422, body: { error: 'Failed to scrape property' } }
    const onGuardar = vi.fn<(l: Competidora[]) => Promise<void>>(async () => {})
    render(<Competidoras iniciales={[]} onGuardar={onGuardar} deshabilitado={false} />)
    await userEvent.type(screen.getByLabelText(/link de una propiedad/i), LINK)
    await userEvent.click(screen.getByRole('button', { name: 'Traer datos' }))
    await userEvent.click(await screen.findByRole('button', { name: /Cargarla a mano/ }))
    expect(screen.getByText(/Completá la dirección/)).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Dirección'), 'Zapiola 3000')
    await userEvent.tab()
    expect(onGuardar).toHaveBeenCalledWith([expect.objectContaining({ url: LINK, direccion: 'Zapiola 3000', precio: null })])
  })

  it('cambiar el precio vuelve a proponer el valor del m²', async () => {
    const inicial: Competidora = { url: LINK, direccion: 'Quesada 3250', barrio: null, precio: 600000, moneda: 'USD', m2: 400, valorM2: 1500,
      ambientes: null, banos: null, dormitorios: null, antiguedad: null, cocheras: null, foto: null, publicadoHace: null, visualizaciones: null, bajoDePrecio: false }
    const onGuardar = vi.fn<(l: Competidora[]) => Promise<void>>(async () => {})
    render(<Competidoras iniciales={[inicial]} onGuardar={onGuardar} deshabilitado={false} />)
    const precio = screen.getByLabelText('Precio')
    await userEvent.clear(precio)
    await userEvent.type(precio, '800000')
    await userEvent.tab()
    expect(onGuardar).toHaveBeenLastCalledWith([expect.objectContaining({ precio: 800000, valorM2: 2000 })])
    expect(screen.getByLabelText('Valor del m²')).toHaveValue('2.000')
  })

  it('no deja repetir una propiedad', async () => {
    const inicial = { url: LINK, direccion: 'X', barrio: null, precio: null, moneda: null, m2: null, valorM2: null, ambientes: null, banos: null,
      dormitorios: null, antiguedad: null, cocheras: null, foto: null, publicadoHace: null, visualizaciones: null, bajoDePrecio: false } satisfies Competidora
    render(<Competidoras iniciales={[inicial]} onGuardar={vi.fn()} deshabilitado={false} />)
    await userEvent.type(screen.getByLabelText(/link de una propiedad/i), LINK)
    await userEvent.click(screen.getByRole('button', { name: 'Traer datos' }))
    expect(screen.getByRole('alert')).toHaveTextContent('ya está en la lista')
    expect(pedidos).toEqual([])
  })
})
