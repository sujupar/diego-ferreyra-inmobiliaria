import { ReportPhotoSettings } from '@/components/settings/ReportPhotoSettings'

/**
 * Perfil del usuario — accesible para TODOS los roles (no gateado por settings.manage).
 * Acá cualquier asesor sube su foto para los informes de tasación. `ReportPhotoSettings`
 * muestra "Mi foto" para todos y la tarjeta de autorización solo para admin/dueño.
 */
export default function MiPerfilPage() {
    return (
        <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
            <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">MI CUENTA</p>
                <h1 className="text-3xl font-bold">Mi Perfil</h1>
            </div>
            <ReportPhotoSettings />
        </div>
    )
}
