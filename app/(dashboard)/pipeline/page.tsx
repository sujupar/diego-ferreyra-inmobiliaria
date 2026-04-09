import { requireAuth } from '@/lib/auth/require-role'

export default async function PipelinePage() {
    await requireAuth()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
                <p className="text-muted-foreground">
                    Gestion de tasaciones y captaciones - Proximamente
                </p>
            </div>
            <div className="flex items-center justify-center min-h-[400px] rounded-lg border border-dashed">
                <p className="text-muted-foreground">
                    El pipeline de gestion comercial se implementara en la Fase 2
                </p>
            </div>
        </div>
    )
}
