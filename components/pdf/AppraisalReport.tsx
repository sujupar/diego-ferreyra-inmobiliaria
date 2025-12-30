import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { ScrapedProperty } from '@/lib/scraper/types'

// Create styles
const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: 30,
    },
    section: {
        margin: 10,
        padding: 10,
    },
    title: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 18,
        marginBottom: 10,
        borderBottom: '1px solid #ccc',
        paddingBottom: 5,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    label: {
        width: 150,
        fontWeight: 'bold',
        fontSize: 12,
    },
    value: {
        fontSize: 12,
    },
    price: {
        fontSize: 30,
        fontWeight: 'bold',
        color: '#0066cc',
        textAlign: 'center',
        marginTop: 20,
    },
    disclaimer: {
        fontSize: 10,
        color: 'gray',
        marginTop: 50,
        textAlign: 'center',
    }
})

interface AppraisalReportProps {
    subject: ScrapedProperty
    valuation: number
    comparables: ScrapedProperty[]
}

export function AppraisalReport({ subject, valuation, comparables }: AppraisalReportProps) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.section}>
                    <Text style={styles.title}>Valuation Report</Text>
                    <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 14 }}>Prepared by Diego Ferreyra Management</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.subtitle}>Subject Property</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Title:</Text>
                        <Text style={styles.value}>{subject.title}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Location:</Text>
                        <Text style={styles.value}>{subject.location || 'N/A'}</Text>
                    </View>
                    {subject.features.coveredArea && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Covered Area:</Text>
                            <Text style={styles.value}>{subject.features.coveredArea} m2</Text>
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.subtitle}>Estimated Market Value</Text>
                    <Text style={styles.price}>USD {valuation.toLocaleString()}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.subtitle}>Comparable Properties Used</Text>
                    {comparables.map((comp, i) => (
                        <View key={i} style={{ marginBottom: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{i + 1}. {comp.title}</Text>
                            <Text style={{ fontSize: 10 }}>{comp.currency} {comp.price?.toLocaleString()} - {comp.location || 'N/A'}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.section}>
                    <Text style={styles.disclaimer}>
                        This valuation is an estimate based on market comparables and does not constitute a formal bank appraisal.
                    </Text>
                </View>
            </Page>
        </Document>
    )
}
