/**
 * Tests de `POST /api/funnel/submit` — la conversión de las dos landings pagas.
 *
 * Lo que se protege acá, en orden de importancia:
 *
 *  1. QUE NO SE LLAME A NINGÚN TERCERO mientras la persona espera. El 504 del
 *     2026-08-08 fue exactamente eso: el POST a Resend colgó 34,47 s dentro de
 *     este handler. Se asserta a nivel mecanismo (`fetch` nunca se invoca) y a
 *     nivel módulo (Resend, Meta y Mailchimp no se tocan).
 *  2. QUE DOS ENVÍOS SIMULTÁNEOS DEL MISMO TELÉFONO CREEN UN SOLO DEAL. La
 *     decisión de rate-limit + dedup + alta vive ENTERA en una sola llamada
 *     atómica a Postgres. El Supabase falso de este archivo modela esa
 *     atomicidad: `rpc('reservar_envio_embudo')` corre sin ceder el hilo (como
 *     una función serializada por candados), mientras que un `.select()` normal
 *     sí cede — así que si alguien vuelve a mover la decisión a JavaScript, las
 *     dos peticiones se intercalan y este test se pone rojo.
 *  3. Que el rate-limit y el dedup sigan haciendo exactamente lo de antes.
 *  4. Que se encolen los cinco avisos y que encolar dos veces no los duplique.
 *
 * Solo se moquea `@supabase/supabase-js`: el resto del camino (validación,
 * honeypot, dedup de contacto, alta del deal, armado de los trabajos) corre de
 * verdad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const bd = vi.hoisted(() => ({
  envios: [] as Array<Record<string, unknown>>,
  contactos: [] as Array<Record<string, unknown>>,
  deals: [] as Array<Record<string, unknown>>,
  trabajos: [] as Array<Record<string, unknown>>,
  /** Cada llamada a `.rpc(nombre, args)`, en orden. */
  rpcs: [] as Array<{ nombre: string; args: Record<string, unknown> }>,
  /** Hace fallar el insert del deal (para el camino de error). */
  fallaElDeal: false,
  /** Cuántas veces seguidas falla `completar_envio_embudo`. */
  fallosDeCierre: 0,
  reloj: Date.parse('2026-08-08T12:00:00.000Z'),
  secuencia: 0,
}))

function nuevoId(prefijo: string) {
  bd.secuencia += 1
  return `${prefijo}-${bd.secuencia}`
}

