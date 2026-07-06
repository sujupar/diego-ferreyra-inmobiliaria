'use client'

import React from 'react'
import { Document, Page, Text, View, Image, Link, Svg, Path, Circle as SvgCircle, Rect as SvgRect } from '@react-pdf/renderer'
import { ValuationProperty, ValuationResult, PurchaseResult, PurchaseScenarioResult } from '@/lib/valuation/calculator'
import { formatCurrency } from '@/lib/valuation/utils'
import { styles, colors } from './PDFStyles'
import { ReportEdits, SemaphoreColor } from '@/lib/types/report-edits'
import { extractAddress } from '@/lib/valuation/addressUtils'
import { StockDashboardPDF } from './market/StockDashboardPDF'
import { EscriturasPDF } from './market/EscriturasPDF'
import { BarrioPanelPDF } from './market/BarrioPanelPDF'
import { TiposPDF } from './market/TiposPDF'

interface MarketImageLabel {
    label: string
    description: string
}

interface PDFReportProps {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
    overpriced?: ValuationProperty[]
    purchaseProperties?: ValuationProperty[]
    purchaseResult?: PurchaseResult
    marketImageLabels?: Record<string, MarketImageLabel>
    marketImageUrls?: Record<string, string>
    reportEdits?: ReportEdits
    /** ISO date string (e.g. appraisal.created_at). Used in page-2 footer. */
    appraisalDate?: string
    /** Foto del asesor que firma el informe (portada + páginas finales). Por agente:
     *  se resuelve desde el perfil del agente asignado a la tasación; si no hay,
     *  default = foto de Diego. */
    advisorPhotoUrl?: string
    /** Datos de mercado resueltos por (barrio, período congelado). Si falta/null,
     *  las páginas de mercado renderizan el camino LEGACY de imágenes (idéntico a hoy). */
    marketData?: import('@/lib/market-data/types').MarketDataForReport | null
    /** Barrio canónico (evita el regex frágil de extractNeighborhood). */
    neighborhoodName?: string
}

// Map semaphore color names to actual color values
function getSemaphoreColorValue(color: SemaphoreColor): string {
    switch (color) {
        case 'green': return colors.semaphoreGreen
        case 'yellow': return colors.semaphoreYellow
        case 'red': return colors.semaphoreRed
    }
}

// Helper to extract neighborhood from location
function extractNeighborhood(location: string): string {
    const match = location.match(/,\s*([^,]+),\s*(?:CABA|Capital Federal)/i)
    return match ? match[1].trim() : 'CABA'
}


/**
 * Distribuye items en páginas con max=N por página, balanceando para evitar páginas con solo 1 item.
 * Ej: 4 items → [2, 2] en vez de [3, 1]. 5 items → [3, 2]. 7 items → [3, 2, 2].
 */
function paginateBalanced<T>(items: T[], maxPerPage = 3): T[][] {
    if (items.length <= maxPerPage) return [items]
    const totalPages = Math.ceil(items.length / maxPerPage)
    const baseSize = Math.floor(items.length / totalPages)
    const remainder = items.length % totalPages
    const pages: T[][] = []
    let cursor = 0
    for (let i = 0; i < totalPages; i++) {
        const size = i < remainder ? baseSize + 1 : baseSize
        pages.push(items.slice(cursor, cursor + size))
        cursor += size
    }
    return pages
}

/** Strip HTML tags, collapse whitespace, and limit length */
function cleanText(str: string | undefined | null, maxLen: number = 300): string {
    if (!str) return ''
    // Remove HTML tags
    let clean = str.replace(/<[^>]*>/g, ' ')
    // Remove excessive whitespace/newlines
    clean = clean.replace(/\s+/g, ' ').trim()
    // Limit length
    if (clean.length > maxLen) clean = clean.slice(0, maxLen) + '...'
    return clean
}

/**
 * Formatea el `publishedDate` de un comparable para mostrar "Publicado hace X".
 * - Formato nuevo: fecha absoluta ISO (YYYY-MM-DD) → se calcula "hace X" FRESCO
 *   al renderizar, así nunca se desactualiza.
 * - Rechaza valores implausibles para un aviso activo (años, > ~18 meses) y
 *   ruido de UI scrapeada. Devuelve '' cuando no hay fecha confiable, y el caller
 *   OCULTA la línea (en vez de mostrar "Sin fecha de publicación").
 */
const PUBLISHED_UI_NOISE = /(fotos|videos|planos|ubicaci[oó]n|360|mensaje|anunciante|favorito|compartir|denunciar|contactar|whatsapp|tel[eé]fono)/i
function formatPublishedDate(raw: string | null | undefined): string {
    if (!raw) return ''
    const text = String(raw).trim()
    if (!text || text.length > 60 || PUBLISHED_UI_NOISE.test(text)) return ''

    // Formato nuevo: fecha absoluta ISO → "Publicado hace X" recalculado fresco.
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (iso) {
        const then = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
        const days = Math.floor((Date.now() - then.getTime()) / 86400000)
        if (days < 0 || days > 550) return '' // futuro o > ~18 meses: implausible
        if (days <= 1) return 'Publicado hoy'
        if (days < 14) return `Publicado hace ${days} días`
        if (days < 60) return `Publicado hace ${Math.round(days / 7)} semanas`
        const months = Math.round(days / 30)
        return `Publicado hace ${months} ${months === 1 ? 'mes' : 'meses'}`
    }

    // Legacy: strings relativos viejos. Rechazar "año(s)" (casi siempre misparse).
    if (/\baños?\b/i.test(text)) return ''
    return text
}

function FeatureChip({ label }: { label: string }) {
    return (
        <View style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: '#f1f5f9',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'solid',
            borderRadius: 3,
        }}>
            <Text style={{ fontSize: 8, color: '#1f2937', fontWeight: 'bold' }}>{label}</Text>
        </View>
    )
}

// ─── Helpers para Simulación Gastos e Impuestos ───
function ValueCell({ label, value, flex }: { label: string; value: string; flex?: boolean }) {
    return (
        <View style={[
            { padding: 4, borderRightWidth: 1, borderRightColor: colors.lightGray, borderRightStyle: 'solid' },
            flex ? { flex: 1 } : {},
        ]}>
            <Text style={{ fontSize: 7, color: colors.mediumGray, textAlign: 'center' }}>{label}</Text>
            <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center' }}>{value}</Text>
        </View>
    )
}

function ExpRow({ label, value, bold }: { label: string; value: number; currency: string; bold?: boolean }) {
    return (
        <View style={{
            flexDirection: 'row', justifyContent: 'space-between', padding: 4,
            borderWidth: 1,
            borderColor: bold ? colors.darkGray : colors.lightGray,
            borderStyle: 'solid',
            borderTopWidth: 0,
            backgroundColor: bold ? '#f5f5f5' : undefined,
        }}>
            <Text style={{ fontSize: 8, fontWeight: bold ? 'bold' : 'normal' }}>{label}</Text>
            <Text style={{ fontSize: 8, fontWeight: bold ? 'bold' : 'normal' }}>
                USD {value.toLocaleString()}
            </Text>
        </View>
    )
}

function SaleSimTable({
    valuationResult, subject, neighborhood, pubDisplay, saleDisplay,
}: { valuationResult: ValuationResult; subject: ValuationProperty; neighborhood: string; pubDisplay?: number; saleDisplay?: number }) {
    const r = valuationResult
    // Override de display de los precios (mismo criterio que la página de Costos): no
    // recalcula gastos/dinero-en-mano, solo muestra el valor cargado a mano si existe.
    const pub = pubDisplay ?? r.publicationPrice
    const sale = saleDisplay ?? r.saleValue
    const rates = r.expenseRates
    const showOwnerShare = typeof r.ownerSharePercent === 'number' && r.ownerSharePercent < 100 && typeof r.ownerShareMoney === 'number'
    return (
        <View style={{ marginBottom: 14 }}>
            <View style={{
                backgroundColor: '#fff3e0', padding: 6,
                borderWidth: 1, borderColor: colors.orange, borderStyle: 'solid',
            }}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}>
                    VENTA {subject.features.rooms ? `${subject.features.rooms} AMBIENTES` : ''} | {neighborhood}
                </Text>
            </View>
            <View style={{
                flexDirection: 'row',
                borderWidth: 1, borderColor: colors.lightGray, borderStyle: 'solid',
                borderTopWidth: 0,
            }}>
                <ValueCell label="Valor de Publicación" value={`USD ${pub.toLocaleString()}`} flex />
                <ValueCell label="Valor de Venta" value={`USD ${sale.toLocaleString()}`} flex />
                <ValueCell label="Valor de Escritura" value={`USD ${r.deedValue.toLocaleString()}`} flex />
            </View>
            <View style={{
                backgroundColor: '#e8f4fd', padding: 4,
                borderWidth: 1, borderColor: colors.lightGray, borderStyle: 'solid',
                borderTopWidth: 0,
            }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>Gastos de Venta</Text>
            </View>
            <ExpRow label={`Sellos ${rates.stampsPercent}% s/escritura`} value={r.stampsCost} currency={r.currency} />
            <ExpRow label={`Gastos Escritura ${rates.deedExpensesPercent}% s/venta`} value={r.deedExpenses} currency={r.currency} />
            <ExpRow label={`Honorarios Inmobiliaria ${rates.agencyFeesPercent}% s/venta`} value={r.agencyFees} currency={r.currency} />
            <ExpRow label="Total gastos venta" value={r.totalExpenses} currency={r.currency} bold />
            {/* Dinero luego de venta — el dato clave: caja verde prominente */}
            <View style={{
                marginTop: 8, padding: 12, backgroundColor: colors.semaphoreGreen, borderRadius: 4,
                alignItems: 'center',
            }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.white, letterSpacing: 0.5 }}>DINERO LUEGO DE VENTA</Text>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.white, marginTop: 3 }}>
                    USD {r.moneyInHand.toLocaleString()}
                </Text>
            </View>
            {showOwnerShare && (
                <View style={{
                    marginTop: 4, flexDirection: 'row', justifyContent: 'space-between',
                    padding: 6, backgroundColor: '#fef3c7', borderRadius: 2,
                }}>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#92400e' }}>
                        Parte del Propietario ({r.ownerSharePercent}%)
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#92400e' }}>
                        USD {(r.ownerShareMoney as number).toLocaleString()}
                    </Text>
                </View>
            )}
        </View>
    )
}

