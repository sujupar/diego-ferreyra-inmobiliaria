import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeUsarAsistente } from '@/lib/asistente-tasacion/acceso'
import { aplicarPropuestaEnTasacion, cargarTasacion, hiloDeTasacion, marcarPropuestaAplicada, mensajeDeHilo } from '@/lib/asistente-tasacion/repositorio'
import { validarRespuesta } from '@/lib/asistente-tasacion/respuesta'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * "Aplicar a la tasación": la ÚNICA forma en que una propuesta del asistente
 * cambia una tasación — una persona lo decide con este botón (spec 2026-10-03).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; hiloId: string; mensajeId: string }> }) {
    const user = await requireAuth()
    const { id, hiloId, mensajeId } = await params
    try {
        if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        const sb = admin()
        if (!(await hiloDeTasacion(sb, id, hiloId))) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
        const mensaje = await mensajeDeHilo(sb, hiloId, mensajeId)
        if (!mensaje?.propuesta) return NextResponse.json({ error: 'Ese mensaje no tiene una propuesta' }, { status: 404 })
        if (mensaje.propuesta_aplicada_at) return NextResponse.json({ error: 'La propuesta ya fue aplicada' }, { status: 409 })
        // Revalidada: lo guardado en la base no se usa sin pasar por las reglas.
        const { propuesta } = validarRespuesta({ bloques: [{ tipo: 'resumen', texto: '-' }], propuesta: mensaje.propuesta })
        if (!propuesta) return NextResponse.json({ error: 'Propuesta inválida' }, { status: 400 })
        const datos = await cargarTasacion(sb, id)
        if (!datos) return NextResponse.json({ error: 'Tasación no encontrada' }, { status: 404 })
        const efecto = await aplicarPropuestaEnTasacion(sb, datos, propuesta)
        await marcarPropuestaAplicada(sb, mensajeId, user.id)
        return NextResponse.json({ ok: true, ...efecto })
    } catch (e) {
        console.error('[asistente aplicar]', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo aplicar la propuesta' }, { status: 500 })
    }
}
