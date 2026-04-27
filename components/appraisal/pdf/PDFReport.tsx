'use client'

import React from 'react'
import { Document, Page, Text, View, Image, Link, Svg, Path, Circle as SvgCircle, Rect as SvgRect } from '@react-pdf/renderer'
import { ValuationProperty, ValuationResult, PurchaseResult } from '@/lib/valuation/calculator'
import { formatCurrency } from '@/lib/valuation/utils'
import { styles, colors } from './PDFStyles'
import { ReportEdits, SemaphoreColor } from '@/lib/types/report-edits'
import { extractAddress } from '@/lib/valuation/addressUtils'

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

export function PDFReportDocument({ subject, comparables, valuationResult, overpriced = [], purchaseProperties = [], purchaseResult, marketImageLabels = {}, marketImageUrls = {}, reportEdits }: PDFReportProps) {
    const neighborhood = extractNeighborhood(subject.location || '')
    const recommendedPrice = valuationResult.publicationPrice
    const noSaleZone = valuationResult.noSaleZonePrice

    // Helper: calculate homogenized surface for a comparable
    const getHomogenizedSurface = (comp: ValuationProperty) => {
        const covered = comp.features.coveredArea || 0
        const semi = comp.features.semiCoveredArea || 0
        const uncovered = comp.features.uncoveredArea || 0
        return covered + (semi * 0.5) + (uncovered * 0.5)
    }

    return (
        <Document>
            {/* PAGE 1: PORTADA */}
            <Page size="A4" style={styles.page}>
                {/* Top section - centered content */}
                <View style={{ paddingHorizontal: 60, paddingTop: 50, alignItems: 'center' }}>
                    {/* Title */}
                    <Text style={[styles.h1, { color: colors.primary, fontSize: 28, letterSpacing: 4 }]}>
                        {reportEdits?.coverTitle || 'INFORME DE TASACIÓN'}
                    </Text>

                    {/* Property Title */}
                    <Text style={[styles.propertyTitle, { marginTop: 16, fontSize: 32 }]}>
                        {reportEdits?.coverPropertyTitle || extractAddress(subject.location || subject.title)}
                    </Text>

                    {/* Three Institutional Logos */}
                    <View style={[styles.logosRow, { marginTop: 30 }]}>
                        <Image
                            src="/pdf-assets/logos/logos-institucionales.png"
                            style={{ height: 50, width: 240, objectFit: 'contain' }}
                        />
                    </View>

                    {/* Diego Ferreyra Logo - prominent */}
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <Image
                            src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                            style={{ height: 100, width: 350, objectFit: 'contain' }}
                        />
                        <Text style={{ fontSize: 13, color: colors.mediumGray, fontStyle: 'italic', marginTop: 8 }}>
                            Inmobiliaria - CUCICBA 8266
                        </Text>
                    </View>
                </View>

                {/* Diego Photo - bottom-right, flush with footer */}
                <View style={{ position: 'absolute', bottom: 48, right: 0, width: 280 }}>
                    <Image
                        src="/pdf-assets/photos/Foto Diego.png"
                        style={{ width: '100%', height: 420, objectFit: 'contain' }}
                    />
                </View>

                {/* City text - bottom-left, above footer */}
                <Text style={{
                    position: 'absolute',
                    bottom: 55,
                    left: 60,
                    fontSize: 13,
                    color: colors.darkGray,
                    fontWeight: 'bold',
                    lineHeight: 1.4
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

                {/* Property Title */}
                <Text style={[styles.propertyTitle, { marginTop: 40 }]}>
                    {subject.title || subject.location}
                </Text>

                {/* Main Photo */}
                {subject.images && subject.images[0] && (
                    <View style={{ marginBottom: 12, border: `1px solid ${colors.lightGray}` }}>
                        <Image
                            src={subject.images[0]}
                            style={{ width: '100%', height: 250, objectFit: 'cover' }}
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
            </Page>

            {/* PAGE 3: MARKET DATA - CABA */}
            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                    <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                </View>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>{marketImageLabels['stock-departamentos']?.label || 'Stock de Departamentos en venta en CABA'}</Text>
                    <Image
                        src={marketImageUrls['stock-departamentos'] || '/pdf-assets/monthly-data/stock-departamentos.png'}
                        style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                    />
                    {marketImageLabels['stock-departamentos']?.description ? (
                        <Text style={{ fontSize: 8, color: colors.mediumGray, marginBottom: 16 }}>{marketImageLabels['stock-departamentos'].description}</Text>
                    ) : <View style={{ marginBottom: 16 }} />}

                    <View wrap={false}>
                        <Text style={styles.h2}>{marketImageLabels['escrituras-caba']?.label || 'Cantidad de Escrituras CABA'}</Text>
                        <Image
                            src={marketImageUrls['escrituras-caba'] || '/pdf-assets/monthly-data/escrituras-caba.png'}
                            style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                        />
                        {marketImageLabels['escrituras-caba']?.description ? (
                            <Text style={{ fontSize: 8, color: colors.mediumGray }}>{marketImageLabels['escrituras-caba'].description}</Text>
                        ) : null}
                    </View>
                </View>
            </Page>

            {/* PAGE 4: MARKET DATA - NEIGHBORHOOD */}
            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                    <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                </View>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>{marketImageLabels['datos-barrio']?.label || `Datos de ${neighborhood}, CABA`}</Text>
                    <Image
                        src={marketImageUrls['datos-barrio'] || '/pdf-assets/monthly-data/datos-barrio.png'}
                        style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                    />
                    {marketImageLabels['datos-barrio']?.description ? (
                        <Text style={{ fontSize: 8, color: colors.mediumGray, marginBottom: 16 }}>{marketImageLabels['datos-barrio'].description}</Text>
                    ) : <View style={{ marginBottom: 16 }} />}

                    <Text style={styles.h2}>{marketImageLabels['tipos-propiedades']?.label || `Tipos de propiedades en ${neighborhood}`}</Text>
                    <Image
                        src={marketImageUrls['tipos-propiedades'] || '/pdf-assets/monthly-data/tipos-propiedades.png'}
                        style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                    />
                    {marketImageLabels['tipos-propiedades']?.description ? (
                        <Text style={{ fontSize: 8, color: colors.mediumGray }}>{marketImageLabels['tipos-propiedades'].description}</Text>
                    ) : null}
                </View>
            </Page>

            {/* PAGE 5: PROPIEDADES QUE COMPITEN (Divisor) */}
            <Page size="A4" style={styles.page}>
                <View style={styles.backgroundPage}>
                    <Image
                        src="/pdf-assets/graphics/section-divider-bg.jpg"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
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

            {/* PAGES 7+: COMPARABLES (3 per page, compact layout) */}
            {Array.from({ length: Math.ceil(comparables.length / 3) }).map((_, pageIndex) => {
                const pageComps = comparables.slice(pageIndex * 3, pageIndex * 3 + 3)
                return (
                    <Page key={`comparables-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                        <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                            <Text style={styles.headerTitle}>PROPIEDADES EN VENTA</Text>
                            <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                        </View>

                        <View style={{ marginTop: 60, gap: 16 }}>
                            {pageComps.map((comp, index) => {
                            const globalIndex = pageIndex * 3 + index
                                const homSurface = getHomogenizedSurface(comp)
                                const pricePerM2 = homSurface > 0 ? (comp.price || 0) / homSurface : 0

                                return (
                                    <View key={globalIndex} wrap={false} style={{ flexDirection: 'row', gap: 12 }}>
                                        {/* Photo with semaphore */}
                                        <View style={{ position: 'relative', width: '30%' }}>
                                            {comp.images && comp.images[0] ? (
                                                <Image
                                                    src={comp.images[0]}
                                                    style={{ width: '100%', height: 130, objectFit: 'cover', border: `1px solid ${colors.lightGray}` }}
                                                />
                                            ) : (
                                                <View style={{ width: '100%', height: 130, backgroundColor: colors.lightGray }} />
                                            )}
                                            {/* Semaphore indicator — configurable color */}
                                            <View style={{ position: 'absolute', top: 6, left: 6 }}>
                                                <View style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 14,
                                                    backgroundColor: getSemaphoreColorValue(reportEdits?.semaphoreOverrides?.[`comparable-${globalIndex}`] || 'green'),
                                                    border: `2px solid ${colors.white}`
                                                }} />
                                            </View>
                                        </View>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 13, marginBottom: 4 }]}>
                                                {comp.location || comp.title}
                                            </Text>

                                            {/* Features grid */}
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                                                <Text style={styles.featureText}>■ {comp.features.coveredArea || 0}m² cub.</Text>
                                                {(comp.features.uncoveredArea ?? 0) > 0 && (
                                                    <Text style={styles.featureText}>■ {comp.features.uncoveredArea}m² desc.</Text>
                                                )}
                                                {comp.features.rooms && (
                                                    <Text style={styles.featureText}>■ {comp.features.rooms} Amb.</Text>
                                                )}
                                                {comp.features.bedrooms && (
                                                    <Text style={styles.featureText}>■ {comp.features.bedrooms} Dorm.</Text>
                                                )}
                                                {comp.features.bathrooms && (
                                                    <Text style={styles.featureText}>■ {comp.features.bathrooms} Baños</Text>
                                                )}
                                                <Text style={styles.featureText}>■ {comp.features.age || 0} años</Text>
                                            </View>

                                            {/* Price */}
                                            <View style={{ gap: 2, marginBottom: 8 }}>
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
                                            <Link src={comp.url || '#'} style={styles.comparableLink}>
                                                LINK DE LA PROPIEDAD
                                            </Link>

                                            {/* Metadata: published date + views */}
                                            <Text style={styles.comparableMetadata}>
                                                {cleanText(comp.features.publishedDate as string, 50) || 'Publicado'}{comp.features.views ? ` | ${cleanText(String(comp.features.views), 20)} visualizaciones` : ''}
                                            </Text>
                                        </View>
                                    </View>
                                )
                            })}
                        </View>
                    </Page>
                )
            })}

            {/* OVERPRICED PROPERTIES PAGES (if any) */}
            {overpriced.length > 0 && Array.from({ length: Math.ceil(overpriced.length / 2) }).map((_, pageIndex) => {
                const startIndex = pageIndex * 2
                const pageProps = overpriced.slice(startIndex, startIndex + 2)

                return (
                    <Page key={`overpriced-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                        <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                            <Text style={[styles.headerTitle, { color: colors.semaphoreRed }]}>PROPIEDADES FUERA DE PRECIO</Text>
                            <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                        </View>

                        <View style={{ marginTop: 70, gap: 24 }}>
                            {pageProps.map((prop, index) => {
                                const globalIndex = startIndex + index
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
            })}

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
                    {valuationResult.comparableAnalysis.map((analysis, index) => (
                        <View key={index} style={{ flexDirection: 'row', borderBottom: `0.5px solid ${colors.lightGray}`, backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <Text style={{ width: '12%', fontSize: 5, padding: 2 }}>
                                {(analysis.property.location || `Comp. ${index + 1}`).slice(0, 26)}
                            </Text>
                            <Text style={{ width: '7%', fontSize: 5, padding: 2, textAlign: 'right' }}>
                                {((analysis.property.price || 0) / 1000).toFixed(0)}k
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.property.features.coveredArea || '-'}
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.property.features.uncoveredArea || '-'}
                            </Text>
                            <Text style={{ width: '5%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.homogenizedSurface.toFixed(0)}
                            </Text>
                            <Text style={{ width: '4%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.property.features.age ?? '-'}
                            </Text>
                            <Text style={{ width: '4%', fontSize: 5, padding: 2, textAlign: 'center' }}>
                                {analysis.property.features.rooms || '-'}
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
                    ))}

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
                    <Text style={styles.body}>{reportEdits.analysisText}</Text>
                ) : (
                    <Text style={styles.body}>
                        Debido a la competencia para tener visitas y potencial de venta la propiedad se debería publicar en <Text style={{ color: colors.semaphoreGreen, fontWeight: 'bold' }}>{formatCurrency(recommendedPrice, valuationResult.currency)}.</Text>
                    </Text>
                )}
                <Text style={[styles.body, { marginTop: 8 }]}>
                    Una buena tasación, siempre es, vender al mejor valor que el mercado convalide en un plazo de 2 meses.
                </Text>
            </Page>

            {/* PAGE 10: COSTOS DE VENTA */}
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
                                {formatCurrency(valuationResult.publicationPrice, valuationResult.currency)}
                            </Text>
                        </View>
                        <View style={{ flex: 1, padding: 14, backgroundColor: colors.semaphoreGreen, alignItems: 'center', borderRadius: 4 }}>
                            <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold', letterSpacing: 0.5 }}>VALOR VENTA (-{valuationResult.expenseRates?.saleDiscountPercent ?? 5}%)</Text>
                            <Text style={{ fontSize: 18, color: colors.white, fontWeight: 'bold', marginTop: 6 }}>
                                {formatCurrency(valuationResult.saleValue, valuationResult.currency)}
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

            {/* PURCHASE PROPERTIES SECTION (conditional) */}
            {purchaseProperties.length > 0 && (
                <>
                    {/* PURCHASE DIVIDER PAGE */}
                    <Page size="A4" style={styles.page}>
                        <View style={styles.backgroundPage}>
                            <Image
                                src="/pdf-assets/graphics/section-divider-bg.jpg"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <View style={styles.backgroundOverlay} />
                            <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: 280 }]}>
                                <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 32 }]}>
                                    PROPIEDADES PARA COMPRA
                                </Text>
                            </View>
                            <Image
                                src="/pdf-assets/photos/Foto Diego.png"
                                style={styles.dividerPhoto}
                            />
                        </View>
                    </Page>

                    {/* PURCHASE PROPERTY CARDS (1 per page) */}
                    {purchaseProperties.map((prop, globalIndex) => {
                        const homSurface = getHomogenizedSurface(prop)
                        const pricePerM2 = homSurface > 0 ? (prop.price || 0) / homSurface : 0

                        return (
                            <Page key={`purchase-${globalIndex}`} size="A4" style={styles.pageWithPadding}>
                                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                                    <Text style={[styles.headerTitle, { color: colors.primary }]}>PROPIEDADES EN VENTA</Text>
                                    <Text style={styles.headerSubtitle}>CABA</Text>
                                </View>

                                <View style={{ marginTop: 70 }}>
                                            <View wrap={false} style={{ flexDirection: 'row', gap: 16 }}>
                                                {/* Photo (no semaphore for purchase) */}
                                                <View style={{ width: '35%' }}>
                                                    {prop.images && prop.images[0] ? (
                                                        <Image
                                                            src={prop.images[0]}
                                                            style={{ width: '100%', height: 160, objectFit: 'cover', border: `1px solid ${colors.lightGray}` }}
                                                        />
                                                    ) : (
                                                        <View style={{ width: '100%', height: 160, backgroundColor: colors.lightGray }} />
                                                    )}
                                                </View>

                                                {/* Info */}
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 16, marginBottom: 8 }]}>
                                                        {prop.location || prop.title}
                                                    </Text>

                                                    {/* Features grid */}
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                                        <Text style={styles.featureText}>■ {prop.features.coveredArea || 0}m²</Text>
                                                        {prop.features.rooms && (
                                                            <Text style={styles.featureText}>■ {prop.features.rooms} Amb.</Text>
                                                        )}
                                                        {prop.features.bedrooms && (
                                                            <Text style={styles.featureText}>■ {prop.features.bedrooms} Dorm.</Text>
                                                        )}
                                                        {prop.features.bathrooms && (
                                                            <Text style={styles.featureText}>■ {prop.features.bathrooms} Baños</Text>
                                                        )}
                                                        <Text style={styles.featureText}>■ {prop.features.age || 0} años</Text>
                                                    </View>

                                                    {/* Price */}
                                                    <View style={{ gap: 2, marginBottom: 8 }}>
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

                                                    {/* Link */}
                                                    <Link src={prop.url || '#'} style={styles.comparableLink}>
                                                        LINK DE LA PROPIEDAD
                                                    </Link>
                                                </View>
                                            </View>
                                </View>
                            </Page>
                        )
                    })}

                    {/* SIMULATION DIVIDER PAGE */}
                    {purchaseResult && (
                        <Page size="A4" style={styles.page}>
                            <View style={styles.backgroundPage}>
                                <Image
                                    src="/pdf-assets/graphics/section-divider-bg.jpg"
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <View style={styles.backgroundOverlay} />
                                <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: 280 }]}>
                                    <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 32 }]}>
                                        SIMULACIÓN COMPRA Y VENTA
                                    </Text>
                                </View>
                                <Image
                                    src="/pdf-assets/photos/Foto Diego.png"
                                    style={styles.dividerPhoto}
                                />
                            </View>
                        </Page>
                    )}

                    {/* SIMULATION TABLE PAGE */}
                    {purchaseResult && (
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
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{valuationResult.publicationPrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Venta</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{valuationResult.saleValue.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4 }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Escritura</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{valuationResult.deedValue.toLocaleString()}</Text>
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
                                                <Text style={{ fontSize: 7 }}>u$d{row.value.toLocaleString()}</Text>
                                            </View>
                                        ))}
                                        {/* Total */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.darkGray, borderTopWidth: 0, backgroundColor: '#f5f5f5' }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>Total gastos venta</Text>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>u$d{valuationResult.totalExpenses.toLocaleString()}</Text>
                                        </View>
                                        {/* Money after sale */}
                                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#ecfdf5', borderRadius: 2 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#065f46' }}>Dinero luego de venta</Text>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.semaphoreGreen }}>u$d{valuationResult.moneyInHand.toLocaleString()}</Text>
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
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{purchaseResult.publicationPrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Compra</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{purchaseResult.purchasePrice.toLocaleString()}</Text>
                                            </View>
                                            <View style={{ flex: 1, padding: 4 }}>
                                                <Text style={{ fontSize: 6, color: colors.mediumGray, textAlign: 'center' }}>Valor de Escritura</Text>
                                                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>u$d{purchaseResult.deedValue.toLocaleString()}</Text>
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
                                                <Text style={{ fontSize: 7 }}>u$d{row.value.toLocaleString()}</Text>
                                            </View>
                                        ))}
                                        {/* Total */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderWidth: 1, borderColor: colors.darkGray, borderTopWidth: 0, backgroundColor: '#f5f5f5' }}>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>Total gastos compra</Text>
                                            <Text style={{ fontSize: 7, fontWeight: 'bold' }}>u$d{purchaseResult.totalPurchaseCosts.toLocaleString()}</Text>
                                        </View>
                                        {/* Cost of purchase */}
                                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#eff6ff', borderRadius: 2 }}>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#1e40af' }}>Costo de compra</Text>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.primary }}>u$d{purchaseResult.totalCostWithPurchase.toLocaleString()}</Text>
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
                        src="/pdf-assets/graphics/section-divider-bg.jpg"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
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
                    <Text style={[styles.body, { marginBottom: 12 }]}>
                        {reportEdits?.strategyDiffusionText || 'Tu propiedad merece tener máxima difusión. Que la vean en excelencia, todos los potenciales compradores. Para ello haremos fotos, video, tour virtual con profesional, publicaremos en todos los portales inmobiliarios de forma destacada, crearemos una página web para la propiedad y haremos campañas publicitarias en las redes sociales. Con esta estrategia tu propiedad la verán el triple de potenciales compradores.'}
                    </Text>
                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        Si tenes el precio adecuado y máxima difusión, vas a tener consultas y visitas a tu propiedad
                    </Text>

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

                    {/* Branding Section */}
                    <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center', marginTop: 24 }}>
                        <View style={{ flex: 1 }}>
                            <Image
                                src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                                style={{ height: 60, width: '100%', objectFit: 'contain' }}
                            />
                            <Text style={{ fontSize: 10, color: colors.mediumGray, fontStyle: 'italic', textAlign: 'center', marginTop: 6 }}>
                                Inmobiliaria - CUCICBA 8266
                            </Text>

                            {/* Social Icons Placeholder */}
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12 }}>
                                <Text style={{ fontSize: 20, color: colors.primary }}>📱</Text>
                                <Text style={{ fontSize: 20, color: colors.primary }}>📷</Text>
                                <Text style={{ fontSize: 20, color: colors.primary }}>▶️</Text>
                            </View>

                            <Link src="https://diegoferreyraInmobiliaria.com/" style={{ fontSize: 11, color: colors.primary, textAlign: 'center', marginTop: 12, textDecoration: 'underline' }}>
                                diegoferreyraInmobiliaria.com
                            </Link>
                        </View>

                        <View style={{ width: 260 }}>
                            <Image
                                src="/pdf-assets/photos/Foto Diego.png"
                                style={{ width: '100%', height: 320, objectFit: 'cover' }}
                            />
                        </View>
                    </View>
                </View>
            </Page>

            {/* PAGE 13: BACK COVER */}
            <Page size="A4" style={[styles.page, { justifyContent: 'center', alignItems: 'center', padding: 60 }]}>
                {/* Circular Photo */}
                <View style={{ width: 180, height: 180, borderRadius: 90, overflow: 'hidden', border: `4px solid ${colors.primary}`, marginBottom: 32 }}>
                    <Image
                        src="/pdf-assets/photos/Foto Diego.png"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </View>

                {/* Logo */}
                <Image
                    src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                    style={{ height: 70, width: 300, objectFit: 'contain', marginBottom: 8 }}
                />
                <Text style={{ fontSize: 12, color: colors.mediumGray, fontStyle: 'italic', marginBottom: 24 }}>
                    Inmobiliaria - CUCICBA 8266
                </Text>

                {/* Social Icons */}
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                    <Text style={{ fontSize: 28, color: colors.primary }}>📱</Text>
                    <Text style={{ fontSize: 28, color: colors.primary }}>📷</Text>
                    <Text style={{ fontSize: 28, color: colors.primary }}>▶️</Text>
                </View>

                {/* Website */}
                <Link src="https://diegoferreyraInmobiliaria.com/" style={{ fontSize: 13, color: colors.primary, textDecoration: 'underline' }}>
                    diegoferreyraInmobiliaria.com
                </Link>
            </Page>
        </Document>
    )
}
