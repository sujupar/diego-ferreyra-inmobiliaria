// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VisitDetailPage from './page'

/**
 * D30 — la ficha nunca se queda en "Cargando…": 404, 500, cuerpo no-JSON (504
 * con HTML del gateway) y 200 sin datos tienen su pantalla, con salida a /visits.
 * Más: las acciones de etapa piden lo que tienen que pedir antes de guardar, y
 * la concurrencia optimista (versión en cada acción, 409 CAMBIO_CONCURRENTE,
 * 200 con `data: null`) no rompe la pantalla.
 */
const ID = '66666666-6666-4666-8666-666666666666'
const VERSION = '2026-10-10T13:00:00.123456+00:00'
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '66666666-6666-4666-8666-666666666666' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function visita(p: Record<string, unknown> = {}) {
  return {
    id: ID, scheduled_at: '2026-08-05T15:00:00Z', status: 'scheduled', client_name: 'Cliente Uno',
    client_email: 'cliente@example.com', client_phone: '11-1111-1111', origin: 'portal', origin_detail: 'zonaprop',
    propiedad: { id: 'p1', address: 'Calle Falsa 123', neighborhood: 'Palermo', foto: null },
    advisor_id: 'a1', asesor: { id: 'a1', full_name: 'Lucas' }, comprador: null, consulta: null, notes: null, completion_notes: null,
    outcome_reason: null, advisor_interest: null, reschedule_count: 0, created_by_ai: false,
    updated_at: VERSION,
    eventos: [{ id: 'e1', kind: 'creada', from_status: null, to_status: 'scheduled', from_scheduled_at: null,
      to_scheduled_at: null, reason: null, note: null, created_at: '2026-08-01T12:00:00Z', actor: 'Lucas',
      desde_asesor: null, hacia_asesor: null }],
    acciones: ['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'],
    ...p,
  }
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })
let respuesta: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
let posteos: Array<{ url: string; body: unknown }> = []

