import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Rutas de PÁGINA (no `/api/`) que no requieren sesión. Se comparan por
 * PREFIJO, igual que siempre — `/questionnaire/<token>` cuelga de
 * `/questionnaire`. `/p/`, `/v/` y los paths del embudo se resuelven antes,
 * en `middleware.ts`, y ni siquiera llegan acá.
 */
const PAGINAS_PUBLICAS = [
    '/login',
    '/accept-invite',
    '/questionnaire',
    '/privacidad',
    '/eliminacion-de-datos',
]

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Rutas de API públicas — LISTA EXPLÍCITA, todo lo demás exige sesión.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hasta 2026-08-08 esta lista era una sola entrada, `'/api/'`, o sea: el
 * middleware no autenticaba NINGUNA ruta de API. Cada handler se defendía solo
 * y **cada ruta nueva nacía abierta** — ya se encontraron cinco sin ningún
 * guard. La regla está invertida: el default es CERRADO y lo público se
 * enumera acá, con el motivo escrito. Sin el motivo, dentro de seis meses
 * nadie sabe si la entrada se puede sacar.
 *
 * Esto es una capa MÁS, no un reemplazo: los `requireAuth()`/`requireRole()` de
 * cada handler siguen en su lugar, y las rutas públicas que validan algo por su
 * cuenta (secreto de cron, firma del webhook, ticket anti-bot) lo siguen
 * validando. El middleware no ve nada de eso.
 *
 * Al agregar una ruta acá, preguntarse: ¿quién la llama SIN cookie de sesión?
 * Si la respuesta es "el navegador de alguien que ya entró al CRM", no va.
 */
type RutaPublica = {
    /** Path a comparar. En `prefijo` DEBE terminar en `/` para no morder vecinos. */
    ruta: string
    tipo: 'exacta' | 'prefijo'
    /** Métodos públicos. Si se omite, todos. En MAYÚSCULAS. */
    metodos?: readonly string[]
    motivo: string
}

