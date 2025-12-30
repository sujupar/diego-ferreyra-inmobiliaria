import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Image,
    Font
} from '@react-pdf/renderer'
import { ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import {
    DISPOSITION_LABELS,
    QUALITY_LABELS,
    CONSERVATION_LABELS,
    DispositionType,
    QualityType,
    ConservationStateType
} from '@/lib/valuation/rules'

// Registrar fuentes (opcional, usa Helvetica por defecto)
// Font.register({
//     family: 'Inter',
//     src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
// })

const styles = StyleSheet.create({
    page: {
        backgroundColor: '#FFFFFF',
        padding: 40,
        fontFamily: 'Helvetica',
    },
    // PORTADA
    coverPage: {
        justifyContent: 'space-between',
        padding: 60,
    },
    coverHeader: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logo: {
        width: 200,
        height: 60,
        marginBottom: 20,
    },
    institutionalLogos: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 15,
        marginTop: 10,
    },
    smallLogo: {
        width: 40,
        height: 40,
    },
    coverTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1a365d',
        textAlign: 'center',
        marginTop: 60,
        marginBottom: 10,
    },
    propertyName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ff6b35',
        textAlign: 'center',
        marginBottom: 40,
    },
    coverDate: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },

    // PÁGINA DE DETALLES
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a365d',
        marginBottom: 15,
        borderBottomWidth: 2,
        borderBottomColor: '#ff6b35',
        paddingBottom: 5,
    },
    propertyImage: {
        width: '100%',
        height: 250,
        objectFit: 'cover',
        borderRadius: 8,
        marginBottom: 20,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 15,
    },
    detailItem: {
        width: '45%',
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
        marginBottom: 3,
    },
    detailValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },

    // TABLA DE TASACIÓN
    table: {
        marginTop: 20,
        marginBottom: 20,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f0f4f8',
        borderBottomWidth: 2,
        borderBottomColor: '#1a365d',
        paddingVertical: 8,
        paddingHorizontal: 5,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 6,
        paddingHorizontal: 5,
    },
    tableRowAlt: {
        backgroundColor: '#f9fafb',
    },
    tableCellHeader: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#1a365d',
        textAlign: 'center',
    },
    tableCell: {
        fontSize: 9,
        color: '#333',
        textAlign: 'center',
    },
    tableCellLeft: {
        textAlign: 'left',
    },
    tableCellRight: {
        textAlign: 'right',
    },
    // Anchos de columnas (total debe ser 100%)
    col1: { width: '15%' }, // Comparable
    col2: { width: '10%' }, // Precio
    col3: { width: '8%' },  // Sup Total
    col4: { width: '8%' },  // Sup Cub
    col5: { width: '8%' },  // Sup Homog
    col6: { width: '10%' }, // USD/m² Orig
    col7: { width: '8%' },  // Coef Piso
    col8: { width: '8%' },  // Coef Disp
    col9: { width: '8%' },  // Coef Cal
    col10: { width: '8%' }, // Coef Edad
    col11: { width: '11%' }, // USD/m² Ajust

    // VALOR OBJETIVO
    valorObjetivo: {
        backgroundColor: '#1a365d',
        padding: 20,
        borderRadius: 8,
        marginTop: 20,
        alignItems: 'center',
    },
    valorObjetivoLabel: {
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    valorObjetivoValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ff6b35',
    },

    // FOOTER
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        textAlign: 'center',
        color: '#999',
        fontSize: 9,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 10,
    },
})

interface PDFReportProps {
    subject: ValuationProperty
    result: ValuationResult
}

function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)
}

function formatNumber(value: number, decimals: number = 2): string {
    return value.toFixed(decimals)
}

