'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { AppraisalDetail } from '@/lib/supabase/appraisals'
import { updateAppraisal, saveReportEdits, generarValuacionIA, elegirTasadorDeTasacion, guardarSnapshotIA } from '@/lib/supabase/appraisals'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { SelectorDeTasador, type EstadoIAEnPantalla } from '@/components/appraisal/SelectorDeTasador'
import { ValuationProperty, ValuationResult, ValuationFeatures, getQualityCoefficient, ExpenseRates } from '@/lib/valuation/calculator'
import { recalcularFicha, type CambioFicha } from '@/lib/valuation/recalculo-ficha'
import { valuacionConPreciosManuales } from '@/lib/valuation/precio-manual'
import { valuacionActiva, estadoTarjetaIA, comparablesNormales, filaAPropiedad, rehidratar, comparablesDelSnapshotIA } from '@/lib/valuation/valuacion-activa'
import { huellaDeInsumos } from '@/lib/valuation/huella-insumos'
import { recalcularSnapshotIA, type CambioSnapshotIA } from '@/lib/valuation/editar-snapshot-ia'
import type { ValuationSource } from '@/lib/valuation/ia-tipos'
import { ReportEdits, buildDefaultEdits, normalizarEdiciones } from '@/lib/types/report-edits'
import type { PropertyFeatures, ScrapedProperty } from '@/lib/scraper/types'
import type { MarketDataForReport } from '@/lib/market-data/types'
import { Button } from '@/components/ui/button'
import { BotonAsistente } from '@/components/appraisal/asistente/BotonAsistente'
import { ArrowLeft, FileText, AlertCircle, Edit2, Loader2, UserCog, Home } from 'lucide-react'
import { ContactEditor } from '@/components/contacts/ContactEditor'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { FlowHistoryCard, type FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'

const PDFPreviewModal = dynamic(
    () => import('@/components/appraisal/PDFPreviewModal').then(m => m.PDFPreviewModal),
    { ssr: false }
)

type FilaDeFicha = AppraisalDetail['comparables'][number]

const tipoDeFila = (c: FilaDeFicha): string | undefined =>
    (c.analysis as { propertyType?: string } | null)?.propertyType

function filaAScraped(c: FilaDeFicha): ScrapedProperty {
    return {
        url: c.url || '',
        title: c.title || '',
        price: c.price,
        currency: (c.currency as 'USD' | 'ARS' | null) ?? null,
        location: c.location || '',
        description: c.description || '',
        features: c.features as PropertyFeatures,
        images: c.images || [],
        portal: '',
    }
}

/** El PUT recibe sujeto + las tres listas por separado; se arman desde el estado vigente. */
function payloadDeFicha(a: AppraisalDetail) {
    return {
        subject: {
            url: a.property_url || '',
            title: a.property_title || '',
            price: a.property_price,
            currency: (a.property_currency as 'USD' | 'ARS' | null) ?? null,
            location: a.property_location,
            description: a.property_description || '',
            features: (a.property_features ?? {}) as PropertyFeatures,
            images: a.property_images || [],
            portal: '',
            neighborhoodSlug: a.neighborhood_slug ?? undefined,
        } satisfies ScrapedProperty,
        comparables: a.comparables.filter(c => tipoDeFila(c) !== 'overpriced' && tipoDeFila(c) !== 'purchase').map(filaAScraped),
        overpriced: a.comparables.filter(c => tipoDeFila(c) === 'overpriced').map(filaAScraped),
        purchaseProperties: a.comparables.filter(c => tipoDeFila(c) === 'purchase').map(filaAScraped),
        valuationResult: a.valuation_result,
    }
}

export default function AppraisalDetailPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const [appraisal, setAppraisal] = useState<AppraisalDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showPDFPreview, setShowPDFPreview] = useState(false)
    const [contactEditorOpen, setContactEditorOpen] = useState(false)
    const [reportEdits, setReportEdits] = useState<ReportEdits | null>(null)
    const [flowHistory, setFlowHistory] = useState<FlowHistoryData | null>(null)
    const [subjectFeaturesOverride, setSubjectFeaturesOverride] = useState<PropertyFeatures | null>(null)
    // Tasador IA. `estadoIA` null = derivarlo de la fila; se fija a mano
    // mientras se genera o cuando la ruta contesta que no está configurado.
    const [estadoIA, setEstadoIA] = useState<EstadoIAEnPantalla | null>(null)
    const [ocupadoIA, setOcupadoIA] = useState(false)
    const [avisoTasador, setAvisoTasador] = useState<string | null>(null)
    const [valuationOverride, setValuationOverride] = useState<ValuationResult | null>(null)
    const [savingFeatures, setSavingFeatures] = useState(false)
    const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
    // Estado VIGENTE de la ficha para las ediciones en línea (B3). Se actualiza
    // sincrónicamente al editar y se re-sincroniza con cada cambio de `appraisal`.
    const fichaRef = useRef<AppraisalDetail | null>(null)
    const [advisorPhotoUrl, setAdvisorPhotoUrl] = useState<string | undefined>(undefined)
    /**
     * El servidor mandó la ficha RESUMIDA (alcance `vinculadas`: el abogado
     * sobre la tasación de una propiedad que revisa). Esta pantalla arma el
     * informe COMPLETO —recalcula la valuación, ofrece PDF, edición y editor de
     * contacto—, así que con la mitad de los datos dibujaría un informe vacío
     * con botones que responden 403. Se corta acá y se lo manda a donde su
     * lectura sí vive: la ficha de la propiedad que está revisando.
     */
    const [soloDesdeLaPropiedad, setSoloDesdeLaPropiedad] = useState(false)

    // Market image settings are loaded lazily by PDFPreviewModal on open

    function loadAppraisal() {
        const id = params.id as string
        if (!id) return
        return fetch(`/api/appraisals/${id}`)
            .then(r => {
                if (!r.ok) throw new Error('Not found')
                return r.json()
            })
            .then(({ data, resumida }) => {
                if (!data) { setError('Tasación no encontrada'); return }
                if (resumida) { setSoloDesdeLaPropiedad(true); return }
                fichaRef.current = data as AppraisalDetail
                setAppraisal(data as AppraisalDetail)
                // Cargar los ajustes guardados (textos, semáforos, overrides de precio) para
                // que el informe web y el modal muestren lo persistido (ej. Zona de No Venta).
                // Normalizadas: los precios viejos escritos en los textos pasan al
                // marcador {precio}, que el informe resuelve con el precio vigente.
                if (data.report_edits) setReportEdits(normalizarEdiciones(data.report_edits as ReportEdits))
            })
            .catch(err => {
                console.error('Error loading appraisal:', err)
                setError('Error al cargar la tasación')
            })
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fichaRef.current = appraisal
    }, [appraisal])

    useEffect(() => {
        loadAppraisal()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id])

    useEffect(() => {
        const id = params.id as string
        if (!id) return
        fetch(`/api/flow-history?appraisalId=${id}`)
            .then(r => r.json())
            .then(({ data }) => setFlowHistory(data))
            .catch(() => setFlowHistory(null))
    }, [params.id])

    // Si llegamos con ?editContact=1 (típicamente desde tasks), abrimos el editor.
    useEffect(() => {
        if (searchParams.get('editContact') === '1') setContactEditorOpen(true)
    }, [searchParams])

    // Foto del asesor de la tasación: el ASIGNADO o, si no hay, el CREADOR (user_id).
    // Así las tasaciones que hizo el asesor (aunque queden sin assigned_to) salen con
    // su foto. Si no está autorizado / no subió foto, queda undefined → default (Diego).
    useEffect(() => {
        const agentId = appraisal?.assigned_to ?? appraisal?.user_id
        if (!agentId) { setAdvisorPhotoUrl(undefined); return }
        fetch(`/api/advisor-photo?id=${agentId}`)
            .then(r => r.json())
            .then(({ url }) => setAdvisorPhotoUrl(url || undefined))
            .catch(() => setAdvisorPhotoUrl(undefined))
    }, [appraisal?.assigned_to, appraisal?.user_id])

    const [marketData, setMarketData] = useState<MarketDataForReport | null>(null)

    // Datos de mercado CONGELADOS de la tasación: (barrio, período de creación).
    // Tasaciones legacy (sin slug) → null → el PDF usa el camino de imágenes actual.
    useEffect(() => {
        const slug = appraisal?.neighborhood_slug
        if (!slug) { setMarketData(null); return }
        const period = appraisal?.market_period
        const qs = `neighborhood=${encodeURIComponent(slug)}${period ? `&period=${period}` : ''}`
        let cancelled = false
        fetch(`/api/market-data?${qs}`)
            .then(r => r.json())
            .then(({ data }) => { if (!cancelled) setMarketData(data || null) })
            .catch(() => { if (!cancelled) setMarketData(null) })
        return () => { cancelled = true }
    }, [appraisal?.neighborhood_slug, appraisal?.market_period])

    // CRÍTICO: los useMemo deben llamarse SIEMPRE — antes de cualquier early
    // return — porque las reglas de hooks de React requieren orden estable.
    // Manejamos el caso `appraisal === null` con fallbacks adentro.
    // Qué tasador está en uso y su resultado (con los comparables rehidratados
    // desde las filas; en modo IA, con las features que la IA interpretó).
    const activa = useMemo(() => (appraisal ? valuacionActiva(appraisal, appraisal.comparables) : null), [appraisal])
    const tasadorElegido: ValuationSource = activa?.source ?? 'calculator'
    const snapshotIA = appraisal?.ai_valuation_result ?? null

    // En modo IA, el subject que se muestra y edita es el del snapshot IA.
    const effectiveFeatures: PropertyFeatures | null =
        subjectFeaturesOverride
        ?? (tasadorElegido === 'ai' && snapshotIA
            ? (snapshotIA.ai.subject.features as unknown as PropertyFeatures)
            : (appraisal?.property_features ?? null))

    const subject: ValuationProperty | null = useMemo(() => {
        if (!appraisal) return null
        return {
            price: appraisal.property_price,
            currency: appraisal.property_currency,
            title: appraisal.property_title || undefined,
            location: appraisal.property_location,
            images: appraisal.property_images || undefined,
            description: appraisal.property_description || undefined,
            features: (effectiveFeatures ?? {}) as unknown as ValuationProperty['features'],
        }
    }, [appraisal, effectiveFeatures])

    const { comparables, overpriced, purchaseProperties } = useMemo<{
        comparables: ValuationProperty[]
        overpriced: ValuationProperty[]
        purchaseProperties: ValuationProperty[]
    }>(() => {
        if (!appraisal) return { comparables: [], overpriced: [], purchaseProperties: [] }

        const normalComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType !== 'overpriced' && analysis?.propertyType !== 'purchase'
        })
        const overpricedComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType === 'overpriced'
        })
        const purchaseComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType === 'purchase'
        })

        const mapToValuation = (c: typeof appraisal.comparables[number]): ValuationProperty => ({
            price: c.price,
            currency: c.currency,
            title: c.title || undefined,
            location: c.location || undefined,
            url: c.url || undefined,
            images: c.images || undefined,
            description: c.description || undefined,
            features: c.features,
        })

        return {
            comparables: normalComps.map(mapToValuation),
            overpriced: overpricedComps.map(mapToValuation),
            purchaseProperties: purchaseComps.map(mapToValuation),
        }
    }, [appraisal])

    if (loading) {
        return (
            <div className="w-full max-w-5xl mx-auto space-y-8 pb-20">
                {/* Header skeleton */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                        <div className="space-y-2">
                            <div className="h-6 w-64 bg-muted animate-pulse rounded" />
                            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-10 w-36 bg-muted animate-pulse rounded" />
                        <div className="h-10 w-40 bg-muted animate-pulse rounded" />
                    </div>
                </div>
                {/* Report skeleton */}
                <div className="bg-card rounded-xl border p-8 space-y-6">
                    <div className="h-8 w-56 bg-muted animate-pulse rounded" />
                    <div className="grid grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="h-48 bg-muted animate-pulse rounded" />
                </div>
            </div>
        )
    }

    // Va ANTES del bloque de error: `appraisal` quedó en null a propósito, y
    // sin esta rama el abogado leería "Tasación no encontrada" —que es falso,
    // la tasación existe y él tiene acceso al resumen— con un botón al
    // Historial, que a él le responde 403.
    if (soloDesdeLaPropiedad) {
        return (
            <div className="w-full max-w-5xl mx-auto text-center py-20">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">
                    Esta tasación se ve desde la ficha de la propiedad
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Tenés el resumen de la tasación en la pestaña «Propiedad» de la propiedad
                    que estás revisando. El informe completo —valuación, comparables y datos
                    del cliente— no es parte de la revisión legal.
                </p>
            </div>
        )
    }

    if (error || !appraisal || !subject) {
        return (
            <div className="w-full max-w-5xl mx-auto text-center py-20">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">{error || 'Tasación no encontrada'}</h2>
                <Link href="/appraisals">
                    <Button variant="outline" className="gap-2 mt-4">
                        <ArrowLeft className="h-4 w-4" />
                        Volver al Historial
                    </Button>
                </Link>
            </div>
        )
    }

    const result: ValuationResult = valuationOverride ?? (activa?.result ?? appraisal.valuation_result ?? ({} as ValuationResult))
    // Huella de los insumos objetivos de HOY: si difiere de la del snapshot IA,
    // la tarjeta avisa "Desactualizada".
    const huellaActual = huellaDeInsumos({
        subject: {
            price: appraisal.property_price, currency: appraisal.property_currency,
            location: appraisal.property_location, description: appraisal.property_description ?? '',
            features: (appraisal.property_features ?? {}) as ValuationFeatures,
        },
        comparables: comparablesNormales(appraisal.comparables).map(r => filaAPropiedad(r)),
        expenseRates: appraisal.valuation_result?.expenseRates,
        ownerSharePercent: appraisal.valuation_result?.ownerSharePercent ?? 100,
    })
    const estadoIAEfectivo: EstadoIAEnPantalla = estadoIA ?? estadoTarjetaIA(appraisal, huellaActual)
    const hasFullValuation = result.subjectSurface != null && result.comparableAnalysis?.length > 0

    // Detect coefficient drift: tasaciones guardadas antes del fix tenían subjectQualityCoef = 1.0 hardcoded.
    // El nuevo cálculo usa el coeficiente real según features.quality del subject.
    const subjectQuality = appraisal.property_features?.quality
    const expectedQualityCoef = getQualityCoefficient(subjectQuality)
    const storedQualityCoef = result?.subjectQualityCoef
    const qualityCoefficientChanged =
        typeof storedQualityCoef === 'number' &&
        Math.abs(storedQualityCoef - expectedQualityCoef) > 0.01

    /* ------------------------------ Tasador IA ------------------------------ */

    async function handleGenerarIA() {
        if (!appraisal) return
        // Los overrides en memoria son de la versión ANTERIOR (una edición en
        // línea del snapshot viejo): sin limpiarlos, `result` seguiría mostrando
        // esa versión —y el PDF la descargaría— aunque la base ya tenga la nueva.
        setValuationOverride(null)
        setSubjectFeaturesOverride(null)
        setEstadoIA('analizando')
        setOcupadoIA(true)
        try {
            const cols = await generarValuacionIA(appraisal.id)
            setAppraisal(prev => (prev ? { ...prev, ...cols } : prev))
            setEstadoIA(null)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo generar la valuación IA'
            if (/no configurado/i.test(msg)) {
                setEstadoIA('no_configurado')
            } else {
                setEstadoIA('fallida')
                setAppraisal(prev => (prev ? { ...prev, ai_valuation_status: 'failed', ai_valuation_error: msg } : prev))
            }
        } finally {
            setOcupadoIA(false)
        }
    }

    async function handleElegirTasador(source: ValuationSource) {
        if (!appraisal || source === tasadorElegido) return
        setOcupadoIA(true)
        setAvisoTasador(null)
        try {
            const { teniaPreciosEditados } = await elegirTasadorDeTasacion(appraisal.id, source)
            // Los overrides en memoria eran del tasador anterior: se descartan
            // igual que en la base, y se relee la fila para que todo (precios
            // desnormalizados, snapshot, elección) venga de una sola fuente.
            setValuationOverride(null)
            setSubjectFeaturesOverride(null)
            if (teniaPreciosEditados) {
                setReportEdits(prev => (prev ? { ...prev, priceOverrides: undefined } : prev))
                setAvisoTasador('Se descartaron los precios editados a mano del PDF: eran de la otra versión.')
            }
            await loadAppraisal()
        } catch (err) {
            setAvisoTasador(err instanceof Error ? err.message : 'No se pudo cambiar el tasador')
        } finally {
            setOcupadoIA(false)
        }
    }

    /**
     * Edición en línea con la IA en uso: recalcula SOLO el snapshot IA (la
     * versión clásica no se entera) y lo persiste por el PATCH liviano.
     */
    async function editarSnapshotIA(cambio: CambioSnapshotIA) {
        if (!appraisal || !snapshotIA || !subject || !activa) return
        setSavingFeatures(true)
        try {
            const nuevo = recalcularSnapshotIA(
                snapshotIA,
                { ...subject, features: snapshotIA.ai.subject.features },
                activa.comparables,
                cambio,
            )
            if (!nuevo) return
            setValuationOverride(rehidratar(nuevo, comparablesDelSnapshotIA(appraisal.comparables, nuevo.ai)))
            await guardarSnapshotIA(appraisal.id, nuevo)
            setAppraisal(prev => (prev ? { ...prev, ai_valuation_result: nuevo } : prev))
        } catch (err) {
            console.error('editarSnapshotIA error:', err)
        } finally {
            setSavingFeatures(false)
        }
    }

    /**
     * Edición en línea con la versión CLÁSICA en uso. Parte SIEMPRE del estado
     * vigente (`fichaRef`), no de lo cargado al abrir: antes, editar el
     * comparable 1 y después el 2 mandaba el 1 original y deshacía la primera
     * edición (auditoría 2026-10-03, B3). `recalcularFicha` además conserva la
     * parte del propietario y recalcula los escenarios de compra.
     */
    async function aplicarCambioClasico(cambio: CambioFicha) {
        const actual = fichaRef.current
        if (!actual || !subject) return
        const nuevo = recalcularFicha(
            {
                sujeto: { ...subject, features: (actual.property_features ?? {}) as ValuationFeatures },
                filas: actual.comparables,
                resultado: actual.valuation_result,
            },
            cambio,
        )
        if (!nuevo) {
            setErrorEdicion('No se pudo recalcular con ese dato: revisá superficies y precios. No se guardó nada.')
            return
        }
        setErrorEdicion(null)
        const siguiente: AppraisalDetail = {
            ...actual,
            comparables: nuevo.filas,
            property_features: nuevo.sujeto.features,
            valuation_result: nuevo.resultado,
            publication_price: nuevo.resultado.publicationPrice,
            sale_value: nuevo.resultado.saleValue,
            money_in_hand: nuevo.resultado.moneyInHand,
        }
        // Sincrónico: si el asesor edita otro campo antes del próximo render,
        // ya parte de este estado.
        fichaRef.current = siguiente
        setAppraisal(siguiente)
        setValuationOverride(null)
        setSubjectFeaturesOverride(null)
        setSavingFeatures(true)
        try {
            await updateAppraisal(actual.id, payloadDeFicha(siguiente))
        } catch (err) {
            console.error('aplicarCambioClasico error:', err)
            setErrorEdicion('El cambio se ve en pantalla pero NO se guardó. Recargá la página para ver lo guardado.')
        } finally {
            setSavingFeatures(false)
        }
    }

    async function handleSubjectFeaturesChange(features: PropertyFeatures) {
        if (tasadorElegido === 'ai' && snapshotIA) {
            // `PropertyFeatures` (del scraper, con null) y `ValuationFeatures` (con
            // undefined) son la misma información.
            await editarSnapshotIA({ tipo: 'subject', features: features as unknown as ValuationFeatures })
            return
        }
        await aplicarCambioClasico({ tipo: 'sujeto', features: features as unknown as ValuationFeatures })
    }

    async function handleComparableFeaturesChange(index: number, newFeatures: Record<string, unknown>) {
        if (tasadorElegido === 'ai' && snapshotIA) {
            await editarSnapshotIA({ tipo: 'comparable', index, features: newFeatures as ValuationFeatures })
            return
        }
        await aplicarCambioClasico({ tipo: 'comparable', indice: index, features: newFeatures as ValuationFeatures })
    }

    async function handleExpenseRatesChange(next: Partial<ExpenseRates>) {
        if (tasadorElegido === 'ai' && snapshotIA) {
            await editarSnapshotIA({ tipo: 'gastos', expenseRates: next })
            return
        }
        await aplicarCambioClasico({ tipo: 'tasas', tasas: next })
    }

    // Override manual de la Zona de No Venta. Se guarda en reportEdits.priceOverrides
    // (mismo store que usa el PDF) vía PATCH liviano — no toca comparables.
    function handleNoSaleZoneOverride(value: number | undefined) {
        if (!appraisal) return
        const base = reportEdits || buildDefaultEdits(
            { title: appraisal.property_title || '', location: appraisal.property_location, description: appraisal.property_description || '' },
        )
        const nextPO = { ...(base.priceOverrides || {}) }
        if (value === undefined || Number.isNaN(value)) delete nextPO.noSaleZonePrice
        else nextPO.noSaleZonePrice = value
        const next: ReportEdits = { ...base, priceOverrides: Object.keys(nextPO).length > 0 ? nextPO : undefined }
        setReportEdits(next)
        saveReportEdits(appraisal.id, next).catch(err => console.error('saveReportEdits (no-sale-zone) error:', err))
    }

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/appraisals">
                        <Button variant="ghost" size="sm" className="gap-1">
                            <ArrowLeft className="h-4 w-4" />
                            Historial
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {appraisal.property_title || appraisal.property_location}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {new Date(appraisal.created_at).toLocaleDateString('es-AR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <AddTaskDialog entity={{ kind: 'appraisal', id: appraisal.id, label: appraisal.property_title || appraisal.property_location }} />
                    <Button variant="outline" className="gap-2" onClick={() => setContactEditorOpen(true)}>
                        <UserCog className="h-4 w-4" />
                        {appraisal.contact_id ? 'Editar Contacto' : 'Asignar Contacto'}
                    </Button>
                    <Link href={`/appraisal/new?editId=${appraisal.id}`}>
                        <Button variant="outline" className="gap-2">
                            <Edit2 className="h-4 w-4" />
                            Editar Tasación
                        </Button>
                    </Link>
                    <Link href={`/properties/new?appraisalId=${appraisal.id}`}>
                        <Button variant="outline" className="gap-2">
                            <Home className="h-4 w-4" />
                            Captar como propiedad
                        </Button>
                    </Link>
                    <BotonAsistente tasacionId={appraisal.id} className="gap-2" />
                    <Button className="gap-2" onClick={() => setShowPDFPreview(true)}>
                        <FileText className="h-4 w-4" />
                        Vista Previa PDF
                    </Button>
                </div>
            </div>

            <ContactEditor
                open={contactEditorOpen}
                onOpenChange={setContactEditorOpen}
                contactId={appraisal.contact_id}
                appraisalId={appraisal.id}
                // SIN precarga, a propósito: ponía la DIRECCIÓN como nombre del
                // propietario (`property_title`) y un origen que la base rechaza.
                // De ahí salieron los contactos llamados "Av. Hipólito Yrigoyen
                // 1550", que después nadie encontraba buscando por nombre.
                onSaved={() => loadAppraisal()}
            />

            {/* Saving indicator */}
            {savingFeatures && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando cambios...
                </div>
            )}

            {errorEdicion && (
                <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {errorEdicion}
                </div>
            )}

            {/* Flow process history */}
            <FlowHistoryCard data={flowHistory} />

            {/* Banner: coeficiente de calidad constructiva desactualizado */}
            {qualityCoefficientChanged && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                    <strong className="text-amber-800">Aviso de actualización del motor de cálculo</strong>
                    <p className="mt-1 text-amber-700">
                        Esta tasación fue creada con un coeficiente de calidad constructiva fijo (1.0).
                        Al editar cualquier dato se recalculará usando el coeficiente real de la calidad
                        seleccionada ({subjectQuality ?? 'no definida'} = {expectedQualityCoef.toFixed(2)}).
                        Esto puede modificar el precio de publicación.
                    </p>
                </div>
            )}

            {/* Tasador en uso: clásico o IA */}
            {hasFullValuation && activa && (
                <SelectorDeTasador
                    clasico={activa.source === 'calculator'
                        ? activa.result
                        : rehidratar(appraisal.valuation_result, comparablesNormales(appraisal.comparables).map(r => filaAPropiedad(r)))}
                    ia={snapshotIA}
                    estadoIA={estadoIAEfectivo}
                    errorIA={appraisal.ai_valuation_error}
                    elegido={tasadorElegido}
                    ocupado={ocupadoIA}
                    onElegir={handleElegirTasador}
                    onGenerar={handleGenerarIA}
                />
            )}
            {avisoTasador && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{avisoTasador}</div>
            )}

            {/* Report */}
            {hasFullValuation ? (
                <ValuationReport
                    subject={subject}
                    // El precio cargado a mano manda en toda la cadena, igual que en el PDF (B5).
                    result={valuacionConPreciosManuales(result, reportEdits?.priceOverrides)}
                    precioCalculado={result.publicationPrice}
                    editable
                    onSubjectFeaturesChange={handleSubjectFeaturesChange}
                    onComparableFeaturesChange={handleComparableFeaturesChange}
                    expenseRates={(valuationOverride?.expenseRates ?? result.expenseRates) || undefined}
                    onExpenseRatesChange={handleExpenseRatesChange}
                    noSaleZoneOverride={reportEdits?.priceOverrides?.noSaleZonePrice}
                    onNoSaleZoneOverrideChange={handleNoSaleZoneOverride}
                />
            ) : (
                <div className="rounded-lg border p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Resumen de Tasacion</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div><span className="text-muted-foreground">Precio Publicacion:</span> <span className="font-bold">{result.publicationPrice ? `USD ${result.publicationPrice.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Valor de Venta:</span> <span className="font-bold">{result.saleValue ? `USD ${result.saleValue.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Dinero en Mano:</span> <span className="font-bold">{result.moneyInHand ? `USD ${result.moneyInHand.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Comparables:</span> <span>{appraisal.comparable_count}</span></div>
                        <div><span className="text-muted-foreground">Ubicacion:</span> <span>{appraisal.property_location}</span></div>
                    </div>
                    <p className="text-xs text-muted-foreground">Tasacion simplificada — sin analisis detallado de comparables.</p>
                </div>
            )}

            {/* PDF Preview Modal — market image settings are loaded lazily by the modal itself */}
            {showPDFPreview && (
                <PDFPreviewModal
                    open={showPDFPreview}
                    onOpenChange={setShowPDFPreview}
                    appraisalId={appraisal.id}
                    subject={subject}
                    comparables={activa?.comparables ?? comparables}
                    valuationResult={result}
                    overpriced={overpriced}
                    purchaseProperties={purchaseProperties}
                    purchaseResult={result.purchaseResult}
                    reportEdits={reportEdits || buildDefaultEdits(
                        { title: appraisal.property_title || '', location: appraisal.property_location, description: appraisal.property_description || '' },
                    )}
                    onReportEditsChange={setReportEdits}
                    appraisalDate={appraisal.created_at}
                    advisorPhotoUrl={advisorPhotoUrl}
                    marketData={marketData}
                    neighborhoodName={marketData?.neighborhood.name}
                />
            )}
        </div>
    )
}
