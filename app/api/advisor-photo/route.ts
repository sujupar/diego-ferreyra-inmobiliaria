import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

/**
 * GET /api/advisor-photo?id=<profileId> — resuelve la foto del asesor para el PDF.
 * Devuelve { url } = report_photo_url SOLO si el perfil está autorizado
 * (report_in_pdf) y subió foto; si no, { url: null } → el PDF usa la default (Diego).
 * Defensivo: cualquier error (incl. columnas inexistentes pre-migración) → null.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await getUser()
        if (!user) return NextResponse.json({ url: null }, { status: 401 })
        const id = req.nextUrl.searchParams.get('id')
        if (!id) return NextResponse.json({ url: null })

        const admin = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data, error } = await admin
            .from('profiles')
            .select('report_photo_url, report_in_pdf')
            .eq('id', id)
            .maybeSingle()

        if (error || !data) return NextResponse.json({ url: null })
        const url = data.report_in_pdf && data.report_photo_url ? data.report_photo_url : null
        return NextResponse.json({ url })
    } catch {
        return NextResponse.json({ url: null })
    }
}
