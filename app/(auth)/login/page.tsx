'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function LoginPageWrapper() {
    return (
        <Suspense fallback={
            <Card><CardContent className="py-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent></Card>
        }>
            <LoginPage />
        </Suspense>
    )
}

function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()

    const errorParam = searchParams.get('error')
    const redirectTo = searchParams.get('redirectTo') || '/'

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const supabase = createClient()
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (signInError) {
            setError(
                signInError.message === 'Invalid login credentials'
                    ? 'Email o contraseña incorrectos'
                    : signInError.message
            )
            setLoading(false)
            return
        }

        if (!data.session) {
            setError('No se pudo crear la sesión. Verifica tus credenciales.')
            setLoading(false)
            return
        }

        window.location.href = redirectTo
    }

    return (
        <Card>
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Iniciar Sesion</CardTitle>
                <CardDescription>
                    Ingresa tus credenciales para acceder a la plataforma
                </CardDescription>
            </CardHeader>
            <CardContent>
                {(error || errorParam === 'inactive') && (
                    <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {errorParam === 'inactive'
                            ? 'Tu cuenta ha sido desactivada. Contacta al administrador.'
                            : error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Contrasena</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Ingresar
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
