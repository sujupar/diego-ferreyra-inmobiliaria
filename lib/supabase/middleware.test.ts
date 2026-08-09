import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Esta es la capa que decide quién entra a TODO. Hasta el 2026-08-08 el
 * middleware tenía `'/api/'` en la lista pública, o sea que no autenticaba
 * ninguna ruta de API; ahora el default es CERRADO y lo público se enumera.
 *
 * Los tests de abajo son lo único que sostiene eso. Los de rutas públicas van
 * UNO POR RUTA a propósito, no un `forEach` sobre la lista: un test que recorre
 * la misma constante que está probando pasa en verde aunque alguien borre una
 * entrada. Acá, si alguien saca `/api/funnel/submit`, se cae SU test y el
 * nombre del test dice cuál es el embudo que se rompió.
 */

const getUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({ auth: { getUser } }),
}))

const { updateSession, esApiPublica, esPaginaPublica, esRutaApi, API_PUBLICAS } =
    await import('./middleware')

type RespuestaMiddleware = { status: number; headers: Headers }

/** Arma un NextRequest suficientemente real para el middleware. */
function pedido(pathname: string, method = 'GET') {
    const url = new URL(`http://localhost:3000${pathname}`)
    return {
        method,
        nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
        cookies: { getAll: () => [], set: () => {} },
        headers: new Headers(),
    } as never
}

function conSesion() {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
}

function sinSesion() {
    getUser.mockResolvedValue({ data: { user: null } })
}

/** `true` si el middleware dejó pasar (ni 401 ni redirect a /login). */
async function pasa(pathname: string, method = 'GET'): Promise<boolean> {
    const res = (await updateSession(pedido(pathname, method))) as RespuestaMiddleware
    return res.status !== 401 && res.status !== 307 && res.status !== 302
}

beforeEach(() => {
    getUser.mockReset()
    sinSesion()
})

