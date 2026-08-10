/**
 * D1 (crítico) — el abogado no toca las tasaciones, por ninguna de las cuatro
 * puertas de esta ruta.
 *
 * El agujero estaba en `canAccessAppraisal`: `if (role !== 'asesor') return true`
 * dejaba pasar a todo rol que no fuera asesor. Como los handlers usan el cliente
 * service-role, la RLS tampoco frenaba nada, y el DELETE es un borrado DURO (no
 * hay papelera). El caso decisivo es el último de cada bloque: que la consulta
 * de borrado NUNCA se arme.
 *
 * 2026-08-10 — el dueño abrió una rendija: el abogado SÍ ve la tasación de la
 * propiedad que está revisando (alcance `vinculadas`). Esa rendija tiene que
 * ser exactamente eso, así que acá se fija su forma completa:
 *   - lee SOLO la vinculada a una propiedad, y con la ficha RESUMIDA que arma
 *     el servidor (menos columnas, cero comparables);
 *   - una tasación SIN propiedad que la referencie le sigue dando 403;
 *   - y las tres puertas de escritura siguen cerradas para él.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: {
    llamadas: [] as { metodo: string; args: unknown[]; tabla: string }[],
    /** Fila que devuelve la consulta, POR TABLA. */
    filas: {} as Record<string, unknown>,
    /** Error que devuelve la consulta, POR TABLA (para el caso "no se pudo mirar"). */
    errores: {} as Record<string, unknown>,
    rol: 'admin' as string,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  // Un builder por cliente: `canAccessAppraisal` arma el suyo (consulta
  // `properties` o `appraisals`) y el handler arma otro. Cada uno recuerda
  // sobre qué tabla está trabajando para poder devolver la fila que
  // corresponde y para que las aserciones puedan mirar la tabla.
  const crearBuilder = () => {
    let tabla = ''
    const builder: any = new Proxy({} as any, {
      get(_objetivo, prop) {
        if (typeof prop === 'symbol') return undefined
        const resultado = (t: string) => ({
          data: registro.errores[t] ? null : registro.filas[t] ?? null,
          error: registro.errores[t] ?? null,
        })
        if (prop === 'then') {
          const t = tabla
          return (ok: any, mal: any) => Promise.resolve(resultado(t)).then(ok, mal)
        }
        return (...args: any[]) => {
          if (prop === 'from') tabla = String(args[0])
          registro.llamadas.push({ metodo: String(prop), args, tabla })
          if (prop === 'maybeSingle' || prop === 'single') {
            return Promise.resolve(resultado(tabla))
          }
          return builder
        }
      },
    })
    return builder
  }
  return { createClient: () => crearBuilder() }
})

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: 'yo-1',
    email: 'yo@local',
    profile: { id: 'yo-1', role: registro.rol },
  })),
}))
vi.mock('@/lib/supabase/appraisals-write', () => ({ replaceAppraisalComparables: vi.fn() }))

import { GET, PUT, PATCH, DELETE } from './route'
import { COLUMNAS_TASACION_RESUMIDA } from '@/lib/auth/appraisal-access'

const params = Promise.resolve({ id: 'tasacion-1' })

function pedido(cuerpo?: unknown) {
  return new Request('http://local/api/appraisals/tasacion-1', {
    method: 'POST',
    body: JSON.stringify(cuerpo ?? {}),
    headers: { 'content-type': 'application/json' },
  }) as never
}

/** ¿Se llegó a armar la consulta de borrado? */
function huboBorrado() {
  return registro.llamadas.some(l => l.metodo === 'delete')
}

/** ¿Se llegó a armar un UPDATE (la escritura del PUT/PATCH)? */
function huboUpdate() {
  return registro.llamadas.some(l => l.metodo === 'update')
}

/** Las tablas que la corrida llegó a consultar. */
function tablasConsultadas() {
  return registro.llamadas.filter(l => l.metodo === 'from').map(l => String(l.args[0]))
}

/**
 * El `.select(...)` con el que el HANDLER leyó la tasación. Es el ÚLTIMO: con
 * el alcance `propias`, `canAccessAppraisal` ya hizo antes su propio
 * `select('assigned_to, user_id')` para resolver la pertenencia.
 */
