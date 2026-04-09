'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { Role } from '@/types/auth.types'

interface InvitationData {
    email: string
    role: string
    expires_at: string
}

export default function AcceptInvitePageWrapper() {
    return (
        <Suspense fallback={
            <Card><CardContent className="py-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent></Card>
        }>
            <AcceptInvitePage />
        </Suspense>
    )
}

function AcceptInvitePage() {
    const [invitation, setInvitation] = useState<InvitationData | null>(null)
    const [fullName, setFullName] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [invalidToken, setInvalidToken] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get('token')

    useEffect(() => {
        async function validateToken() {
            if (!token) {
                setInvalidToken(true)
                setLoading(false)
                return
            }

            try {
                const res = await fetch(`/api/auth/accept-invite?token=${token}`)
                if (!res.ok) {
                    setInvalidToken(true)
                    setLoading(false)
                    return
                }
                const data = await res.json()
                setInvitation(data)
            } catch {
                setInvalidToken(true)
            }
            setLoading(false)
        }

        validateToken()
    }, [token])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (password !== confirmPassword) {
            setError('Las contrasenas no coinciden')
            return
        }
        if (password.length < 6) {
            setError('La contrasena debe tener al menos 6 caracteres')
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            const res = await fetch('/api/auth/accept-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, fullName, password }),
            })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Error al crear la cuenta')
                setSubmitting(false)
                return
            }

            setSuccess(true)

            // Auto-login after account creation
            const supabase = createClient()
            await supabase.auth.signInWithPassword({
                email: invitation!.email,
                password,
            })

            setTimeout(() => {
                router.push('/')
                router.refresh()
            }, 2000)
        } catch {
            setError('Error de conexion. Intenta de nuevo.')
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="py-12 flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (invalidToken) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <h2 className="text-lg font-semibold mb-2">Invitacion invalida</h2>
                    <p className="text-sm text-muted-foreground">
                        Este enlace de invitacion no es valido o ha expirado.
                        Contacta al administrador para una nueva invitacion.
                    </p>
                </CardContent>
            </Card>
        )
    }

    if (success) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                    <h2 className="text-lg font-semibold mb-2">Cuenta creada</h2>
                    <p className="text-sm text-muted-foreground">
                        Redirigiendo a la plataforma...
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Crear tu cuenta</CardTitle>
                <CardDescription>
                    Has sido invitado como <strong>{ROLE_LABELS[invitation!.role as Role]}</strong>
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={invitation!.email} disabled />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="fullName">Nombre completo</Label>
                        <Input
                            id="fullName"
                            placeholder="Tu nombre"
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Contrasena</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="Minimo 6 caracteres"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Repite tu contrasena"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear cuenta
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