vi.mock('@supabase/supabase-js', () => {
  function tablaDe(nombre: string): Array<Record<string, unknown>> {
    if (nombre === 'funnel_lead_submissions') return bd.envios
    if (nombre === 'contacts') return bd.contactos
    if (nombre === 'deals') return bd.deals
    if (nombre === 'funnel_lead_jobs') return bd.trabajos
    return []
  }

  function constructor(nombre: string) {
    const filtros: Array<(f: Record<string, unknown>) => boolean> = []
    let modo: 'select' | 'insert' | 'delete' = 'select'
    let aInsertar: Record<string, unknown> | null = null
    let limite: number | null = null
    let ordenCol = 'created_at'
    let desc = false

    // Un acceso normal a la tabla es un VIAJE DE RED: tarda, y mientras tanto
    // otra petición avanza. Se modela con un temporizador real (no un microtask)
    // porque es lo único que reproduce de verdad el intercalado. Esa es la
    // diferencia con la reserva atómica, que corre entera sin ceder el hilo: si
    // la decisión sobre duplicados volviera a tomarse acá, en JavaScript, dos
    // peticiones simultáneas leerían las dos "no hay duplicado".
    async function resolver() {
      await new Promise((r) => setTimeout(r, 1))
      const tabla = tablaDe(nombre)
      if (modo === 'insert') {
        if (nombre === 'deals' && bd.fallaElDeal) {
          return { data: [], error: { message: 'deal insert falló' } }
        }
        const fila = { id: nuevoId(nombre), created_at: new Date(bd.reloj).toISOString(), ...aInsertar }
        tabla.push(fila)
        return { data: [fila], error: null }
      }
      const coinciden = tabla.filter((f) => filtros.every((p) => p(f)))
      if (modo === 'delete') {
        for (const f of coinciden) tabla.splice(tabla.indexOf(f), 1)
        return { data: coinciden, error: null }
      }
      const ordenadas = [...coinciden].sort((a, b) => {
        const va = String(a[ordenCol] ?? '')
        const vb = String(b[ordenCol] ?? '')
        return desc ? (va < vb ? 1 : va > vb ? -1 : 0) : va < vb ? -1 : va > vb ? 1 : 0
      })
      return { data: limite === null ? ordenadas : ordenadas.slice(0, limite), error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      insert: (row: Record<string, unknown>) => { modo = 'insert'; aInsertar = row; return q },
      delete: () => { modo = 'delete'; return q },
      update: (row: Record<string, unknown>) => { modo = 'select'; aInsertar = row; return q },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q },
      ilike: (c: string, v: string) => {
        filtros.push((f) => String(f[c] ?? '').toLowerCase() === String(v).toLowerCase())
        return q
      },
      gte: (c: string, v: string) => { filtros.push((f) => String(f[c] ?? '') >= v); return q },
      lte: (c: string, v: string) => { filtros.push((f) => String(f[c] ?? '') <= v); return q },
      lt: (c: string, v: string) => { filtros.push((f) => String(f[c] ?? '') < v); return q },
      order: (c: string, o?: { ascending?: boolean }) => { ordenCol = c; desc = o?.ascending === false; return q },
      limit: (n: number) => { limite = n; return q },
      maybeSingle: async () => { const r = await resolver(); return { data: r.data?.[0] ?? null, error: r.error } },
      single: async () => {
        const r = await resolver()
        if (r.error) return { data: null, error: r.error }
        return { data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: 'sin filas' } }
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => resolver().then(res, rej),
    }
    return q
  }

  /**
   * `reservar_envio_embudo` — modela la función de Postgres: rate-limit, dedup y
   * alta en una sola operación que NO cede el hilo (los candados de transacción
   * serializan a las peticiones que comparten identidad).
   */
  function reservar(a: Record<string, number & string>) {
    const ventanaRate = new Date(bd.reloj - Number(a.p_rate_window_seconds) * 1000).toISOString()
    const ventanaDedup = new Date(bd.reloj - Number(a.p_dedup_window_seconds) * 1000).toISOString()
    const ventanaVuelo = new Date(bd.reloj - Number(a.p_inflight_seconds) * 1000).toISOString()

    const enVentana = (f: Record<string, unknown>) =>
      (f.status === 'complete' && String(f.created_at) >= ventanaDedup) ||
      (f.status === 'reserved' && String(f.created_at) >= ventanaVuelo)

    if (a.p_ip_hash) {
      const n = bd.envios.filter(
        (f) => f.ip_hash === a.p_ip_hash && String(f.created_at) >= ventanaRate,
      ).length
      if (n >= Number(a.p_rate_max)) {
        return { data: [{ resultado: 'rate_limited', submission_id: null, contact_id: null }], error: null }
      }
    }
    for (const col of ['email', 'phone'] as const) {
      const valor = a[`p_${col}`]
      if (!valor) continue
      const dup = [...bd.envios]
        .filter((f) => f[col] === valor && enVentana(f))
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0]
      if (dup) {
        return { data: [{ resultado: 'duplicado', submission_id: dup.id, contact_id: dup.contact_id ?? null }], error: null }
      }
    }
    const fila = {
      id: nuevoId('envio'),
      funnel: a.p_funnel,
      ip_hash: a.p_ip_hash,
      email: a.p_email ?? null,
      phone: a.p_phone ?? null,
      event_id: a.p_event_id ?? null,
      contact_id: null as string | null,
      deal_id: null as string | null,
      status: 'reserved',
      created_at: new Date(bd.reloj).toISOString(),
    }
    bd.envios.push(fila)
    return { data: [{ resultado: 'reservado', submission_id: fila.id, contact_id: null }], error: null }
  }

  /** `completar_envio_embudo` — cierra la reserva y encola con ON CONFLICT DO NOTHING. */
  function completar(a: Record<string, unknown>) {
    if (bd.fallosDeCierre > 0) {
      bd.fallosDeCierre -= 1
      return { data: null, error: { message: 'cierre falló' } }
    }
    const envio = bd.envios.find((f) => f.id === a.p_submission_id)
    if (!envio) return { data: null, error: { message: 'no existe la reserva' } }
    envio.status = 'complete'
    envio.contact_id = a.p_contact_id
    envio.deal_id = a.p_deal_id
    let encolados = 0
    for (const t of (a.p_trabajos ?? []) as Array<{ kind: string; payload: unknown }>) {
      const yaEsta = bd.trabajos.some((j) => j.submission_id === a.p_submission_id && j.kind === t.kind)
      if (yaEsta) continue
      bd.trabajos.push({
        id: nuevoId('trabajo'),
        submission_id: a.p_submission_id,
        kind: t.kind,
        payload: t.payload ?? {},
        status: 'pending',
        attempts: 0,
        max_attempts: 5,
        created_at: new Date(bd.reloj).toISOString(),
      })
      encolados += 1
    }
    return { data: encolados, error: null }
  }

  return {
    createClient: () => ({
      from: (nombre: string) => constructor(nombre),
      rpc: async (nombre: string, args: Record<string, unknown>) => {
        bd.rpcs.push({ nombre, args })
        // OJO: sin `await` antes de decidir. Es lo que modela la atomicidad.
        if (nombre === 'reservar_envio_embudo') return reservar(args as never)
        if (nombre === 'completar_envio_embudo') return completar(args)
        return { data: null, error: null }
      },
    }),
  }
})

