'use client'

import type { KeyboardEvent, MouseEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Calculator, RefreshCw, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/valuation/utils'
import type { ValuationResult } from '@/lib/valuation/calculator'
import type { AiValuationResult, ValuationSource } from '@/lib/valuation/ia-tipos'
import type { EstadoTarjetaIA } from '@/lib/valuation/valuacion-activa'
import { cn } from '@/lib/utils'

/** Lo que la tarjeta IA puede mostrar. `no_configurado` llega por el 503 de la ruta. */
export type EstadoIAEnPantalla = EstadoTarjetaIA | 'no_configurado'

export interface SelectorDeTasadorProps {
    clasico: ValuationResult
    ia: AiValuationResult | null
    estadoIA: EstadoIAEnPantalla
    errorIA?: string | null
    elegido: ValuationSource
    /** Deshabilita clicks mientras se guarda o se genera. */
    ocupado?: boolean
    onElegir: (source: ValuationSource) => void
    /** Generar / Regenerar / Reintentar: siempre la misma acción (la ruta es idempotente). */
    onGenerar: () => void
}

function Numeros({ r }: { r: ValuationResult }) {
    const fila = (label: string, v: string) => (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{v}</span>
        </div>
    )
    return (
        <div className="space-y-1.5">
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(r.publicationPrice, r.currency)}</div>
            <div className="-mt-1 text-xs text-muted-foreground">Precio de publicación</div>
            {fila('Valor de venta', formatCurrency(r.saleValue, r.currency))}
            {fila('Dinero en mano', formatCurrency(r.moneyInHand, r.currency))}
            {fila('Precio por m²', formatCurrency(r.subjectPriceM2, r.currency))}
        </div>
    )
}

function diferencia(ia: number, clasico: number): string {
    if (!clasico) return '—'
    const pct = ((ia - clasico) / clasico) * 100
    const signo = pct > 0 ? '+' : ''
    return `${signo}${pct.toFixed(1)}% vs. clásico`
}

const CONFIANZA: Record<string, string> = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja' }

/**
 * Dos tarjetas: Tasador clásico y Tasador IA. La elegida lleva borde de marca y
 * "En uso". La IA solo se puede elegir cuando está lista o desactualizada (en
 * ese caso los números siguen siendo válidos para el conjunto de datos con el
 * que se generó; la tarjeta lo avisa y ofrece regenerar).
 */
export function SelectorDeTasador({ clasico, ia, estadoIA, errorIA, elegido, ocupado, onElegir, onGenerar }: SelectorDeTasadorProps) {
    const iaElegible = ia != null && (estadoIA === 'lista' || estadoIA === 'desactualizada')

    const claseTarjeta = (activa: boolean, clickable: boolean) => cn(
        'relative transition-shadow',
        clickable && !ocupado && 'cursor-pointer hover:shadow-md',
        activa ? 'border-brand ring-2 ring-brand/30' : 'border-border',
    )
    const enUso = <Badge className="absolute right-3 top-3 bg-brand text-brand-foreground">En uso</Badge>

    // Los botones viven DENTRO de una tarjeta clickeable: sin `stopPropagation`
    // tocar "Generar" también elegiría la tarjeta.
    const accion = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); fn() }
    const tecla = (source: ValuationSource, habilitado: boolean) => (e: KeyboardEvent<HTMLDivElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && habilitado && !ocupado) { e.preventDefault(); onElegir(source) }
    }

    return (
        <section aria-label="Elegir tasador" className="grid gap-4 md:grid-cols-2">
            <Card
                role="button"
                tabIndex={0}
                aria-pressed={elegido === 'calculator'}
                className={claseTarjeta(elegido === 'calculator', true)}
                onClick={() => { if (!ocupado && elegido !== 'calculator') onElegir('calculator') }}
                onKeyDown={tecla('calculator', true)}
            >
                {elegido === 'calculator' && enUso}
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" /> Tasador clásico</CardTitle>
                    <p className="text-xs text-muted-foreground">Coeficientes cargados por el asesor</p>
                </CardHeader>
                <CardContent><Numeros r={clasico} /></CardContent>
            </Card>

            <Card
                role="button"
                tabIndex={0}
                aria-pressed={elegido === 'ai'}
                aria-disabled={!iaElegible}
                className={claseTarjeta(elegido === 'ai', iaElegible)}
                onClick={() => { if (!ocupado && iaElegible && elegido !== 'ai') onElegir('ai') }}
                onKeyDown={tecla('ai', iaElegible)}
            >
                {elegido === 'ai' && enUso}
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Tasador IA</CardTitle>
                    <p className="text-xs text-muted-foreground">Mismo método, interpretado por inteligencia artificial</p>
                </CardHeader>
                <CardContent className="space-y-3">
                    {estadoIA === 'analizando' && (
                        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Analizando comparables…
                        </div>
                    )}
                    {estadoIA === 'no_configurado' && (
                        <p className="py-6 text-sm text-muted-foreground">Tasador IA no configurado.</p>
                    )}
                    {estadoIA === 'sin_generar' && (
                        <div className="space-y-3 py-4">
                            <p className="text-sm text-muted-foreground">Esta tasación todavía no tiene una segunda opinión.</p>
                            <Button size="sm" onClick={accion(onGenerar)} disabled={ocupado}>
                                <Sparkles className="mr-1 h-4 w-4" /> Generar
                            </Button>
                        </div>
                    )}
                    {estadoIA === 'fallida' && (
                        <div className="space-y-3 py-4">
                            <p className="flex items-start gap-2 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errorIA || 'No se pudo generar la valuación IA.'}
                            </p>
                            <Button size="sm" variant="outline" onClick={accion(onGenerar)} disabled={ocupado}>
                                <RefreshCw className="mr-1 h-4 w-4" /> Reintentar
                            </Button>
                        </div>
                    )}
                    {ia && (estadoIA === 'lista' || estadoIA === 'desactualizada') && (
                        <>
                            {estadoIA === 'desactualizada' && (
                                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <span>Desactualizada: cambiaron los datos</span>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={accion(onGenerar)} disabled={ocupado}>
                                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerar
                                    </Button>
                                </div>
                            )}
                            <Numeros r={ia} />
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Badge variant="secondary">{CONFIANZA[ia.ai.confidence] ?? ia.ai.confidence}</Badge>
                                <span className="text-muted-foreground">{diferencia(ia.publicationPrice, clasico.publicationPrice)}</span>
                                <span className="text-muted-foreground">· {ia.ai.model}</span>
                            </div>
                            <details className="text-xs text-muted-foreground">
                                <summary className="cursor-pointer select-none">Cómo lo interpretó</summary>
                                <p className="mt-1 whitespace-pre-line">{ia.ai.summary}</p>
                            </details>
                            {estadoIA === 'lista' && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={accion(onGenerar)} disabled={ocupado}>
                                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerar
                                </Button>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
