import { describe, it, expect } from 'vitest'
import {
  cargarAvisos,
  cargarPropiedades,
  cargarAsesores,
  falloDeRespuesta,
  MAX_PAGINAS_PROPIEDADES,
  PAGINA_PROPIEDADES,
  type PropiedadOpcion,
} from './avisos-carga'

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('falloDeRespuesta', () => {
  it('401 manda a re-loguear y no ofrece reintentar', () => {
    const f = falloDeRespuesta(401, 'los avisos pendientes')
    expect(f.sesionVencida).toBe(true)
    expect(f.reintentable).toBe(false)
    expect(f.motivo).toMatch(/sesión/i)
  })

  it('403 explica que es un problema de permiso, no de datos', () => {
    const f = falloDeRespuesta(403, 'los avisos pendientes')
    expect(f.sesionVencida).toBe(false)
    expect(f.reintentable).toBe(false)
    expect(f.motivo).toMatch(/permiso/i)
  })

  it('500 sí ofrece reintentar y dice el código', () => {
    const f = falloDeRespuesta(500, 'los avisos pendientes')
    expect(f.reintentable).toBe(true)
    expect(f.motivo).toContain('500')
  })
})

describe('cargarAvisos', () => {
  it('devuelve la cola cuando el pedido sale bien', async () => {
    const r = await cargarAvisos(async () => respuesta(200, { data: [{ portal: 'zonaprop', externalCode: 'X' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toHaveLength(1)
  })

  it('una cola realmente vacía es `ok` con lista vacía', async () => {
    const r = await cargarAvisos(async () => respuesta(200, { data: [] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toEqual([])
  })

  it.each([401, 403, 500])('un %i NO se convierte en "no hay avisos"', async status => {
    const r = await cargarAvisos(async () => respuesta(status, { error: 'x' }))
    expect(r.ok).toBe(false)
  })

  it('un cuerpo que no es JSON (página de error del gateway) tampoco pasa por vacío', async () => {
    const r = await cargarAvisos(async () => new Response('<html>504</html>', { status: 200 }))
    expect(r.ok).toBe(false)
  })

  it('si el fetch ni sale, se avisa la falla de red', async () => {
    const r = await cargarAvisos(async () => {
      throw new Error('offline')
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.reintentable).toBe(true)
  })
})

describe('cargarPropiedades', () => {
  const prop = (i: number, over: Partial<PropiedadOpcion> = {}): PropiedadOpcion => ({
    id: `p${i}`,
    address: `Calle ${i}`,
    assigned_to: null,
    status: 'approved',
    ...over,
  })

  /** Servidor de mentira que respeta el tope de 100 del endpoint real. */
  function servidorCon(total: number, fabricar: (i: number) => PropiedadOpcion = prop) {
    const todas = Array.from({ length: total }, (_, i) => fabricar(i))
    const urls: string[] = []
    const fetchImpl = async (url: string) => {
      urls.push(url)
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0)
      const data = todas.slice(offset, offset + PAGINA_PROPIEDADES)
      return respuesta(200, { data, total, hasMore: offset + data.length < total })
    }
    return { fetchImpl, urls }
  }

  it('trae TODAS aunque pasen de 100 — el endpoint acota en 100 en silencio', async () => {
    const { fetchImpl } = servidorCon(250)
    const r = await cargarPropiedades(fetchImpl)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.propiedades).toHaveLength(250)
      expect(r.valor.incompleta).toBe(false)
    }
  })

  it('nunca pide más de 100 por página (pedir 200 no sirve: el servidor recorta)', async () => {
    const { fetchImpl, urls } = servidorCon(250)
    await cargarPropiedades(fetchImpl)
    for (const u of urls) expect(u).toContain(`limit=${PAGINA_PROPIEDADES}`)
    expect(urls).toHaveLength(3)
  })

  it('con menos de 100 hace UN solo pedido', async () => {
    const { fetchImpl, urls } = servidorCon(41)
    const r = await cargarPropiedades(fetchImpl)
    expect(urls).toHaveLength(1)
    if (r.ok) expect(r.valor.propiedades).toHaveLength(41)
  })

  it('las descartadas (archivadas/fusionadas) no se ofrecen como opción', async () => {
    const { fetchImpl } = servidorCon(4, i => prop(i, { status: i === 2 ? 'descartada' : 'approved' }))
    const r = await cargarPropiedades(fetchImpl)
    if (r.ok) {
      expect(r.valor.propiedades).toHaveLength(3)
      expect(r.valor.propiedades.map(p => p.id)).not.toContain('p2')
    }
  })

  it('si el servidor nunca deja de decir "hay más", corta y lo avisa', async () => {
    const fetchImpl = async () => respuesta(200, { data: [prop(0)], hasMore: true })
    const r = await cargarPropiedades(fetchImpl)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.incompleta).toBe(true)
      expect(r.valor.propiedades).toHaveLength(MAX_PAGINAS_PROPIEDADES)
    }
  })

  it('un fallo del listado se reporta, no queda como selector vacío', async () => {
    const r = await cargarPropiedades(async () => respuesta(500, { error: 'boom' }))
    expect(r.ok).toBe(false)
  })
})

describe('cargarAsesores', () => {
  it('un fallo se reporta (sin asesores no se puede guardar nada)', async () => {
    const r = await cargarAsesores(async () => respuesta(500, { error: 'boom' }))
    expect(r.ok).toBe(false)
  })

  it('con datos devuelve la lista', async () => {
    const r = await cargarAsesores(async () => respuesta(200, { data: [{ id: 'a1', full_name: 'Ana' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor[0].full_name).toBe('Ana')
  })
})