// ─────────────────────────────────────────────────────────────────────────────
// Cada ruta pública, una por una. Si un test de acá se pone rojo, algo que
// atiende gente de afuera del CRM dejó de responder.
// ─────────────────────────────────────────────────────────────────────────────
describe('rutas de API públicas — pasan SIN sesión', () => {
    it('/api/funnel/submit (POST) — conversión del embudo de tráfico pago', async () => {
        expect(await pasa('/api/funnel/submit', 'POST')).toBe(true)
    })

    it('/api/leads (POST) — formulario de captura de la landing pública', async () => {
        expect(await pasa('/api/leads', 'POST')).toBe(true)
    })

    it('/api/leads/ticket (GET) — ficha anti-bot del popup', async () => {
        expect(await pasa('/api/leads/ticket')).toBe(true)
    })

    it('/api/geo (GET) — país del visitante para el selector de teléfono', async () => {
        expect(await pasa('/api/geo')).toBe(true)
    })

    it('/api/landing/track-visit (POST) — visita a una landing pública', async () => {
        expect(await pasa('/api/landing/track-visit', 'POST')).toBe(true)
    })

    it('/api/track/video (POST) — sendBeacon del reproductor del embudo', async () => {
        expect(await pasa('/api/track/video', 'POST')).toBe(true)
    })

    it('/api/track/heatmap (POST) — sendBeacon del mapa de calor del embudo', async () => {
        expect(await pasa('/api/track/heatmap', 'POST')).toBe(true)
    })

    it('/api/v/<token>/schedule (POST) — agenda de visita del link de WhatsApp', async () => {
        expect(await pasa('/api/v/Ab3xK9pQ2r/schedule', 'POST')).toBe(true)
    })

    it('/api/public/questionnaire/<token> (GET y POST) — cuestionario post-visita', async () => {
        expect(await pasa('/api/public/questionnaire/Ab3xK9pQ2r')).toBe(true)
        expect(await pasa('/api/public/questionnaire/Ab3xK9pQ2r', 'POST')).toBe(true)
    })

    it('/api/auth/accept-invite (GET y POST) — el invitado todavía no tiene sesión', async () => {
        expect(await pasa('/api/auth/accept-invite')).toBe(true)
        expect(await pasa('/api/auth/accept-invite', 'POST')).toBe(true)
    })

    it('/api/webhooks/whatsapp (GET verificación y POST firmado) — lo llama Meta', async () => {
        expect(await pasa('/api/webhooks/whatsapp')).toBe(true)
        expect(await pasa('/api/webhooks/whatsapp', 'POST')).toBe(true)
    })

    it('/api/webhooks/mailchimp — lo llama Mailchimp con su secreto en ?s=', async () => {
        expect(await pasa('/api/webhooks/mailchimp')).toBe(true)
        expect(await pasa('/api/webhooks/mailchimp', 'POST')).toBe(true)
    })

    it('/api/webhooks/ghl/form-submission — secreto compartido propio', async () => {
        expect(await pasa('/api/webhooks/ghl/form-submission', 'POST')).toBe(true)
    })

    it('/api/version — commit deployado, diagnóstico', async () => {
        expect(await pasa('/api/version')).toBe(true)
    })

    // Los 11 jobs vivos de `cron.job` (leídos de la base el 2026-08-08) más los
    // que disparan las funciones de Netlify. Los ejecuta Postgres: sin cookies.
    it.each([
        'send-report',
        'publish-listings',
        'portal-inquiries',
        'meta-sync',
        'refresh-market-data',
        'refresh-portal-map',
        'mailchimp-sync',
        'ghl-poll',
        'visit-reminders',
        'funnel-side-effects',
        'meta-audience-sync',
    ])('/api/cron/%s — lo dispara pg_cron desde Postgres', async (job) => {
        expect(await pasa(`/api/cron/${job}`)).toBe(true)
        expect(await pasa(`/api/cron/${job}`, 'POST')).toBe(true)
    })

    it('no consulta la sesión para resolver una ruta pública', async () => {
        // Si el embudo dependiera de getUser(), una caída de Supabase lo tiraría.
        await pasa('/api/funnel/submit', 'POST')
        expect(getUser).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// El default cerrado
// ─────────────────────────────────────────────────────────────────────────────
describe('rutas de API sin sesión — no pasan', () => {
    it.each([
        '/api/me',
        '/api/tasks',
        '/api/properties',
        '/api/deals',
        '/api/contacts',
        '/api/pipeline',
        '/api/admin/impersonate',
        '/api/marketing/reports/history',
        '/api/settings/market-images',
        '/api/whatsapp/send',
        '/api/oauth/mercadolibre/callback',
    ])('%s devuelve 401', async (ruta) => {
        const res = (await updateSession(pedido(ruta))) as RespuestaMiddleware
        expect(res.status).toBe(401)
    })

    it('una ruta de API INVENTADA tampoco pasa — el default es cerrado', async () => {
        // Éste es el test que prueba que se invirtió la regla. Antes, con
        // `'/api/'` en la lista, CUALQUIER ruta nueva nacía abierta.
        const res = (await updateSession(
            pedido('/api/ruta-que-alguien-va-a-escribir-manana')
        )) as RespuestaMiddleware
        expect(res.status).toBe(401)
    })

    it('responde 401 en JSON, no un redirect a /login', async () => {
        // Un 307 a una página HTML hace que el `res.json()` del cliente explote
        // con `Unexpected token '<'`, que no dice nada del problema real.
        const res = (await updateSession(pedido('/api/tasks'))) as RespuestaMiddleware
        expect(res.status).toBe(401)
        expect(res.headers.get('content-type')).toContain('application/json')
        expect(res.headers.get('location')).toBeNull()
    })
})

describe('rutas de API con sesión válida — pasan', () => {
    it.each(['/api/me', '/api/tasks', '/api/properties', '/api/deals'])(
        '%s pasa con sesión',
        async (ruta) => {
            conSesion()
            expect(await pasa(ruta)).toBe(true)
        }
    )

    it('/api/leads GET pasa con sesión (solo el POST es público)', async () => {
        conSesion()
        expect(await pasa('/api/leads')).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// El alcance por método: /api/leads mezcla público y privado en un archivo
// ─────────────────────────────────────────────────────────────────────────────
describe('/api/leads — público solo para POST', () => {
    it('POST pasa sin sesión (lo manda la landing)', async () => {
        expect(await pasa('/api/leads', 'POST')).toBe(true)
    })

    it('GET no pasa sin sesión (lista leads)', async () => {
        expect(await pasa('/api/leads')).toBe(false)
    })

    it('DELETE no pasa sin sesión (borra leads)', async () => {
        expect(await pasa('/api/leads', 'DELETE')).toBe(false)
    })

    it('las subrutas de /api/leads NO heredan lo público del POST', async () => {
        expect(await pasa('/api/leads/count')).toBe(false)
        expect(await pasa('/api/leads/abc-123', 'POST')).toBe(false)
        expect(await pasa('/api/leads/abc-123/tags', 'POST')).toBe(false)
        expect(await pasa('/api/leads/restore', 'POST')).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Los prefijos no pueden morder a los vecinos
// ─────────────────────────────────────────────────────────────────────────────
describe('los prefijos públicos están acotados', () => {
    it.each([
        '/api/track-secreto',
        '/api/tracking',
        '/api/track',
        '/api/cron-secreto',
        '/api/crones',
        '/api/version-secreta',
        '/api/versiones',
        '/api/geolocalizacion',
        '/api/public-interno',
        '/api/v-interno',
        '/api/webhooks/inventado',
        '/api/auth/accept-invite-falso',
        '/api/auth/invite',
        '/api/auth/me',
        '/api/landing/track-visit-secreto',
        '/api/funnel/submit-secreto',
        '/api/funnels/metrics',
    ])('%s NO es pública', (ruta) => {
        expect(esApiPublica(ruta, 'GET')).toBe(false)
        expect(esApiPublica(ruta, 'POST')).toBe(false)
    })

    it('todo prefijo declarado termina en "/" — sino mordería a su vecino', () => {
        for (const entrada of API_PUBLICAS) {
            if (entrada.tipo === 'prefijo') {
                expect(entrada.ruta.endsWith('/')).toBe(true)
            }
        }
    })

    it('toda entrada lleva su motivo escrito', () => {
        for (const entrada of API_PUBLICAS) {
            expect(entrada.motivo.trim().length).toBeGreaterThan(20)
        }
    })
})

describe('detalles de comparación', () => {
    it('la barra final no cambia el resultado', () => {
        expect(esApiPublica('/api/version/', 'GET')).toBe(true)
        expect(esApiPublica('/api/geo/', 'GET')).toBe(true)
        expect(esApiPublica('/api/tasks/', 'GET')).toBe(false)
    })

    it('el método se compara sin importar mayúsculas', () => {
        expect(esApiPublica('/api/leads', 'post')).toBe(true)
        expect(esApiPublica('/api/leads', 'get')).toBe(false)
    })

    it('esRutaApi distingue /api/ de una página que empieza igual', () => {
        expect(esRutaApi('/api/tasks')).toBe(true)
        expect(esRutaApi('/api')).toBe(true)
        expect(esRutaApi('/apitasks')).toBe(false)
        expect(esRutaApi('/login')).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Las páginas se comportan igual que antes del cambio
// ─────────────────────────────────────────────────────────────────────────────
describe('rutas de página — sin cambios de comportamiento', () => {
    it.each([
        '/login',
        '/accept-invite',
        '/questionnaire',
        '/questionnaire/Ab3xK9pQ2r',
        '/questionnaire/Ab3xK9pQ2r/thanks',
        '/privacidad',
        '/eliminacion-de-datos',
    ])('%s es pública', (ruta) => {
        expect(esPaginaPublica(ruta)).toBe(true)
    })

    it.each(['/dashboard', '/properties', '/metrics', '/settings', '/inbox', '/'])(
        '%s NO es pública',
        (ruta) => {
            expect(esPaginaPublica(ruta)).toBe(false)
        }
    )

    it('una página privada sin sesión redirige a /login con redirectTo', async () => {
        const res = (await updateSession(pedido('/properties'))) as RespuestaMiddleware
        expect(res.status).toBe(307)
        const destino = new URL(res.headers.get('location')!)
        expect(destino.pathname).toBe('/login')
        expect(destino.searchParams.get('redirectTo')).toBe('/properties')
    })

    it('una página privada con sesión pasa', async () => {
        conSesion()
        expect(await pasa('/properties')).toBe(true)
    })

    it('una página pública no consulta la sesión', async () => {
        await pasa('/login')
        expect(getUser).not.toHaveBeenCalled()
    })
})