function PurchaseSimTable({
    scenario, currency, width, showPropertyLabel,
}: { scenario: PurchaseScenarioResult; currency: string; width?: string | number; showPropertyLabel?: boolean }) {
    // Si no se pasa width específico, usar flex: 1 para distribuirse uniformemente
    // entre escenarios visibles dentro del contenedor row.
    const wrapperStyle = width !== undefined
        ? { width }
        : { flex: 1, minWidth: 0 }
    // El propertyLabel sólo se muestra si hay más de una propiedad en juego (showPropertyLabel=true)
    // o si el escenario tiene propertyLabel explícito y no es legacy.
    const header = showPropertyLabel && scenario.propertyLabel
        ? `COMPRA — ${scenario.propertyLabel.toUpperCase()} · ${scenario.label.toUpperCase()}`
        : `COMPRA — ${scenario.label.toUpperCase()}`
    return (
        <View style={wrapperStyle}>
            <View style={{
                backgroundColor: '#e8f4fd', padding: 6,
                borderWidth: 1, borderColor: colors.primary, borderStyle: 'solid',
            }}>
                <Text
                    style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}
                    wrap={false}
                >
                    {header}
                </Text>
            </View>
            <View style={{
                flexDirection: 'row',
                borderWidth: 1, borderColor: colors.lightGray, borderStyle: 'solid',
                borderTopWidth: 0,
            }}>
                <ValueCell label="Publicación" value={`USD ${scenario.publicationPrice.toLocaleString()}`} flex />
                <ValueCell label="Compra" value={`USD ${scenario.purchasePrice.toLocaleString()}`} flex />
                <ValueCell label="Escritura" value={`USD ${scenario.deedValue.toLocaleString()}`} flex />
            </View>
            <View style={{
                backgroundColor: '#e8f4fd', padding: 4,
                borderWidth: 1, borderColor: colors.lightGray, borderStyle: 'solid',
                borderTopWidth: 0,
            }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>Gastos de Compra</Text>
            </View>
            <ExpRow label={`Sellos ${scenario.rates.stampsPercent}%`} value={scenario.stampsCost} currency={currency} />
            <ExpRow label={`Honor. Escribano ${scenario.rates.notaryFeesPercent}%`} value={scenario.notaryFees} currency={currency} />
            <ExpRow label={`Gastos Escritura ${scenario.rates.deedExpensesPercent}%`} value={scenario.deedExpenses} currency={currency} />
            <ExpRow label={`Honor. Inmob. ${scenario.rates.buyerCommissionPercent}%`} value={scenario.buyerCommission} currency={currency} />
            <ExpRow label="Total gastos compra" value={scenario.totalPurchaseCosts} currency={currency} bold />
            {/* Costo total + Diferencia En Mano en cajas (Diferencia = el dato más
                importante: caja verde/rojo, la más grande). */}
            <View style={{ marginTop: 6 }}>
                <View style={{ padding: 7, backgroundColor: colors.primary, borderRadius: 3, alignItems: 'center' }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: colors.white, letterSpacing: 0.3 }}>COSTO TOTAL</Text>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.white, marginTop: 1 }} wrap={false}>
                        USD {scenario.totalCostWithPurchase.toLocaleString()}
                    </Text>
                </View>
                <View style={{
                    marginTop: 4, padding: 9, borderRadius: 3, alignItems: 'center',
                    backgroundColor: scenario.remainingMoney >= 0 ? colors.semaphoreGreen : colors.semaphoreRed,
                }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: colors.white, letterSpacing: 0.3 }}>DIFERENCIA EN MANO</Text>
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: colors.white, marginTop: 1 }} wrap={false}>
                        USD {scenario.remainingMoney.toLocaleString()}
                    </Text>
                </View>
            </View>
        </View>
    )
}

