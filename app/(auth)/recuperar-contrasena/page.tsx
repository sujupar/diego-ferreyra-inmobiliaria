'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, MailCheck } from 'lucide-react'

export default function RecuperarContrasenaPage() {
    const [email, setEmail] = useState('')
    const [enviando, setEnviando] = useState(false)
    const [enviado, setEnviado] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setEnviando(true)
        setError(null)
        try {
            const res = await fetch('/api/auth/recuperar-contrasena', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            if (res.ok) {
                setEnviado(true)
                return
            }
            // Solo un 400 trae un mensaje pensado para mostrar; cualquier otra cosa
            // (un 504 de Netlify devuelve HTML) se resume en un texto propio.
            const datos: unknown = res.status === 400 ? await res.json().catch(() => null) : null
            const mensaje = datos && typeof datos === 'object' && 'error' in datos && typeof datos.error === 'string'
                ? datos.error
                : 'No pudimos procesar el pedido. Probá de nuevo en un momento.'
            setError(mensaje)
        } catch {
            setError('Error de conexión. Revisá tu internet y probá de nuevo.')
        } finally {
            setEnviando(false)
        }
    }

    if (enviado) {
        return (
            <Card>
                <CardContent className="py-10 text-center space-y-4">
                    <MailCheck className="h-12 w-12 text-primary mx-auto" />
                    <h2 className="text-lg font-semibold">Revisá tu email</h2>
                    <p className="text-sm text-muted-foreground">
                        Si <strong className="break-all">{email.trim()}</strong> tiene una cuenta, te mandamos un
                        enlace para elegir una contraseña nueva. Vence en 1 hora.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Si no aparece en unos minutos, revisá también la carpeta de spam o correo no deseado.
                    </p>
                    <div className="pt-2 flex flex-col gap-2">
                        <Button variant="outline" onClick={() => setEnviado(false)}>
                            Probar con otro email
                        </Button>
                        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                            Volver al login
                        </Link>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Recuperar contraseña</CardTitle>
                <CardDescription>
                    Escribí el email con el que entrás a la plataforma y te mandamos un enlace para elegir una
                    contraseña nueva.
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
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            autoFocus
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={enviando}>
                        {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Enviarme el enlace
                    </Button>
                </form>

                <div className="mt-4 text-center">
                    <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                        Volver al login
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
