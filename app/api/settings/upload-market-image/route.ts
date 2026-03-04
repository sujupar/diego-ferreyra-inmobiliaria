import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const VALID_SLOTS: Record<string, string> = {
    'stock-departamentos': 'stock-departamentos.png',
    'escrituras-caba': 'escrituras-caba.png',
    'datos-barrio': 'datos-barrio.png',
    'tipos-propiedades': 'tipos-propiedades.png',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(request: Request): Promise<Response> {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const slot = formData.get('slot') as string | null

        if (!file || !slot) {
            return NextResponse.json({ error: 'File and slot are required' }, { status: 400 })
        }

        if (!VALID_SLOTS[slot]) {
            return NextResponse.json({ error: 'Invalid slot identifier' }, { status: 400 })
        }

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const outputDir = path.join(process.cwd(), 'public', 'pdf-assets', 'monthly-data')
        await mkdir(outputDir, { recursive: true })

        const filename = VALID_SLOTS[slot]
        const outputPath = path.join(outputDir, filename)

        await writeFile(outputPath, buffer)

        const publicPath = `/pdf-assets/monthly-data/${filename}`
        return NextResponse.json({ success: true, path: publicPath, slot, filename })
    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }
}
