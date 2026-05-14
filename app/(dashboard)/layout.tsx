import Link from 'next/link'
import { getUser, isImpersonating } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { hasPermission, hasAnyPermission } from '@/lib/auth/roles'
import { UserMenu } from '@/components/auth/UserMenu'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { DashboardNav } from './DashboardNav'
import { Role } from '@/types/auth.types'
import { Permission } from '@/lib/auth/roles'
import { NavigationProgress } from '@/components/dashboard/NavigationProgress'
import { getNotificationSettings } from '@/lib/email/settings'

interface NavSection {
    label: string
    href?: string
    items?: Array<{ href: string; label: string }>
}

function getNavSections(role: Role): NavSection[] {
    const can = (p: Permission) => hasPermission(role, p)

    switch (role) {
        case 'abogado':
            return [
                { label: 'Pendientes', href: '/tasks' },
                { label: 'Revision Legal', href: '/properties/review' },
                { label: 'Historial', href: '/appraisals' },
            ]

        case 'asesor':
            return [
                { label: 'Pendientes', href: '/tasks' },
                { label: 'Inbox', href: '/inbox' },
                { label: 'CRM', href: '/crm' },
                { label: 'Tasaciones', items: [
                    { href: '/pipeline/new', label: 'Coordinar' },
                    { href: '/appraisal/new', label: 'Nueva Tasacion' },
                    { href: '/appraisals', label: 'Historial' },
                ]},
                { label: 'Mis Contactos', href: '/contacts' },
                { label: 'Visitas', href: '/visits' },
                { label: 'Mis Propiedades', href: '/properties' },
            ]

        case 'coordinador':
            return [
                { label: 'Pendientes', href: '/tasks' },
                { label: 'Inbox', href: '/inbox' },
                { label: 'CRM', href: '/crm' },
                { label: 'Tasaciones', items: [
                    { href: '/pipeline/new', label: 'Coordinar' },
                    { href: '/appraisals', label: 'Historial' },
                ]},
                { label: 'Propiedades', items: [
                    { href: '/properties', label: 'Listado' },
                    { href: '/properties/new', label: 'Nueva' },
                ]},
                { label: 'Visitas', href: '/visits' },
                { label: 'Contactos', href: '/contacts' },
            ]

        default: // admin, dueno
            return [
                { label: 'Pendientes', href: '/tasks' },
                { label: 'Inbox', href: '/inbox' },
                { label: 'CRM', href: '/crm' },
                { label: 'Tasaciones', items: [
                    { href: '/pipeline/new', label: 'Coordinar' },
                    { href: '/appraisal/new', label: 'Nueva Tasacion' },
                    { href: '/appraisals', label: 'Historial' },
                ]},
                { label: 'Propiedades', items: [
                    { href: '/properties', label: 'Listado' },
                    { href: '/properties/new', label: 'Nueva' },
                    ...(can('properties.review') ? [{ href: '/properties/review', label: 'Revision Legal' }] : []),
                ]},
                { label: 'Visitas', href: '/visits' },
                { label: 'Contactos', href: '/contacts' },
                ...(can('metrics.view') ? [
                    { label: 'Metricas', href: '/metrics' },
                    { label: 'Marketing', href: '/marketing' },
                ] : []),
                ...(can('settings.manage') || can('users.manage') ? [{
                    label: 'Admin', items: [
                        ...(can('settings.manage') ? [{ href: '/settings', label: 'Configuracion' }] : []),
                        ...(can('settings.manage') ? [{ href: '/settings/portals', label: 'Portales' }] : []),
                        ...(can('settings.manage') ? [{ href: '/admin/email-test', label: 'Test de Emails' }] : []),
                        ...(can('users.manage') ? [{ href: '/users', label: 'Usuarios' }] : []),
                    ]
                }] : []),
            ]
    }
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [user, impersonating, notifSettings] = await Promise.all([
        getUser(),
        isImpersonating(),
        // Soft-fail: si la tabla no existe (env nuevo), no rompemos el layout.
        getNotificationSettings().catch(() => null),
    ])
    if (!user) redirect('/login')
    const navSections = getNavSections(user.profile.role)
    const testModeActive = !!notifSettings?.test_mode_enabled

    return (
        <div className="min-h-screen flex flex-col bg-secondary/30">
            <NavigationProgress />
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
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto h-16 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-3">
                            <img
                                src="https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png"
                                alt="Diego Ferreyra Inmobiliaria"
                                className="h-8 w-auto object-contain"
                            />
                            <span className="eyebrow hidden sm:inline-block border-l border-border pl-3">
                                Inmobiliaria
                            </span>
                        </Link>
                    </div>
                    <DashboardNav sections={navSections} />
                    <UserMenu profile={user.profile} />
                </div>
            </header>
            <main className="flex-1 container mx-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    )
}
