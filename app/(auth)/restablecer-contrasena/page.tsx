'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
    esTokenConForma,
    mensajeEnlaceInvalido,
    validarNuevaContrasena,
    MIN_CARACTERES,
} from '@/lib/auth/recuperar-contrasena'

export default function RestablecerContrasenaWrapper() {
    return (
        <Suspense fallback={
            <Card><CardContent className="py-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent></Card>
        }>
            <RestablecerContrasena />
        </Suspense>
    )
}

type Estado = 'formulario' | 'enlace-invalido' | 'listo'

function RestablecerContrasena() {
    const tokenHash = useSearchParams().get('token_hash')
    const [estado, setEstado] = useState<Estado>(esTokenConForma(tokenHash) ? 'formulario' : 'enlace-invalido')
    const [contrasena, setContrasena] = useState('')
    const [repetida, setRepetida] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // El token es de un solo uso. Si ya se canjeó y lo que falló fue guardar la
    // contraseña (red, contraseña repetida), el reintento NO tiene que volver a
    // canjearlo: la sesión ya está abierta y el token ya no sirve.
    const [verificado, setVerificado] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const invalida = validarNuevaContrasena(contrasena, repetida)
        if (invalida) {
            setError(invalida)
            return
        }
        if (!esTokenConForma(tokenHash)) {
            setEstado('enlace-invalido')
            return
        }

        setGuardando(true)
        setError(null)
        const supabase = createClient()
        try {
            // El token se canjea RECIÉN acá y no al abrir la página: los antivirus de
            // correo abren los enlaces antes que la persona, y si el canje fuera al
            // cargar, quemarían el enlace de un solo uso antes de que llegue a usarlo.
            if (!verificado) {
                const { error: errorVerificacion } = await supabase.auth.verifyOtp({
                    type: 'recovery',
                    token_hash: tokenHash,
                })
                if (errorVerificacion) {
                    if (mensajeEnlaceInvalido(errorVerificacion.message)) {
                        setEstado('enlace-invalido')
                    } else {
                        setError('No pudimos validar el enlace. Probá de nuevo en un momento.')
                    }
                    return
                }
                setVerificado(true)
            }

            const { error: errorGuardado } = await supabase.auth.updateUser({
                password: contrasena.normalize('NFC'),
            })
            if (errorGuardado) {
                setError(traducirErrorGuardado(errorGuardado.message))
                return
            }

            // Quien recupera la contraseña puede estar haciéndolo porque alguien más la
            // tenía: se cierran las otras sesiones de la cuenta. Si falla, la contraseña
            // ya cambió igual, así que no se frena por esto.
            await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)

            setEstado('listo')
            setTimeout(() => { window.location.href = '/' }, 1500)
        } catch {
            setError('Error de conexión. Revisá tu internet y probá de nuevo.')
        } finally {
            setGuardando(false)
        }
    }

    if (estado === 'enlace-invalido') {
        return (
            <Card>
                <CardContent className="py-10 text-center space-y-4">
                    <XCircle className="h-12 w-12 text-destructive mx-auto" />
                    <h2 className="text-lg font-semibold">Este enlace venció o ya se usó</h2>
                    <p className="text-sm text-muted-foreground">
                        Los enlaces para cambiar la contraseña sirven una sola vez y duran 1 hora. Pedí uno nuevo y
                        usá el último que te llegue.
                    </p>
                    <div className="pt-2 flex flex-col gap-2">
                        <Button asChild>
                            <Link href="/recuperar-contrasena">Pedir un enlace nuevo</Link>
                        </Button>
                        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                            Volver al login
                        </Link>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (estado === 'listo') {
        return (
            <Card>
                <CardContent className="py-10 text-center space-y-3">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                    <h2 className="text-lg font-semibold">Contraseña actualizada</h2>
                    <p className="text-sm text-muted-foreground">Entrando a la plataforma...</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Elegí tu contraseña nueva</CardTitle>
                <CardDescription>
                    Al guardarla entrás directo a la plataforma.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <div role="alert" className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="contrasena">Contraseña nueva</Label>
                        <Input
                            id="contrasena"
                            type="password"
                            placeholder={`Mínimo ${MIN_CARACTERES} caracteres`}
                            value={contrasena}
                            onChange={e => setContrasena(e.target.value)}
                            required
                            autoComplete="new-password"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="repetida">Repetí la contraseña</Label>
                        <Input
                            id="repetida"
                            type="password"
                            value={repetida}
                            onChange={e => setRepetida(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={guardando}>
                        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar y entrar
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

function traducirErrorGuardado(mensaje: string): string {
    if (/different from the old password/i.test(mensaje)) {
        return 'La contraseña nueva tiene que ser distinta de la anterior.'
    }
    if (/weak|pwned|leaked|characters/i.test(mensaje)) {
        return 'Esa contraseña es muy fácil de adivinar. Probá con otra más larga o con números y símbolos.'
    }
    return 'No pudimos guardar la contraseña. Probá de nuevo en un momento.'
}
