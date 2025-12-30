import { NextResponse } from 'next/server'
import { z } from 'zod'
import { spawn } from 'child_process'
import path from 'path'

const scrapeSchema = z.object({
    url: z.string().url(),
})

export async function POST(request: Request): Promise<Response> {
    try {
        const body = await request.json()
        const { url } = scrapeSchema.parse(body)

        // Path to the python script
        const scriptPath = path.join(process.cwd(), 'scripts', 'scraper.py')

        return new Promise<Response>((resolve) => {

            const pythonProcess = spawn('python3', [scriptPath, url])

            let dataString = ''
            let errorString = ''

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString()
            })

            pythonProcess.stderr.on('data', (data) => {
                errorString += data.toString()
            })

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('Python script error:', errorString)
                    resolve(NextResponse.json(
                        { error: 'Failed to scrape property. Please try again.' },
                        { status: 500 }
                    ))
                    return
                }

                try {
                    const result = JSON.parse(dataString)

                    if (!result.success) {
                        resolve(NextResponse.json(
                            { error: result.error || 'Unknown error occurred' },
                            { status: 500 }
                        ))
                        return
                    }

                    resolve(NextResponse.json(result.data))
                } catch (e) {
                    console.error('JSON parse error:', e)
                    resolve(NextResponse.json(
                        { error: 'Invalid response from scraper' },
                        { status: 500 }
                    ))
                }
            })
        })

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 })
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
