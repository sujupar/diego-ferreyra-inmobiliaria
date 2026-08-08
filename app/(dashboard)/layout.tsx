import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUser, isImpersonating } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import { UserMenu } from '@/components/auth/UserMenu'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { NavigationProgress } from '@/components/dashboard/NavigationProgress'
import { getNotificationSettings } from '@/lib/email/settings'
import { SidebarForRole, TopbarForRole } from '@/components/nav/NavForRole'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

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
            <SidebarInset className="bg-secondary">
                {/*
                  Los dos carteles de estado peligroso van ACÁ ADENTRO, arriba de la
                  barra superior, y no arriba de todo como antes. Motivo: el riel del
                  menú es `fixed` contra la VENTANA (components/ui/sidebar.tsx), así
                  que arranca en y=0 pase lo que pase; un cartel a ancho completo de
                  ventana queda con su franja izquierda (~240px) tapada por el menú.
                  Adentro del área de contenido ocupan todo el ancho útil y ningún
                  ancho de pantalla ni estado del menú los puede tapar. Siguen siendo
                  lo primero que se ve al entrar y siguen desplazándose con el scroll,
                  igual que antes.
                */}
                {testModeActive && (
                    <div className="bg-amber-500 text-amber-950 text-sm px-4 py-2 text-center font-medium border-b border-amber-600">
                        ⚠️ MODO PRUEBA ACTIVO — Todos los emails se redirigen a{' '}
                        <span className="font-mono">{notifSettings?.test_recipient_email || 'destinatario configurado'}</span>.{' '}
                        {hasPermission(user.profile.role, 'settings.manage') && (
                            <Link href="/admin/email-test" className="underline">Desactivar</Link>
                        )}
                    </div>
                )}
                {impersonating && (
                    <ImpersonationBanner
                        name={user.profile.full_name}
                        role={user.profile.role}
                    />
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
                <div id="contenido" tabIndex={-1} className="flex-1 p-4 md:p-6 outline-none">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
