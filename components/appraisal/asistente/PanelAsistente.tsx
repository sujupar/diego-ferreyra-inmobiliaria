'use client'

/**
 * Asistente de IA de la tasación — diseño A (panel lateral), elegido por el
 * dueño el 2026-10-10. Conversaciones guardadas por tasación, "Nuevo chat",
 * adjuntos (imagen/PDF) y propuestas que se aplican con un botón.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, MessageSquare, Paperclip, Plus, Send, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { asistenteApi } from '@/lib/asistente-tasacion/cliente-http'
import { MAX_ADJUNTOS_POR_MENSAJE, MAX_BYTES_ADJUNTO, tipoDeAdjunto } from '@/lib/asistente-tasacion/adjuntos'
import type { Adjunto, Hilo, Mensaje } from '@/lib/asistente-tasacion/repositorio'
import { MensajeAsistente } from './MensajeAsistente'

const ATAJOS = [
    '¿Cómo llegó a este precio?',
    '¿Qué comparable pesa más?',
    'Ayudame a responderle al propietario',
    '¿Qué factores de la zona no está viendo el método?',
]

export interface PanelAsistenteProps {
    tasacionId: string
    abierto: boolean
    onCerrar: () => void
    /**
     * Después de aplicar una propuesta la tasación cambió en la base. La pantalla
     * que abrió el panel TIENE que recargar sus datos: si no, su próximo
     * autoguardado pisaría el cambio con el estado viejo.
     */
    onTasacionCambiada: () => void
}

