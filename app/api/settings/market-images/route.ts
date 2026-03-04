import { NextResponse } from 'next/server'
import { access } from 'fs/promises'
import path from 'path'

const IMAGE_SLOTS = [
    { id: 'stock-departamentos', label: 'Stock de Departamentos en venta en CABA', filename: 'stock-departamentos.png' },
    { id: 'escrituras-caba', label: 'Cantidad de Escrituras CABA', filename: 'escrituras-caba.png' },
    { id: 'datos-barrio', label: 'Datos del barrio', filename: 'datos-barrio.png' },
    { id: 'tipos-propiedades', label: 'Tipos de propiedades del barrio', filename: 'tipos-propiedades.png' },
]

export async function GET(): Promise<Response> {
    const baseDir = path.join(process.cwd(), 'public', 'pdf-assets', 'monthly-data')

    const slots = await Promise.all(IMAGE_SLOTS.map(async (slot) => {
        const filePath = path.join(baseDir, slot.filename)
        let exists = false

        try {
            await access(filePath)
            exists = true
        } catch {
            // File doesn't exist
        }

        return {
            ...slot,
            exists,
            currentPath: exists ? `/pdf-assets/monthly-data/${slot.filename}` : null,
        }
    }))

    return NextResponse.json({ slots })
}