export function PDFReportDocument({ subject, comparables, valuationResult, overpriced = [], purchaseProperties = [], purchaseResult, marketImageLabels = {}, marketImageUrls = {}, reportEdits, appraisalDate, advisorPhotoUrl = '/pdf-assets/photos/advisor-default.png', marketData, neighborhoodName }: PDFReportProps) {
    const neighborhood = neighborhoodName || extractNeighborhood(subject.location || '')
    // Precios mostrados: override manual (reportEdits.priceOverrides) o el valor calculado.
    // Override de display puro: NO recalcula la cadena de costos/gastos ni los textos.
    const recommendedPrice = reportEdits?.priceOverrides?.publicationPrice ?? valuationResult.publicationPrice
    const noSaleZone = reportEdits?.priceOverrides?.noSaleZonePrice ?? valuationResult.noSaleZonePrice
    const saleValueDisplay = reportEdits?.priceOverrides?.saleValue ?? valuationResult.saleValue

    // Helper: calculate homogenized surface for a comparable
    const getHomogenizedSurface = (comp: ValuationProperty) => {
        const covered = comp.features.coveredArea || 0
        const semi = comp.features.semiCoveredArea || 0
        const uncovered = comp.features.uncoveredArea || 0
        return covered + (semi * 0.5) + (uncovered * 0.5)
    }

    return (
        <Document>
            {/* PAGE 1: PORTADA — fondo blanco, texto azul, logos sin cards. La foto de Diego es la actual `Foto Diego.png` renderizada con dividerPhoto bottom-right. */}
            <Page size="A4" style={styles.page}>
                {/* Top section - centered content */}
                <View style={{ paddingHorizontal: 60, paddingTop: 50, alignItems: 'center' }}>
                    {/* Title */}
                    <Text style={[styles.h1, { color: colors.primary, fontSize: 28, letterSpacing: 4 }]}>
                        {reportEdits?.coverTitle || 'INFORME DE TASACIÓN'}
                    </Text>

                    {/* Property Title — siempre solo dirección, incluso si reportEdits guardó el título completo (legacy) */}
                    <Text style={[styles.propertyTitle, { marginTop: 16, fontSize: 32 }]}>
                        {extractAddress(reportEdits?.coverPropertyTitle || subject.location || subject.title)}
                    </Text>

                    {/* Three Institutional Logos */}
                    <View style={[styles.logosRow, { marginTop: 30 }]}>
                        <Image
                            src="/pdf-assets/logos/logos-institucionales.png"
                            style={{ height: 50, width: 240, objectFit: 'contain' }}
                        />
                    </View>

                    {/* Diego Ferreyra Logo - prominent. El texto "Martillero Público - CUCICBA 8266" ya viene en el PNG. */}
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <Image
                            src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                            style={{ height: 100, width: 350, objectFit: 'contain' }}
                        />
                    </View>
                </View>

                {/* Diego Photo — mismo tratamiento que dividers (cover, full-bleed bottom-right) */}
                <Image
                    src={advisorPhotoUrl}
                    style={styles.dividerPhoto}
                />

                {/* City text - bottom-left, posicionado por encima de la zona de la foto */}
                <Text style={{
                    position: 'absolute',
                    bottom: 220,
                    left: 60,
                    fontSize: 14,
                    color: colors.darkGray,
                    fontWeight: 'bold',
                    lineHeight: 1.4,
                }}>
                    Ciudad Autónoma{'\n'}de Buenos Aires
                </Text>

                {/* Footer */}
                <View style={styles.footer}>
                    <Link src="https://diegoferreyraInmobiliaria.com/" style={styles.footerText}>
                        diegoferreyraInmobiliaria.com
                    </Link>
                </View>
            </Page>

            {/* PAGE 2: PROPERTY DETAILS */}
            <Page size="A4" style={styles.pageWithPadding}>
                {/* Header */}
                <View style={styles.header}>
                    <Text>PROPIEDADES EN VENTA</Text>
                </View>

                {/* Property Title — solo dirección */}
                <Text style={[styles.propertyTitle, { marginTop: 40 }]}>
                    {extractAddress(subject.title || subject.location)}
                </Text>

                {/* Main Photo — más grande para mejor protagonismo */}
                {subject.images && subject.images[0] && (
                    <View style={{
                        marginTop: 8,
                        marginBottom: 24,
                        borderWidth: 1,
                        borderColor: colors.lightGray,
                        borderStyle: 'solid',
                    }}>
                        <Image
                            src={subject.images[0]}
                            style={{ width: '100%', height: 320, objectFit: 'cover' }}
                        />
                    </View>
                )}

                {/* Features Grid — visual cards with SVG icons */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, marginTop: 8 }}>
                    {/* Sup. Cubierta — house icon */}
                    <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                            <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                <Path d="M12 3L4 10H7V20H17V10H20L12 3Z" fill="white" />
                            </Svg>
                        </View>
                        <View>
                            <Text style={{ fontSize: 7, color: colors.mediumGray }}>Sup. Cubierta</Text>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.coveredArea || 0} m²</Text>
                        </View>
                    </View>
                    {/* Sup. Descubierta — open/outdoor icon */}
                    {(subject.features.uncoveredArea ?? 0) > 0 && (
                        <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                                <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                    <Path d="M3 20H21M5 20V12H19V20M5 12L12 6L19 12" stroke="white" strokeWidth={1.5} fill="none" />
                                    <Path d="M9 12V8M15 12V8" stroke="white" strokeWidth={1.5} fill="none" />
                                </Svg>
                            </View>
                            <View>
                                <Text style={{ fontSize: 7, color: colors.mediumGray }}>Sup. Descubierta</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.uncoveredArea} m²</Text>
                            </View>
                        </View>
                    )}
                    {/* Ambientes — grid/layout icon */}
                    {subject.features.rooms && (
                        <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                                <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                    <SvgRect x={3} y={3} width={7} height={7} rx={1} fill="white" />
                                    <SvgRect x={14} y={3} width={7} height={7} rx={1} fill="white" />
                                    <SvgRect x={3} y={14} width={7} height={7} rx={1} fill="white" />
                                    <SvgRect x={14} y={14} width={7} height={7} rx={1} fill="white" />
                                </Svg>
                            </View>
                            <View>
                                <Text style={{ fontSize: 7, color: colors.mediumGray }}>Ambientes</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.rooms}</Text>
                            </View>
                        </View>
                    )}
                    {/* Dormitorios — bed icon */}
                    {subject.features.bedrooms && (
                        <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                                <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                    <Path d="M3 18V13H21V18M3 13V9H9V13M3 18H21M21 13V18" stroke="white" strokeWidth={1.5} fill="none" />
                                    <SvgCircle cx={6} cy={11} r={1.5} fill="white" />
                                </Svg>
                            </View>
                            <View>
                                <Text style={{ fontSize: 7, color: colors.mediumGray }}>Dormitorios</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.bedrooms}</Text>
                            </View>
                        </View>
                    )}
                    {/* Baños — water drop icon */}
                    {subject.features.bathrooms && (
                        <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                                <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                    <Path d="M12 4C12 4 6 11 6 15C6 18.3 8.7 21 12 21C15.3 21 18 18.3 18 15C18 11 12 4 12 4Z" fill="white" />
                                </Svg>
                            </View>
                            <View>
                                <Text style={{ fontSize: 7, color: colors.mediumGray }}>Baños</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.bathrooms}</Text>
                            </View>
                        </View>
                    )}
                    {/* Antigüedad — clock icon */}
                    <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                            <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                <SvgCircle cx={12} cy={12} r={9} stroke="white" strokeWidth={1.5} fill="none" />
                                <Path d="M12 7V12L15.5 14.5" stroke="white" strokeWidth={1.5} fill="none" />
                            </Svg>
                        </View>
                        <View>
                            <Text style={{ fontSize: 7, color: colors.mediumGray }}>Antigüedad</Text>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.age || 0} años</Text>
                        </View>
                    </View>
                    {/* Cochera — car icon */}
                    {subject.features.garages && (
                        <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, borderLeft: `3px solid ${colors.primary}` }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                                <Svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                    <Path d="M5 16H19V12L17 8H7L5 12V16Z" stroke="white" strokeWidth={1.5} fill="none" />
                                    <SvgCircle cx={8} cy={14} r={1.2} fill="white" />
                                    <SvgCircle cx={16} cy={14} r={1.2} fill="white" />
                                    <Path d="M5 16V18H8V16M16 16V18H19V16" stroke="white" strokeWidth={1} fill="none" />
                                </Svg>
                            </View>
                            <View>
                                <Text style={{ fontSize: 7, color: colors.mediumGray }}>Cochera{subject.features.garages > 1 ? 's' : ''}</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>{subject.features.garages}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Property Description */}
                {subject.description && cleanText(subject.description) && (
                    <View style={styles.checkboxList}>
                        <Text style={[styles.body, { fontSize: 10, color: colors.mediumGray }]}>
                            {cleanText(subject.description, 300)}
                        </Text>
                    </View>
                )}

                {/* Footer info card — fills bottom space with agent + appraisal date */}
                <View style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 40,
                    right: 40,
                    padding: 16,
                    backgroundColor: '#f8f9fa',
                    borderRadius: 8,
                    borderLeftWidth: 4,
                    borderLeftColor: colors.primary,
                    borderLeftStyle: 'solid',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>
                            Diego Ferreyra
                        </Text>
                        <Text style={{ fontSize: 9, color: colors.mediumGray, marginTop: 2 }}>
                            Asesor inmobiliario · CUCICBA 8266
                        </Text>
                        <Text style={{ fontSize: 9, color: colors.mediumGray, marginTop: 2 }}>
                            diegoferreyraInmobiliaria.com
                        </Text>
                    </View>
                    <View style={{
                        paddingLeft: 12,
                        borderLeftWidth: 1,
                        borderLeftColor: colors.lightGray,
                        borderLeftStyle: 'solid',
                        alignItems: 'flex-end',
                    }}>
                        <Text style={{ fontSize: 9, color: colors.mediumGray }}>Tasación realizada el</Text>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray, marginTop: 2 }}>
                            {(appraisalDate ? new Date(appraisalDate) : new Date()).toLocaleDateString('es-AR', {
                                day: '2-digit', month: 'long', year: 'numeric',
                            })}
                        </Text>
                    </View>
                </View>
            </Page>

            {(() => {
                // Bloque legacy de UN slot — markup idéntico al histórico.
                const MarketImageSection = ({ slot, defaultLabel, defaultSrc, last }: { slot: string; defaultLabel: string; defaultSrc: string; last?: boolean }) => (
                    <View wrap={false}>
                        <Text style={styles.h2}>{marketImageLabels[slot]?.label || defaultLabel}</Text>
                        <Image
                            src={marketImageUrls[slot] || defaultSrc}
                            style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                        />
                        {marketImageLabels[slot]?.description ? (
                            <Text style={{ fontSize: 8, color: colors.mediumGray, marginBottom: last ? 0 : 16 }}>{marketImageLabels[slot].description}</Text>
                        ) : (last ? null : <View style={{ marginBottom: 16 }} />)}
                    </View>
                )
                const MarketHeader = () => (
                    <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                        <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                        <Text style={styles.headerSubtitle}>{neighborhood === 'CABA' ? 'CABA' : `${neighborhood}, CABA`}</Text>
                    </View>
                )
                const md = marketData
                if (!md) {
                    // ===== CAMINO LEGACY (tasaciones sin snapshot): 2 páginas, igual que siempre =====
                    return (
                        <>
                            <Page size="A4" style={styles.pageWithPadding}>
                                <MarketHeader />
                                <View style={{ marginTop: 60 }}>
                                    <MarketImageSection slot="stock-departamentos" defaultLabel="Stock de Departamentos en venta en CABA" defaultSrc="/pdf-assets/monthly-data/stock-departamentos.png" />
                                    <MarketImageSection slot="escrituras-caba" defaultLabel="Cantidad de Escrituras CABA" defaultSrc="/pdf-assets/monthly-data/escrituras-caba.png" last />
                                </View>
                            </Page>
                            <Page size="A4" style={styles.pageWithPadding}>
                                <MarketHeader />
                                <View style={{ marginTop: 60 }}>
                                    <MarketImageSection slot="datos-barrio" defaultLabel={`Datos de ${neighborhood}, CABA`} defaultSrc="/pdf-assets/monthly-data/datos-barrio.png" />
                                    <MarketImageSection slot="tipos-propiedades" defaultLabel={`Tipos de propiedades en ${neighborhood}`} defaultSrc="/pdf-assets/monthly-data/tipos-propiedades.png" last />
                                </View>
                            </Page>
                        </>
                    )
                }
                // ===== CAMINO DATA-DRIVEN: 4 páginas; cada sección cae a su imagen legacy si SU dato falta =====
                const barrioTitle = md.neighborhood.isGeneral ? 'CABA (general)' : md.neighborhood.name
                return (
                    <>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                {md.caba.stock && md.caba.stock.tipos?.length
                                    ? (<>
                                        <Text style={styles.h2}>Stock de inmuebles en venta en CABA</Text>
                                        <StockDashboardPDF stock={md.caba.stock} />
                                    </>)
                                    : <MarketImageSection slot="stock-departamentos" defaultLabel="Stock de Departamentos en venta en CABA" defaultSrc="/pdf-assets/monthly-data/stock-departamentos.png" last />}
                            </View>
                        </Page>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                {md.caba.escrituras
                                    ? (<>
                                        <Text style={styles.h2}>Cantidad de Escrituras CABA</Text>
                                        <EscriturasPDF escrituras={md.caba.escrituras} />
                                    </>)
                                    : <MarketImageSection slot="escrituras-caba" defaultLabel="Cantidad de Escrituras CABA" defaultSrc="/pdf-assets/monthly-data/escrituras-caba.png" last />}
                            </View>
                        </Page>
                        {/* Datos del barrio + Tipos de propiedades: UNA sola página (pedido del
                            usuario 2026-07-06, mismo agrupado que el layout legacy original). */}
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                <View style={{ marginBottom: 28 }}>
                                    {md.barrio.price
                                        ? (<>
                                            <Text style={styles.h2}>{`Datos de ${barrioTitle}`}</Text>
                                            <BarrioPanelPDF name={md.neighborhood.name} price={md.barrio.price} highlightSlug={md.neighborhood.slug} isGeneral={md.neighborhood.isGeneral} />
                                        </>)
                                        : <MarketImageSection slot="datos-barrio" defaultLabel={`Datos de ${neighborhood}, CABA`} defaultSrc="/pdf-assets/monthly-data/datos-barrio.png" />}
                                </View>
                                {md.barrio.propertyTypes
                                    ? (<>
                                        <Text style={styles.h2}>{`Tipos de propiedades en ${barrioTitle}`}</Text>
                                        <TiposPDF tipos={md.barrio.propertyTypes} />
                                    </>)
                                    : <MarketImageSection slot="tipos-propiedades" defaultLabel={`Tipos de propiedades en ${neighborhood}`} defaultSrc="/pdf-assets/monthly-data/tipos-propiedades.png" last />}
                            </View>
                        </Page>
                    </>
                )
            })()}

            {/* PAGE 5: PROPIEDADES QUE COMPITEN (Divisor) */}
            <Page size="A4" style={styles.page}>
                <View style={styles.backgroundPage}>
                    <Image
                        src="/pdf-assets/graphics/section-divider-bg-clean.png"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Foto del asesor superpuesta (dinámica por agente; default = Diego) */}
                    <Image src={advisorPhotoUrl} style={[styles.dividerPhoto, styles.dividerPhotoBottom]} />
                    <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: '50%' }]}>
                        <Text style={[styles.dividerTitle, { textAlign: 'left' }]}>
                            PROPIEDADES{'\n'}QUE{'\n'}COMPITEN
                        </Text>
                        <View style={[styles.dividerText, { width: '100%' }]}>
                            <Text style={{ fontSize: 13, lineHeight: 1.6 }}>
                                Sabemos lo valiosa que es tu propiedad y para asegurarnos de que consigas una
                                venta rápida y al mejor precio posible, veremos las propiedades con las que
                                competís directamente.
                            </Text>
                        </View>
                    </View>
                </View>
            </Page>

            {/* PAGE 6: SEMÁFORO DEL MERCADO */}
            <Page size="A4" style={styles.pageWithPadding}>
                <Text style={[styles.headerTitle, { position: 'absolute', top: 20, right: 40 }]}>
                    SEMÁFORO DEL MERCADO
                </Text>

                <View style={{ marginTop: 60 }}>
                    <View style={styles.divider} />

                    <Text style={styles.h2}>SEMÁFORO DEL MERCADO</Text>

                    <Text style={[styles.body, { marginBottom: 16 }]}>
                        En el camino hacia la venta exitosa, es clave estar en la zona correcta.
                    </Text>

                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        Queremos que tu propiedad brille en la zona verde, donde las oportunidades se convierten
                        en resultados, donde los sueños de los compradores coinciden con tu necesidad de vender.
                    </Text>

                    {/* Traffic Light Image */}
                    <View style={{ flexDirection: 'row', gap: 24, marginVertical: 24 }}>
                        <View style={{ flex: 1 }}>
                            <Image
                                src="/pdf-assets/graphics/traffic-light.png"
                                style={{ width: '100%', maxWidth: 200, height: 300, objectFit: 'contain' }}
                            />
                        </View>
                        <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.semaphoreRed }} />
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.semaphoreRed }}>
                                    ÁREA DE NO VENTA
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.semaphoreYellow }} />
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.semaphoreYellow }}>
                                    ÁREA DE PRUEBA
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.semaphoreGreen }} />
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.semaphoreGreen }}>
                                    ÁREA DE VENTA
                                </Text>
                            </View>
                        </View>
                    </View>

                    <Text style={[styles.body, { marginTop: 16, marginBottom: 8 }]}>
                        La línea de precio se crea a en base a información de:
                    </Text>

                    <View style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                            <View style={{ width: 12, height: 12, backgroundColor: colors.semaphoreRed, marginTop: 2 }} />
                            <Text style={[styles.body, { flex: 1 }]}>
                                Propiedades Publicadas nuevas y viejas que tienen un precio que las deja fuera de
                                mercado y están hace mucho tiempo publicadas.
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                            <View style={{ width: 12, height: 12, backgroundColor: colors.semaphoreYellow, marginTop: 2 }} />
                            <Text style={[styles.body, { flex: 1 }]}>
                                Propiedades Publicadas que están al límite aunque tienen potencial
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                            <View style={{ width: 12, height: 12, backgroundColor: colors.semaphoreGreen, marginTop: 2 }} />
                            <Text style={[styles.body, { flex: 1 }]}>
                                Precios de venta reales de propiedades.
                            </Text>
                        </View>
                    </View>
                </View>
            </Page>

            {/* PAGES 7+: COMPARABLES — 2 por página garantizado para evitar overlap */}
            {(() => {
                const pages = paginateBalanced(comparables, 2)
                return pages.map((pageComps, pageIndex) => {
                    const startGlobal = pages.slice(0, pageIndex).reduce((sum, p) => sum + p.length, 0)
                    return (
                    <Page key={`comparables-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                        <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                            <Text style={styles.headerTitle}>PROPIEDADES EN VENTA</Text>
                            <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                        </View>

                        <View style={{ marginTop: 70, gap: 28 }}>
                            {pageComps.map((comp, index) => {
                            const globalIndex = startGlobal + index
                                const homSurface = getHomogenizedSurface(comp)
                                const pricePerM2 = homSurface > 0 ? (comp.price || 0) / homSurface : 0

                                return (
                                    <View key={globalIndex} wrap={false} style={{
                                        flexDirection: 'row',
                                        gap: 16,
                                        paddingBottom: 16,
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#e2e8f0',
                                        borderBottomStyle: 'solid',
                                    }}>
                                        {/* Photo with semaphore */}
                                        <View style={{ position: 'relative', width: '32%' }}>
                                            {comp.images && comp.images[0] ? (
                                                <Image
                                                    src={comp.images[0]}
                                                    style={{
                                                        width: '100%',
                                                        height: 200,
                                                        objectFit: 'cover',
                                                        borderWidth: 1,
                                                        borderColor: colors.lightGray,
                                                        borderStyle: 'solid',
                                                    }}
                                                />
                                            ) : (
                                                <View style={{ width: '100%', height: 200, backgroundColor: colors.lightGray }} />
                                            )}
                                            {/* Semaphore indicator — configurable color */}
                                            <View style={{ position: 'absolute', top: 8, left: 8 }}>
                                                <View style={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 16,
                                                    backgroundColor: getSemaphoreColorValue(reportEdits?.semaphoreOverrides?.[`comparable-${globalIndex}`] || 'green'),
                                                    borderWidth: 2,
                                                    borderColor: colors.white,
                                                    borderStyle: 'solid',
                                                }} />
                                            </View>
                                        </View>

                                        {/* Info */}
                                        <View style={{ flex: 1, justifyContent: 'flex-start' }}>
                                            <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 14, marginBottom: 6 }]}>
                                                {extractAddress(comp.location || comp.title)}
                                            </Text>

                                            {/* Features grid — chips con borde para separación visual */}
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                                {(comp.features.coveredArea ?? 0) > 0 && (
                                                    <FeatureChip label={`${comp.features.coveredArea} m² cub.`} />
                                                )}
                                                {(comp.features.uncoveredArea ?? 0) > 0 && (
                                                    <FeatureChip label={`${comp.features.uncoveredArea} m² desc.`} />
                                                )}
                                                {comp.features.rooms ? <FeatureChip label={`${comp.features.rooms} amb.`} /> : null}
                                                {comp.features.bedrooms ? <FeatureChip label={`${comp.features.bedrooms} dorm.`} /> : null}
                                                {comp.features.bathrooms ? <FeatureChip label={`${comp.features.bathrooms} baños`} /> : null}
                                                <FeatureChip label={`${comp.features.age || 0} años`} />
                                            </View>

                                            {/* Price */}
                                            <View style={{ gap: 3, marginBottom: 10 }}>
                                                <View style={styles.priceBullet}>
                                                    <View style={styles.bullet} />
                                                    <Text style={styles.priceText}>
                                                        {formatCurrency(comp.price || 0, valuationResult.currency)}
                                                    </Text>
                                                </View>
                                                <View style={styles.priceBullet}>
                                                    <View style={styles.bullet} />
                                                    <Text style={styles.priceText}>
                                                        Valor del m² hom. {Math.round(pricePerM2).toLocaleString()} {valuationResult.currency}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Link */}
                                            <Link src={comp.url || '#'} style={{ textDecoration: 'none' }}>
                                                <View style={styles.comparableLink}>
                                                    <Text style={{ color: colors.white, fontSize: 9, fontWeight: 'bold' }}>VER PUBLICACIÓN →</Text>
                                                </View>
                                            </Link>

                                            {/* Metadata: fecha de publicación (oculta la línea si no hay fecha confiable) + visualizaciones */}
                                            {(() => {
                                                const pub = formatPublishedDate(comp.features.publishedDate as string)
                                                const views = comp.features.views ? `${comp.features.views} visualizaciones` : ''
                                                const meta = [pub, views].filter(Boolean).join(' · ')
                                                return meta ? (
                                                    <Text style={[styles.comparableMetadata, { marginTop: 6 }]}>{meta}</Text>
                                                ) : null
                                            })()}
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    </Page>
                    )
                })
            })()}

            {/* OVERPRICED PROPERTIES PAGES (if any) */}
            {overpriced.length > 0 && (() => {
                const pages = paginateBalanced(overpriced, 2)
                return pages.map((pageProps, pageIndex) => {
                    const startGlobal = pages.slice(0, pageIndex).reduce((sum, p) => sum + p.length, 0)
                    return (
                    <Page key={`overpriced-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                        <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                            <Text style={[styles.headerTitle, { color: colors.semaphoreRed }]}>PROPIEDADES FUERA DE PRECIO</Text>
                            <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                        </View>

                        <View style={{ marginTop: 70, gap: 24 }}>
                            {pageProps.map((prop, index) => {
                                const globalIndex = startGlobal + index
                                const homSurface = getHomogenizedSurface(prop)
                                const pricePerM2 = homSurface > 0 ? (prop.price || 0) / homSurface : 0

                                return (
                                    <View key={globalIndex} style={{ flexDirection: 'row', gap: 16 }}>
                                        {/* Photo with red semaphore */}
                                        <View style={{ position: 'relative', width: '35%' }}>
                                            {prop.images && prop.images[0] ? (
                                                <Image
                                                    src={prop.images[0]}
                                                    style={{ width: '100%', height: 160, objectFit: 'cover', border: `2px solid ${colors.semaphoreRed}` }}
                                                />
                                            ) : (
                                                <View style={{ width: '100%', height: 160, backgroundColor: '#fef2f2', border: `2px solid ${colors.semaphoreRed}` }} />
                                            )}
                                            {/* Semaphore indicator — configurable color */}
                                            <View style={{ position: 'absolute', top: 8, left: 8 }}>
                                                <View style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 18,
                                                    backgroundColor: getSemaphoreColorValue(reportEdits?.semaphoreOverrides?.[`overpriced-${globalIndex}`] || 'red'),
                                                    border: `2px solid ${colors.white}`
                                                }} />
                                            </View>
                                        </View>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 16, marginBottom: 8, color: colors.darkGray }]}>
                                                {prop.location || prop.title}
                                            </Text>

                                            {/* Basic features */}
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                                {prop.features.coveredArea && (
                                                    <Text style={styles.featureText}>■ {prop.features.coveredArea}m² cub.</Text>
                                                )}
                                                {(prop.features.uncoveredArea ?? 0) > 0 && (
                                                    <Text style={styles.featureText}>■ {prop.features.uncoveredArea}m² desc.</Text>
                                                )}
                                                {prop.features.rooms && (
                                                    <Text style={styles.featureText}>■ {prop.features.rooms} Amb.</Text>
                                                )}
                                            </View>

                                            {/* Price */}
                                            <View style={{ gap: 2, marginBottom: 8 }}>
                                                <View style={styles.priceBullet}>
                                                    <View style={[styles.bullet, { backgroundColor: colors.semaphoreRed }]} />
                                                    <Text style={[styles.priceText, { color: colors.semaphoreRed }]}>
                                                        {formatCurrency(prop.price || 0, valuationResult.currency)}
                                                    </Text>
                                                </View>
                                                {pricePerM2 > 0 && (
                                                    <View style={styles.priceBullet}>
                                                        <View style={[styles.bullet, { backgroundColor: colors.semaphoreRed }]} />
                                                        <Text style={[styles.priceText, { color: colors.semaphoreRed }]}>
                                                            {Math.round(pricePerM2).toLocaleString()} {valuationResult.currency}/m²
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Link */}
                                            <Link src={prop.url || '#'} style={styles.comparableLink}>
                                                LINK DE LA PROPIEDAD
                                            </Link>

                                            {/* Overpriced label */}
                                            <Text style={{ fontSize: 9, color: colors.semaphoreRed, fontWeight: 'bold', marginTop: 4 }}>
                                                FUERA DE PRECIO
                                            </Text>
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    </Page>
                    )
                })
            })()}

            {/* PAGE 9: MAPA DE VALOR (Valuation Table) - CRITICAL */}

            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>PROPIEDADES EN VENTA</Text>
                </View>

                <Text style={[styles.h3, { marginTop: 40, fontSize: 16 }]}>DEPARTAMENTO</Text>
                <View style={styles.divider} />

                <Text style={styles.h2}>Mapa de Valor</Text>
                <Text style={[styles.body, { marginBottom: 12 }]}>
                    {reportEdits?.analysisMethodText || 'Para tasar la propiedad se utilizó el método de comparables. Se toman propiedades similares a valor correcto de mercado y se comparan variables como superficie, ubicación, piso, disposición, antigüedad, estado de conservación y calidad constructiva.'}
                </Text>

                {/* Valuation Table — complete with all property data + coefficients */}
                <View style={{ marginVertical: 8, border: `1px solid ${colors.darkGray}` }}>
                    {/* Table Header */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#f5ead6', borderBottom: `1px solid ${colors.darkGray}` }}>
                        <Text style={{ width: '12%', fontSize: 5, fontWeight: 'bold', padding: 2 }}>Comparable</Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right' }}>Valor</Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>M²{'\n'}Cub.</Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>M²{'\n'}Desc.</Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>M²{'\n'}Hom.</Text>
                        <Text style={{ width: '4%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Edad</Text>
                        <Text style={{ width: '4%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Amb.</Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right' }}>$/m²</Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Ubic.</Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Piso</Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Disp.</Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Edad{'\n'}Estado</Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Cal.{'\n'}Const.</Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center' }}>Total</Text>
                        <Text style={{ width: '8%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right' }}>$/m²{'\n'}Result.</Text>
                    </View>

                    {/* Subject Row */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#e8f4fd', borderBottom: `1.5px solid ${colors.primary}` }}>
                        <Text style={{ width: '12%', fontSize: 5, fontWeight: 'bold', padding: 2, color: colors.primary }}>
                            {(subject.location || 'Sujeto').slice(0, 26)}
                        </Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right', color: colors.primary }}>
                            {formatCurrency(recommendedPrice, valuationResult.currency)}
                        </Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {subject.features.coveredArea || '-'}
                        </Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {subject.features.uncoveredArea || '-'}
                        </Text>
                        <Text style={{ width: '5%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectSurface.toFixed(0)}
                        </Text>
                        <Text style={{ width: '4%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {subject.features.age ?? '-'}
                        </Text>
                        <Text style={{ width: '4%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {subject.features.rooms || '-'}
                        </Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right', color: colors.primary }}>
                            {Math.round(valuationResult.subjectPriceM2).toLocaleString()}
                        </Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectLocationCoef.toFixed(2)}
                        </Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectFloorCoef.toFixed(2)}
                        </Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectDispositionCoef.toFixed(2)}
                        </Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectAgeCoef.toFixed(4)}
                        </Text>
                        <Text style={{ width: '7%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectQualityCoef.toFixed(2)}
                        </Text>
                        <Text style={{ width: '6%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'center', color: colors.primary }}>
                            {valuationResult.subjectTotalCoef.toFixed(4)}
                        </Text>
                        <Text style={{ width: '8%', fontSize: 5, fontWeight: 'bold', padding: 2, textAlign: 'right', color: colors.primary }}>
                            {Math.round(valuationResult.subjectPriceM2).toLocaleString()}
                        </Text>
                    </View>

                    {/* Comparable Rows */}
                    {valuationResult.comparableAnalysis.map((analysis, index) => {
                        // Fallback a `comparables[index]`: al previsualizar una tasación GUARDADA,
                        // el valuation_result viene sin `analysis.property` (se quita al guardar),
                        // y sin esto la tabla muestra Valor "0k" y M²/Edad/Amb en "-".
                        const prop = analysis.property || comparables[index] || ({} as typeof analysis.property)
                        const propFeatures = (prop?.features || {}) as Record<string, number | undefined | null>
                        return (
                        <View key={index} style={{ flexDirection: 'row', borderBottom: `0.5px solid ${colors.lightGray}`, backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <Text style={{ width: '12%', fontSize: 5, padding: 2 }}>
                                {(prop.location || `Comp. ${index + 1}`).slice(0, 26)}
                            </Text>
                            <Text style={{ width: '7%', fontSize: 5, padding: 2, textAlign: 'right' }}>
                                {((prop.price || 0) / 1000).toFixed(0)}k
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {propFeatures.coveredArea || '-'}
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {propFeatures.uncoveredArea || '-'}
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.homogenizedSurface.toFixed(0)}
                            </Text>
                            <Text style={{ width: '4%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {propFeatures.age ?? '-'}
                            </Text>
                            <Text style={{ width: '4%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {propFeatures.rooms || '-'}
                            </Text>
                            <Text style={{ width: '7%', fontSize: 5, padding: 2, textAlign: 'right' }}>
                                {Math.round(analysis.originalPriceM2).toLocaleString()}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.locationCoefficient.toFixed(2)}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.floorCoefficient.toFixed(2)}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.dispositionCoefficient.toFixed(2)}
                            </Text>
                            <Text style={{ width: '7%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.ageCoefficient.toFixed(4)}
                            </Text>
                            <Text style={{ width: '7%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.qualityCoefficient.toFixed(2)}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 5, padding: 2, textAlign: 'center', fontWeight: 'bold' }}>
                                {analysis.totalCoefficient.toFixed(4)}
                            </Text>
                            <Text style={{ width: '8%', fontSize: 5, padding: 2, textAlign: 'right', fontWeight: 'bold' }}>
                                {Math.round(analysis.adjustedPriceM2).toLocaleString()}
                            </Text>
                        </View>
                        )
                    })}

                    {/* Average Row */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#f5ead6', borderTop: `1px solid ${colors.darkGray}` }}>
                        <Text style={{ width: '92%', fontSize: 6, fontWeight: 'bold', padding: 3, textAlign: 'right' }}>
                            Promedio $/m² Ajustado:
                        </Text>
                        <Text style={{ width: '8%', fontSize: 7, fontWeight: 'bold', padding: 3, textAlign: 'right', color: colors.primary }}>
                            {Math.round(valuationResult.averagePriceM2).toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* Price boxes */}
                <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
                    <View style={{ flex: 1, padding: 12, backgroundColor: colors.semaphoreGreen, alignItems: 'center', borderRadius: 4 }}>
                        <Text style={{ fontSize: 7, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>PRECIO DE PUBLICACIÓN</Text>
                        <Text style={{ fontSize: 16, color: colors.white, fontWeight: 'bold', marginTop: 4 }}>
                            {formatCurrency(recommendedPrice, valuationResult.currency)}
                        </Text>
                    </View>
                    <View style={{ flex: 1, padding: 12, backgroundColor: colors.semaphoreRed, alignItems: 'center', borderRadius: 4 }}>
                        <Text style={{ fontSize: 7, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>ZONA DE NO VENTA</Text>
                        <Text style={{ fontSize: 16, color: colors.white, fontWeight: 'bold', marginTop: 4 }}>
                            {formatCurrency(noSaleZone, valuationResult.currency)}
                        </Text>
                    </View>
                </View>

                {/* Analysis */}
                <Text style={[styles.h2, { fontSize: 18 }]}>Análisis</Text>
                {reportEdits?.analysisText ? (
                    // El analysisText editable YA incluye la frase de cierre ("Una buena
                    // tasación..."), así que NO se agrega la línea estática (evita duplicado).
                    <Text style={styles.body}>{reportEdits.analysisText}</Text>
                ) : (
                    <>
                        <Text style={styles.body}>
                            Debido a la competencia para tener visitas y potencial de venta la propiedad se debería publicar en <Text style={{ color: colors.semaphoreGreen, fontWeight: 'bold' }}>{formatCurrency(recommendedPrice, valuationResult.currency)}.</Text>
                        </Text>
                        <Text style={[styles.body, { marginTop: 8 }]}>
                            Una buena tasación siempre es vender al mejor valor que el mercado convalide en un plazo de 2 meses.
                        </Text>
                    </>
                )}
            </Page>

            {/* PAGE 10: COSTOS DE VENTA — solo si NO hay propiedades de compra */}
            {purchaseProperties.length === 0 && (
            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>COSTOS DE VENTA</Text>
                </View>

                <View style={{ marginTop: 50 }}>
                    {/* Title */}
                    <Text style={styles.h2}>
                        Venta {subject.features.rooms ? `${subject.features.rooms} Ambientes` : ''} | {neighborhood}
                    </Text>

                    <View style={styles.divider} />

                    {/* Three value boxes */}
                    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
                        <View style={{ flex: 1, padding: 14, backgroundColor: colors.primary, alignItems: 'center', borderRadius: 4 }}>
                            <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>VALOR PUBLICACIÓN</Text>
                            <Text style={{ fontSize: 18, color: colors.white, fontWeight: 'bold', marginTop: 6 }}>
                                {formatCurrency(recommendedPrice, valuationResult.currency)}
                            </Text>
                        </View>
                        <View style={{ flex: 1, padding: 14, backgroundColor: colors.semaphoreGreen, alignItems: 'center', borderRadius: 4 }}>
                            <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>VALOR VENTA (-{valuationResult.expenseRates?.saleDiscountPercent ?? 5}%)</Text>
                            <Text style={{ fontSize: 18, color: colors.white, fontWeight: 'bold', marginTop: 6 }}>
                                {formatCurrency(saleValueDisplay, valuationResult.currency)}
                            </Text>
                        </View>
                        <View style={{ flex: 1, padding: 14, backgroundColor: '#6b7280', alignItems: 'center', borderRadius: 4 }}>
                            <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>VALOR ESCRITURA (-{valuationResult.expenseRates?.deedDiscountPercent ?? 30}%)</Text>
                            <Text style={{ fontSize: 18, color: colors.white, fontWeight: 'bold', marginTop: 6 }}>
                                {formatCurrency(valuationResult.deedValue, valuationResult.currency)}
                            </Text>
                        </View>
                    </View>

                    {/* Expenses Table */}
                    <View style={{ marginTop: 20, border: `1px solid ${colors.darkGray}` }}>
                        {/* Table Header */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#f5ead6', borderBottom: `1px solid ${colors.darkGray}` }}>
                            <Text style={{ width: '50%', fontSize: 9, fontWeight: 'bold', padding: 6 }}>Gastos de Venta</Text>
                            <Text style={{ width: '25%', fontSize: 9, fontWeight: 'bold', padding: 6, textAlign: 'center' }}>%</Text>
                            <Text style={{ width: '25%', fontSize: 9, fontWeight: 'bold', padding: 6, textAlign: 'right' }}>Monto</Text>
                        </View>

                        {/* Sellos */}
                        <View style={{ flexDirection: 'row', borderBottom: `0.5px solid ${colors.lightGray}` }}>
                            <Text style={{ width: '50%', fontSize: 10, padding: 6 }}>Sellos</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'center', color: colors.mediumGray }}>{valuationResult.expenseRates?.stampsPercent ?? 1.35}% s/escritura</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'right', fontWeight: 'bold' }}>
                                {formatCurrency(valuationResult.stampsCost, valuationResult.currency)}
                            </Text>
                        </View>

                        {/* Gastos de Escritura */}
                        <View style={{ flexDirection: 'row', borderBottom: `0.5px solid ${colors.lightGray}` }}>
                            <Text style={{ width: '50%', fontSize: 10, padding: 6 }}>Gastos de Escritura</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'center', color: colors.mediumGray }}>{valuationResult.expenseRates?.deedExpensesPercent ?? 1.5}% s/venta</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'right', fontWeight: 'bold' }}>
                                {formatCurrency(valuationResult.deedExpenses, valuationResult.currency)}
                            </Text>
                        </View>

                        {/* Honorarios */}
                        <View style={{ flexDirection: 'row', borderBottom: `1px solid ${colors.darkGray}` }}>
                            <Text style={{ width: '50%', fontSize: 10, padding: 6 }}>Honorarios Inmobiliaria</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'center', color: colors.mediumGray }}>{valuationResult.expenseRates?.agencyFeesPercent ?? 3}% s/venta</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6, textAlign: 'right', fontWeight: 'bold' }}>
                                {formatCurrency(valuationResult.agencyFees, valuationResult.currency)}
                            </Text>
                        </View>

                        {/* Total */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#fef2f2' }}>
                            <Text style={{ width: '50%', fontSize: 10, fontWeight: 'bold', padding: 6 }}>Total gastos de venta</Text>
                            <Text style={{ width: '25%', fontSize: 10, padding: 6 }}></Text>
                            <Text style={{ width: '25%', fontSize: 10, fontWeight: 'bold', padding: 6, textAlign: 'right', color: colors.semaphoreRed }}>
                                {formatCurrency(valuationResult.totalExpenses, valuationResult.currency)}
                            </Text>
                        </View>
                    </View>

                    {/* Money in Hand */}
                    <View style={{ marginTop: 20, padding: 16, backgroundColor: '#ecfdf5', borderRadius: 4, border: `1px solid ${colors.semaphoreGreen}`, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#065f46' }}>Dinero luego de venta</Text>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.semaphoreGreen }}>
                            {formatCurrency(valuationResult.moneyInHand, valuationResult.currency)}
                        </Text>
                    </View>
                </View>
            </Page>
            )}

            {/* PURCHASE PROPERTIES SECTION (conditional) */}
            {purchaseProperties.length > 0 && (
                <>
                    {/* PURCHASE DIVIDER PAGE — fondo sin persona + foto del asesor
                        superpuesta (dinámica por agente; default = Diego). */}
                    <Page size="A4" style={styles.page}>
                        <View style={styles.backgroundPage}>
                            <Image
                                src="/pdf-assets/graphics/section-divider-bg-clean.png"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <Image src={advisorPhotoUrl} style={[styles.dividerPhoto, styles.dividerPhotoBottom]} />
                            <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: '50%' }]}>
                                <Text style={[styles.dividerTitle, { textAlign: 'left' }]}>
                                    PROPIEDADES{'\n'}PARA{'\n'}COMPRA
                                </Text>
                            </View>
                        </View>
                    </Page>

                    {/* PURCHASE PROPERTY CARDS — 2 por página (mismo layout que
                        "PROPIEDADES QUE COMPITEN"). Antes cada propiedad ocupaba una
                        página entera; ahora se paginan en tarjetas tipo fila para
                        optimizar el espacio. Sin semáforo (no aplica a compra). */}
                    {(() => {
                        const pages = paginateBalanced(purchaseProperties, 2)
                        return pages.map((pageProps, pageIndex) => {
                            const startGlobal = pages.slice(0, pageIndex).reduce((sum, p) => sum + p.length, 0)
                            return (
                            <Page key={`purchase-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                                    <Text style={[styles.headerTitle, { color: colors.primary }]}>PROPIEDADES EN VENTA</Text>
                                    <Text style={styles.headerSubtitle}>CABA</Text>
                                </View>

                                <View style={{ marginTop: 70, gap: 28 }}>
                                    {pageProps.map((prop, index) => {
                                        const globalIndex = startGlobal + index
                                        const homSurface = getHomogenizedSurface(prop)
                                        const pricePerM2 = homSurface > 0 ? (prop.price || 0) / homSurface : 0

                                        return (
                                            <View key={globalIndex} wrap={false} style={{
                                                flexDirection: 'row',
                                                gap: 16,
                                                paddingBottom: 16,
                                                borderBottomWidth: 1,
                                                borderBottomColor: '#e2e8f0',
                                                borderBottomStyle: 'solid',
                                            }}>
                                                {/* Photo con semáforo configurable (default verde; el asesor puede poner amarillo/rojo) */}
                                                <View style={{ position: 'relative', width: '32%' }}>
                                                    {prop.images && prop.images[0] ? (
                                                        <Image
                                                            src={prop.images[0]}
                                                            style={{
                                                                width: '100%',
                                                                height: 200,
                                                                objectFit: 'cover',
                                                                borderWidth: 1,
                                                                borderColor: colors.lightGray,
                                                                borderStyle: 'solid',
                                                            }}
                                                        />
                                                    ) : (
                                                        <View style={{ width: '100%', height: 200, backgroundColor: colors.lightGray }} />
                                                    )}
                                                    <View style={{ position: 'absolute', top: 8, left: 8 }}>
                                                        <View style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 16,
                                                            backgroundColor: getSemaphoreColorValue(reportEdits?.semaphoreOverrides?.[`purchase-${globalIndex}`] || 'green'),
                                                            borderWidth: 2,
                                                            borderColor: colors.white,
                                                            borderStyle: 'solid',
                                                        }} />
                                                    </View>
                                                </View>

                                                {/* Info */}
                                                <View style={{ flex: 1, justifyContent: 'flex-start' }}>
                                                    <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 14, marginBottom: 6 }]}>
                                                        {extractAddress(prop.location || prop.title)}
                                                    </Text>

                                                    {/* Features grid — chips con borde (igual que comparables) */}
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                                        {(prop.features.coveredArea ?? 0) > 0 && (
                                                            <FeatureChip label={`${prop.features.coveredArea} m² cub.`} />
                                                        )}
                                                        {(prop.features.uncoveredArea ?? 0) > 0 && (
                                                            <FeatureChip label={`${prop.features.uncoveredArea} m² desc.`} />
                                                        )}
                                                        {prop.features.rooms ? <FeatureChip label={`${prop.features.rooms} amb.`} /> : null}
                                                        {prop.features.bedrooms ? <FeatureChip label={`${prop.features.bedrooms} dorm.`} /> : null}
                                                        {prop.features.bathrooms ? <FeatureChip label={`${prop.features.bathrooms} baños`} /> : null}
                                                        <FeatureChip label={`${prop.features.age || 0} años`} />
                                                    </View>

                                                    {/* Price */}
                                                    <View style={{ gap: 3, marginBottom: 10 }}>
                                                        <View style={styles.priceBullet}>
                                                            <View style={styles.bullet} />
                                                            <Text style={styles.priceText}>
                                                                {formatCurrency(prop.price || 0, valuationResult.currency)}
                                                            </Text>
                                                        </View>
                                                        {pricePerM2 > 0 && (
                                                            <View style={styles.priceBullet}>
                                                                <View style={styles.bullet} />
                                                                <Text style={styles.priceText}>
                                                                    Valor del m² {Math.round(pricePerM2).toLocaleString()} {valuationResult.currency}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>

                                                    {/* Link como botón consistente con comparables */}
                                                    <Link src={prop.url || '#'} style={{ textDecoration: 'none' }}>
                                                        <View style={styles.comparableLink}>
                                                            <Text style={{ color: colors.white, fontSize: 9, fontWeight: 'bold' }}>VER PUBLICACIÓN →</Text>
                                                        </View>
                                                    </Link>
                                                </View>
                                            </View>
                                        )
                                    })}
                                </View>
                            </Page>
                            )
                        })
                    })()}

                    {/* SIMULATION DIVIDER PAGE — SIEMPRE (toda tasación tiene gastos e
                        impuestos de venta). Antes se gateaba detrás de purchaseScenarios y
                        desaparecía por completo en una tasación de venta normal. */}
                    {valuationResult && (
                        <Page size="A4" style={styles.page}>
                            <View style={styles.backgroundPage}>
                                <Image
                                    src="/pdf-assets/graphics/section-divider-bg-clean.png"
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <Image src={advisorPhotoUrl} style={[styles.dividerPhoto, styles.dividerPhotoBottom]} />
                                <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: '50%' }]}>
                                    <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 30 }]}>
                                        SIMULACIÓN{'\n'}GASTOS E{'\n'}IMPUESTOS
                                    </Text>
                                </View>
                            </View>
                        </Page>
                    )}

                    {/* SALE EXPENSES/TAXES PAGE — SaleSimTable (sellos, gastos escritura,
                        honorarios, total, dinero en mano) se muestra SIEMPRE. Los escenarios
                        de compra sólo si existen. Antes TODA esta página se gateaba detrás de
                        purchaseScenarios → era la causa de "el PDF no muestra impuestos". */}
                    {valuationResult && (() => {
                        const allScenarios = valuationResult.purchaseScenarios || []
                        const fallbackIds = allScenarios.map(s => s.id)
                        const selectedIds = valuationResult.selectedScenarioIds && valuationResult.selectedScenarioIds.length > 0
                            ? valuationResult.selectedScenarioIds
                            : fallbackIds
                        const visibleScenarios = allScenarios.filter(s => selectedIds.includes(s.id))
                        // Mostrar el propertyLabel en el header sólo si hay propiedades distintas en las columnas.
                        const uniquePropertyKeys = new Set(visibleScenarios.map(s => s.propertyKey))
                        const showPropertyLabel = uniquePropertyKeys.size > 1
                        return (
                            <Page size="A4" style={styles.pageWithPadding}>
                                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                                    <Text style={styles.headerTitle}>SIMULACIÓN GASTOS E IMPUESTOS</Text>
                                </View>
                                <View style={{ marginTop: 60 }}>
                                    <SaleSimTable valuationResult={valuationResult} subject={subject} neighborhood={neighborhood} pubDisplay={recommendedPrice} saleDisplay={saleValueDisplay} />
                                    {visibleScenarios.length > 0 && (
                                        <View style={{ marginTop: 16 }}>
                                            <Text style={[styles.h3, { fontSize: 20, marginBottom: 12, textAlign: 'center' }]}>Escenarios de Compra</Text>
                                            {/* Distribución uniforme: flex: 1 reparte el ancho disponible entre N escenarios.
                                                Si entran muchos, el flexWrap los baja a una segunda fila manteniendo gap. */}
                                            <View style={{
                                                flexDirection: 'row',
                                                gap: 12,
                                                flexWrap: 'wrap',
                                                alignItems: 'flex-start',
                                            }}>
                                                {visibleScenarios.map(scenario => (
                                                    <PurchaseSimTable
                                                        key={scenario.id}
                                                        scenario={scenario}
                                                        currency={valuationResult.currency}
                                                        showPropertyLabel={showPropertyLabel}
                                                    />
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </Page>
                        )
                    })()}

                    {/* FALLBACK LEGACY: tabla side-by-side si no hay scenarios pero sí purchaseResult */}
                    {(!valuationResult.purchaseScenarios || valuationResult.purchaseScenarios.length === 0) && purchaseResult && (
                        <Page size="A4" style={styles.pageWithPadding}>
                            <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                                <Text style={styles.headerTitle}>PROPIEDADES EN VENTA</Text>
                            </View>

                            <View style={{ marginTop: 60 }}>
                                <Text style={[styles.h2, { textAlign: 'center', marginBottom: 24 }]}>
                                    SIMULACIÓN DE COMPRA y VENTA
                                </Text>

                                {/* Side-by-side tables */}
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    {/* SALE TABLE */}
                                    <View style={{ flex: 1 }}>
                                        {/* Header */}
                                        <View style={{ backgroundColor: '#fff3e0', padding: 6, borderWidth: 1, borderColor: colors.orange, marginBottom: 0 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}>
                                                VENTA {subject.features.rooms ? `${subject.features.rooms} AMBIENTES` : ''} | {neighborhood}
                                            </Text>
                                        </View>
                                        {/* Values row */}
                                        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Publicación</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {recommendedPrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Venta</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {saleValueDisplay.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4 }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Escritura</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {valuationResult.deedValue.toLocaleString()}</Text>
                                            </View>
                                        </View>
                                        {/* Gastos de venta header */}
                                        <View style={{ backgroundColor: '#e8f4fd', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold', textAlign: 'center' }}>Gastos de venta</Text>
                                        </View>
                                        {/* Sale expense rows */}
                                        {[
                                            { label: `Sellos ${valuationResult.expenseRates.stampsPercent}%`, value: valuationResult.stampsCost },
                                            { label: `Gastos Escritura ${valuationResult.expenseRates.deedExpensesPercent}%`, value: valuationResult.deedExpenses },
                                            { label: `Honorarios Inmobiliaria ${valuationResult.expenseRates.agencyFeesPercent}%`, value: valuationResult.agencyFees },
                                        ].map((row, i) => (
                                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                                <Text style={{ fontSize: 7 }}>{row.label}</Text>
                                                <Text style={{ fontSize: 7 }}>USD {row.value.toLocaleString()}</Text>
                                            </View>
                                        ))}
                                        {/* Total */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.darkGray, borderTopWidth: 0, backgroundColor: '#f5f5f5' }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>Total gastos venta</Text>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>USD {valuationResult.totalExpenses.toLocaleString()}</Text>
                                        </View>
                                        {/* Money after sale */}
                                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#ecfdf5', borderRadius: 2 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#065f46' }}>Dinero luego de venta</Text>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.semaphoreGreen }}>USD {valuationResult.moneyInHand.toLocaleString()}</Text>
                                        </View>
                                    </View>

                                    {/* PURCHASE TABLE */}
                                    <View style={{ flex: 1 }}>
                                        {/* Header */}
                                        <View style={{ backgroundColor: '#e8f4fd', padding: 6, borderWidth: 1, borderColor: colors.primary, marginBottom: 0 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}>
                                                COMPRA {purchaseResult.selectedPropertyTitle ? `| ${purchaseResult.selectedPropertyTitle}` : 'AMBIENTES'}
                                            </Text>
                                        </View>
                                        {/* Values row */}
                                        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Publicación</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {purchaseResult.publicationPrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Compra</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {purchaseResult.purchasePrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4 }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Escritura</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>USD {purchaseResult.deedValue.toLocaleString()}</Text>
                                            </View>
                                        </View>
                                        {/* Gastos de compra header */}
                                        <View style={{ backgroundColor: '#e8f4fd', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold', textAlign: 'center' }}>Gastos de Compra</Text>
                                        </View>
                                        {/* Purchase expense rows */}
                                        {[
                                            { label: `Sellos ${purchaseResult.purchaseExpenseRates.stampsPercent}%`, value: purchaseResult.stampsCost },
                                            { label: `Honorarios de Escribano ${purchaseResult.purchaseExpenseRates.notaryFeesPercent}%`, value: purchaseResult.notaryFees },
                                            { label: `Gastos de Escritura ${purchaseResult.purchaseExpenseRates.deedExpensesPercent}%`, value: purchaseResult.deedExpenses },
                                            { label: `Honorarios Inmobiliaria ${purchaseResult.purchaseExpenseRates.buyerCommissionPercent}%`, value: purchaseResult.buyerCommission },
                                        ].map((row, i) => (
                                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                                                <Text style={{ fontSize: 7 }}>{row.label}</Text>
                                                <Text style={{ fontSize: 7 }}>USD {row.value.toLocaleString()}</Text>
                                            </View>
                                        ))}
                                        {/* Total */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.darkGray, borderTopWidth: 0, backgroundColor: '#f5f5f5' }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>Total gastos compra</Text>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>USD {purchaseResult.totalPurchaseCosts.toLocaleString()}</Text>
                                        </View>
                                        {/* Cost of purchase */}
                                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#eff6ff', borderRadius: 2 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#1e40af' }}>Costo de compra</Text>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.primary }}>USD {purchaseResult.totalCostWithPurchase.toLocaleString()}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </Page>
                    )}
                </>
            )}

            {/* PAGE 11: ESTRATEGIA DE VENTA (Divisor) */}
            <Page size="A4" style={styles.page}>
                <View style={styles.backgroundPage}>
                    <Image
                        src="/pdf-assets/graphics/section-divider-bg-clean.png"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <Image src={advisorPhotoUrl} style={[styles.dividerPhoto, styles.dividerPhotoBottom]} />
                    <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: '50%' }]}>
                        <Text style={[styles.dividerTitle, { textAlign: 'left' }]}>
                            ESTRATEGIA{'\n'}DE VENTA
                        </Text>
                    </View>
                </View>
            </Page>

            {/* PAGE 11: ESTRATEGIA */}
            <Page size="A4" style={styles.pageWithPadding}>
                <Text style={[styles.headerTitle, { position: 'absolute', top: 20, right: 40 }]}>ESTRATEGIA</Text>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>Estrategia de Precio</Text>

                    {reportEdits?.strategyPriceText ? (
                        <Text style={[styles.body, { marginBottom: 24 }]}>{reportEdits.strategyPriceText}</Text>
                    ) : (
                        <>
                            <Text style={styles.body}>
                                El valor de publicación recomendado es: <Text style={{ color: colors.semaphoreGreen, fontWeight: 'bold' }}>{formatCurrency(recommendedPrice, valuationResult.currency)}.</Text>
                            </Text>
                            <Text style={[styles.body, { marginTop: 8, marginBottom: 16 }]}>
                                Hoy las propiedades que están en un valor interesante para el mercado tienen cerca de 8 visitas
                                mensuales y con el método por etapas, cada 10 visitas hay una reserva en promedio.
                            </Text>
                        </>
                    )}

                    <Text style={styles.h2}>Máxima Difusión</Text>
                    <Text style={[styles.body, { marginBottom: reportEdits?.strategyDiffusionText ? 24 : 12 }]}>
                        {reportEdits?.strategyDiffusionText || 'Tu propiedad merece tener máxima difusión. Que la vean en excelencia, todos los potenciales compradores. Para ello haremos fotos, video, tour virtual con profesional, publicaremos en todos los portales inmobiliarios de forma destacada, crearemos una página web para la propiedad y haremos campañas publicitarias en las redes sociales. Con esta estrategia tu propiedad la verán el triple de potenciales compradores.'}
                    </Text>
                    {/* La frase de cierre solo cuando NO hay strategyDiffusionText editable
                        (el default editable ya la incluye → evita duplicado). */}
                    {!reportEdits?.strategyDiffusionText && (
                        <Text style={[styles.body, { marginBottom: 24 }]}>
                            Si tenés el precio adecuado y máxima difusión, vas a tener consultas y visitas a tu propiedad.
                        </Text>
                    )}

                    <Text style={styles.h2}>Seguimiento y Mejora Continua</Text>
                    <Text style={styles.body}>
                        {reportEdits?.strategyFollowupText || 'Cada 15 días se harán informes de gestión quincenal donde te enviaremos las métricas de los portales, la información que dejaron los compradores en la ficha de visitas y un análisis con la mejora que debemos realizar en la estrategia para lograr vender en los próximos 15 días.'}
                    </Text>
                </View>
            </Page>

            {/* PAGE 12: TERMS & CONDITIONS */}
            <Page size="A4" style={styles.pageWithPadding}>
                <Text style={[styles.headerTitle, { position: 'absolute', top: 20, right: 40 }]}>DATOS REFERENCIALES</Text>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h3}>Autorización Exclusiva, Compartida</Text>
                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        {reportEdits?.authorizationText || 'La autorización es exclusiva y la propiedad se compartirá con todas las inmobiliarias. Seré el máximo responsable e interlocutor principal para que se logre la operación exitosamente. El plazo de la autorización para conseguir resultados óptimos es de 120 días.'}
                    </Text>

                    <Text style={styles.h3}>Honorarios</Text>
                    <Text style={[styles.body, { marginBottom: 32 }]}>
                        {reportEdits?.feesText || 'La retribución en concepto de honorarios por el servicio a brindar es del 3% (tres por ciento), calculado sobre el monto de venta final de la operación.'}
                    </Text>

                    {/* Branding Section — sin duplicar el texto que ya está dentro del logo */}
                    <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center', marginTop: 24 }}>
                        <View style={{ flex: 1 }}>
                            <Image
                                src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                                style={{ height: 80, width: '100%', objectFit: 'contain' }}
                            />

                            <Link src="https://diegoferreyraInmobiliaria.com/" style={{ fontSize: 12, color: colors.primary, textAlign: 'center', marginTop: 16, textDecoration: 'underline' }}>
                                diegoferreyraInmobiliaria.com
                            </Link>
                        </View>

                        <View style={{ width: 260 }}>
                            <Image
                                src={advisorPhotoUrl}
                                style={{ width: '100%', height: 320, objectFit: 'cover', objectPosition: 'top' }}
                            />
                        </View>
                    </View>
                </View>
            </Page>

            {/* PAGE 13: BACK COVER — sin texto duplicado y sin emojis no soportados */}
            <Page size="A4" style={[styles.page, { justifyContent: 'center', alignItems: 'center', padding: 60 }]}>
                {/* Circular Photo */}
                <View style={{
                    width: 180, height: 180, borderRadius: 90, overflow: 'hidden',
                    borderWidth: 4, borderColor: colors.primary, borderStyle: 'solid',
                    marginBottom: 40,
                }}>
                    <Image
                        src={advisorPhotoUrl}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                    />
                </View>

                {/* Logo — el texto "Martillero Público - CUCICBA 8266" ya está integrado en el PNG */}
                <Image
                    src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                    style={{ height: 90, width: 340, objectFit: 'contain', marginBottom: 28 }}
                />

                {/* Website */}
                <Link src="https://diegoferreyraInmobiliaria.com/" style={{ fontSize: 14, color: colors.primary, textDecoration: 'underline' }}>
                    diegoferreyraInmobiliaria.com
                </Link>
            </Page>
        </Document>
    )
}
