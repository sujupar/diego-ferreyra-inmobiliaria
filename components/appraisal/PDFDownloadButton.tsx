'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'
import { PDFReportDocument } from './pdf/PDFReport'
import { pdf } from '@react-pdf/renderer'

interface PDFDownloadButtonProps {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
}

export function PDFDownloadButton({ subject, comparables, valuationResult }: PDFDownloadButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false)

    const handleDownload = async () => {
        try {
            setIsGenerating(true)

            // Generate PDF blob
            const doc = <PDFReportDocument
                subject={subject}
                comparables={comparables}
                valuationResult={valuationResult}
            />

            const asPdf = pdf(doc)
            const blob = await asPdf.toBlob()

            // Create download link
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url

            // Generate filename from property title
            const propertyName = subject.title || subject.location || 'Propiedad'
            const filename = `Informe_Tasacion_${propertyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`

            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

        } catch (error) {
            console.error('Error generating PDF:', error)
            alert('Hubo un error al generar el PDF. Por favor, intenta nuevamente.')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <Button
            onClick={handleDownload}
            disabled={isGenerating}
            className="gap-2"
            size="lg"
        >
            {isGenerating ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generando PDF...
                </>
            ) : (
                <>
                    <Download className="w-4 h-4" />
                    Generar PDF
                </>
            )}
        </Button>
    )
}