export function PDFReport({ subject, result }: PDFReportProps) {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return (
        <Document>
            {/* PÁGINA 1: PORTADA */}
            <Page size="A4" style={[styles.page, styles.coverPage]}>
                <View style={styles.coverHeader}>
                    <Text style={styles.coverTitle}>INFORME DE TASACIÓN</Text>
                    <Text style={styles.propertyName}>
                        {subject.title || subject.location || 'Propiedad'}
                    </Text>
                </View>

                <View>
                    <Text style={styles.coverDate}>
                        {today}
                    </Text>
                    <Text style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: '#666' }}>
                        Método de Comparables de Mercado
                    </Text>
                </View>

                <Text style={styles.footer}>
                    Diego Ferreyra Gestión Inmobiliaria
                </Text>
            </Page>

            {/* PÁGINA 2: DETALLES DEL INMUEBLE */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.sectionTitle}>Detalles del Inmueble</Text>

                {/* Foto principal si existe */}
                {subject.images && subject.images[0] && (
                    <Image
                        src={subject.images[0]}
                        style={styles.propertyImage}
                    />
                )}

                <View style={styles.detailsGrid}>
                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Ubicación</Text>
                        <Text style={styles.detailValue}>{subject.location || 'No especificada'}</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Superficie Cubierta</Text>
                        <Text style={styles.detailValue}>{subject.features.coveredArea || '-'} m²</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Superficie Total</Text>
                        <Text style={styles.detailValue}>{subject.features.totalArea || '-'} m²</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Antigüedad</Text>
                        <Text style={styles.detailValue}>{subject.features.age || 0} años</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Piso</Text>
                        <Text style={styles.detailValue}>
                            {subject.features.floor === 0 ? 'PB' : subject.features.floor || '-'}
                        </Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Dormitorios</Text>
                        <Text style={styles.detailValue}>{subject.features.bedrooms || '-'}</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Baños</Text>
                        <Text style={styles.detailValue}>{subject.features.bathrooms || '-'}</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Cocheras</Text>
                        <Text style={styles.detailValue}>{subject.features.garages || '-'}</Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Disposición</Text>
                        <Text style={styles.detailValue}>
                            {subject.features.disposition
                                ? DISPOSITION_LABELS[subject.features.disposition as DispositionType]
                                : 'No especificada'}
                        </Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Calidad Constructiva</Text>
                        <Text style={styles.detailValue}>
                            {subject.features.quality
                                ? QUALITY_LABELS[subject.features.quality as QualityType]
                                : 'No especificada'}
                        </Text>
                    </View>

                    <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Estado de Conservación</Text>
                        <Text style={styles.detailValue}>
                            {subject.features.conservationState
                                ? CONSERVATION_LABELS[subject.features.conservationState as ConservationStateType]
                                : 'No especificado'}
                        </Text>
                    </View>
                </View>

                {subject.description && (
                    <View style={[styles.section, { marginTop: 20 }]}>
                        <Text style={styles.detailLabel}>Descripción</Text>
                        <Text style={{ fontSize: 10, color: '#555', marginTop: 5, lineHeight: 1.5 }}>
                            {subject.description}
                        </Text>
                    </View>
                )}

                <Text style={styles.footer}>
                    Diego Ferreyra Gestión Inmobiliaria | Página 2
                </Text>
            </Page>

            {/* PÁGINA 3: MAPA DE VALOR - TABLA DE TASACIÓN */}
            <Page size="A4" style={styles.page} orientation="landscape">
                <Text style={styles.sectionTitle}>Mapa de Valor - Análisis de Comparables</Text>

                <View style={styles.table}>
                    {/* ENCABEZADO */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableCellHeader, styles.col1]}>Comparable</Text>
                        <Text style={[styles.tableCellHeader, styles.col2]}>Precio</Text>
                        <Text style={[styles.tableCellHeader, styles.col3]}>Sup. Total</Text>
                        <Text style={[styles.tableCellHeader, styles.col4]}>Sup. Cub.</Text>
                        <Text style={[styles.tableCellHeader, styles.col5]}>Sup. Homog.</Text>
                        <Text style={[styles.tableCellHeader, styles.col6]}>USD/m² Orig.</Text>
                        <Text style={[styles.tableCellHeader, styles.col7]}>Coef. Piso</Text>
                        <Text style={[styles.tableCellHeader, styles.col8]}>Coef. Disp.</Text>
                        <Text style={[styles.tableCellHeader, styles.col9]}>Coef. Cal.</Text>
                        <Text style={[styles.tableCellHeader, styles.col10]}>Coef. Edad</Text>
                        <Text style={[styles.tableCellHeader, styles.col11]}>USD/m² Ajust.</Text>
                    </View>

                    {/* FILAS DE DATOS */}
                    {result.comparableAnalysis.map((analysis, index) => (
                        <View
                            key={index}
                            style={[
                                styles.tableRow,
                                ...(index % 2 === 1 ? [styles.tableRowAlt] : [])
                            ]}
                        >
                            <Text style={[styles.tableCell, styles.tableCellLeft, styles.col1]}>
                                {analysis.property.location?.substring(0, 30) || `Comp. ${index + 1}`}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellRight, styles.col2]}>
                                {formatCurrency(analysis.property.price || 0, result.currency)}
                            </Text>
                            <Text style={[styles.tableCell, styles.col3]}>
                                {analysis.property.features.totalArea || '-'}
                            </Text>
                            <Text style={[styles.tableCell, styles.col4]}>
                                {analysis.property.features.coveredArea || '-'}
                            </Text>
                            <Text style={[styles.tableCell, styles.col5]}>
                                {formatNumber(analysis.homogenizedSurface, 1)}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellRight, styles.col6]}>
                                {formatNumber(analysis.originalPriceM2, 0)}
                            </Text>
                            <Text style={[styles.tableCell, styles.col7]}>
                                {formatNumber(analysis.floorFactor, 2)}
                            </Text>
                            <Text style={[styles.tableCell, styles.col8]}>
                                {formatNumber(analysis.dispositionFactor, 2)}
                            </Text>
                            <Text style={[styles.tableCell, styles.col9]}>
                                {formatNumber(analysis.qualityFactor, 2)}
                            </Text>
                            <Text style={[styles.tableCell, styles.col10]}>
                                {formatNumber(analysis.ageFactor, 2)}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellRight, styles.col11, { fontWeight: 'bold', color: '#1a365d' }]}>
                                {formatNumber(analysis.adjustedPriceM2, 0)}
                            </Text>
                        </View>
                    ))}

                    {/* FILA DE PROMEDIO */}
                    <View style={[styles.tableRow, { backgroundColor: '#f0f4f8', borderTopWidth: 2, borderTopColor: '#1a365d' }]}>
                        <Text style={[styles.tableCell, styles.tableCellRight, { width: '89%', fontWeight: 'bold' }]}>
                            Promedio USD/m² Ajustado:
                        </Text>
                        <Text style={[styles.tableCell, styles.tableCellRight, styles.col11, { fontWeight: 'bold', color: '#1a365d', fontSize: 11 }]}>
                            {formatNumber(result.averagePriceM2, 0)}
                        </Text>
                    </View>
                </View>

                {/* VALOR OBJETIVO */}
                <View style={styles.valorObjetivo}>
                    <Text style={styles.valorObjetivoLabel}>VALOR OBJETIVO DE TASACIÓN</Text>
                    <Text style={styles.valorObjetivoValue}>
                        {formatCurrency(result.finalValue, result.currency)}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#FFFFFF', marginTop: 8 }}>
                        Superficie homogeneizada: {formatNumber(result.subjectSurface, 2)} m² |
                        Basado en {result.comparableAnalysis.length} comparables
                    </Text>
                </View>

                <Text style={styles.footer}>
                    Diego Ferreyra Gestión Inmobiliaria | Página 3
                </Text>
            </Page>
        </Document>
    )
}
