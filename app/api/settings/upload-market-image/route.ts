import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const VALID_SLOTS = ['stock-departamentos', 'escrituras-caba', 'datos-barrio', 'tipos-propiedades']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(request: Request): Promise<Response> {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const slot = formData.get('slot') as string | null

        if (!file || !slot) {
            return NextResponse.json({ error: 'File and slot are required' }, { status: 400 })
        }

        if (!VALID_SLOTS.includes(slot)) {
            return NextResponse.json({ error: 'Invalid slot identifier' }, { status: 400 })
        }

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
        }

        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const filename = `${slot}.png`
        const buffer = Buffer.from(await file.arrayBuffer())

        // Upload (upsert) to Supabase Storage
        const { error } = await supabase.storage
            .from('market-images')
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: true,
            })

        if (error) {
            console.error('Supabase storage upload error:', error)
            return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('market-images')
            .getPublicUrl(filename)

        return NextResponse.json({ success: true, path: publicUrl, slot, filename })
    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }
}
