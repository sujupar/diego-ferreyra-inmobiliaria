import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeUsarAsistente } from '@/lib/asistente-tasacion/acceso'
import { BUCKET_ADJUNTOS, hiloDeTasacion } from '@/lib/asistente-tasacion/repositorio'
import { tipoDeAdjunto, MAX_BYTES_ADJUNTO } from '@/lib/asistente-tasacion/adjuntos'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const pedidoSchema = z.object({ nombre: z.string().min(1).max(200), tamano: z.number().int().positive(), mime: z.string().min(1).max(100) })

/**
 * URL firmada para subir un adjunto DIRECTO a Storage (patrón de los documentos
 * legales): el archivo no pasa por la función, que tiene límite de cuerpo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; hiloId: string }> }) {
    const user = await requireAuth()
    const { id, hiloId } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        const body = pedidoSchema.safeParse(await req.json().catch(() => null))
        if (!body.success) return NextResponse.json({ error: 'Datos del archivo inválidos' }, { status: 400 })
        const tipo = tipoDeAdjunto(body.data.mime)
        if (!tipo) return NextResponse.json({ error: 'Solo se pueden adjuntar imágenes (JPG, PNG, WEBP) o PDF' }, { status: 400 })
        if (body.data.tamano > MAX_BYTES_ADJUNTO) return NextResponse.json({ error: 'El archivo supera los 10 MB' }, { status: 413 })
        const sb = admin()
        if (!(await hiloDeTasacion(sb, id, hiloId))) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
        const limpio = body.data.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
        const path = `${id}/${hiloId}/${randomUUID()}-${limpio}`
        const { data, error } = await sb.storage.from(BUCKET_ADJUNTOS).createSignedUploadUrl(path)
        if (error || !data) return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 500 })
        return NextResponse.json({ signedUrl: data.signedUrl, adjunto: { path, tipo, nombre: body.data.nombre, tamano: body.data.tamano } })
    } catch (e) {
        console.error('[asistente adjuntos]', e)
        return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 500 })
    }
}
