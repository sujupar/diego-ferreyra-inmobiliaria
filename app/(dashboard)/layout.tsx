import Link from 'next/link'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col bg-secondary/30">
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto h-16 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <img
                            src="https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png"
                            alt="Diego Ferreyra Inmobiliaria"
                            className="h-8 w-auto object-contain"
                        />
                    </div>
                    <nav className="flex gap-6">
                        <Link href="/appraisal/new" className="text-sm font-medium hover:text-primary transition-colors">
                            Nueva Tasación
                        </Link>
                        <Link href="/settings" className="text-sm font-medium hover:text-primary transition-colors text-muted-foreground">
                            Configuración
                        </Link>
                    </nav>
                </div>
            </header>
            <main className="flex-1 container mx-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    )
}
