// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ReelsCard, ANCLA_REELS } from './ReelsCard'

function respuesta(cuerpo: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, text: async () => JSON.stringify(cuerpo) }
}

const REEL_PUBLICADO = {
  id: 'r1',
  origen: 'subido' as const,
  estado: 'publicado' as const,
  palabra_clave: 'propiedad',
  programado_para: null,
  ig_permalink: 'https://instagram.com/reel/abc',
  ultimo_error: null,
  automatizacion_activa: true,
  simulacro: true,
  created_at: '2026-09-22T10:00:00Z',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    respuesta({ reels: [], resumen: {}, landing: { publicada: true, slug: 'abc' } }),
  ))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReelsCard', () => {
  it('sin reels invita a subir o a enganchar', async () => {
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByRole('button', { name: /subir un reel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /enganchar/i })).toBeTruthy()
  })

  it('SIN permiso de difundir no muestra ningún botón de acción', async () => {
    // El abogado entra a la pestaña Difusión (capacidad ver_difusion) pero no
    // publica. El permiso REAL lo decide el servidor; esto solo evita ofrecerle
    // botones que le van a dar 403.
    render(<ReelsCard propertyId="p1" puedeGestionar={false} />)
    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())
    expect(screen.queryByRole('button', { name: /subir un reel/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /enganchar/i })).toBeNull()
  })

  it('sin landing publicada avisa qué falta y por qué', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({ reels: [], resumen: {}, landing: { publicada: false, slug: null } }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/falta publicar la landing/i)).toBeTruthy()
  })

  it('mientras carga NO dice que falta la landing (no parpadea en fichas que la tienen)', () => {
    // La respuesta nunca llega: el estado es "cargando" para siempre.
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(screen.getByText(/cargando/i)).toBeTruthy()
    expect(screen.queryByText(/falta publicar la landing/i)).toBeNull()
  })

  it('tiene el ancla a la que salta el atajo "Ir a Reels"', async () => {
    const { container } = render(<ReelsCard propertyId="p1" puedeGestionar />)
    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())
    expect(container.querySelector(`#${ANCLA_REELS}`)).toBeTruthy()
  })

  it('una fila con varias palabras las muestra todas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({
        reels: [{ ...REEL_PUBLICADO, palabra_clave: 'parque rivadavia, doblas' }],
        resumen: {},
        landing: { publicada: true, slug: 'abc' },
      }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText('parque rivadavia · doblas')).toBeTruthy()
    expect(screen.getByText(/palabras:/)).toBeTruthy()
  })

  it('con landing publicada NO muestra el aviso', async () => {
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())
    expect(screen.queryByText(/falta publicar la landing/i)).toBeNull()
  })

  it('muestra el simulacro cuando está puesto', async () => {
    // Es la diferencia entre "esto le escribe a la gente" y "esto no le escribe
    // a nadie": tiene que verse sin abrir nada.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({
        reels: [REEL_PUBLICADO],
        resumen: { r1: { coincidencias: 5, privadosEnviados: 0, botonesTocados: 0 } },
        landing: { publicada: true, slug: 'abc' },
      }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText('Simulacro')).toBeTruthy()
    expect(screen.queryByText('Automatización activa')).toBeNull()
  })

  it('muestra los contadores de un reel publicado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({
        reels: [REEL_PUBLICADO],
        resumen: { r1: { coincidencias: 5, privadosEnviados: 3, botonesTocados: 2 } },
        landing: { publicada: true, slug: 'abc' },
      }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/5 con alguna palabra/)).toBeTruthy()
    expect(screen.getByText(/3 privados/)).toBeTruthy()
  })

  it('un reel sin palabra lo avisa en la fila', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({
        reels: [{ ...REEL_PUBLICADO, palabra_clave: null }],
        resumen: {},
        landing: { publicada: true, slug: 'abc' },
      }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/sin palabra configurada/i)).toBeTruthy()
  })

  it('un error del servidor se ve, no se traga', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({ error: 'No se pudieron cargar los reels' }, false),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/no se pudieron cargar los reels/i)).toBeTruthy()
  })

  it('si el servidor devuelve HTML de error, el mensaje es entendible', async () => {
    // El caso real: el gateway corta por tiempo y devuelve una página. Con
    // res.json() el asesor leería "Unexpected token '<'".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 504, text: async () => '<html>Gateway Timeout</html>',
    }))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/tardó demasiado/i)).toBeTruthy()
  })

  it('muestra el error del último intento de publicación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respuesta({
        reels: [{ ...REEL_PUBLICADO, estado: 'fallido', ultimo_error: 'Instagram no pudo procesar el video.' }],
        resumen: {},
        landing: { publicada: true, slug: 'abc' },
      }),
    ))
    render(<ReelsCard propertyId="p1" puedeGestionar />)
    expect(await screen.findByText(/instagram no pudo procesar el video/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy()
  })
})