export const API_PUBLICAS: readonly RutaPublica[] = [
    // ── El embudo de marketing (tráfico pago; si esto se cierra, se pierde plata) ──
    {
        ruta: '/api/funnel/submit',
        tipo: 'exacta',
        motivo:
            'Conversión de las landings del embudo (tasacion-directa y vsl-clase-propietarios). ' +
            'La manda un visitante anónimo desde el navegador.',
    },
    {
        ruta: '/api/leads',
        tipo: 'exacta',
        metodos: ['POST'],
        motivo:
            'POST = formulario de captura de la landing pública `/p/<slug>` (popup LeadCaptureProvider ' +
            'y bloque LeadForm), visitante anónimo. Se defiende con rate-limit por IP + ticket anti-bot. ' +
            'GET y DELETE de esta MISMA ruta listan/borran leads y quedan cerrados a propósito ' +
            '(además ya llaman requireAuth por su cuenta).',
    },
    {
        ruta: '/api/leads/ticket',
        tipo: 'exacta',
        motivo:
            'Ficha anti-bot de un solo uso que el popup de la landing pide al abrirse, antes de ' +
            'que exista lead alguno. La pide un visitante anónimo.',
    },
    {
        ruta: '/api/geo',
        tipo: 'exacta',
        motivo:
            'País del visitante (header del CDN) para el país por defecto del selector de teléfono ' +
            'de la landing pública. No lee la base ni recibe datos.',
    },

    // ── Analítica de las landings públicas ──
    {
        ruta: '/api/landing/track-visit',
        tipo: 'exacta',
        motivo: 'Registra la visita a una landing pública (`/p/<slug>` y las dos del embudo). Visitante anónimo.',
    },
    {
        ruta: '/api/track/',
        tipo: 'prefijo',
        motivo:
            'Analítica de las landings del embudo: `/api/track/video` y `/api/track/heatmap`, que se ' +
            'mandan con navigator.sendBeacon() desde el navegador de un visitante anónimo. El prefijo ' +
            'lleva barra final a propósito: NO habilita algo como `/api/track-secreto`.',
    },

    // ── Links por token: la persona del otro lado NO tiene cuenta en el CRM ──
    {
        ruta: '/api/v/',
        tipo: 'prefijo',
        motivo:
            'Agenda de visita desde el link de recorrido que se manda por WhatsApp ' +
            '(`/api/v/<token>/schedule`). Lo usa un comprador sin cuenta; la seguridad es el token.',
    },
    {
        ruta: '/api/public/',
        tipo: 'prefijo',
        motivo:
            'Cuestionario posterior a la visita (`/api/public/questionnaire/<token>`), que responde ' +
            'un comprador sin cuenta desde la página pública `/questionnaire/<token>`.',
    },

    // ── Alta de usuarios: cerrar esto deja a la gente afuera del CRM ──
    {
        ruta: '/api/auth/accept-invite',
        tipo: 'exacta',
        motivo:
            'Valida la invitación (GET) y crea la cuenta (POST). Por definición la llama alguien que ' +
            'TODAVÍA NO tiene sesión: autenticarla dejaría a los invitados afuera. El resto de ' +
            '`/api/auth/*` (invite, me) sí exige sesión.',
    },

    // ── Webhooks: los llama un proveedor externo, se autentican por firma o secreto ──
    {
        ruta: '/api/webhooks/whatsapp',
        tipo: 'exacta',
        motivo:
            'WhatsApp Cloud API de Meta. GET = verificación de suscripción (hub.challenge contra ' +
            'WHATSAPP_WEBHOOK_VERIFY_TOKEN); POST = mensajes entrantes, validados con firma HMAC ' +
            'x-hub-signature-256. Meta no manda cookies.',
    },
    {
        ruta: '/api/webhooks/mailchimp',
        tipo: 'exacta',
        motivo:
            'Bajas y limpiezas de Mailchimp. GET = verificación del endpoint; POST = evento, ' +
            'autorizado por el secreto compartido en `?s=`. Mailchimp no manda cookies.',
    },
    {
        ruta: '/api/webhooks/ghl/form-submission',
        tipo: 'exacta',
        motivo:
            'Webhook de GoHighLevel. GHL está DECOMISADO (dejó de postear el 2026-07-02) y la ruta ' +
            'quedó en cuarentena, pero se deja pública porque se autentica con su propio secreto ' +
            'compartido y cerrarla no aporta nada: sin el secreto ya devuelve 401.',
    },

    // ── Los dispara Postgres, no un navegador ──
    {
        ruta: '/api/cron/',
        tipo: 'prefijo',
        motivo:
            'Los jobs de pg_cron los ejecuta Supabase con net.http_post DESDE POSTGRES: no hay ' +
            'navegador ni cookie posible. Verificado contra la tabla `cron.job` el 2026-08-08 — hay 11 ' +
            'jobs activos pegándole a send-report, publish-listings, portal-inquiries, meta-sync, ' +
            'refresh-market-data, refresh-portal-map y mailchimp-sync. Tres más los llaman las ' +
            'funciones de Netlify (ghl-poll, visit-reminders, portal-inquiries). Va por PREFIJO a ' +
            'propósito: cada ruta valida su `x-cron-secret`, y una que quedara cerrada por olvido ' +
            'fallaría en silencio (403 dentro de Postgres, sin nadie mirando).',
    },

    // ── Diagnóstico ──
    {
        ruta: '/api/version',
        tipo: 'exacta',
        motivo:
            'Commit deployado. Público a propósito (ver el comentario de la ruta): permite verificar ' +
            'QUÉ código está sirviendo producción sin entrar al CRM, y un SHA de un repo privado no ' +
            'expone nada.',
    },
]

