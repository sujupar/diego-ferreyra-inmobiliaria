/**
 * GET /api/appraisals — el rango de fechas es un día ARGENTINO.
 *
 * La pantalla de Tasaciones manda `?from=2026-08-07&to=2026-08-07` (fecha de
 * calendario). Con el corte viejo (`T00:00:00Z` / `T23:59:59Z`) eso traía desde
 * las 21:00 del 6 hasta las 20:59 del 7, hora de acá: una tasación cargada a
 * las 22:00 del 7 no aparecía en el día que el asesor había pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: {
    llamadas: [] as Array<{ metodo: string; columna: string; valor: unknown }>,
    rol: 'admin' as string,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  const resultado = { data: [], error: null, count: 0 }
  const builder: any = new Proxy({} as any, {
    get(_objetivo, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') {
        return (ok: any, mal: any) => Promise.resolve(resultado).then(ok, mal)
      }
      return (...args: any[]) => {
        if (prop === 'gte' || prop === 'lte' || prop === 'order') {
          registro.llamadas.push({ metodo: prop, columna: args[0], valor: args[1] })
        }
        return builder
      }
    },
  })
  return { createClient: () => builder }
})

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: 'yo-1', profile: { id: 'yo-1', role: registro.rol } })),
}))
vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'yo-1', profile: { id: 'yo-1', role: registro.rol } })),
}))
const { insertar } = vi.hoisted(() => ({ insertar: vi.fn(async () => 'tasacion-nueva') }))
vi.mock('@/lib/supabase/appraisals-write', () => ({ insertAppraisalWithComparables: insertar }))

import { GET, POST } from './route'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/appraisals${qs}`) as never)
}

function crear(cuerpo: unknown = { subject: { title: 'x' }, valuationResult: {}, comparables: [] }) {
  return POST(new Request('http://local/api/appraisals', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json' },
  }) as never)
}

beforeEach(() => {
  registro.llamadas = []
  registro.rol = 'admin'
  insertar.mockClear()
})

/** El primer `.order(...)` es el orden principal; el segundo es el desempate. */
function ordenPrincipal() {
  return registro.llamadas.filter(l => l.metodo === 'order')[0]
}

describe('GET /api/appraisals — rango de fechas', () => {
  it('un solo día cubre el día argentino entero, no el día UTC', async () => {
    const res = await pedir('?from=2026-08-07&to=2026-08-07')
    expect(res.status).toBe(200)

    const desde = registro.llamadas.find(l => l.metodo === 'gte')
    const hasta = registro.llamadas.find(l => l.metodo === 'lte')
    expect(desde?.valor).toBe('2026-08-07T00:00:00.000-03:00')
    expect(hasta?.valor).toBe('2026-08-07T23:59:59.999999-03:00')

    // Una tasación de las 23:30 locales del 7 (= 2026-08-08T02:30Z) cae adentro.
    const tarde = new Date('2026-08-08T02:30:00Z').getTime()
    expect(new Date(String(desde?.valor)).getTime()).toBeLessThanOrEqual(tarde)
    expect(new Date(String(hasta?.valor)).getTime()).toBeGreaterThanOrEqual(tarde)

    // Y una de las 21:30 locales del 6 (= 2026-08-07T00:30Z) queda AFUERA:
    // con el corte viejo se colaba en el día 7.
    const nocheAnterior = new Date('2026-08-07T00:30:00Z').getTime()
    expect(new Date(String(desde?.valor)).getTime()).toBeGreaterThan(nocheAnterior)
  })

  it('un instante ISO completo pasa sin tocar', async () => {
    await pedir('?from=2026-08-07T03%3A00%3A00.000Z&to=2026-08-08T02%3A59%3A59.999Z')
    expect(registro.llamadas.find(l => l.metodo === 'gte')?.valor).toBe('2026-08-07T03:00:00.000Z')
    expect(registro.llamadas.find(l => l.metodo === 'lte')?.valor).toBe('2026-08-08T02:59:59.999Z')
  })

  it('sin rango no agrega ningún límite de fecha', async () => {
    await pedir('')
    expect(registro.llamadas.filter(l => l.metodo === 'gte' || l.metodo === 'lte')).toHaveLength(0)
  })
})

