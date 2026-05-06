import { requirePermission } from '@/lib/auth/require-role'
import EmailTestClient from './EmailTestClient'

export default async function EmailTestPage() {
    // Server guard: solo admin/dueño llegan al cliente. Si un asesor pega
    // la URL directa, el `requirePermission` lo redirige al dashboard root.
    await requirePermission('settings.manage')
    return <EmailTestClient />
}
