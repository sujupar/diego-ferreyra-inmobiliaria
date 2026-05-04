import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<Response> {
    try {
        const { url } = await request.json()

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }

        // Validate it's a proper HTTP(S) URL
        try {
            const parsed = new URL(url)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return NextResponse.json({ error: 'Only HTTP/HTTPS URLs allowed' }, { status: 400 })
            }
        } catch {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/*',
            },
        })

        clearTimeout(timeout)

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: 502 })
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const dataUrl = `data:${contentType};base64,${base64}`

        // Cache de 1 hora en el browser. Las URLs de portales (zonaprop, ML, etc)
        // son estables — la imagen no cambia. Esto evita re-fetches en sesiones
        // largas o entre tabs del mismo usuario.
        return NextResponse.json({ dataUrl }, {
            headers: {
                'Cache-Control': 'private, max-age=3600',
            },
        })
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return NextResponse.json({ error: 'Image fetch timed out' }, { status: 504 })
        }
        console.error('Proxy image error:', error)
        return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 })
    }
}
