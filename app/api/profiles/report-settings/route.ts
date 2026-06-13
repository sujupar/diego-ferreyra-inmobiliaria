import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

/**
 * GET /api/profiles/report-settings — lista de perfiles con su estado de foto en
 * informes (solo admin/dueño), para la pantalla de autorización en Configuración.
 * Defensivo: si la migración no corrió (columnas faltantes), devuelve data: [].
 */
export async function GET() {
    try {
        const user = await getUser()
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        if (!['admin', 'dueno'].includes(user.profile.role)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }

        const admin = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data, error } = await admin
            .from('profiles')
            .select('id, full_name, email, role, report_photo_url, report_in_pdf')
            .eq('is_active', true)
            .order('full_name', { ascending: true })

        if (error) {
            return NextResponse.json({ data: [], error: error.message })
        }
        return NextResponse.json({ data })
    } catch {
        return NextResponse.json({ data: [] })
    }
}
