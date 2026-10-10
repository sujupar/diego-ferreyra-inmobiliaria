import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeUsarAsistente } from '@/lib/asistente-tasacion/acceso'
import { crearHilo, listarHilos } from '@/lib/asistente-tasacion/repositorio'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Conversaciones del asistente de esta tasación (compartidas entre quienes la editan). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    // Fuera del try: requireAuth puede redirigir y eso tiene que llegar a Next.
    const user = await requireAuth()
    const { id } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        return NextResponse.json({ hilos: await listarHilos(admin(), id) })
    } catch (e) {
        console.error('[asistente GET hilos]', e)
        return NextResponse.json({ error: 'No se pudieron cargar las conversaciones' }, { status: 500 })
    }
}

/** "Nuevo chat": abre otra conversación de la misma tasación. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await requireAuth()
    const { id } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        return NextResponse.json({ hilo: await crearHilo(admin(), id, user.id) }, { status: 201 })
    } catch (e) {
        console.error('[asistente POST hilo]', e)
        return NextResponse.json({ error: 'No se pudo abrir la conversación' }, { status: 500 })
    }
}
