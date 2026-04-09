'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/auth.types'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'

function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
}

export function UserMenu({ profile }: { profile: Profile }) {
    const router = useRouter()

    async function handleSignOut() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                    <AvatarFallback className="text-xs">
                        {getInitials(profile.full_name)}
                    </AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium leading-tight">{profile.full_name}</span>
                    <span className="text-xs text-muted-foreground leading-tight">
                        {ROLE_LABELS[profile.role]}
                    </span>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{profile.full_name}</p>
                        <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-muted-foreground">
                    <User className="mr-2 h-4 w-4" />
                    {ROLE_LABELS[profile.role]}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar sesion
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
