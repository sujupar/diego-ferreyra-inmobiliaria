import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const DEFAULT_SLOTS = [
    { id: 'stock-departamentos', label: 'Stock de Departamentos en venta en CABA', filename: 'stock-departamentos.png' },
    { id: 'escrituras-caba', label: 'Cantidad de Escrituras CABA', filename: 'escrituras-caba.png' },
    { id: 'datos-barrio', label: 'Datos del barrio', filename: 'datos-barrio.png' },
    { id: 'tipos-propiedades', label: 'Tipos de propiedades del barrio', filename: 'tipos-propiedades.png' },
]

export async function GET(): Promise<Response> {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Try to get labels from Supabase table
    const { data: settings } = await supabase
        .from('market_image_settings')
        .select('*')
    const settingsMap = new Map((settings || []).map(s => [s.id, s]))

    // Check which files exist in Supabase Storage
    let existingFiles = new Set<string>()
    try {
        const { data: files } = await supabase.storage.from('market-images').list()
        existingFiles = new Set((files || []).map(f => f.name))
    } catch {
        // Storage bucket may not exist yet
    }

    const slots = DEFAULT_SLOTS.map(slot => {
        const setting = settingsMap.get(slot.id)
        const existsInStorage = existingFiles.has(slot.filename)

        let currentPath: string | null = null
        if (existsInStorage) {
            const { data: { publicUrl } } = supabase.storage
                .from('market-images')
                .getPublicUrl(slot.filename)
            currentPath = publicUrl
        } else {
            // Fallback to local path (for dev or pre-migration)
            currentPath = `/pdf-assets/monthly-data/${slot.filename}`
        }

        return {
            id: slot.id,
            label: setting?.label || slot.label,
            description: setting?.description || '',
            filename: slot.filename,
            exists: true,
            currentPath,
        }
    })

    return NextResponse.json({ slots })
}

export async function PUT(request: Request): Promise<Response> {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const { id, label, description } = await request.json()

        if (!id || !label) {
            return NextResponse.json({ error: 'id and label are required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('market_image_settings')
            .upsert({
                id,
                label,
                description: description || '',
                updated_at: new Date().toISOString(),
            })

        if (error) {
            console.error('Failed to save market image setting:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('PUT error:', error)
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }
}
