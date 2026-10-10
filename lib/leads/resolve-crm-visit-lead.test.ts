import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Revisión final, grupo L: el respaldo para visitas viejas sin `lead_id` comparaba
 * teléfono y email con IGUALDAD EXACTA. El mismo celular vive en la base como
 * '+5491158234521', '+541158234521' o '1158234521' (CLAUDE.md § Teléfonos), y un
 * email puede venir con mayúsculas o espacios: el comprador no aparecía y su
 * estado no avanzaba a "visitó". Ahora: teléfono por `phone_norm` (últimos 10
 * dígitos) y email con `ilike` sobre el email normalizado, escapando % _ \.
 *
 * Supabase se reemplaza por un cliente falso que GRABA cada cadena de llamadas.
 */
interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null }

const { registro, tokenMock } = vi.hoisted(() => {
  const registro: { llamadas: Llamada[]; responder: (l: Llamada) => Respuesta } = {
    llamadas: [],
    responder: () => ({ data: null, error: null }),
  }
  return { registro, tokenMock: vi.fn() }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_objetivo, prop) {
          if (prop === 'then') {
            return (resolver: (r: Respuesta) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(resolver, rechazar)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
  }),
}))
vi.mock('./pipeline-state', () => ({ resolveLeadIdForVisit: tokenMock }))

import { resolveLeadIdForVisitWithFallback } from './resolve-crm-visit-lead'

const VISITA = '66666666-6666-4666-8666-666666666666'
const PROP = '33333333-3333-4333-8333-333333333333'

function filtro(l: Llamada, metodo: string, columna: string): unknown {
  return l.pasos.find(p => p.metodo === metodo && p.args[0] === columna)?.args[1]
}
const busquedasDeLeads = () => registro.llamadas.filter(l => l.tabla === 'property_leads')

/** La visita tiene estos datos; `porEmail`/`porTelefono` es lo que devuelve cada búsqueda. */
function escenario(visita: { client_email: string | null; client_phone: string | null } | null,
  porEmail: string | null = null, porTelefono: string | null = null) {
  registro.responder = (l) => {
    if (l.tabla === 'property_visits') return { data: visita && { property_id: PROP, ...visita }, error: null }
    if (filtro(l, 'ilike', 'email') !== undefined) return { data: porEmail ? { id: porEmail } : null, error: null }
    if (filtro(l, 'eq', 'phone_norm') !== undefined) return { data: porTelefono ? { id: porTelefono } : null, error: null }
    return { data: null, error: { message: 'consulta inesperada' } }
  }
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []
  tokenMock.mockReset()
  tokenMock.mockResolvedValue(null)
})

describe('resolveLeadIdForVisitWithFallback — teléfono por últimos 10 dígitos', () => {
  it('la visita con "+5491158234521" busca phone_norm "1158234521" (el lead pudo guardarse sin +54 9)', async () => {
    escenario({ client_email: null, client_phone: '+5491158234521' }, null, 'lead-tel')
    expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBe('lead-tel')
    const [busqueda] = busquedasDeLeads()
    expect(filtro(busqueda, 'eq', 'phone_norm')).toBe('1158234521')
    expect(filtro(busqueda, 'eq', 'property_id')).toBe(PROP)
    expect(filtro(busqueda, 'eq', 'phone')).toBeUndefined()
  })
  it('la visita con "1158234521" busca el mismo phone_norm', async () => {
    escenario({ client_email: null, client_phone: '11 5823-4521' }, null, 'lead-tel')
    await resolveLeadIdForVisitWithFallback(VISITA)
    expect(filtro(busquedasDeLeads()[0], 'eq', 'phone_norm')).toBe('1158234521')
  })
  it('un teléfono que no llega a 10 dígitos no busca por teléfono', async () => {
    escenario({ client_email: null, client_phone: '123' })
    expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBeNull()
    expect(busquedasDeLeads()).toHaveLength(0)
  })
})

describe('resolveLeadIdForVisitWithFallback — email normalizado', () => {
  it('compara con ilike sobre el email en minúsculas y sin espacios', async () => {
    escenario({ client_email: '  Ana@Mail.com ', client_phone: null }, 'lead-mail')
    expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBe('lead-mail')
    expect(filtro(busquedasDeLeads()[0], 'ilike', 'email')).toBe('ana@mail.com')
    expect(filtro(busquedasDeLeads()[0], 'eq', 'email')).toBeUndefined()
  })
  it('escapa los comodines de LIKE (% _ \\) para no matchear el email de otra persona', async () => {
    escenario({ client_email: 'a_b%c\\d@x.com', client_phone: null })
    await resolveLeadIdForVisitWithFallback(VISITA)
    expect(filtro(busquedasDeLeads()[0], 'ilike', 'email')).toBe('a\\_b\\%c\\\\d@x.com')
  })
  it('si el email no encuentra a nadie, prueba por teléfono', async () => {
    escenario({ client_email: 'ana@mail.com', client_phone: '+541158234521' }, null, 'lead-tel')
    expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBe('lead-tel')
    expect(busquedasDeLeads()).toHaveLength(2)
  })
})

describe('resolveLeadIdForVisitWithFallback — contrato', () => {
  it('con token del recorrido público usa ese vínculo y no busca nada más', async () => {
    tokenMock.mockResolvedValue('lead-token')
    expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBe('lead-token')
    expect(registro.llamadas).toHaveLength(0)
  })
  it('si la lectura de la visita devuelve error, devuelve null sin lanzar (y lo registra)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      registro.responder = () => ({ data: null, error: { message: 'boom' } })
      expect(await resolveLeadIdForVisitWithFallback(VISITA)).toBeNull()
      expect(aviso).toHaveBeenCalled()
    } finally { aviso.mockRestore() }
  })
})
