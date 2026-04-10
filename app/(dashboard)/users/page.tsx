import { requireRole } from '@/lib/auth/require-role'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { UsersClient } from './users-client'
import { Profile, Invitation } from '@/types/auth.types'

export default async function UsersPage() {
    await requireRole('admin', 'dueno')

    // Use service_role to bypass RLS for admin queries
    const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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
