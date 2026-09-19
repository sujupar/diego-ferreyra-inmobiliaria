// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerarDescripcionPanel } from './GenerarDescripcionPanel'
import type { EstadoDescripcion, ResultadoEscritura } from '@/lib/descripcion/servicio'
import { DISCLAIMER } from '@/lib/descripcion/metodo-diego'

const estado: EstadoDescripcion = {
  faltan: [], cantidadFotos: 22, conocidas: [], fotosListas: false, zonaLista: false,
  pendientes: [{ id: 'q1', tema: 'comprador', pregunta: '¿Quién imaginás que es el comprador ideal?', ayuda: 'Familia, inversor…' }],
  compradorSugerido: null, notas: null, portalesPublicados: ['mercadolibre'], tieneDescripcion: false,
}

const inventario = {
  ambientes: [{ nombre: 'Living comedor', fotos: [1], detalle: 'Parquet' }], exteriores: [], edificio: [], vistas: [],
  estilo: '', estadoGeneral: '', puntosFuertes: [], noSeVe: [], fotosAmbientadas: [],
  compradorSugerido: { perfil: 'Pareja joven', porque: 'Tamaño' },
}

const escrito = (problemas: string[]): ResultadoEscritura => ({
  texto: { title: 'Departamento luminoso de 3 ambientes', subtitle: 'Piso alto.', body: `Living con parquet.\n\n${DISCLAIMER}` },
  usado: { comprador: 'Pareja joven con un hijo', respuestas: [], inventario, zona: null, notas: null },
  problemas,
  avisos: ['Las fotos muestran 2 dormitorios y la ficha dice 1. Revisá que las fotos sean de esta propiedad o corregí la ficha.'],
})

let pedidos: Array<{ url: string; body: Record<string, unknown> }>
let escrituras: number

