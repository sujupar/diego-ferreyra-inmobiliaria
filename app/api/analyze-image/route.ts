import { NextResponse } from 'next/server'
import { analyzeImage } from '@/lib/ai'

export async function POST(request: Request) {
    const { imageUrl } = await request.json()
    const score = await analyzeImage(imageUrl)
    return NextResponse.json({ score })
}