// Los tres terceros del camino viejo. Si alguno se vuelve a llamar desde el
// request, estos espías lo delatan.
const terceros = vi.hoisted(() => ({ resend: 0, meta: 0, mailchimp: 0 }))
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: async () => { terceros.resend += 1; return { ok: true } },
}))
vi.mock('@/lib/marketing/meta-capi', () => ({
  sendCapiEvent: async () => { terceros.meta += 1; return { ok: true } },
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({
  syncDealToMailchimp: async () => { terceros.mailchimp += 1 },
}))

import { POST } from './route'

const IP = '200.10.20.30'

function pedido(cuerpo: Record<string, unknown>, opciones: { ip?: string } = {}) {
  return new Request('https://app.test/api/funnel/submit', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': opciones.ip ?? IP,
      'user-agent': 'Mozilla/5.0 (prueba)',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

const ENVIO_TASACION = {
  funnel: 'tasacion',
  name: 'Ana Pérez',
  email: 'ana@ejemplo.com',
  phone: '+5491133445566',
  propertyLocation: 'Palermo',
  eventId: 'evt-1234567890',
  anonId: 'anon-1234567890',
  fbp: 'fb.1.123.456',
}

let fetchEspia: ReturnType<typeof vi.fn>

beforeEach(() => {
  bd.envios = []
  bd.contactos = []
  bd.deals = []
  bd.trabajos = []
  bd.rpcs = []
  bd.fallaElDeal = false
  bd.fallosDeCierre = 0
  bd.secuencia = 0
  bd.reloj = Date.parse('2026-08-08T12:00:00.000Z')
  terceros.resend = 0
  terceros.meta = 0
  terceros.mailchimp = 0
  fetchEspia = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchEspia)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})

describe('el request no toca a ningún tercero', () => {
  it('responde ok sin llamar a Resend, ni a Meta, ni a Mailchimp, ni hacer un solo fetch', async () => {
    const res = await POST(pedido(ENVIO_TASACION))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, redirect: '/gracias-tasacion' })
    expect(json.contactId).toBeTruthy()

    expect(terceros.resend).toBe(0)
    expect(terceros.meta).toBe(0)
    expect(terceros.mailchimp).toBe(0)
    expect(fetchEspia).not.toHaveBeenCalled()
  })

  it('el lead queda creado y el envío cerrado como conversión', async () => {
    await POST(pedido(ENVIO_TASACION))
    expect(bd.contactos).toHaveLength(1)
    expect(bd.deals).toHaveLength(1)
    expect(bd.deals[0]).toMatchObject({ origin: 'embudo', stage: 'request', property_address: 'Palermo' })
    expect(bd.envios).toHaveLength(1)
    expect(bd.envios[0]).toMatchObject({ status: 'complete', deal_id: bd.deals[0].id })
  })
})

describe('reserva atómica', () => {
  it('dos envíos SIMULTÁNEOS del mismo teléfono crean UN SOLO deal', async () => {
    const [a, b] = await Promise.all([
      POST(pedido(ENVIO_TASACION)).then((r) => r.json()),
      POST(pedido(ENVIO_TASACION)).then((r) => r.json()),
    ])

    expect(bd.deals).toHaveLength(1)
    expect(bd.contactos).toHaveLength(1)
    expect(bd.envios).toHaveLength(1)

    // Los dos ven "ok" (nadie se lleva un error), pero solo uno creó el lead.
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect([a.deduplicated, b.deduplicated].filter(Boolean)).toHaveLength(1)
  })

  it('la decisión la toma UNA sola llamada: la ruta no consulta la tabla de envíos por su cuenta', async () => {
    await POST(pedido(ENVIO_TASACION))
    expect(bd.rpcs.map((r) => r.nombre)).toEqual(['reservar_envio_embudo', 'completar_envio_embudo'])
    expect(bd.rpcs[0].args).toMatchObject({
      p_rate_max: 20,
      p_rate_window_seconds: 60,
      p_dedup_window_seconds: 300,
    })
  })
})

describe('rate-limit por IP (sin cambios de comportamiento)', () => {
  it('corta en el envío 21 del mismo minuto (tope 20: CGNAT móvil, ver RATE_MAX)', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await POST(pedido({ ...ENVIO_TASACION, email: `a${i}@ejemplo.com`, phone: `+549110000${String(i).padStart(4, '0')}` }))
      expect(res.status).toBe(200)
    }
    const excedente = await POST(pedido({ ...ENVIO_TASACION, email: 'otro@ejemplo.com', phone: '+5491199999999' }))
    expect(excedente.status).toBe(429)
    expect(await excedente.json()).toEqual({ error: 'Demasiados envíos. Probá de nuevo en un minuto.' })
    expect(bd.deals).toHaveLength(20)
  })

  it('otra IP no arrastra el corte', async () => {
    for (let i = 0; i < 20; i++) {
      await POST(pedido({ ...ENVIO_TASACION, email: `a${i}@ejemplo.com`, phone: `+549110000${String(i).padStart(4, '0')}` }))
    }
    const otra = await POST(
      pedido({ ...ENVIO_TASACION, email: 'z@ejemplo.com', phone: '+5491188887777' }, { ip: '190.1.1.1' }),
    )
    expect(otra.status).toBe(200)
  })
})