export function PanelAsistente({ tasacionId, abierto, onCerrar, onTasacionCambiada }: PanelAsistenteProps) {
    const [hilos, setHilos] = useState<Hilo[]>([])
    const [hiloId, setHiloId] = useState<string | null>(null)
    const [mensajes, setMensajes] = useState<Mensaje[]>([])
    const [urls, setUrls] = useState<Record<string, string>>({})
    const [texto, setTexto] = useState('')
    const [archivos, setArchivos] = useState<File[]>([])
    const [cargando, setCargando] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const finRef = useRef<HTMLDivElement>(null)
    const archivoRef = useRef<HTMLInputElement>(null)

    const abrirHilo = useCallback(async (id: string) => {
        setHiloId(id); setCargando(true); setError(null)
        try {
            const r = await asistenteApi.abrirHilo(tasacionId, id)
            setMensajes(r.mensajes); setUrls(r.urlsAdjuntos)
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la conversación') }
        finally { setCargando(false) }
    }, [tasacionId])

    // Al abrir el panel: la conversación más reciente, o ninguna (se crea al enviar).
    useEffect(() => {
        if (!abierto) return
        let cancelado = false
        setCargando(true); setError(null)
        asistenteApi.listarHilos(tasacionId)
            .then(hs => { if (cancelado) return; setHilos(hs); if (hs[0]) void abrirHilo(hs[0].id); else { setHiloId(null); setMensajes([]); setCargando(false) } })
            .catch(e => { if (!cancelado) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las conversaciones'); setCargando(false) } })
        return () => { cancelado = true }
    }, [abierto, tasacionId, abrirHilo])

    useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, enviando])

    async function nuevoChat() {
        setError(null)
        try {
            const h = await asistenteApi.crearHilo(tasacionId)
            setHilos(prev => [h, ...prev]); setHiloId(h.id); setMensajes([]); setUrls({})
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la conversación') }
    }

    function elegirArchivos(lista: FileList | null) {
        if (!lista) return
        setError(null)
        const nuevos = Array.from(lista)
        const invalido = nuevos.find(f => !tipoDeAdjunto(f.type) || f.size > MAX_BYTES_ADJUNTO)
        if (invalido) { setError(`${invalido.name}: solo imágenes (JPG, PNG, WEBP) o PDF de hasta 10 MB`); return }
        setArchivos(prev => [...prev, ...nuevos].slice(0, MAX_ADJUNTOS_POR_MENSAJE))
    }

    async function enviar(contenido = texto) {
        if (enviando || (!contenido.trim() && archivos.length === 0)) return
        setEnviando(true); setError(null)
        try {
            let id = hiloId
            if (!id) {
                const h = await asistenteApi.crearHilo(tasacionId)
                setHilos(prev => [h, ...prev]); setHiloId(h.id); id = h.id
            }
            const adjuntos: Adjunto[] = []
            for (const f of archivos) adjuntos.push(await asistenteApi.subirAdjunto(tasacionId, id, f))
            const r = await asistenteApi.enviar(tasacionId, id, contenido.trim(), adjuntos)
            setTexto(''); setArchivos([])
            // Recargar el hilo trae las URLs firmadas de los adjuntos recién subidos y el título nuevo.
            setMensajes(prev => [...prev, r.mensajeUsuario, r.respuesta])
            const recargado = await asistenteApi.abrirHilo(tasacionId, id)
            setMensajes(recargado.mensajes); setUrls(recargado.urlsAdjuntos)
            setHilos(prev => prev.map(h => (h.id === id ? recargado.hilo : h)))
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje') }
        finally { setEnviando(false) }
    }

    async function reintentar(indiceFallida: number) {
        const original = [...mensajes.slice(0, indiceFallida)].reverse().find(m => m.role === 'user')
        if (!original || !hiloId) return
        setEnviando(true); setError(null)
        try {
            await asistenteApi.reintentar(tasacionId, hiloId, original.id)
            const r = await asistenteApi.abrirHilo(tasacionId, hiloId)
            setMensajes(r.mensajes); setUrls(r.urlsAdjuntos)
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reintentar') }
        finally { setEnviando(false) }
    }

    async function aplicar(mensajeId: string) {
        if (!hiloId) return
        setEnviando(true); setError(null)
        try {
            await asistenteApi.aplicar(tasacionId, hiloId, mensajeId)
            onTasacionCambiada()
            const r = await asistenteApi.abrirHilo(tasacionId, hiloId)
            setMensajes(r.mensajes)
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo aplicar la propuesta') }
        finally { setEnviando(false) }
    }

    function tecla(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() }
    }

    return (
        <Sheet open={abierto} onOpenChange={o => { if (!o) onCerrar() }}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
                <SheetHeader className="gap-3 border-b px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand"><MessageSquare className="h-4 w-4 text-brand-foreground" /></span>
                        <div>
                            <SheetTitle className="text-base">Asistente de tasación</SheetTitle>
                            <SheetDescription className="text-xs">Conoce esta tasación completa</SheetDescription>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <label className="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                            Conversación
                            <select
                                className="h-10 rounded-lg border bg-background px-2.5 text-sm font-normal text-foreground"
                                value={hiloId ?? ''}
                                onChange={e => { if (e.target.value) void abrirHilo(e.target.value) }}
                                disabled={hilos.length === 0}
                            >
                                {hilos.length === 0 && <option value="">Sin conversaciones todavía</option>}
                                {hilos.map(h => (
                                    <option key={h.id} value={h.id}>{h.title} — {new Date(h.updated_at).toLocaleDateString('es-AR')}</option>
                                ))}
                            </select>
                        </label>
                        <Button variant="outline" className="h-10 border-brand text-brand" onClick={() => void nuevoChat()} disabled={enviando}>
                            <Plus className="mr-1 h-4 w-4" /> Nuevo chat
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-muted/30 px-5 py-5" aria-live="polite">
                    {cargando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>}
                    {!cargando && mensajes.length === 0 && (
                        <p className="text-sm text-muted-foreground">Preguntale lo que necesites sobre esta tasación, dale contexto de la cuadra o adjuntá una captura o un documento.</p>
                    )}
                    {mensajes.map((m, i) => (
                        <MensajeAsistente
                            key={m.id} mensaje={m} urlsAdjuntos={urls} ocupado={enviando}
                            onReintentar={m.role === 'assistant' && m.status === 'failed' ? () => void reintentar(i) : undefined}
                            onAplicar={m.propuesta ? () => void aplicar(m.id) : undefined}
                        />
                    ))}
                    {enviando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Pensando la respuesta…</div>}
                    <div ref={finRef} />
                </div>

                <div className="flex flex-col gap-2.5 border-t px-5 pb-5 pt-3.5">
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {mensajes.length === 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {ATAJOS.map(a => (
                                <button key={a} type="button" onClick={() => void enviar(a)} disabled={enviando}
                                    className="min-h-8 rounded-full border bg-background px-2.5 text-xs hover:bg-muted disabled:opacity-50">{a}</button>
                            ))}
                        </div>
                    )}
                    {archivos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {archivos.map((f, i) => (
                                <span key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
                                    <span className="max-w-[160px] truncate">{f.name}</span>
                                    <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setArchivos(prev => prev.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2 rounded-xl border-[1.5px] border-brand p-2">
                        <input ref={archivoRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
                            onChange={e => { elegirArchivos(e.target.files); e.target.value = '' }} />
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Adjuntar imagen o PDF"
                            onClick={() => archivoRef.current?.click()} disabled={enviando || archivos.length >= MAX_ADJUNTOS_POR_MENSAJE}>
                            <Paperclip className="h-5 w-5" />
                        </Button>
                        <label className="flex flex-1">
                            <span className="sr-only">Mensaje</span>
                            <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={tecla}
                                placeholder="Preguntá, dale contexto o pegá una captura…" disabled={enviando}
                                className="flex-1 resize-none bg-transparent px-1 py-2.5 text-sm outline-none" />
                        </label>
                        <Button type="button" size="icon" className="h-11 w-11 shrink-0 bg-orange-600 hover:bg-orange-700" aria-label="Enviar"
                            onClick={() => void enviar()} disabled={enviando || (!texto.trim() && archivos.length === 0)}>
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
