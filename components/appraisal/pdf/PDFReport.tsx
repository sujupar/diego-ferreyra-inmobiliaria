'use client'

import React from 'react'
import { Document, Page, Text, View, Image, Link } from '@react-pdf/renderer'
import { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'
import { styles, colors } from './PDFStyles'

interface PDFReportProps {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
}

// Helper to extract neighborhood from location
function extractNeighborhood(location: string): string {
    const match = location.match(/,\s*([^,]+),\s*(?:CABA|Capital Federal)/i)
    return match ? match[1].trim() : 'CABA'
}

// Helper to calculate semaphore color
function getSemaphoreColor(pricePerM2: number, marketAvg: number): string {
    const ratio = pricePerM2 / marketAvg
    if (ratio > 1.15) return colors.semaphoreRed
    if (ratio > 0.95) return colors.semaphoreYellow
    return colors.semaphoreGreen
}

//Helper to format currency
function formatCurrency(value: number, currency: string = 'USD'): string {
    if (currency === 'USD') {
        return `USD ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    }
    return `${currency} ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function PDFReportDocument({ subject, comparables, valuationResult }: PDFReportProps) {
    const neighborhood = extractNeighborhood(subject.location || '')
    const marketAvg = valuationResult.averagePriceM2
    const recommendedPrice = Math.round(valuationResult.finalValue)
    const noSaleZone = Math.round(recommendedPrice * 1.02) // 2% above recommended

    // Calculate days ago for comparables (placeholder - would come from scrapeDate)
    const getDaysAgo = (index: number) => {
        // Placeholder logic - in real implementation, calculate from scrapedAt date
        const dayOptions = [11, 169, 205, 0] // "hoy" for 0
        return dayOptions[index % 4]
    }

    return (
        <Document>
            {/* PAGE 1: PORTADA */}
            <Page size="A4" style={styles.page}>
                <View style={{ padding: 60, alignItems: 'center' }}>
                    {/* Title */}
                    <Text style={[styles.h1, { color: colors.darkGray, marginTop: 40 }]}>
                        INFORME DE TASACIÓN
                    </Text>

                    {/* Property Title */}
                    <Text style={[styles.propertyTitle, { marginTop: 24, fontSize: 28 }]}>
                        {subject.title || subject.location}
                    </Text>

                    {/* Institutional Logos */}
                    <View style={[styles.logosRow, { marginTop: 40 }]}>
                        <Image
                            src="/pdf-assets/logos/Captura de pantalla 2025-12-30 a la(s) 4.27.51 p.m..png"
                            style={{ height: 35, width: 120, objectFit: 'contain' }}
                        />
                    </View>

                    {/* Diego Ferreyra Logo */}
                    <View style={{ marginTop: 60, alignItems: 'center' }}>
                        <Image
                            src="/pdf-assets/logos/Logo Diego Ferreyra.png"
                            style={{ height: 80, width: 300, objectFit: 'contain' }}
                        />
                        <Text style={{ fontSize: 12, color: colors.mediumGray, fontStyle: 'italic', marginTop: 8 }}>
                            Martillero Público - CUCICBA 8266
                        </Text>
                    </View>

                    {/* Diego Photo */}
                    <View style={{ position: 'absolute', bottom: 80, right: 0, width: 280 }}>
                        <Image
                            src="/pdf-assets/photos/Foto Diego.png"
                            style={{ width: '100%', height: 380, objectFit: 'cover' }}
                        />
                    </View>

                    {/* Decorative Wave */}
                    <View style={{ position: 'absolute', bottom: 80, left: 0 }}>
                        <Image
                            src="/pdf-assets/graphics/wave-decoration.png"
                            style={{ width: 200, height: 100, objectFit: 'contain', opacity: 0.3 }}
                        />
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Link src="https://diegoferreyraimmobiliaria.com/" style={styles.footerText}>
                        https://diegoferreyraimmobiliaria.com/
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

                {/* Map Placeholder */}
                <View style={{
                    width: '100%',
                    height: 200,
                    backgroundColor: colors.lightGray,
                    marginBottom: 20,
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <Text style={styles.bodySecondary}>Mapa de ubicación: {subject.location}</Text>
                </View>

                {/* Features Grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureText}>■ {subject.features.coveredArea} m²</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureText}>■ {subject.features.bathrooms || 2} baños</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureText}>■ 4 Amb.</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureText}>■ {subject.features.bedrooms || 3} Dormitorios</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureText}>■ {subject.features.age || 0} años Antigüedad</Text>
                    </View>
                </View>

                {/* Additional Features Checklist */}
                <View style={styles.checkboxList}>
                    <View style={styles.checkboxItem}>
                        <View style={styles.checkboxChecked} />
                        <Text style={styles.body}>Cómoda cochera</Text>
                    </View>
                    <View style={styles.checkboxItem}>
                        <View style={styles.checkboxChecked} />
                        <Text style={styles.body}>Piso completo</Text>
                    </View>
                    <View style={styles.checkboxItem}>
                        <View style={styles.checkboxChecked} />
                        <Text style={styles.body}>Buena iluminación</Text>
                    </View>
                    <View style={styles.checkboxItem}>
                        <View style={styles.checkboxChecked} />
                        <Text style={styles.body}>Calle tranquila en {neighborhood}</Text>
                    </View>
                </View>
            </Page>

            {/* PAGE 3: MARKET DATA - CABA */}
            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                    <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                </View>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>Stock de Departamentos en venta en CABA</Text>
                    <Image
                        src="/pdf-assets/monthly-data/Captura de pantalla 2025-12-30 a la(s) 4.29.03 p.m..png"
                        style={{ width: '100%', height: 'auto', marginBottom: 20 }}
                    />

                    <Text style={styles.h2}>Cantidad de Escrituras CABA</Text>
                    <Image
                        src="/pdf-assets/monthly-data/Captura de pantalla 2025-12-30 a la(s) 4.29.11 p.m..png"
                        style={{ width: '100%', height: 'auto' }}
                    />
                </View>
            </Page>

            {/* PAGE 4: MARKET DATA - NEIGHBORHOOD */}
            <Page size="A4" style={styles.pageWithPadding}>
                <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                    <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                    <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                </View>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>Datos de {neighborhood}, CABA</Text>
                    <Image
                        src="/pdf-assets/monthly-data/Captura de pantalla 2025-12-30 a la(s) 4.29.18 p.m..png"
                        style={{ width: '100%', height: 'auto', marginBottom: 20 }}
                    />

                    <Text style={styles.h2}>Tipos de propiedades en {neighborhood}</Text>
                    <Image
                        src="/pdf-assets/monthly-data/Captura de pantalla 2025-12-30 a la(s) 4.30.21 p.m..png"
                        style={{ width: '100%', height: 'auto' }}
                    />
                </View>
            </Page>

            {/* PAGE 5: PROPIEDADES QUE COMPITEN (Divisor) */}
            <Page size="A4" style={styles.page}>
                <View style={styles.backgroundPage}>
                    {/* Background color overlay */}
                    <View style={{ ...styles.backgroundOverlay, backgroundColor: 'rgba(26, 84, 144, 0.92)' }} />

                    {/* Content */}
                    <View style={styles.backgroundContent}>
                        <Text style={styles.dividerTitle}>
                            PROPIEDADES QUE{'\n'}COMPITEN
                        </Text>
                        <View style={[styles.dividerText, { width: '70%', maxWidth: 500 }]}>
                            <Text style={{ fontSize: 13, lineHeight: 1.6 }}>
                                Sabemos lo valiosa que es tu propiedad y para asegurarnos de que consigas una
                                venta rápida y al mejor precio posible, veremos las propiedades con las que
                                competís directamente.
                            </Text>
                        </View>
                    </View>

                    {/* Diego Photo */}
                    <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
                        <Image
                            src="/pdf-assets/photos/Foto Diego.png"
                            style={{ width: 280, height: 400, objectFit: 'cover' }}
                        />
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

            {/* PAGES 7-8+: COMPARABLES (2 per page) */}
            {Array.from({ length: Math.ceil(comparables.length / 2) }).map((_, pageIndex) => {
                const startIndex = pageIndex * 2
                const pageComparables = comparables.slice(startIndex, startIndex + 2)

                return (
                    <Page key={`comparables-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                        <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                            <Text style={styles.headerTitle}>PROPIEDADES EN VENTA</Text>
                            <Text style={styles.headerSubtitle}>{neighborhood}, CABA</Text>
                        </View>

                        <View style={{ marginTop: 70, gap: 24 }}>
                            {pageComparables.map((comp, index) => {
                                const globalIndex = startIndex + index
                                const compSurface = comp.features.coveredArea || 100
                                const pricePerM2 = (comp.price || 0) / compSurface
                                const semaphoreColor = getSemaphoreColor(pricePerM2, marketAvg)
                                const daysAgo = getDaysAgo(globalIndex)

                                return (
                                    <View key={globalIndex} style={{ flexDirection: 'row', gap: 16 }}>
                                        {/* Photo with semaphore */}
                                        <View style={{ position: 'relative', width: '35%' }}>
                                            {comp.images && comp.images[0] ? (
                                                <Image
                                                    src={comp.images[0]}
                                                    style={{ width: '100%', height: 160, objectFit: 'cover', border: `1px solid ${colors.lightGray}` }}
                                                />
                                            ) : (
                                                <View style={{ width: '100%', height: 160, backgroundColor: colors.lightGray }} />
                                            )}
                                            {/* Semaphore indicator */}
                                            <View style={{ position: 'absolute', top: 8, left: 8 }}>
                                                <View style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 18,
                                                    backgroundColor: semaphoreColor,
                                                    border: `2px solid ${colors.white}`
                                                }} />
                                            </View>
                                        </View>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 16, marginBottom: 8 }]}>
                                                {comp.location || comp.title}
                                            </Text>

                                            {/* Features grid */}
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                                <Text style={styles.featureText}>■ {compSurface}m²</Text>
                                                <Text style={styles.featureText}>■ {comp.features.bathrooms || 2} baños</Text>
                                                <Text style={styles.featureText}>■ 4 Amb.</Text>
                                                <Text style={styles.featureText}>■ {comp.features.bedrooms || 3} Dormitorios</Text>
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
                                                        Valor del m2 {Math.round(pricePerM2).toLocaleString()} {valuationResult.currency}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Link */}
                                            <Link src={comp.url || '#'} style={styles.comparableLink}>
                                                LINK DE LA PROPIEDAD
                                            </Link>

                                            {/* Metadata */}
                                            <Text style={styles.comparableMetadata}>
                                                Publicado hace {daysAgo === 0 ? 'hoy' : `${daysAgo} días`} | Visualizaciones N/A
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
                <Text style={[styles.body, { marginBottom: 16 }]}>
                    Para Tasar la propiedad se utilizó el método de comparables. Para llegar al valor se toman
                    propiedades lo más similares y en un valor correcto de mercado. Finalmente se comparan variables
                    como m2, ubicación, valor, antigüedad, estado, etc.
                </Text>

                {/* Valuation Table */}
                <View style={{ fontSize: 6, marginVertical: 12, border: `1px solid ${colors.lightGray}` }}>
                    {/* Table Header */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#f5ead6', borderBottom: `1px solid ${colors.darkGray}`, padding: 2 }}>
                        <Text style={{ width: '12%', fontSize: 6, fontWeight: 'bold', padding: 1 }}>COMPARABLE</Text>
                        <Text style={{ width: '6%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'center' }}>SUP.{'\n'}HOM.</Text>
                        <Text style={{ width: '9%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'right' }}>$/m²{'\n'}ORIGINAL</Text>
                        <Text style={{ width: '6%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'center' }}>AJ.{'\n'}PISO</Text>
                        <Text style={{ width: '6%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'center' }}>AJ.{'\n'}DISP.</Text>
                        <Text style={{ width: '7%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'center' }}>AJ.{'\n'}CALIDAD</Text>
                        <Text style={{ width: '7%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'center' }}>AJ.{'\n'}EDAD</Text>
                        <Text style={{ width: '9%', fontSize: 6, fontWeight: 'bold', padding: 1, textAlign: 'right' }}>$/m²{'\n'}AJUSTADO</Text>
                    </View>

                    {/* Subject Row */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#fff9e6', borderBottom: `1px solid ${colors.lightGray}`, padding: 2 }}>
                        <Text style={{ width: '12%', fontSize: 6, padding: 1 }}>{subject.location || 'Sujeto'}</Text>
                        <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center' }}>{Math.round(valuationResult.subjectSurface)}</Text>
                        <Text style={{ width: '9%', fontSize: 6, padding: 1, textAlign: 'right' }}>-</Text>
                        <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center' }}>-</Text>
                        <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center' }}>-</Text>
                        <Text style={{ width: '7%', fontSize: 6, padding: 1, textAlign: 'center' }}>-</Text>
                        <Text style={{ width: '7%', fontSize: 6, padding: 1, textAlign: 'center' }}>-</Text>
                        <Text style={{ width: '9%', fontSize: 6, padding: 1, textAlign: 'right' }}>-</Text>
                    </View>

                    {/* Comparable Rows */}
                    {valuationResult.comparableAnalysis.map((analysis, index) => (
                        <View key={index} style={{ flexDirection: 'row', borderBottom: `1px solid ${colors.lightGray}`, padding: 2 }}>
                            <Text style={{ width: '12%', fontSize: 6, padding: 1 }}>
                                {analysis.property.location || `Comp. ${index + 1}`}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center' }}>
                                {Math.round(analysis.homogenizedSurface)}
                            </Text>
                            <Text style={{ width: '9%', fontSize: 6, padding: 1, textAlign: 'right' }}>
                                {formatCurrency(Math.round(analysis.originalPriceM2), valuationResult.currency)}
                            </Text>
                            <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center', color: analysis.floorFactor >= 1 ? colors.semaphoreGreen : colors.semaphoreRed }}>
                                {((analysis.floorFactor - 1) * 100).toFixed(1)}%
                            </Text>
                            <Text style={{ width: '6%', fontSize: 6, padding: 1, textAlign: 'center', color: analysis.dispositionFactor >= 1 ? colors.semaphoreGreen : colors.semaphoreRed }}>
                                {((analysis.dispositionFactor - 1) * 100).toFixed(1)}%
                            </Text>
                            <Text style={{ width: '7%', fontSize: 6, padding: 1, textAlign: 'center', color: analysis.qualityFactor >= 1 ? colors.semaphoreGreen : colors.semaphoreRed }}>
                                {((analysis.qualityFactor - 1) * 100).toFixed(1)}%
                            </Text>
                            <Text style={{ width: '7%', fontSize: 6, padding: 1, textAlign: 'center', color: analysis.ageFactor >= 1 ? colors.semaphoreGreen : colors.semaphoreRed }}>
                                {((analysis.ageFactor - 1) * 100).toFixed(1)}%
                            </Text>
                            <Text style={{ width: '9%', fontSize: 6, padding: 1, textAlign: 'right', fontWeight: 'bold' }}>
                                {formatCurrency(Math.round(analysis.adjustedPriceM2), valuationResult.currency)}
                            </Text>
                        </View>
                    ))}

                    {/* Footer Row */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#fff9e6', padding: 2 }}>
                        <Text style={{ width: '56%', fontSize: 7, padding: 1, textAlign: 'right', fontWeight: 'bold' }}>
                            Promedio $/m² Ajustado:
                        </Text>
                        <Text style={{ width: '9%', fontSize: 7, padding: 1, textAlign: 'right', fontWeight: 'bold', color: colors.primary }}>
                            {formatCurrency(Math.round(valuationResult.averagePriceM2), valuationResult.currency)}
                        </Text>
                    </View>
                </View>

                {/* Semaphore Visualization */}
                <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
                    <View style={{ flex: 1, padding: 12, backgroundColor: colors.semaphoreGreen, alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold' }}>PRECIO DE PUBLICACION</Text>
                        <Text style={{ fontSize: 14, color: colors.white, fontWeight: 'bold', marginTop: 4 }}>
                            {formatCurrency(recommendedPrice, valuationResult.currency)}
                        </Text>
                    </View>
                    <View style={{ flex: 1, padding: 12, backgroundColor: colors.semaphoreRed, alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, color: colors.white, fontWeight: 'bold' }}>ZONA DE NO VENTA</Text>
                        <Text style={{ fontSize: 14, color: colors.white, fontWeight: 'bold', marginTop: 4 }}>
                            {formatCurrency(noSaleZone, valuationResult.currency)}
                        </Text>
                    </View>
                </View>

                {/* Analysis */}
                <Text style={styles.h2}>Análisis</Text>
                <Text style={styles.body}>
                    Debido a la competencia cerca de <Text style={{ color: colors.semaphoreRed, fontWeight: 'bold' }}>{formatCurrency(noSaleZone, valuationResult.currency)}</Text> es muy probable que
                    el mercado no convalide el valor de venta. Para vender en el corto plazo recomiendo publicar en <Text style={{ color: colors.semaphoreYellow, fontWeight: 'bold' }}>{formatCurrency(recommendedPrice, valuationResult.currency)}</Text> y
                    medir la respuesta del mercado.
                </Text>
                <Text style={[styles.body, { marginTop: 12 }]}>
                    Una buena tasación, siempre es, vender al mejor valor que el mercado en 2 meses.
                </Text>
            </Page>

            {/* PAGE 10: ESTRATEGIA DE VENTA (Divisor) */}
            <Page size="A4" style={styles.page}>
                <View style={styles.backgroundPage}>
                    <View style={{ ...styles.backgroundOverlay, backgroundColor: 'rgba(26, 84, 144, 0.92)' }} />
                    <View style={styles.backgroundContent}>
                        <Text style={styles.dividerTitle}>ESTRATEGIA DE{'\n'}VENTA</Text>
                    </View>
                    <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
                        <Image
                            src="/pdf-assets/photos/Foto Diego.png"
                            style={{ width: 280, height: 400, objectFit: 'cover' }}
                        />
                    </View>
                </View>
            </Page>

            {/* PAGE 11: ESTRATEGIA */}
            <Page size="A4" style={styles.pageWithPadding}>
                <Text style={[styles.headerTitle, { position: 'absolute', top: 20, right: 40 }]}>ESTRATEGIA</Text>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h2}>Estrategia de Precio</Text>

                    <Text style={styles.body}>
                        La zona de no venta está en torno a los <Text style={{ color: colors.semaphoreRed, fontWeight: 'bold' }}>{formatCurrency(noSaleZone, valuationResult.currency)}.</Text>
                    </Text>
                    <Text style={[styles.body, { marginTop: 8, marginBottom: 16 }]}>
                        El valor de publicación recomendado es: <Text style={{ color: colors.semaphoreGreen, fontWeight: 'bold' }}>{formatCurrency(recommendedPrice, valuationResult.currency)}.</Text>
                    </Text>

                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        Hoy las propiedades que están en un valor interesante para el mercado tienen cerca de 6 visitas
                        mensuales y con el método por etapas, cada 12 visitas hay una reserva en promedio.
                    </Text>

                    <Text style={styles.h2}>Máxima Difusión</Text>
                    <Text style={[styles.body, { marginBottom: 12 }]}>
                        Tu propiedad merece tener máxima difusión. Que la vean en excelencia, todos los potenciales compradores.
                        Para ello haremos fotos, video, tour virtual con profesional, publicaremos en todos los portales
                        inmobiliarios de forma destacada, crearemos una página web para la propiedad y haremos campañas
                        publicitarias en las redes sociales. Con esta estrategia tu propiedad la verán el triple de potenciales
                        compradores.
                    </Text>
                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        Si tenes el precio adecuado y máxima difusión, vas a tener consultas y visitas a tu propiedad
                    </Text>

                    <Text style={styles.h2}>Seguimiento y Mejora Continua</Text>
                    <Text style={styles.body}>
                        Cada 15 días se harán informes de gestión quincenal donde te enviaremos las métricas de los portales,
                        la información que dejaron los compradores en la ficha de visitas y un análisis con la mejora que
                        debemos realizar en la estrategia para lograr vender en los próximos 15 días.
                    </Text>
                </View>
            </Page>

            {/* PAGE 12: TERMS & CONDITIONS */}
            <Page size="A4" style={styles.pageWithPadding}>
                <Text style={[styles.headerTitle, { position: 'absolute', top: 20, right: 40 }]}>DATOS REFERENCIALES</Text>

                <View style={{ marginTop: 60 }}>
                    <Text style={styles.h3}>Autorización Exclusiva, Compartida</Text>
                    <Text style={[styles.body, { marginBottom: 24 }]}>
                        La autorización es exclusiva y la propiedad se compartirá con todas las inmobiliarias. Seré el
                        máximo responsable e interlocutor principal para que se logre la operación exitosamente. El plazo
                        de la autorización para conseguir resultados óptimos es de 120 días.
                    </Text>

                    <Text style={styles.h3}>Honorarios</Text>
                    <Text style={[styles.body, { marginBottom: 32 }]}>
                        La retribución en concepto de honorarios por el servicio a brindar es del 3% (tres por ciento),
                        calculado sobre el monto de venta final de la operación.
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

                            <Text style={{ fontSize: 11, color: colors.primary, textAlign: 'center', marginTop: 12 }}>
                                diegoferreyraimmobiliaria.com
                            </Text>
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
                <Link src="https://diegoferreyraimmobiliaria.com/" style={{ fontSize: 13, color: colors.primary }}>
                    diegoferreyraimmobiliaria.com
                </Link>
            </Page>
        </Document>
    )
}