describe('dedup de 5 minutos (sin cambios de comportamiento)', () => {
  it('devuelve el contactId del envío anterior y no crea otro deal', async () => {
    const primero = await (await POST(pedido(ENVIO_TASACION))).json()

    bd.reloj += 4 * 60_000 // dentro de la ventana
    const segundo = await (await POST(pedido(ENVIO_TASACION))).json()

    expect(segundo).toEqual({
      ok: true,
      deduplicated: true,
      contactId: primero.contactId,
      redirect: '/gracias-tasacion',
    })
    expect(bd.deals).toHaveLength(1)
  })

  it('pasados los 5 minutos vuelve a crear', async () => {
    await POST(pedido(ENVIO_TASACION))
    bd.reloj += 6 * 60_000
    const segundo = await (await POST(pedido(ENVIO_TASACION))).json()
    expect(segundo.deduplicated).toBeUndefined()
    expect(bd.deals).toHaveLength(2)
  })

  it('dedupea por teléfono aunque cambie el email', async () => {
    await POST(pedido(ENVIO_TASACION))
    bd.reloj += 30_000
    const segundo = await (await POST(pedido({ ...ENVIO_TASACION, email: 'otra@ejemplo.com' }))).json()
    expect(segundo.deduplicated).toBe(true)
    expect(bd.deals).toHaveLength(1)
  })
})

describe('encolado de los avisos', () => {
  it('encola los seis trabajos del envío (whatsapp incluido, 2026-08-13)', async () => {
    await POST(pedido(ENVIO_TASACION))
    expect(bd.trabajos.map((t) => t.kind).sort()).toEqual(
      ['anon_stitch', 'capi', 'coordinator_task', 'mailchimp', 'notify', 'whatsapp'],
    )
    expect(bd.trabajos.every((t) => t.status === 'pending')).toBe(true)
  })

  it('el trabajo de Meta lleva la hora REAL de la conversión, no la del worker', async () => {
    await POST(pedido(ENVIO_TASACION))
    const capi = bd.trabajos.find((t) => t.kind === 'capi')!.payload as Record<string, unknown>
    expect(capi.eventId).toBe('evt-1234567890')
    expect(typeof capi.eventTimeUnixSeconds).toBe('number')
    expect(Math.abs((capi.eventTimeUnixSeconds as number) - Math.floor(Date.now() / 1000))).toBeLessThan(60)
  })

  it('encolar dos veces el MISMO envío no duplica trabajos', async () => {
    await POST(pedido(ENVIO_TASACION))
    expect(bd.trabajos).toHaveLength(6)

    // Segundo envío idéntico: el dedup lo frena antes de encolar nada.
    bd.reloj += 10_000
    await POST(pedido(ENVIO_TASACION))
    expect(bd.trabajos).toHaveLength(6)
  })

  it('si el primer intento de cierre falla, reintenta y no duplica', async () => {
    bd.fallosDeCierre = 1
    const res = await POST(pedido(ENVIO_TASACION))
    expect(res.status).toBe(200)
    expect(bd.trabajos).toHaveLength(6)
    expect(bd.envios[0].status).toBe('complete')
  })
})

