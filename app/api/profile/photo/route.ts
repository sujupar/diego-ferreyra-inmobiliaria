import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

function getAdmin() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
}

/**
 * POST /api/profile/photo — el usuario sube SU foto para el informe (una vez).
 * Guarda en Storage (bucket market-images, prefijo report-photos/) y persiste la
 * URL en profiles.report_photo_url del usuario actual.
 * Requiere la migración 20260613000001 (columna report_photo_url).
 */
export async function POST(request: Request) {
    try {
        const user = await getUser()
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

        const formData = await request.formData()
        const file = formData.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
        if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Debe ser una imagen' }, { status: 400 })
        if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'La imagen debe pesar menos de 5 MB' }, { status: 400 })

        const admin = getAdmin()
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `report-photos/${user.id}.${ext}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const { error: upErr } = await admin.storage
            .from('market-images')
            .upload(path, buffer, { contentType: file.type, upsert: true })
        if (upErr) {
            console.error('profile photo upload error:', upErr)
            return NextResponse.json({ error: 'No se pudo subir la imagen al storage' }, { status: 500 })
        }

        const { data: { publicUrl } } = admin.storage.from('market-images').getPublicUrl(path)
        // upsert mantiene la misma ruta → cache-bust para que la nueva foto se vea.
        const url = `${publicUrl}?v=${Date.now()}`

        const { error: dbErr } = await admin
            .from('profiles')
            .update({ report_photo_url: url, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        if (dbErr) {
            console.error('profile photo db error:', dbErr)
            return NextResponse.json({ error: 'Imagen subida, pero no se pudo guardar (¿corriste la migración?)' }, { status: 500 })
        }

        return NextResponse.json({ url })
    } catch (e) {
        console.error('POST /api/profile/photo error:', e)
        return NextResponse.json({ error: 'Error al procesar la foto' }, { status: 500 })
    }
}