/**
 * D1 (crítico): el abogado no tiene ni un permiso `appraisal.*` en roles.ts y
 * sin embargo esta ruta le devolvía el listado COMPLETO de la inmobiliaria —
 * el mismo listado desde el que después borraba.
 */
describe('GET /api/appraisals — quién puede pedir el listado', () => {
  it('el abogado recibe 403, no el listado entero', async () => {
    // Sigue valiendo DESPUÉS de darle la lectura acotada de la tasación de la
    // propiedad que revisa (alcance `vinculadas`): esa lectura es de a UNA,
    // desde la ficha. Listado no tiene, y este es el caso que lo clava — si el
    // candado volviera a preguntar "¿alcanza algo?" en vez de "¿tiene
    // listado?", acá se pondría rojo.
    registro.rol = 'abogado'
    const res = await pedir('')
    expect(res.status).toBe(403)
    // Y no se llegó a armar ninguna consulta.
    expect(registro.llamadas).toHaveLength(0)
  })

  it('un rol desconocido tampoco (falla cerrado)', async () => {
    registro.rol = 'rol_que_no_existe'
    expect((await pedir('')).status).toBe(403)
  })

  it('admin, coordinador y asesor sí', async () => {
    for (const rol of ['admin', 'dueno', 'coordinador', 'asesor']) {
      registro.rol = rol
      expect((await pedir('')).status).toBe(200)
    }
  })
})

describe('POST /api/appraisals — quién puede crear', () => {
  it('el abogado no crea tasaciones, y el INSERT ni se intenta', async () => {
    registro.rol = 'abogado'
    const res = await crear()
    expect(res.status).toBe(403)
    expect(insertar).not.toHaveBeenCalled()
  })

  it('un rol desconocido tampoco (falla cerrado)', async () => {
    registro.rol = 'rol_que_no_existe'
    expect((await crear()).status).toBe(403)
    expect(insertar).not.toHaveBeenCalled()
  })

  it('los roles de siempre sí crean', async () => {
    for (const rol of ['admin', 'dueno', 'coordinador', 'asesor']) {
      insertar.mockClear()
      registro.rol = rol
      expect((await crear()).status).toBe(200)
      expect(insertar).toHaveBeenCalledTimes(1)
    }
  })
})

/**
 * D29: la pantalla pagina de a 12. Ordenar en memoria ordenaba esas 12 filas y
 * dejaba la flecha del encabezado puesta como si el orden fuera global — "la
 * más cara" era la más cara de la página, no del sistema. El orden ahora se
 * resuelve acá.
 */
describe('GET /api/appraisals — orden', () => {
  it('sin parámetros ordena por fecha, las más nuevas primero', async () => {
    await pedir('')
    expect(ordenPrincipal()).toMatchObject({ columna: 'created_at', valor: { ascending: false } })
  })

  it('ordena por la columna pedida, en la dirección pedida', async () => {
    await pedir('?sort=publication_price&dir=asc')
    expect(ordenPrincipal()).toMatchObject({ columna: 'publication_price', valor: { ascending: true } })
  })

  it('desc es la dirección por defecto de una columna válida', async () => {
    await pedir('?sort=comparable_count')
    expect(ordenPrincipal()).toMatchObject({ columna: 'comparable_count', valor: { ascending: false } })
  })

  it('una columna que no está en la lista blanca se ignora y cae al orden por defecto', async () => {
    // La clave llega del querystring y termina dentro de un `.order()`: sin
    // lista blanca, cualquiera podría ordenar por una columna que la pantalla
    // ni siquiera pide (o romper la query).
    await pedir('?sort=user_id&dir=asc')
    expect(ordenPrincipal()).toMatchObject({ columna: 'created_at', valor: { ascending: false } })
  })

  it('siempre hay un desempate estable, para que la paginación no repita ni saltee filas', async () => {
    await pedir('?sort=publication_price&dir=desc')
    const ordenes = registro.llamadas.filter(l => l.metodo === 'order')
    expect(ordenes).toHaveLength(2)
    expect(ordenes[1]).toMatchObject({ columna: 'id' })
  })
})
