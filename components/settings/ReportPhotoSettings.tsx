'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Loader2, UserCircle2, Check } from 'lucide-react'

interface Me {
    id: string
    full_name: string | null
    role: string
    report_photo_url: string | null
    report_in_pdf: boolean
}

interface ProfileRow {
    id: string
    full_name: string | null
    email: string | null
    role: string
    report_photo_url: string | null
    report_in_pdf: boolean
}

export function ReportPhotoSettings() {
    const [me, setMe] = useState<Me | null>(null)
    const [myPhoto, setMyPhoto] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const [profiles, setProfiles] = useState<ProfileRow[]>([])
    const [savingId, setSavingId] = useState<string | null>(null)

    const isAdmin = me ? ['admin', 'dueno'].includes(me.role) : false

    useEffect(() => {
        fetch('/api/me')
            .then(r => r.json())
            .then(({ data }) => {
                if (data) { setMe(data); setMyPhoto(data.report_photo_url) }
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        if (!isAdmin) return
        fetch('/api/profiles/report-settings')
            .then(r => r.json())
            .then(({ data }) => setProfiles(data || []))
            .catch(() => setProfiles([]))
    }, [isAdmin])

    async function handleUpload(file: File) {
        setUploading(true)
        setError(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch('/api/profile/photo', { method: 'POST', body: fd })
            const json = await res.json()
            if (!res.ok) { setError(json.error || 'No se pudo subir la foto'); return }
            setMyPhoto(json.url)
        } catch {
            setError('Error al subir la foto')
        } finally {
            setUploading(false)
        }
    }

    async function toggleAuth(id: string, next: boolean) {
        setSavingId(id)
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_in_pdf: next }),
            })
            if (res.ok) {
                setProfiles(prev => prev.map(p => p.id === id ? { ...p, report_in_pdf: next } : p))
            }
        } catch {
            /* noop */
        } finally {
            setSavingId(null)
        }
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Foto en informes de tasacion</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Tu foto aparece en la portada, los divisores y las paginas finales del informe
                    cuando vos haces la tasacion. Si no subis foto, se usa la de Diego por defecto.
                </p>
            </div>

            {/* Mi foto */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Mi foto</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-6">
                    <div className="h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border">
                        {myPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={myPhoto} alt="Mi foto" className="h-full w-full object-cover" />
                        ) : (
                            <UserCircle2 className="h-12 w-12 text-muted-foreground" />
                        )}
                    </div>
                    <div className="space-y-2">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                        />
                        <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {myPhoto ? 'Cambiar foto' : 'Subir foto'}
                        </Button>
                        <p className="text-xs text-muted-foreground">PNG/JPG, hasta 5 MB. Ideal: foto vertical de cuerpo medio.</p>
                        {me && !me.report_in_pdf && (
                            <p className="text-xs text-amber-600">
                                Tu perfil todavia no esta autorizado para aparecer en informes. Pedile a un administrador que te active.
                            </p>
                        )}
                        {error && <p className="text-xs text-red-600">{error}</p>}
                    </div>
                </CardContent>
            </Card>

            {/* Autorizacion (admin/dueño) */}
            {isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Autorizar perfiles en informes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground mb-2">
                            Elegi que perfiles pueden aparecer con su foto en los informes. Si un perfil
                            autorizado hace la tasacion, su foto reemplaza la de Diego.
                        </p>
                        {profiles.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Sin perfiles para mostrar (o falta correr la migracion de la base).
                            </p>
                        )}
                        {profiles.map(p => (
                            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                                <span className="flex-1 truncate text-sm font-medium">
                                    {p.full_name || p.email || p.id}
                                    <span className="text-xs text-muted-foreground ml-2">{p.role}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {p.report_photo_url ? 'foto cargada' : 'sin foto'}
                                </span>
                                <Button
                                    size="sm"
                                    variant={p.report_in_pdf ? 'default' : 'outline'}
                                    className="gap-1 min-w-[140px]"
                                    disabled={savingId === p.id}
                                    onClick={() => toggleAuth(p.id, !p.report_in_pdf)}
                                >
                                    {savingId === p.id
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : p.report_in_pdf && <Check className="h-3 w-3" />}
                                    {p.report_in_pdf ? 'Autorizado' : 'No autorizado'}
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </section>
    )
}
