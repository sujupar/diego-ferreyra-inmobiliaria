import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeUsarAsistente } from '@/lib/asistente-tasacion/acceso'
import { actualizarHilo, BUCKET_ADJUNTOS, hiloDeTasacion, listarMensajes } from '@/lib/asistente-tasacion/repositorio'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
/** Las capturas pueden ser de chats con propietarios: enlaces de vida corta. */
const VIDA_URL_ADJUNTO_S = 600

type Params = { params: Promise<{ id: string; hiloId: string }> }

/** Mensajes del hilo, con URLs firmadas de los adjuntos. Recargar la página no pierde nada. */
export async function GET(_req: Request, { params }: Params) {
    const user = await requireAuth()
    const { id, hiloId } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        const sb = admin()
        const hilo = await hiloDeTasacion(sb, id, hiloId)
        if (!hilo) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
        const mensajes = await listarMensajes(sb, hiloId)
        const paths = mensajes.flatMap(m => m.adjuntos.map(a => a.path))
        const urls: Record<string, string> = {}
        if (paths.length) {
            const { data } = await sb.storage.from(BUCKET_ADJUNTOS).createSignedUrls(paths, VIDA_URL_ADJUNTO_S)
            for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl
        }
        return NextResponse.json({ hilo, mensajes, urlsAdjuntos: urls })
    } catch (e) {
        console.error('[asistente GET mensajes]', e)
        return NextResponse.json({ error: 'No se pudo cargar la conversación' }, { status: 500 })
    }
}

const cambiosSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    archivar: z.boolean().optional(),
})

/** Renombrar o archivar una conversación. */
export async function PATCH(req: Request, { params }: Params) {
    const user = await requireAuth()
    const { id, hiloId } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        const body = cambiosSchema.safeParse(await req.json().catch(() => null))
        if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        const sb = admin()
        if (!(await hiloDeTasacion(sb, id, hiloId))) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
        await actualizarHilo(sb, hiloId, {
            ...(body.data.title ? { title: body.data.title } : {}),
            ...(body.data.archivar !== undefined ? { archived_at: body.data.archivar ? new Date().toISOString() : null } : {}),
        })
        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error('[asistente PATCH hilo]', e)
        return NextResponse.json({ error: 'No se pudo actualizar la conversación' }, { status: 500 })
    }
}
