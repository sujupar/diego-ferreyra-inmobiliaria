import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUser, isImpersonating } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import { UserMenu } from '@/components/auth/UserMenu'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { NavigationProgress } from '@/components/dashboard/NavigationProgress'
import { ViewportProbe } from '@/components/dashboard/ViewportProbe'
import { ContentScrollReset } from '@/components/dashboard/ContentScrollReset'
import { getNotificationSettings } from '@/lib/email/settings'
import { SidebarForRole, TopbarForRole, BottomNavForRole } from '@/components/nav/NavForRole'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Suspense } from 'react'

const LOGO_URL =
    'https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [user, impersonating, notifSettings, cookieStore] = await Promise.all([
        getUser(),
        isImpersonating(),
        // Soft-fail: si la tabla no existe (env nuevo), no rompemos el layout.
        getNotificationSettings().catch(() => null),
        cookies(),
    ])
    if (!user) redirect('/login')
    const testModeActive = !!notifSettings?.test_mode_enabled
    // La cookie guarda los strings "true"/"false". Se lee en el servidor para que
    // el menú se dibuje ya colapsado o abierto, sin parpadeo en la primera pintura.
    const sidebarAbierto = cookieStore.get('sidebar_state')?.value !== 'false'

    return (
        <SidebarProvider defaultOpen={sidebarAbierto}>
            <NavigationProgress />
            {/* Sin dibujo propio: publican `--app-vh` (el alto real de la ventana,
                que en el teléfono sigue también al teclado) y devuelven el área de
                contenido al tope en cada navegación. Ver la cadena de alto más abajo. */}
            <ViewportProbe />
            <ContentScrollReset />
            {/*
              Primer parada del Tab: salta el menú entero y aterriza en el contenido.
              No usa `sr-only`/`not-sr-only` (esas dos utilidades se pelean por la
              propiedad `position` y quién gana depende del orden en la hoja
              generada): se esconde arriba del borde con un desplazamiento y vuelve
              al foco. Así se ve siempre igual.
            */}
            <a
                href="#contenido"
                className="fixed left-4 top-4 z-[60] -translate-y-[200%] rounded-md bg-background px-4 py-2 text-sm font-medium shadow-lg outline-2 outline-[color:var(--ring)] transition-transform focus:translate-y-0"
            >
                Saltar al contenido
            </a>
            <SidebarForRole role={user.profile.role} logoUrl={LOGO_URL} />
            {/* `min-w-0`: sin eso, un hijo que fuerce ancho (una tabla ancha, un
                bloque sin wrap) estira el área de contenido y el riel del menú
                —que es `fixed`— le termina tapando la izquierda. */}
            {/*
              CADENA DE ALTO (sistema móvil, Fase 0). El área de contenido mide el
              alto REAL de la ventana (`h-app` = `--app-vh`, que en el teléfono
              sigue también al teclado) y NO scrollea: el scroller pasa a ser
              `#contenido`, más abajo.

              Esto borra tres problemas de una sola vez:
              · los carteles de modo prueba / suplantación se descuentan solos,
                para siempre, en vez de quedar fuera de un `calc()` escrito a mano;
              · `PropertyTabsNav`, que es `sticky`, empieza a pegarse al techo del
                ÁREA DE CONTENIDO en vez de competir con la barra superior por el
                mismo scroller (antes desaparecía detrás de ella);
              · cualquier pantalla que quiera ocupar la ventana pide `flex-1
                min-h-0` en vez de restar píxeles a mano.

              Las dos contracaras obligatorias ya están puestas: `ContentScrollReset`
              (el navegador ya no tiene qué scrollear al cambiar de ruta) y la regla
              `body[data-scroll-locked] #contenido` de globals.css (que el fondo no
              scrollee por detrás de un diálogo abierto).
            */}
            <SidebarInset className="bg-secondary min-w-0 h-app min-h-0 overflow-hidden">
                {/*
                  Los dos carteles de estado peligroso van ACÁ ADENTRO, arriba de la
                  barra superior, y no arriba de todo como antes. Motivo: el riel del
                  menú es `fixed` contra la VENTANA (components/ui/sidebar.tsx), así
                  que arranca en y=0 pase lo que pase; un cartel a ancho completo de
                  ventana queda con su franja izquierda (~240px) tapada por el menú.
                  Adentro del área de contenido ocupan todo el ancho útil y ningún
                  ancho de pantalla ni estado del menú los puede tapar. Siguen siendo
                  lo primero que se ve al entrar.

                  CAMBIO con la cadena de alto: antes se iban con el scroll de la
                  página; ahora quedan fijos arriba, porque el que scrollea es
                  `#contenido` y ellos están afuera. Para dos carteles de "estás en
                  un estado peligroso" es lo que corresponde — pero es un cambio de
                  comportamiento, no un accidente.
                */}
                {/* `shrink-0` en los dos carteles y en la barra: son hermanos de un
                    contenedor de alto fijo, y sin eso el flex los aplasta antes de
                    dejar que scrollee el contenido. */}
                {testModeActive && (
                    <div className="shrink-0 bg-amber-500 text-amber-950 text-sm px-4 py-2 text-center font-medium border-b border-amber-600">
                        ⚠️ MODO PRUEBA ACTIVO — Todos los emails se redirigen a{' '}
                        <span className="font-mono">{notifSettings?.test_recipient_email || 'destinatario configurado'}</span>.{' '}
                        {hasPermission(user.profile.role, 'settings.manage') && (
                            <Link href="/admin/email-test" className="underline">Desactivar</Link>
                        )}
                    </div>
                )}
                {impersonating && (
                    <div className="shrink-0">
                        <ImpersonationBanner
                            name={user.profile.full_name}
                            role={user.profile.role}
                        />
                    </div>
                )}
                <TopbarForRole role={user.profile.role}>
                    <UserMenu profile={user.profile} />
                </TopbarForRole>
                {/*
                  Es un <div> y no un <main>: `SidebarInset` YA renderiza un <main>,
                  y dos landmarks "main" en la misma página le mienten al lector de
                  pantalla. El id es el destino de "Saltar al contenido"; el
                  tabIndex=-1 hace que el foco aterrice acá de verdad al usarlo.
                */}
                {/* `scroll-pane` (globals.css) = `overflow-y:auto` +
                    `overscroll-behavior:contain`: el gesto que llega al final NO se
                    contagia a la página (rebote de iOS, "tirar para recargar" de
                    Android). `min-h-0` es lo que permite que un hijo `flex-1` se
                    achique de verdad en vez de desbordar.

                    EL EJE X NO SE DECLARA ACÁ: lo clava globals.css con
                    `#contenido { overflow-x: hidden }`. No es opcional —
                    `scroll-pane` solo declara el eje Y, y por la especificación
                    de CSS Overflow 3 el otro eje no puede quedarse en `visible`
                    cuando su par es `auto`: computa a `auto`. O sea que este
                    panel scrolleaba de costado solo. Ese era el scroll lateral
                    que el dueño encontró en pantalla tras pantalla, y el
                    `overflow-x: clip` del `body` ya no lo tapaba porque el body
                    dejó de ser el que scrollea. */}
                <div id="contenido" tabIndex={-1} className="flex min-h-0 flex-1 flex-col scroll-pane p-4 md:p-6 outline-none">
                    {children}
                </div>
                {/*
                  BARRA INFERIOR — solo celular (`md:hidden` adentro del propio
                  componente; de 768px para arriba no dibuja nada).

                  Va ACÁ, como hermano del área de contenido y no flotando por
                  encima: así ocupa su propio lugar en la cadena de alto y ninguna
                  pantalla necesita un relleno abajo para no quedar tapada. Los
                  pies pegajosos de los asistentes (`sticky bottom-0`) se pegan al
                  piso del contenido, que ahora termina justo arriba de la barra.

                  `<Suspense>`: lee `?chat=` con `useSearchParams()` para
                  desaparecer cuando el chat se queda con la pantalla entera, y
                  sin este límite Next falla el prerender (mismo motivo que en
                  `app/(dashboard)/inbox/page.tsx`).
                */}
                <Suspense fallback={null}>
                    <BottomNavForRole role={user.profile.role} />
                </Suspense>
            </SidebarInset>
        </SidebarProvider>
    )
}
