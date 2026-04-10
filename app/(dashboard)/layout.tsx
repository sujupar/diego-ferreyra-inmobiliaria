import Link from 'next/link'
import { getUser, isImpersonating } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/auth/roles'
import { UserMenu } from '@/components/auth/UserMenu'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { Role } from '@/types/auth.types'
import { Permission } from '@/lib/auth/roles'

interface NavItem {
    href: string
    label: string
    permission?: Permission
    roles?: Role[]
}

const NAV_ITEMS: NavItem[] = [
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/pipeline/new', label: 'Agendar Tasacion', roles: ['admin', 'coordinador'] },
    { href: '/appraisal/new', label: 'Nueva Tasacion', permission: 'appraisal.create' },
    { href: '/appraisals', label: 'Historial' },
    { href: '/properties', label: 'Propiedades', permission: 'properties.view_all' },
    { href: '/properties/review', label: 'Revision Legal', permission: 'properties.review' },
    { href: '/metrics', label: 'Metricas', permission: 'metrics.view' },
    { href: '/marketing', label: 'Marketing', permission: 'metrics.view' },
    { href: '/settings', label: 'Configuracion', permission: 'settings.manage' },
    { href: '/users', label: 'Usuarios', permission: 'users.manage' },
]

function getVisibleNavItems(role: Role): NavItem[] {
    return NAV_ITEMS.filter(item => {
        if (item.roles) return item.roles.includes(role)
        if (item.permission) return hasPermission(role, item.permission)
        return true
    })
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getUser()
    if (!user) redirect('/login')

    const impersonating = await isImpersonating()
    const visibleNav = getVisibleNavItems(user.profile.role)

    return (
        <div className="min-h-screen flex flex-col bg-secondary/30">
            {impersonating && (
                <ImpersonationBanner
                    name={user.profile.full_name}
                    role={user.profile.role}
                />
            )}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto h-16 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Link href="/">
                            <img
                                src="https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png"
                                alt="Diego Ferreyra Inmobiliaria"
                                className="h-8 w-auto object-contain"
                            />
                        </Link>
                    </div>
                    <nav className="flex gap-6 items-center overflow-x-auto">
                        {visibleNav.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-sm font-medium hover:text-primary transition-colors text-muted-foreground whitespace-nowrap"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <UserMenu profile={user.profile} />
                </div>
            </header>
            <main className="flex-1 container mx-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    )
}
