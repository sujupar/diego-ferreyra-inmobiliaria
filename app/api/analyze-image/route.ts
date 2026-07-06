import { NextResponse } from 'next/server'
import { analyzeImage } from '@/lib/ai'
import { requireAuth } from '@/lib/auth/require-role'

export async function POST(request: Request) {
    // Endpoint sin llamadores internos pero vivo: sin auth era abuso de costo LLM
    // (LLM10) + SSRF potencial vía imageUrl. Exigir sesión.
    await requireAuth()
    try {
        const { imageUrl } = await request.json()
        if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
            return NextResponse.json({ error: 'imageUrl inválida' }, { status: 400 })
        }
        const score = await analyzeImage(imageUrl)
        return NextResponse.json({ score })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
