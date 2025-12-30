import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { AppraisalReport } from '@/components/pdf/AppraisalReport'
import { ScrapedProperty } from '@/lib/scraper/types'

// Mock types for the request body
interface PdfRequest {
    subject: ScrapedProperty
    valuation: number
    comparables: ScrapedProperty[]
}

export async function POST(request: Request) {
    try {
        const body: PdfRequest = await request.json()
        const { subject, valuation, comparables } = body

        const stream = await renderToStream(
            <AppraisalReport subject={ subject } valuation = { valuation } comparables = { comparables } />
    )

        return new NextResponse(stream as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="appraisal-${Date.now()}.pdf"`,
            },
        })
    } catch (error) {
        console.error('PDF generation error', error)
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }
}
