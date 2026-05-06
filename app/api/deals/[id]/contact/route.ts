import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

function getAdmin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * PATCH /api/deals/[id]/contact
 *
 * Asocia (o desasocia) un contacto a un deal. Body: { contact_id: string | null }.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuth()
        const { id } = await params
        const body = await request.json()
        const contactId = body?.contact_id

        if (contactId !== null && typeof contactId !== 'string') {
            return NextResponse.json({ error: 'contact_id required (string|null)' }, { status: 400 })
        }

        const { error } = await getAdmin()
            .from('deals')
            .update({ contact_id: contactId })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('PATCH /api/deals/[id]/contact error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
    }
}
