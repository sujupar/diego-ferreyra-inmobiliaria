import { requireRole } from '@/lib/auth/require-role'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { UsersClient } from './users-client'
import { Profile, Invitation } from '@/types/auth.types'

export default async function UsersPage() {
    await requireRole('admin')

    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const [profilesRes, invitationsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('invitations').select('*').order('created_at', { ascending: false }),
    ])

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
                <p className="text-muted-foreground">Gestiona los usuarios y envia invitaciones</p>
            </div>
            <UsersClient
                profiles={(profilesRes.data || []) as unknown as Profile[]}
                invitations={(invitationsRes.data || []) as unknown as Invitation[]}
            />
        </div>
    )
}
