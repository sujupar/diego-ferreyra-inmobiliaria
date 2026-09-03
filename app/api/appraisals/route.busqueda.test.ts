/**
 * GET /api/appraisals — buscador de texto y rango de precio.
 *
 * Lo que se prueba acá NO es el escapado (eso vive en
 * `lib/filters/busqueda-texto.test.ts`): es que la RUTA arme la consulta con
 * las piezas correctas y, sobre todo, que el buscador NO reemplace el filtro
 * por rol. Un asesor solo puede ver sus tasaciones, busque lo que busque.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro, sesion } = vi.hoisted(() => ({
  registro: { llamadas: [] as Array<{ metodo: string; args: unknown[] }> },
  sesion: { rol: 'admin', id: 'yo-1' },
}))

vi.mock('@supabase/supabase-js', () => {
  const resultado = { data: [], error: null, count: 0 }
  const builder: any = new Proxy({} as any, {
    get(_objetivo, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') return (ok: any, mal: any) => Promise.resolve(resultado).then(ok, mal)
      return (...args: any[]) => {
        registro.llamadas.push({ metodo: String(prop), args })
        return builder
      }
    },
  })
  return { createClient: () => builder }
})

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: sesion.id, profile: { id: sesion.id, role: sesion.rol } })),
}))
vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/supabase/appraisals-write', () => ({ insertAppraisalWithComparables: vi.fn() }))

import { GET } from './route'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/appraisals${qs}`) as never)
}

function llamadas(metodo: string) {
  return registro.llamadas.filter(l => l.metodo === metodo)
}

beforeEach(() => {
  registro.llamadas = []
  sesion.rol = 'admin'
  sesion.id = 'yo-1'
})

describe('GET /api/appraisals — buscador de texto', () => {
  it('sin q no agrega ninguna condicion de busqueda', async () => {
    await pedir('')
    expect(llamadas('or')).toHaveLength(0)
  })

  it('q vacio o solo espacios no filtra nada', async () => {
    await pedir('?q=')
    await pedir('?q=%20%20')
    expect(llamadas('or')).toHaveLength(0)
  })

  it('una palabra busca en las cuatro columnas de texto', async () => {
    await pedir('?q=almagro')
    const busquedas = llamadas('or')
    expect(busquedas).toHaveLength(1)
    const clausula = String(busquedas[0].args[0])
    for (const columna of ['property_title', 'property_location', 'property_description', 'notes']) {
      expect(clausula).toContain(`${columna}.imatch.`)
    }
  })

  it('dos palabras arman DOS condiciones — se combinan con Y', async () => {
    // Verificado contra la API real: dos or() encadenados se combinan con AND.
    await pedir('?q=almagro%203841')
    expect(llamadas('or')).toHaveLength(2)
  })

  it('escapa los caracteres especiales con la barra DUPLICADA', async () => {
    // Sin esto, "2*D" devolvia 17 fichas en vez de 1.
    await pedir('?q=2*D')
    const clausula = String(llamadas('or')[0].args[0])
    expect(clausula).toContain('2\\\\*D')
  })

  it('un asesor sigue viendo SOLO lo suyo mientras busca', async () => {
    sesion.rol = 'asesor'
    sesion.id = 'asesor-9'
    await pedir('?q=almagro')
    const condiciones = llamadas('or').map(l => String(l.args[0]))
    // La condicion de alcance por rol tiene que seguir estando...
    expect(condiciones.some(c => c.includes('assigned_to.eq.asesor-9'))).toBe(true)
    // ...ademas de la de busqueda.
    expect(condiciones.some(c => c.includes('property_title.imatch.'))).toBe(true)
  })
})

describe('GET /api/appraisals — rango de precio', () => {
  it('sin precio no toca publication_price', async () => {
    await pedir('')
    const tocaPrecio = registro.llamadas.some(l => l.args[0] === 'publication_price')
    expect(tocaPrecio).toBe(false)
  })

  it('el minimo se aplica sobre publication_price', async () => {
    await pedir('?min=100000')
    const gte = llamadas('gte').find(l => l.args[0] === 'publication_price')
    expect(gte?.args[1]).toBe(100000)
  })

  it('el maximo se aplica sobre publication_price', async () => {
    await pedir('?max=300000')
    const lte = llamadas('lte').find(l => l.args[0] === 'publication_price')
    expect(lte?.args[1]).toBe(300000)
  })

  it('entiende el punto de miles argentino', async () => {
    await pedir('?min=150.000')
    const gte = llamadas('gte').find(l => l.args[0] === 'publication_price')
    expect(gte?.args[1]).toBe(150000)
  })

  it('un precio que no es numero se ignora, no rompe', async () => {
    const res = await pedir('?min=abc')
    expect(res.status).toBe(200)
    expect(llamadas('gte').some(l => l.args[0] === 'publication_price')).toBe(false)
  })

  it('con precio puesto, limita a dolares (contando el nulo como dolar)', async () => {
    // La pantalla ya muestra `currency || 'USD'`, asi que la consulta tiene que
    // tratar el nulo igual o el listado y el filtro dirian cosas distintas.
    await pedir('?min=100000')
    const condiciones = llamadas('or').map(l => String(l.args[0]))
    expect(condiciones.some(c => c.includes('currency.eq.USD') && c.includes('currency.is.null'))).toBe(true)
  })

  it('sin precio NO limita la moneda', async () => {
    await pedir('?q=almagro')
    const condiciones = llamadas('or').map(l => String(l.args[0]))
    expect(condiciones.some(c => c.includes('currency.eq.USD'))).toBe(false)
  })
})
