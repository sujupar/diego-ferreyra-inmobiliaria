'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Loader2, ImageIcon, RefreshCw } from 'lucide-react'

interface ImageSlot {
    id: string
    label: string
    filename: string
    exists: boolean
    currentPath: string | null
}

export default function SettingsPage() {
    const [slots, setSlots] = useState<ImageSlot[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/settings/market-images')
            .then(r => r.json())
            .then(data => {
                setSlots(data.slots)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    async function handleUpload(slotId: string, file: File) {
        setUploading(slotId)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('slot', slotId)

        try {
            const res = await fetch('/api/settings/upload-market-image', {
                method: 'POST',
                body: formData,
            })
            const result = await res.json()
            if (result.success) {
                setSlots(prev => prev.map(s =>
                    s.id === slotId
                        ? { ...s, exists: true, currentPath: result.path + '?t=' + Date.now() }
                        : s
                ))
            } else {
                alert(result.error || 'Error al subir la imagen')
            }
        } catch (err) {
            console.error('Upload failed:', err)
            alert('Error al subir la imagen')
        } finally {
            setUploading(null)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
                <p className="text-muted-foreground mt-1">Administra los datos del sistema</p>
            </div>

            <section className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold">Datos de Mercado Mensuales</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Estas imágenes aparecen en las páginas 3 y 4 del informe PDF. Actualizar mensualmente.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {slots.map(slot => (
                            <Card key={slot.id}>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">{slot.label}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Current image preview */}
                                    {slot.currentPath ? (
                                        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border">
                                            <img
                                                src={slot.currentPath}
                                                alt={slot.label}
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                    ) : (
                                        <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border border-dashed">
                                            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                                        </div>
                                    )}

                                    {/* Upload button */}
                                    <label className="block cursor-pointer">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0]
                                                if (file) handleUpload(slot.id, file)
                                                e.target.value = ''
                                            }}
                                            disabled={uploading === slot.id}
                                        />
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2 pointer-events-none"
                                            disabled={uploading === slot.id}
                                        >
                                            {uploading === slot.id ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo...</>
                                            ) : slot.exists ? (
                                                <><RefreshCw className="h-4 w-4" /> Reemplazar imagen</>
                                            ) : (
                                                <><Upload className="h-4 w-4" /> Subir imagen</>
                                            )}
                                        </Button>
                                    </label>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
