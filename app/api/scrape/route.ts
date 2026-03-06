import { NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeProperty } from '@/lib/scraper'

const scrapeSchema = z.object({
    url: z.string().url(),
})

// Allow up to 60 seconds for scraping (fetch with retry)
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
    try {
        const body = await request.json()
        const { url } = scrapeSchema.parse(body)

        // Use the TypeScript scraper (Puppeteer + Cheerio)
        const result = await scrapeProperty(url)

        if (!result.success || !result.data) {
            return NextResponse.json(
                { error: result.error || 'Failed to scrape property' },
                { status: 500 }
            )
        }

        return NextResponse.json(result.data)

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 })
        }
        console.error('Scrape error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