beforeEach(() => {
  respuesta = async () => ok(visita())
  posteos = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posteos.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve(ok(visita({ status: 'no_show', outcome_reason: 'no_vino', acciones: ['reabrir'] })))
    }
    if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
    if (url.startsWith('/api/visits/')) return respuesta()
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('VisitDetailPage — la pantalla no se queda en "Cargando…" ante un fallo', () => {
  it('el camino feliz muestra propiedad, persona, origen e historial', async () => {
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    expect(screen.getByText(/Consulta de portal · zonaprop/)).toBeInTheDocument()
    expect(screen.getByText('Creada')).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })
  it('el mailto: va con el email codificado: un "?bcc=" escrito por un tercero no prellena el correo', async () => {
    // El email lo escribió el interesado en un portal o formulario: no es de fiar.
    respuesta = async () => ok(visita({ client_email: 'a@b.com?bcc=x@evil.com&body=hola' }))
    render(<VisitDetailPage />)
    const mail = await screen.findByRole('link', { name: 'a@b.com?bcc=x@evil.com&body=hola' })
    const href = mail.getAttribute('href') ?? ''
    expect(href).toBe(`mailto:${encodeURIComponent('a@b.com?bcc=x@evil.com&body=hola')}`)
    expect(href).not.toContain('?')
    expect(href).not.toContain('&')
  })
  it('un 404 dice que no se encontró la visita, con salida a /visits', async () => {
    respuesta = async () => ({ ok: false, status: 404, json: async () => ({ error: 'No encontramos la visita' }) })
    render(<VisitDetailPage />)
    await screen.findByText('No encontramos esta visita')
    expect(screen.getByText('← Volver a visitas')).toBeInTheDocument()
    expect(screen.getByText('Ver todas las visitas')).toBeInTheDocument()
  })
  it('un 500 dice que no se pudo cargar, y "Reintentar" la trae', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
      respuesta = async () => ok(visita())
      fireEvent.click(screen.getByText('Reintentar'))
      await screen.findByText('Calle Falsa 123')
    } finally { errores.mockRestore() }
  })
  it('un cuerpo que no es JSON (el 504 con HTML del gateway) tampoco la cuelga', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'") } })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
  it('un 200 sin la visita adentro es un fallo, no una pantalla vacía', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ok(null)
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
})

describe('VisitDetailPage — encabezado (spec §3.3): foto, WhatsApp y enlace al registro original', () => {
  it('muestra la miniatura de la propiedad con su alt', async () => {
    respuesta = async () => ok(visita({ propiedad: { id: 'p1', address: 'Calle Falsa 123', neighborhood: 'Palermo', foto: 'https://cdn.example.com/f1.jpg' } }))
    render(<VisitDetailPage />)
    const foto = await screen.findByRole('img', { name: 'Foto de Calle Falsa 123' })
    expect(foto).toHaveAttribute('src', 'https://cdn.example.com/f1.jpg')
    expect(foto.className).toContain('object-cover')
    expect(foto.className).toContain('shrink-0')
  })
  it('sin foto no dibuja una imagen rota', async () => {
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('con un teléfono válido hay botón de WhatsApp a wa.me, en pestaña nueva y tocable en celular', async () => {
    respuesta = async () => ok(visita({ client_phone: '11 5823-4521' }))
    render(<VisitDetailPage />)
    const wa = await screen.findByRole('link', { name: /WhatsApp/ })
    expect(wa).toHaveAttribute('href', 'https://wa.me/5491158234521')
    expect(wa).toHaveAttribute('target', '_blank')
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
    expect(wa.className).toContain('max-md:min-h-11')
  })
  it('con un teléfono que no se puede normalizar no hay botón de WhatsApp', async () => {
    respuesta = async () => ok(visita({ client_phone: '123' }))
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
  })
  it('con lead_id enlaza al registro en el Inbox', async () => {
    respuesta = async () => ok(visita({ lead_id: '55555555-5555-4555-8555-555555555555' }))
    render(<VisitDetailPage />)
    const enlace = await screen.findByRole('link', { name: 'Ver en el Inbox' })
    expect(enlace).toHaveAttribute('href', '/inbox?tab=campanas&lead=55555555-5555-4555-8555-555555555555')
  })
  it('sin lead_id no hay enlace al Inbox', async () => {
    respuesta = async () => ok(visita({ lead_id: null }))
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.queryByRole('link', { name: 'Ver en el Inbox' })).not.toBeInTheDocument()
  })
})

describe('VisitDetailPage — cambiar de etapa', () => {
  it('"No se realizó" exige un motivo antes de guardar, y después guarda y pinta la respuesta', async () => {
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí un motivo')).toBeInTheDocument()
    expect(posteos).toHaveLength(0)

    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    // El motivo elegido no es "otro": no hay texto que mandar (ver el test de
    // abajo, que cubre el caso en que SÍ se había escrito uno y se descarta).
    expect(posteos[0]).toEqual({
      url: `/api/visits/${ID}/estado`,
      body: { tipo: 'no_realizada', motivo: 'no_vino', detalle: null, version: VERSION },
    })
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeInTheDocument()
  })

  it('"Se realizó" exige elegir cómo se vio el interés antes de guardar (spec §3.3)', async () => {
    const usuario = userEvent.setup()
    render(<VisitDetailPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Se realizó' }))
    await usuario.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí cómo viste el interés')).toBeInTheDocument()
    expect(posteos).toHaveLength(0)

    await usuario.click(screen.getByRole('radio', { name: 'Medio' }))
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    expect(posteos[0].body).toMatchObject({ tipo: 'realizada', interes: 'medio', version: VERSION })
  })

  it('cambiar de motivo dentro de la misma acción descarta el detalle anterior', async () => {
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otro' }))
    fireEvent.change(screen.getByPlaceholderText('Contanos el motivo'), { target: { value: 'Se mudó de día sin avisar' } })
    // El campo de texto desaparece (ya no es "otro"): si el detalle no se
    // limpiara, viajaría igual en el body sin que nadie lo vea en pantalla.
    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    expect(screen.queryByPlaceholderText('Contanos el motivo')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    expect(posteos[0].body).toEqual({ tipo: 'no_realizada', motivo: 'no_vino', detalle: null, version: VERSION })
  })
})

describe('VisitDetailPage — cambiar de asesor', () => {
  it('si falla la carga de asesores avisa, y "Reintentar" la trae', async () => {
    let pedidosAdvisors = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posteos.push({ url, body: JSON.parse(String(init.body)) })
        return Promise.resolve(ok(visita()))
      }
      if (url.startsWith('/api/users/advisors')) {
        pedidosAdvisors++
        if (pedidosAdvisors === 1) return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
        return Promise.resolve(ok([{ id: 'a9', full_name: 'Marina' }]))
      }
      if (url.startsWith('/api/visits/')) return respuesta()
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar asesor' }))
    expect(await screen.findByText('No pudimos cargar los asesores')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('radio', { name: 'Marina' })).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar los asesores')).not.toBeInTheDocument()
  })

  it('sin asesores activos (fuera de la persona que ya la tiene) avisa en vez de mostrar una lista vacía', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(ok(visita()))
      if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([{ id: 'a1', full_name: 'Lucas' }]))
      if (url.startsWith('/api/visits/')) return respuesta()
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar asesor' }))
    // El único asesor que devuelve la API es el que YA tiene la visita (a1,
    // Lucas): queda afuera de la lista de destino.
    expect(await screen.findByText('No hay asesores activos')).toBeInTheDocument()
  })
})

describe('VisitDetailPage — concurrencia optimista', () => {
  it('manda en el body la version que vio la pantalla, carácter por carácter', async () => {
    render(<VisitDetailPage />)
    // "Se realizó" solo exige el interés (un toque): alcanza para aislar que la
    // version viaja, sin mezclarlo con la validación del motivo.
    fireEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    const cuerpo = posteos[0].body as Record<string, unknown>
    expect(cuerpo.version).toBe(VERSION)
  })

  it('un 409 CAMBIO_CONCURRENTE muestra el aviso, y "Recargar" vuelve a pedir la visita', async () => {
    let pedidosGet = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }),
        })
      }
      if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
      if (url.startsWith('/api/visits/')) { pedidosGet++; return respuesta() }
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('La visita cambió mientras la editabas. Recargá para ver cómo quedó.')).toBeInTheDocument()

    const antes = pedidosGet
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    await waitFor(() => expect(pedidosGet).toBeGreaterThan(antes))
    await screen.findByText('Calle Falsa 123')
  })

  it('un 200 con `data: null` no rompe la pantalla: recarga sola', async () => {
    let pedidosGet = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posteos.push({ url, body: JSON.parse(String(init.body)) })
        return Promise.resolve(ok(null))
      }
      if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
      if (url.startsWith('/api/visits/')) { pedidosGet++; return respuesta() }
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    await waitFor(() => expect(pedidosGet).toBeGreaterThan(1))
    await screen.findByText('Calle Falsa 123')
  })
})

describe('VisitDetailPage — encuesta (Entrega 3)', () => {
  it('una visita realizada muestra su encuesta con el estado y "Copiar link"', async () => {
    respuesta = async () => ok(visita({
      status: 'completed', acciones: ['reabrir'],
      encuesta: { link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', linkDisponible: true, estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' },
        puedeReenviar: false, vencida: false, venceEl: '2026-09-04T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [] },
    }))
    render(<VisitDetailPage />)
    expect(await screen.findByText('Sin enviar (envío apagado)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copiar link/ })).toBeInTheDocument()
  })
})