/** Quita la barra final (salvo que el path sea solo `/`) para comparar sin sorpresas. */
function normalizar(pathname: string): string {
    return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/** ¿El request es a una ruta de API? */
export function esRutaApi(pathname: string): boolean {
    const p = normalizar(pathname)
    return p === '/api' || p.startsWith('/api/')
}

/**
 * ¿Esta ruta de API se sirve sin sesión? Default: NO.
 * `method` importa solo donde la entrada declara `metodos` (hoy: `/api/leads`).
 */
export function esApiPublica(pathname: string, method: string): boolean {
    const p = normalizar(pathname)
    const m = method.toUpperCase()

    return API_PUBLICAS.some((entrada) => {
        const coincidePath =
            entrada.tipo === 'exacta'
                ? p === normalizar(entrada.ruta)
                : // El prefijo conserva su barra final: `/api/track/` NO matchea `/api/track-secreto`.
                  p.startsWith(entrada.ruta)
        if (!coincidePath) return false
        return entrada.metodos ? entrada.metodos.includes(m) : true
    })
}

/** ¿Esta ruta de PÁGINA se sirve sin sesión? Se compara por prefijo, como siempre. */
export function esPaginaPublica(pathname: string): boolean {
    return PAGINAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta))
}

/**
 * ¿Esto es el navegador NAVEGANDO (barra de direcciones, un `<a href>`, un
 * submit), y no un `fetch()`?
 *
 * Importa porque la respuesta sin sesión tiene que ser distinta: a un `fetch()`
 * se le contesta 401 en JSON, pero a una navegación hay que mandarla al login —
 * si no, la persona se queda mirando una página en blanco con
 * `{"error":"unauthorized"}` escrito y sin ningún camino de vuelta.
 *
 * `Sec-Fetch-Mode` es la señal buena: todo navegador moderno la manda, y vale
 * `navigate` SOLO en una navegación de nivel superior (un `fetch()` manda
 * `cors`/`same-origin`/`no-cors`, nunca `navigate`). El `Accept: text/html` es
 * el plan B para un cliente que no mande `Sec-Fetch-*`; se consulta únicamente
 * cuando esa cabecera falta, así que un `fetch()` normal nunca cae acá.
 */
export function esNavegacionDeDocumento(request: NextRequest): boolean {
    const modo = request.headers.get('sec-fetch-mode')
    if (modo) return modo === 'navigate'
    return request.headers.get('accept')?.includes('text/html') ?? false
}

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const pathname = request.nextUrl.pathname
    const esApi = esRutaApi(pathname)

    // Se decide ANTES de llamar a getUser() — si no, una ruta pública dependería
    // de que Supabase conteste, y el embudo se caería con la red de Supabase.
    const esPublica = esApi
        ? esApiPublica(pathname, request.method)
        : esPaginaPublica(pathname)
    if (esPublica) {
        return supabaseResponse
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        // Una ruta de API contesta 401 en JSON, NO un redirect a `/login`: quien
        // la llama es un fetch(), y un 307 a una página HTML hace que el
        // `res.json()` del cliente explote con `Unexpected token '<'` — un error
        // que no dice nada del problema real (ver CLAUDE.md).
        //
        // SALVO cuando no es un fetch. Hay UNA ruta de API a la que el navegador
        // llega navegando: el enlace "conectar cuenta vía OAuth" de
        // Configuración → Portales apunta directo a
        // `/api/oauth/mercadolibre/start` (`<a href="/api/...">`, el único de
        // toda la app). Con la sesión vencida, ese 401 en JSON se dibuja como
        // una página en blanco que dice `{"error":"unauthorized"}`. A una
        // navegación se le contesta lo mismo que a una página: al login.
        if (esApi && !esNavegacionDeDocumento(request)) {
            const respuesta = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
            // Se conservan las cookies que Supabase haya tocado (p. ej. limpiar
            // una sesión vencida), sino el navegador se queda con basura.
            supabaseResponse.cookies.getAll().forEach((cookie) => {
                respuesta.cookies.set(cookie)
            })
            return respuesta
        }

        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('redirectTo', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return supabaseResponse
}
