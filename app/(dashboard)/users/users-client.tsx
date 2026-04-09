'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, Invitation, Role } from '@/types/auth.types'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Mail, UserPlus, Clock } from 'lucide-react'

const ROLE_COLORS: Record<Role, string> = {
    admin: 'bg-red-100 text-red-800',
    dueno: 'bg-blue-100 text-blue-800',
    coordinador: 'bg-purple-100 text-purple-800',
    asesor: 'bg-green-100 text-green-800',
    agent: 'bg-gray-100 text-gray-800',
    viewer: 'bg-gray-100 text-gray-800',
}

export function UsersClient({
    profiles,
    invitations,
}: {
    profiles: Profile[]
    invitations: Invitation[]
}) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<string>('')
    const [sending, setSending] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const router = useRouter()

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault()
        if (!email || !role) return

        setSending(true)
        setMessage(null)

        try {
            const res = await fetch('/api/auth/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            })
            const data = await res.json()

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error })
                setSending(false)
                return
            }

            setMessage({
                type: 'success',
                text: data.warning || 'Invitacion enviada correctamente',
            })
            setEmail('')
            setRole('')
            router.refresh()
        } catch {
            setMessage({ type: 'error', text: 'Error de conexion' })
        }
        setSending(false)
    }

    const pendingInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date())
    const expiredInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) <= new Date())

    return (
        <div className="grid gap-8 lg:grid-cols-2">
            {/* Invite form */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Invitar usuario
                    </CardTitle>
                    <CardDescription>
                        Envía una invitacion por email para que se una a la plataforma
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {message && (
                        <div className={`mb-4 p-3 rounded-md text-sm ${
                            message.type === 'success'
                                ? 'bg-green-50 text-green-800'
                                : 'bg-destructive/10 text-destructive'
                        }`}>
                            {message.text}
                        </div>
                    )}
                    <form onSubmit={handleInvite} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                placeholder="usuario@email.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Rol</Label>
                            <select
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={role}
                                onChange={e => setRole(e.target.value)}
                                required
                            >
                                <option value="">Seleccionar rol</option>
                                <option value="dueno">Dueno</option>
                                <option value="coordinador">Coordinador</option>
                                <option value="asesor">Asesor</option>
                            </select>
                        </div>
                        <Button type="submit" className="w-full" disabled={sending || !role}>
                            {sending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Mail className="mr-2 h-4 w-4" />
                            )}
                            Enviar invitacion
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Active users */}
            <Card>
                <CardHeader>
                    <CardTitle>Usuarios activos ({profiles.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {profiles.map(profile => (
                            <div key={profile.id} className="flex items-center justify-between p-3 rounded-lg border">
                                <div>
                                    <p className="text-sm font-medium">{profile.full_name}</p>
                                    <p className="text-xs text-muted-foreground">{profile.email}</p>
                                </div>
                                <Badge variant="secondary" className={ROLE_COLORS[profile.role]}>
                                    {ROLE_LABELS[profile.role]}
                                </Badge>
                            </div>
                        ))}
                        {profiles.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No hay usuarios registrados
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Pending invitations */}
            {pendingInvitations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-amber-500" />
                            Invitaciones pendientes ({pendingInvitations.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {pendingInvitations.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border">
                                    <div>
                                        <p className="text-sm font-medium">{inv.email}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Expira: {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                                        </p>
                                    </div>
                                    <Badge variant="outline">
                                        {ROLE_LABELS[inv.role as Role]}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