function selectDeTasacion() {
  const selects = registro.llamadas.filter(l => l.metodo === 'select' && l.tabla === 'appraisals')
  return selects[selects.length - 1]?.args[0]
}

beforeEach(() => {
  registro.llamadas = []
  registro.errores = {}
  registro.filas = {
    appraisals: { assigned_to: 'otro-asesor', user_id: 'otro-asesor' },
    // Por defecto la tasación SÍ cuelga de una propiedad.
    properties: { id: 'propiedad-1' },
  }
  registro.rol = 'admin'
})

describe('DELETE /api/appraisals/[id]', () => {
  it('el abogado recibe 403 y la consulta de borrado NUNCA se arma', async () => {
    registro.rol = 'abogado'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('tampoco borra la tasación que SÍ puede leer', async () => {
    // El caso peligroso del alcance nuevo: la propiedad existe, o sea que el
    // vínculo se cumple y la lectura le está permitida. Aun así no borra.
    registro.rol = 'abogado'
    registro.filas.properties = { id: 'propiedad-1' }
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('un rol desconocido tampoco borra (falla cerrado)', async () => {
    registro.rol = 'rol_nuevo_sin_definir'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('el asesor NO borra una tasación ajena', async () => {
    registro.rol = 'asesor'
    registro.filas.appraisals = { assigned_to: 'otro-asesor', user_id: 'otro-asesor' }
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(403)
    expect(huboBorrado()).toBe(false)
  })

  it('el asesor SÍ borra la suya', async () => {
    registro.rol = 'asesor'
    registro.filas.appraisals = { assigned_to: 'yo-1', user_id: null }
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })

  it('el admin borra cualquiera', async () => {
    registro.rol = 'admin'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })

  it('el coordinador sigue pudiendo borrar (comportamiento intencional, no se toca)', async () => {
    registro.rol = 'coordinador'
    const res = await DELETE(pedido(), { params })
    expect(res.status).toBe(200)
    expect(huboBorrado()).toBe(true)
  })
})

describe('el abogado tampoco EDITA tasaciones, ni la que puede leer', () => {
  it('PUT → 403 y no se escribe nada', async () => {
    registro.rol = 'abogado'
    const res = await PUT(
      pedido({ subject: { title: 'x' }, valuationResult: {}, comparables: [] }),
      { params },
    )
    expect(res.status).toBe(403)
    expect(huboUpdate()).toBe(false)
  })

  it('PATCH (report_edits) → 403 y no se escribe nada', async () => {
    registro.rol = 'abogado'
    const res = await PATCH(pedido({ reportEdits: { foo: 1 } }), { params })
    expect(res.status).toBe(403)
    expect(huboUpdate()).toBe(false)
  })

  it('el 403 de escritura llega ANTES de mirar el vínculo: ni se consulta la base', async () => {
    // Si el candado de escritura faltara, el PUT caería en `canAccessAppraisal`,
    // encontraría la propiedad vinculada y dejaría pasar la escritura.
    registro.rol = 'abogado'
    registro.filas.properties = { id: 'propiedad-1' }
    await PUT(pedido({ subject: { title: 'x' }, valuationResult: {}, comparables: [] }), { params })
    expect(registro.llamadas).toHaveLength(0)
  })

  it('un rol desconocido tampoco escribe', async () => {
    registro.rol = 'rol_nuevo_sin_definir'
    expect((await PUT(pedido({ subject: { t: 1 }, valuationResult: {}, comparables: [] }), { params })).status).toBe(403)
    expect((await PATCH(pedido({ reportEdits: {} }), { params })).status).toBe(403)
    expect(huboUpdate()).toBe(false)
  })
})

describe('GET /api/appraisals/[id] — la lectura acotada del abogado', () => {
  it('lee la tasación que cuelga de una propiedad', async () => {
    registro.rol = 'abogado'
    registro.filas.properties = { id: 'propiedad-1' }
    registro.filas.appraisals = { id: 'tasacion-1', property_title: 'Depto en Palermo' }
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(200)
    // El vínculo se resolvió por `properties.appraisal_id`.
    const consultaVinculo = registro.llamadas.find(l => l.metodo === 'eq' && l.tabla === 'properties')
    expect(consultaVinculo?.args[0]).toBe('appraisal_id')
    expect(consultaVinculo?.args[1]).toBe('tasacion-1')
  })

  it('NO lee una tasación que ninguna propiedad referencia', async () => {
    // El "si y solo si": sin propiedad vinculada, el abogado queda afuera —
    // que es el caso de las tasaciones del embudo que nunca se captaron.
    registro.rol = 'abogado'
    registro.filas.properties = null
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(403)
    // Y la tasación ni se llegó a leer.
    expect(tablasConsultadas()).not.toContain('appraisals')
  })

  it('si el vínculo NO se pudo mirar, se niega (falla cerrado)', async () => {
    // Red caída, RLS, tabla ausente: no saber si el vínculo existe no es lo
    // mismo que saber que existe. Sin esto, un hipo de la base abriría la
    // tasación completa.
    registro.rol = 'abogado'
    registro.errores.properties = { message: 'la base no contesta' }
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(403)
    expect(tablasConsultadas()).not.toContain('appraisals')
  })

  it('sin id no se consulta nada', async () => {
    registro.rol = 'abogado'
    const res = await GET(pedido(), { params: Promise.resolve({ id: '' }) })
    expect(res.status).toBe(403)
    expect(registro.llamadas).toHaveLength(0)
  })

  it('recibe la ficha RESUMIDA: el servidor selecciona menos columnas', async () => {
    registro.rol = 'abogado'
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(200)
    expect(selectDeTasacion()).toBe(COLUMNAS_TASACION_RESUMIDA)
    expect(selectDeTasacion()).not.toBe('*')
  })

  it('y NINGÚN comparable: la tabla ni se consulta', async () => {
    registro.rol = 'abogado'
    const res = await GET(pedido(), { params })
    expect(res.status).toBe(200)
    expect(tablasConsultadas()).not.toContain('appraisal_comparables')
    expect((await res.json()).data.comparables).toEqual([])
  })

  it('la respuesta avisa que es resumida, para que la ficha de tasación no arme un informe a medias', async () => {
    registro.rol = 'abogado'
    const res = await GET(pedido(), { params })
    expect((await res.json()).resumida).toBe(true)
  })

  it('un rol sin alcance sigue sin leer nada', async () => {
    for (const rol of ['viewer', 'rol_nuevo_sin_definir']) {
      registro.llamadas = []
      registro.rol = rol
      const res = await GET(pedido(), { params })
      expect(res.status).toBe(403)
      expect(registro.llamadas).toHaveLength(0)
    }
  })
})

describe('GET /api/appraisals/[id] — los demás roles no cambian', () => {
  it('admin/dueño/coordinador siguen recibiendo todo, con comparables', async () => {
    for (const rol of ['admin', 'dueno', 'coordinador']) {
      registro.llamadas = []
      registro.rol = rol
      const res = await GET(pedido(), { params })
      expect(res.status).toBe(200)
      expect(selectDeTasacion()).toBe('*')
      expect(tablasConsultadas()).toContain('appraisal_comparables')
      // Y su ficha de tasación sigue armando el informe: nada de "resumida".
      expect((await res.json()).resumida).toBe(false)
    }
  })

  it('el asesor recibe todo sobre la suya, y 403 sobre una ajena', async () => {
    registro.rol = 'asesor'
    registro.filas.appraisals = { assigned_to: 'yo-1', user_id: null }
    expect((await GET(pedido(), { params })).status).toBe(200)
    expect(selectDeTasacion()).toBe('*')

    registro.llamadas = []
    registro.filas.appraisals = { assigned_to: 'otro-asesor', user_id: 'otro-asesor' }
    expect((await GET(pedido(), { params })).status).toBe(403)
  })

  it('el asesor NO pasa por el vínculo con propiedades: su alcance es la pertenencia', async () => {
    // Si `canAccessAppraisal` resolviera el alcance `propias` por el vínculo,
    // un asesor leería tasaciones ajenas con solo estar captada la propiedad.
    registro.rol = 'asesor'
    registro.filas.appraisals = { assigned_to: 'otro-asesor', user_id: 'otro-asesor' }
    registro.filas.properties = { id: 'propiedad-1' }
    expect((await GET(pedido(), { params })).status).toBe(403)
  })
})
