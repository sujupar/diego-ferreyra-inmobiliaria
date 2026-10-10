import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeUsarAsistente } from '@/lib/asistente-tasacion/acceso'
import {
    BUCKET_ADJUNTOS, cargarTasacion, guardarMensaje, hiloDeTasacion, listarMensajes, mensajeDeHilo, otrasDelBarrio, actualizarHilo,
} from '@/lib/asistente-tasacion/repositorio'
import { MAX_ADJUNTOS_POR_MENSAJE, rutaDeAdjuntoValida } from '@/lib/asistente-tasacion/adjuntos'
import { responder } from '@/lib/asistente-tasacion/responder'
import { tituloDelHilo } from '@/lib/asistente-tasacion/titulo'
import { pedirRespuestaMultimodal } from '@/lib/ai/chat-multimodal'
import { getMarketData } from '@/lib/market-data/resolver'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Techo de la llamada al modelo. La función de Netlify se corta antes de 60 s y
 * `maxDuration` no aplica ahí (CLAUDE.md); una imagen + PDF medidos dieron ~8 s.
 */
const TIMEOUT_MS = 25_000
/** Modelo del asistente: gpt-4.1 ve imágenes y PDF (verificado 2026-10-10). */
const MODELO = () => process.env.TASADOR_CHAT_MODEL || 'gpt-4.1'
const TITULO_POR_DEFECTO = 'Nueva conversación'

const adjuntoSchema = z.object({ path: z.string().min(1).max(400), tipo: z.enum(['imagen', 'pdf']), nombre: z.string().min(1).max(200), tamano: z.number().int().positive() })
const pedidoSchema = z.union([
    z.object({ texto: z.string().max(4000), adjuntos: z.array(adjuntoSchema).max(MAX_ADJUNTOS_POR_MENSAJE).default([]) })
        .refine(p => p.texto.trim().length > 0 || p.adjuntos.length > 0, { message: 'Escribí algo o adjuntá un archivo' }),
    z.object({ reintentar: z.string().uuid() }),
])

/**
 * Envía un mensaje al asistente y devuelve la respuesta. El mensaje del asesor
 * se guarda ANTES de llamar al modelo: si el modelo falla, queda guardado y la
 * respuesta fallida lleva el motivo (botón Reintentar en la pantalla).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; hiloId: string }> }) {
    const user = await requireAuth()
    const { id, hiloId } = await params
    if (!(await puedeUsarAsistente(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const pedido = pedidoSchema.safeParse(await req.json().catch(() => null))
    if (!pedido.success) return NextResponse.json({ error: pedido.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

    const sb = admin()
    try {
        const hilo = await hiloDeTasacion(sb, id, hiloId)
        if (!hilo) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

        let mensajeUsuario
        if ('reintentar' in pedido.data) {
            mensajeUsuario = await mensajeDeHilo(sb, hiloId, pedido.data.reintentar)
            if (!mensajeUsuario || mensajeUsuario.role !== 'user') return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })
        } else {
            const { texto, adjuntos } = pedido.data
            if (!adjuntos.every(a => rutaDeAdjuntoValida(a.path, id, hiloId))) return NextResponse.json({ error: 'Adjunto inválido' }, { status: 400 })
            mensajeUsuario = await guardarMensaje(sb, { thread_id: hiloId, role: 'user', texto: texto.trim(), adjuntos, created_by: user.id })
            if (hilo.title === TITULO_POR_DEFECTO) await actualizarHilo(sb, hiloId, { title: tituloDelHilo(texto) })
        }

        const datos = await cargarTasacion(sb, id)
        if (!datos) return NextResponse.json({ error: 'Tasación no encontrada' }, { status: 404 })
        const [otras, todos] = await Promise.all([otrasDelBarrio(sb, datos.fila), listarMensajes(sb, hiloId)])
        // El historial es lo anterior a este mensaje (en un reintento, lo anterior al original).
        const corte = todos.findIndex(m => m.id === mensajeUsuario.id)
        const anteriores = corte >= 0 ? todos.slice(0, corte) : todos

        let respuesta
        try {
            const r = await responder(datos, otras, anteriores, { texto: mensajeUsuario.texto, adjuntos: mensajeUsuario.adjuntos }, {
                pedir: e => pedirRespuestaMultimodal({ ...e, apiKey: process.env.OPENAI_API_KEY ?? '', modelo: MODELO(), timeoutMs: TIMEOUT_MS }),
                descargarAdjunto: async a => {
                    const { data, error } = await sb.storage.from(BUCKET_ADJUNTOS).download(a.path)
                    if (error || !data) throw new Error(`No se pudo leer el adjunto ${a.nombre}`)
                    return { tipo: a.tipo, nombre: a.nombre, mime: data.type || (a.tipo === 'pdf' ? 'application/pdf' : 'image/png'), base64: Buffer.from(await data.arrayBuffer()).toString('base64') }
                },
                mercado: async () => {
                    const { neighborhood_slug: slug, market_period: periodo } = datos.fila
                    if (!slug || !periodo) return undefined
                    const m = await getMarketData(sb, slug, periodo)
                    const s = m?.caba.stock
                    const p = m?.barrio.price
                    return [
                        s?.totalInmuebles ? `Stock en venta en CABA: ${s.totalInmuebles.toLocaleString('es-AR')} inmuebles` : '',
                        s?.absorcion ? `absorción de departamentos: ${s.absorcion.toFixed(1)} meses` : '',
                        p?.prom ? `precio promedio del barrio: USD ${Math.round(p.prom).toLocaleString('es-AR')}/m²` : '',
                    ].filter(Boolean).join(' · ') || undefined
                },
            })
            respuesta = await guardarMensaje(sb, {
                thread_id: hiloId, role: 'assistant', bloques: r.bloques, propuesta: r.propuesta, model: r.model, usage: r.usage, status: 'ok',
            })
        } catch (e) {
            const motivo = e instanceof Error ? e.message : 'Error desconocido'
            console.error('[asistente responder]', { appraisal: id, hilo: hiloId, motivo })
            respuesta = await guardarMensaje(sb, { thread_id: hiloId, role: 'assistant', status: 'failed', error: motivo.slice(0, 500) })
        }
        return NextResponse.json({ mensajeUsuario, respuesta })
    } catch (e) {
        console.error('[asistente POST mensaje]', e)
        return NextResponse.json({ error: 'No se pudo enviar el mensaje' }, { status: 500 })
    }
}
