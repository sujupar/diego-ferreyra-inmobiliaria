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
import { Loader2, Mail, UserPlus, Clock, RotateCw, X, UserMinus, UserCheck, AlertTriangle } from 'lucide-react'

const ROLE_COLORS: Record<Role, string> = {
    admin: 'bg-red-100 text-red-800',
    dueno: 'bg-blue-100 text-blue-800',
    coordinador: 'bg-purple-100 text-purple-800',
    asesor: 'bg-green-100 text-green-800',
    abogado: 'bg-amber-100 text-amber-800',
    agent: 'bg-gray-100 text-gray-800',
    viewer: 'bg-gray-100 text-gray-800',
}

export function UsersClient({
    profiles,
    invitations,
    currentUserId,
}: {
    profiles: Profile[]
    invitations: Invitation[]
    currentUserId: string
}) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<string>('')
    const [sending, setSending] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [actioning, setActioning] = useState<string | null>(null)
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
                text: data.acceptUrl
                    ? `${data.warning}\n${data.acceptUrl}`
                    : 'Invitación enviada correctamente',
            })
            setEmail('')
            setRole('')
            router.refresh()
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' })
        }
        setSending(false)
    }

    async function handleResend(invId: string, email: string) {
        setActioning(invId)
        setMessage(null)
        try {
            const res = await fetch(`/api/auth/invite/${invId}/resend`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Error al reenviar' })
            } else if (data.acceptUrl) {
                setMessage({ type: 'success', text: `${data.warning}\n${data.acceptUrl}` })
            } else {
                setMessage({
                    type: 'success',
                    text: data.extended
                        ? `Invitación reenviada a ${email} (vencimiento extendido).`
                        : `Invitación reenviada a ${email}.`,
                })
            }
            router.refresh()
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' })
        }
        setActioning(null)
    }

    async function handleCancelInvite(invId: string, email: string) {
        if (!confirm(`¿Cancelar la invitación a ${email}?`)) return
        setActioning(invId)
        try {
            const res = await fetch(`/api/auth/invite/${invId}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Error al cancelar' })
            } else {
                setMessage({ type: 'success', text: `Invitación cancelada.` })
                router.refresh()
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' })
        }
        setActioning(null)
    }

    async function handleToggleActive(profile: Profile) {
        const action = profile.is_active ? 'desactivar' : 'activar'
        if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${profile.full_name}? ${profile.is_active ? 'No podrá iniciar sesión.' : ''}`)) return
        setActioning(profile.id)
        try {
            const res = await fetch(`/api/users/${profile.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !profile.is_active }),
            })
            const data = await res.json()
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Error' })
            } else {
                setMessage({ type: 'success', text: `Usuario ${profile.is_active ? 'desactivado' : 'activado'}.` })
                router.refresh()
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' })
        }
        setActioning(null)
    }

    async function handleDeleteUser(profile: Profile) {
        const confirmation = prompt(`Vas a BORRAR a ${profile.full_name} (${profile.email}) definitivamente. Sus deals, tasaciones y propiedades quedarán huérfanos. Para confirmar, escribí ELIMINAR:`)
        if (confirmation !== 'ELIMINAR') return
        setActioning(profile.id)
        try {
            const res = await fetch(`/api/users/${profile.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Error al borrar' })
            } else {
                setMessage({ type: 'success', text: `Usuario ${profile.full_name} eliminado.` })
                router.refresh()
            }
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión' })
        }
        setActioning(null)
    }

    const pendingInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date())
    const expiredInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) <= new Date())

    const activeProfiles = profiles.filter(p => p.is_active)
    const inactiveProfiles = profiles.filter(p => !p.is_active)

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
                        Envía una invitación por email para que se una a la plataforma.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {message && (
                        <div className={`mb-4 p-3 rounded-md text-sm whitespace-pre-line ${
                            message.type === 'success'
                                ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200'
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
                                <option value="dueno">Dueño</option>
                                <option value="coordinador">Coordinador</option>
                                <option value="asesor">Asesor</option>
                                <option value="abogado">Abogado</option>
                            </select>
                        </div>
                        <Button type="submit" className="w-full" disabled={sending || !role}>
                            {sending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Mail className="mr-2 h-4 w-4" />
                            )}
                            Enviar invitación
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Active users */}
            <Card>
                <CardHeader>
                    <CardTitle>Usuarios activos ({activeProfiles.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {activeProfiles.map(profile => {
                            const isSelf = profile.id === currentUserId
                            const isActioning = actioning === profile.id
                            return (
                                <div key={profile.id} className="flex items-center justify-between p-3 rounded-lg border">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{profile.full_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={async () => {
                                                await fetch('/api/admin/impersonate', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ userId: profile.id }),
                                                })
                                                window.location.href = '/'
                                            }}
                                            className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                                            disabled={isSelf}
                                            title={isSelf ? 'No podés verte como vos mismo' : 'Ver como este usuario'}
                                        >
                                            Ver como
                                        </button>
                                        {!isSelf && (
                                            <>
                                                <button
                                                    onClick={() => handleToggleActive(profile)}
                                                    disabled={isActioning}
                                                    className="text-xs p-1.5 rounded hover:bg-muted transition-colors"
                                                    title="Desactivar usuario"
                                                >
                                                    {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(profile)}
                                                    disabled={isActioning}
                                                    className="text-xs p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                    title="Eliminar usuario (definitivo)"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                        <Badge variant="secondary" className={ROLE_COLORS[profile.role]}>
                                            {ROLE_LABELS[profile.role]}
                                        </Badge>
                                    </div>
                                </div>
                            )
                        })}
                        {activeProfiles.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No hay usuarios activos
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
                        <CardDescription>
                            Reenviá si el usuario no recibió el email, o cancelá si te equivocaste.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {pendingInvitations.map(inv => {
                                const isActioning = actioning === inv.id
                                return (
                                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{inv.email}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Expira: {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleResend(inv.id, inv.email)}
                                                disabled={isActioning}
                                                className="gap-1.5"
                                            >
                                                {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                                Reenviar
                                            </Button>
                                            <button
                                                onClick={() => handleCancelInvite(inv.id, inv.email)}
                                                disabled={isActioning}
                                                className="text-xs p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                title="Cancelar invitación"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <Badge variant="outline">
                                                {ROLE_LABELS[inv.role as Role]}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Expired invitations */}
            {expiredInvitations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-muted-foreground">
                            <AlertTriangle className="h-5 w-5" />
                            Invitaciones expiradas ({expiredInvitations.length})
                        </CardTitle>
                        <CardDescription>
                            Reenviar extiende el vencimiento por 7 días más.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {expiredInvitations.map(inv => {
                                const isActioning = actioning === inv.id
                                return (
                                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border gap-2 opacity-75">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{inv.email}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Expiró: {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleResend(inv.id, inv.email)}
                                                disabled={isActioning}
                                                className="gap-1.5"
                                            >
                                                {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                                Reenviar
                                            </Button>
                                            <button
                                                onClick={() => handleCancelInvite(inv.id, inv.email)}
                                                disabled={isActioning}
                                                className="text-xs p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                title="Cancelar invitación"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <Badge variant="outline">
                                                {ROLE_LABELS[inv.role as Role]}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Inactive users */}
            {inactiveProfiles.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-muted-foreground">
                            <UserMinus className="h-5 w-5" />
                            Usuarios desactivados ({inactiveProfiles.length})
                        </CardTitle>
                        <CardDescription>
                            No pueden iniciar sesión. Sus datos históricos se preservan.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {inactiveProfiles.map(profile => {
                                const isActioning = actioning === profile.id
                                return (
                                    <div key={profile.id} className="flex items-center justify-between p-3 rounded-lg border gap-2 opacity-75">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{profile.full_name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleToggleActive(profile)}
                                                disabled={isActioning}
                                                className="gap-1.5"
                                            >
                                                {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                                                Reactivar
                                            </Button>
                                            <button
                                                onClick={() => handleDeleteUser(profile)}
                                                disabled={isActioning}
                                                className="text-xs p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                title="Eliminar definitivamente"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <Badge variant="secondary" className={ROLE_COLORS[profile.role]}>
                                                {ROLE_LABELS[profile.role]}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