describe('caminos que no cambian', () => {
  it('el honeypot finge éxito sin tocar la base', async () => {
    const res = await POST(pedido({ ...ENVIO_TASACION, company: 'bot corp' }))
    expect(await res.json()).toEqual({ ok: true, redirect: '/gracias-tasacion' })
    expect(bd.envios).toHaveLength(0)
    expect(bd.deals).toHaveLength(0)
    expect(bd.rpcs).toHaveLength(0)
  })

  it('sin email ni teléfono rechaza con 400', async () => {
    const res = await POST(pedido({ funnel: 'clase', name: 'Sin Contacto' }))
    expect(res.status).toBe(400)
    expect(bd.rpcs).toHaveLength(0)
  })

  it('la clase gratuita redirige a su propia página', async () => {
    const res = await POST(pedido({ funnel: 'clase', name: 'Juan', email: 'juan@ejemplo.com' }))
    expect(await res.json()).toMatchObject({ ok: true, redirect: '/gracias-clase' })
    expect(bd.deals[0]).toMatchObject({ origin: 'clase_gratuita', stage: 'clase_gratuita' })
  })
})

describe('cuando el alta falla', () => {
  it('suelta la reserva para que el reintento de la persona no rebote como duplicado', async () => {
    bd.fallaElDeal = true
    const res = await POST(pedido(ENVIO_TASACION))
    expect(res.status).toBe(500)
    // La reserva no puede quedar: si queda, el reintento devuelve
    // "ya estás registrado" y la persona se va sin lead.
    expect(bd.envios).toHaveLength(0)

    bd.fallaElDeal = false
    const reintento = await (await POST(pedido(ENVIO_TASACION))).json()
    expect(reintento.deduplicated).toBeUndefined()
    expect(bd.deals).toHaveLength(1)
  })
})

/**
 * D22 — la mitad que el test de arriba NO cubre.
 *
 * Ese `catch` solo atrapa errores LANZABLES. Cuando el proceso muere de verdad
 * (la función se recicla, el gateway corta, un deploy a mitad de request) nadie
 * suelta la reserva: la fila queda 'reserved' para siempre. Si esa fila sigue
 * contando como duplicado, el reintento de la persona recibe "ya estás
 * registrado" y aterriza en /gracias sin contacto, sin deal, sin avisos y sin
 * Píxel. Es el peor final posible para tráfico pago: se pierde el lead Y se le
 * confirma lo contrario.
 */
describe('reserva abandonada por una muerte dura del proceso', () => {
  /**
   * Se empuja la fila a mano PORQUE NO HAY OTRA FORMA: una muerte dura no pasa
   * por ningún `throw` que el test pueda provocar. Es exactamente lo que deja
   * `reservar_envio_embudo` cuando el request no llega a cerrar.
   */
  function reservaAbandonada() {
    bd.envios.push({
      id: 'envio-huerfano',
      funnel: 'tasacion',
      ip_hash: 'ip-de-otro-request',
      email: ENVIO_TASACION.email,
      phone: ENVIO_TASACION.phone,
      event_id: null,
      contact_id: null,
      deal_id: null,
      status: 'reserved',
      created_at: new Date(bd.reloj).toISOString(),
    })
  }

  it('pasada la ventana en vuelo, el reintento SÍ registra a la persona (no rebota como duplicado)', async () => {
    reservaAbandonada()
    // La función murió; recién ahí la persona ve el error y vuelve a enviar.
    bd.reloj += 12_000

    const json = await (await POST(pedido(ENVIO_TASACION))).json()

    expect(json.deduplicated).toBeUndefined()
    expect(json.contactId).toBeTruthy()
    expect(bd.deals).toHaveLength(1)
    expect(bd.trabajos).toHaveLength(6)
  })

  it('un doble clic de verdad (segundos) sigue dedupeado: no crea dos deals', async () => {
    reservaAbandonada()
    bd.reloj += 2_000

    const res = await POST(pedido(ENVIO_TASACION))

    expect(await res.json()).toMatchObject({ ok: true, deduplicated: true, contactId: null })
    expect(bd.deals).toHaveLength(0)
  })

  it('la ventana en vuelo queda por debajo de lo que vive una función del sitio', async () => {
    // Ninguna reserva legítima puede tener más de ~26 s (el techo del gateway):
    // todo lo que pase de ahí es ventana de falso positivo pura. Este test es el
    // que avisa si alguien vuelve a subir la constante.
    await POST(pedido(ENVIO_TASACION))
    const reserva = bd.rpcs.find((r) => r.nombre === 'reservar_envio_embudo')!
    expect(reserva.args.p_inflight_seconds).toBeLessThan(26)
  })
})
