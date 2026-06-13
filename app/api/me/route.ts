import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'

/**
 * GET /api/me — perfil del usuario actual (para Configuración: subir foto propia
 * + gate de admin). Defensivo: report_photo_url/report_in_pdf pueden no existir
 * si la migración 20260613000001 todavía no corrió.
 */
export async function GET() {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const p = user.profile
    return NextResponse.json({
        data: {
            id: user.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            report_photo_url: p.report_photo_url ?? null,
            report_in_pdf: p.report_in_pdf ?? false,
        },
    })
}
