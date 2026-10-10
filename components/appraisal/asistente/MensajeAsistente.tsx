'use client'

import { useState } from 'react'
import { AlertCircle, Check, Copy, FileText, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/valuation/utils'
import type { BloqueRespuesta } from '@/lib/asistente-tasacion/respuesta'
import type { Mensaje } from '@/lib/asistente-tasacion/repositorio'

const NOMBRE_CAMPO: Record<string, string> = {
    locationCoefficient: 'Ubicación', quality: 'Calidad', conservationState: 'Estado de conservación',
    disposition: 'Disposición', floor: 'Piso', age: 'Antigüedad',
}

function Bloque({ b }: { b: BloqueRespuesta }) {
    const [copiado, setCopiado] = useState(false)
    switch (b.tipo) {
        case 'resumen':
            return <p className="font-semibold text-brand">{b.texto}</p>
        case 'texto':
            return <p className="whitespace-pre-line">{b.texto}</p>
        case 'pasos':
            return (
                <ol className="space-y-2">
                    {b.items.map((it, i) => (
                        <li key={i} className="flex gap-2.5">
                            <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">{i + 1}</span>
                            <span><b>{it.titulo}.</b> {it.texto}</span>
                        </li>
                    ))}
                </ol>
            )
        case 'tabla':
            return (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs tabular-nums">
                        <thead className="bg-muted/60">
                            <tr>{b.columnas.map(c => <th key={c} scope="col" className="px-2.5 py-1.5 text-left font-semibold">{c}</th>)}</tr>
                        </thead>
                        <tbody>
                            {b.filas.map((f, i) => (
                                <tr key={i} className="border-t">{f.map((celda, j) => <td key={j} className="px-2.5 py-1.5">{celda}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        case 'borrador':
            return (
                <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Borrador para {b.destinatario}</span>
                        <Button
                            size="sm" variant="outline" className="h-8"
                            onClick={() => { void navigator.clipboard.writeText(b.texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) }) }}
                        >
                            {copiado ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}{copiado ? 'Copiado' : 'Copiar'}
                        </Button>
                    </div>
                    <p className="whitespace-pre-line">{b.texto}</p>
                </div>
            )
    }
}

export interface MensajeAsistenteProps {
    mensaje: Mensaje
    urlsAdjuntos: Record<string, string>
    /** En una respuesta fallida: reintentar el mensaje del asesor que la originó. */
    onReintentar?: () => void
    onAplicar?: () => void
    ocupado?: boolean
    autor?: string
}

export function MensajeAsistente({ mensaje: m, urlsAdjuntos, onReintentar, onAplicar, ocupado, autor }: MensajeAsistenteProps) {
    const [descartada, setDescartada] = useState(false)

    if (m.role === 'user') {
        return (
            <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
                {m.adjuntos.map(a => (
                    <a key={a.path} href={urlsAdjuntos[a.path]} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs hover:bg-muted">
                        {a.tipo === 'imagen' && urlsAdjuntos[a.path]
                            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, no optimizable por next/image
                            ? <img src={urlsAdjuntos[a.path]} alt="" className="h-9 w-9 rounded object-cover" />
                            : <FileText className="h-5 w-5 text-muted-foreground" />}
                        <span className="max-w-[180px] truncate font-medium">{a.nombre}</span>
                    </a>
                ))}
                {m.texto && <div className="whitespace-pre-line rounded-2xl rounded-br-sm bg-brand px-3.5 py-2.5 text-sm text-brand-foreground">{m.texto}</div>}
                <span className="text-[11px] text-muted-foreground">{autor ? `${autor} · ` : ''}{new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        )
    }

    if (m.status === 'failed') {
        return (
            <div role="alert" className="flex max-w-[92%] items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <span className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span><b className="text-destructive">No pude responder:</b> {(m.error || 'error desconocido').replace(/\.+$/, '')}. Tu mensaje quedó guardado.</span></span>
                {onReintentar && (
                    <Button size="sm" variant="destructive" className="shrink-0" onClick={onReintentar} disabled={ocupado}>
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
                    </Button>
                )}
            </div>
        )
    }

    const p = m.propuesta
    return (
        <div className="flex max-w-[92%] flex-col gap-3 rounded-2xl rounded-bl-sm border bg-background p-4 text-sm leading-relaxed">
            {(m.bloques ?? []).map((b, i) => <Bloque key={i} b={b} />)}
            {p && !descartada && (
                <div className="flex flex-col gap-2 rounded-lg border-[1.5px] border-orange-500 bg-orange-50 p-3 dark:bg-orange-950/30">
                    <span className="text-xs font-extrabold tracking-wide text-orange-800 dark:text-orange-300">PROPUESTA DE AJUSTE</span>
                    <span>
                        {NOMBRE_CAMPO[p.campo] ?? p.campo} {p.objetivo === 'sujeto' ? 'de la propiedad' : `del comparable ${(p.indice ?? 0) + 1}`}: <b className="tabular-nums">{typeof p.valor === 'number' ? p.valor.toLocaleString('es-AR') : String(p.valor)}</b>
                        {p.motivo ? ` — ${p.motivo}` : ''}
                    </span>
                    {typeof p.antes === 'number' && typeof p.despues === 'number' && (
                        <span className="tabular-nums">Precio: {formatCurrency(p.antes, 'USD')} → <b>{formatCurrency(p.despues, 'USD')}</b></span>
                    )}
                    {m.propuesta_aplicada_at ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Aplicada a la tasación</span>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={onAplicar} disabled={ocupado || !onAplicar}>
                                {ocupado && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Aplicar a la tasación
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDescartada(true)} disabled={ocupado}>Descartar</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