beforeEach(() => {
  pedidos = []
  escrituras = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    pedidos.push({ url, body })
    const ok = (json: unknown) => new Response(JSON.stringify(json), { status: 200 })
    if (url.endsWith('/guardar')) return ok({ ok: true })
    if (body.etapa === 'fotos') return ok({ reusada: false, inventario, cantidad: 22 })
    if (body.etapa === 'zona') return ok({ reusada: true, zona: { mapa: null, web: null }, avisos: ['El mapa no respondió: el texto sale sin distancias ni colectivos.'] })
    escrituras += 1
    // El primer intento vuelve con un adjetivo prohibido: el panel pide UNA corrección.
    return ok(escrito(escrituras === 1 ? ['adjetivo prohibido: "una joya"'] : []))
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('GenerarDescripcionPanel — recorrido completo', () => {
  it('fotos → zona → preguntas → escribir (con una corrección) → vista previa → guardar', async () => {
    const onGuardado = vi.fn()
    const onCerrar = vi.fn()
    render(<GenerarDescripcionPanel propertyId="p1" estado={estado} abierto onCerrar={onCerrar} onGuardado={onGuardado} />)

    // Pregunta solo lo pendiente. La sugerencia de las fotos NO se precarga en
    // el campo: lo que se guarda como respuesta tiene que haberlo escrito una persona.
    const q1 = await screen.findByLabelText('¿Quién imaginás que es el comprador ideal?')
    expect(q1).toHaveValue('')
    expect(screen.getByText(/Sugerencia del análisis de las fotos: «Pareja joven»/)).toBeInTheDocument()
    expect(screen.getByText('El mapa no respondió: el texto sale sin distancias ni colectivos.')).toBeInTheDocument()
    expect(screen.getByText('Zona ya investigada (misma dirección)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /usar la sugerencia/i }))
    expect(q1).toHaveValue('Pareja joven')
    await userEvent.type(q1, ' con un hijo')
    await userEvent.click(screen.getByRole('button', { name: /escribir la descripción/i }))

    // Vista previa editable, con el aviso de coherencia y el de portales.
    expect(await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')).toBeInTheDocument()
    expect(screen.getByText(/Las fotos muestran 2 dormitorios/)).toBeInTheDocument()
    expect(screen.getByText(/publicada en MercadoLibre/)).toBeInTheDocument()

    const escrituraPedidos = pedidos.filter(p => p.body.etapa === 'escribir')
    expect(escrituraPedidos).toHaveLength(2)
    expect(escrituraPedidos[0].body.respuestas).toEqual({ q1: 'Pareja joven con un hijo' })
    expect(escrituraPedidos[1].body.corregir).toEqual(['adjetivo prohibido: "una joya"'])
    expect(escrituraPedidos[1].body.respuestas).toBeUndefined()

    // Nada se guardó todavía.
    expect(pedidos.some(p => p.url.endsWith('/guardar'))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    const guardar = pedidos.find(p => p.url.endsWith('/guardar'))
    expect(guardar?.body).toEqual(escrito([]).texto)
    expect(onCerrar).toHaveBeenCalled()
  })

  it('si el comprador queda vacío no se manda como respuesta (la sugerencia no se guarda como si la hubiera dicho el asesor)', async () => {
    render(<GenerarDescripcionPanel propertyId="p1" estado={estado} abierto onCerrar={() => {}} onGuardado={() => {}} />)
    await screen.findByLabelText('¿Quién imaginás que es el comprador ideal?')
    expect(screen.getByText('Escribir con el método de Diego')).toBeInTheDocument() // todavía no empezó
    await userEvent.click(screen.getByRole('button', { name: /escribir la descripción/i }))
    await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')
    expect(pedidos.find(p => p.body.etapa === 'escribir')?.body.respuestas).toEqual({})
  })

  it('"Volver a escribir" repite solo la escritura, con el comprador elegido', async () => {
    render(<GenerarDescripcionPanel propertyId="p1" estado={{ ...estado, pendientes: [] }} abierto onCerrar={() => {}} onGuardado={() => {}} />)
    await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')
    const antes = pedidos.length

    await userEvent.click(screen.getByRole('button', { name: /volver a escribir/i }))
    const comprador = screen.getByLabelText('Comprador ideal para esta versión')
    await userEvent.clear(comprador)
    await userEvent.type(comprador, 'Inversor')
    await userEvent.click(screen.getByRole('button', { name: /escribir de nuevo/i }))

    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes))
    const nuevos = pedidos.slice(antes)
    expect(nuevos.every(p => p.body.etapa === 'escribir')).toBe(true)
    expect(nuevos[0].body.comprador).toBe('Inversor')
  })

  it('un corte momentáneo (504) se reintenta solo, sin mostrar error', async () => {
    let fallas = 1
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      pedidos.push({ url, body })
      if (body.etapa === 'fotos') return new Response(JSON.stringify({ reusada: false, inventario, cantidad: 22 }), { status: 200 })
      if (body.etapa === 'zona' && fallas > 0) { fallas--; return new Response('<html>504</html>', { status: 504 }) }
      if (body.etapa === 'zona') return new Response(JSON.stringify({ reusada: false, zona: { mapa: null, web: 'x' }, avisos: [] }), { status: 200 })
      return new Response(JSON.stringify(escrito([])), { status: 200 })
    }))
    render(<GenerarDescripcionPanel propertyId="p1" estado={{ ...estado, pendientes: [] }} abierto onCerrar={() => {}} onGuardado={() => {}} esperasReintentoMs={[0, 0]} />)
    await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(2)
  })

  it('si sigue fallando muestra el error y "Reintentar" repite solo ese paso', async () => {
    let fallas = 3 // el intento + los 2 reintentos automáticos
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      pedidos.push({ url, body })
      if (body.etapa === 'fotos') return new Response(JSON.stringify({ reusada: false, inventario, cantidad: 22 }), { status: 200 })
      if (body.etapa === 'zona' && fallas > 0) { fallas--; return new Response('<html>504</html>', { status: 504 }) }
      if (body.etapa === 'zona') return new Response(JSON.stringify({ reusada: false, zona: { mapa: null, web: 'x' }, avisos: [] }), { status: 200 })
      return new Response(JSON.stringify(escrito([])), { status: 200 })
    }))
    render(<GenerarDescripcionPanel propertyId="p1" estado={{ ...estado, pendientes: [] }} abierto onCerrar={() => {}} onGuardado={() => {}} esperasReintentoMs={[0, 0]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor tardó demasiado')
    expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')
    expect(pedidos.filter(p => p.body.etapa === 'fotos')).toHaveLength(1)
    expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(4)
  })

  it('un error de datos (409) NO se reintenta: se muestra enseguida', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      pedidos.push({ url, body })
      if (body.etapa === 'fotos') return new Response(JSON.stringify({ reusada: false, inventario, cantidad: 22 }), { status: 200 })
      return new Response(JSON.stringify({ error: 'No se pudo ubicar la dirección en el mapa.' }), { status: 409 })
    }))
    render(<GenerarDescripcionPanel propertyId="p1" estado={{ ...estado, pendientes: [] }} abierto onCerrar={() => {}} onGuardado={() => {}} esperasReintentoMs={[0, 0]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo ubicar la dirección en el mapa.')
    expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(1)
  })

  it('si falla guardar, "Reintentar" vuelve a GUARDAR lo editado (no reescribe ni pisa las ediciones)', async () => {
    let fallasGuardar = 3 // el intento + los 2 reintentos automáticos
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      pedidos.push({ url, body })
      if (url.endsWith('/guardar') && fallasGuardar > 0) { fallasGuardar--; return new Response('<html>503</html>', { status: 503 }) }
      if (url.endsWith('/guardar')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
      if (body.etapa === 'fotos') return new Response(JSON.stringify({ reusada: false, inventario, cantidad: 22 }), { status: 200 })
      if (body.etapa === 'zona') return new Response(JSON.stringify({ reusada: false, zona: { mapa: null, web: 'x' }, avisos: [] }), { status: 200 })
      return new Response(JSON.stringify(escrito([])), { status: 200 })
    }))
    const onGuardado = vi.fn()
    render(<GenerarDescripcionPanel propertyId="p1" estado={{ ...estado, pendientes: [] }} abierto onCerrar={() => {}} onGuardado={onGuardado} esperasReintentoMs={[0, 0]} />)
    const titulo = await screen.findByDisplayValue('Departamento luminoso de 3 ambientes')
    await userEvent.type(titulo, ' editado')
    const escriturasAntes = pedidos.filter(p => p.body.etapa === 'escribir').length

    await userEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(pedidos.filter(p => p.body.etapa === 'escribir')).toHaveLength(escriturasAntes)
    const ultimo = pedidos.filter(p => p.url.endsWith('/guardar')).at(-1)
    expect(ultimo?.body.title).toBe('Departamento luminoso de 3 ambientes editado')
  })

  it('cerrar el panel durante la espera de un reintento no manda más pedidos (no se paga trabajo que nadie va a ver)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      pedidos.push({ url, body })
      if (body.etapa === 'fotos') return new Response(JSON.stringify({ reusada: false, inventario, cantidad: 22 }), { status: 200 })
      return new Response('<html>504</html>', { status: 504 })
    }))
    const props = { propertyId: 'p1', estado: { ...estado, pendientes: [] }, onCerrar: () => {}, onGuardado: () => {}, esperasReintentoMs: [150, 150] }
    const { rerender } = render(<GenerarDescripcionPanel {...props} abierto />)
    await waitFor(() => expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(1))
    rerender(<GenerarDescripcionPanel {...props} abierto={false} />)
    await new Promise(r => setTimeout(r, 500))
    expect(pedidos.filter(p => p.body.etapa === 'zona')).toHaveLength(1)
  })
})
