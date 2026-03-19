'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Loader2, ImageIcon, RefreshCw, Save, Mail, Plus, X } from 'lucide-react'

interface ImageSlot {
    id: string
    label: string
    description: string
    filename: string
    exists: boolean
    currentPath: string | null
}

export default function SettingsPage() {
    const [slots, setSlots] = useState<ImageSlot[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState<string | null>(null)
    const [savingText, setSavingText] = useState<string | null>(null)

    // Report settings state
    const [recipients, setRecipients] = useState<string[]>([])
    const [newEmail, setNewEmail] = useState('')
    const [dailyEnabled, setDailyEnabled] = useState(true)
    const [weeklyEnabled, setWeeklyEnabled] = useState(true)
    const [monthlyEnabled, setMonthlyEnabled] = useState(true)
    const [reportLoading, setReportLoading] = useState(true)
    const [reportSaving, setReportSaving] = useState(false)

    useEffect(() => {
        fetch('/api/settings/report-recipients')
            .then(r => r.json())
            .then(data => {
                setRecipients(data.recipients || [])
                setDailyEnabled(data.daily_enabled ?? true)
                setWeeklyEnabled(data.weekly_enabled ?? true)
                setMonthlyEnabled(data.monthly_enabled ?? true)
                setReportLoading(false)
            })
            .catch(() => setReportLoading(false))
    }, [])

    function addRecipient() {
        const email = newEmail.trim()
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
        if (recipients.includes(email)) return
        setRecipients(prev => [...prev, email])
        setNewEmail('')
    }

    function removeRecipient(email: string) {
        setRecipients(prev => prev.filter(e => e !== email))
    }

    async function saveReportSettings() {
        setReportSaving(true)
        try {
            await fetch('/api/settings/report-recipients', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipients,
                    daily_enabled: dailyEnabled,
                    weekly_enabled: weeklyEnabled,
                    monthly_enabled: monthlyEnabled,
                }),
            })
        } catch (err) {
            console.error('Failed to save report settings:', err)
        } finally {
            setReportSaving(false)
        }
    }

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

    function handleTextChange(id: string, field: 'label' | 'description', value: string) {
        setSlots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    }

    async function saveSlotText(id: string) {
        const slot = slots.find(s => s.id === id)
        if (!slot) return
        setSavingText(id)
        try {
            await fetch('/api/settings/market-images', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, label: slot.label, description: slot.description }),
            })
        } catch (err) {
            console.error('Save text failed:', err)
        } finally {
            setSavingText(null)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Configuracion</h1>
                <p className="text-muted-foreground mt-1">Administra los datos del sistema</p>
            </div>

            <section className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold">Datos de Mercado Mensuales</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Estas imagenes aparecen en las paginas 3 y 4 del informe PDF. Actualizar mensualmente.
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

                                    {/* Editable label */}
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Titulo en el PDF</Label>
                                        <Input
                                            value={slot.label}
                                            onChange={e => handleTextChange(slot.id, 'label', e.target.value)}
                                            onBlur={() => saveSlotText(slot.id)}
                                            className="text-sm"
                                        />
                                    </div>

                                    {/* Editable description */}
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Descripcion adicional (opcional)</Label>
                                        <textarea
                                            value={slot.description}
                                            onChange={e => handleTextChange(slot.id, 'description', e.target.value)}
                                            onBlur={() => saveSlotText(slot.id)}
                                            className="w-full text-sm border rounded-md p-2 min-h-[60px] resize-y bg-background"
                                            placeholder="Texto adicional que aparece debajo de la imagen en el PDF..."
                                        />
                                    </div>

                                    {savingText === slot.id && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Save className="h-3 w-3" /> Guardando...
                                        </p>
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

            {/* Report Recipients Section */}
            <section className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold">Reportes de Marketing</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Configura los destinatarios y frecuencia de los reportes automaticos de marketing.
                    </p>
                </div>

                {reportLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Destinatarios
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Email list */}
                            {recipients.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {recipients.map(email => (
                                        <span key={email} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm">
                                            {email}
                                            <button onClick={() => removeRecipient(email)} className="hover:text-destructive">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Add email */}
                            <div className="flex gap-2">
                                <Input
                                    type="email"
                                    placeholder="email@ejemplo.com"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addRecipient()}
                                    className="flex-1"
                                />
                                <Button variant="outline" size="sm" onClick={addRecipient}>
                                    <Plus className="h-4 w-4 mr-1" /> Agregar
                                </Button>
                            </div>

                            {/* Report type toggles */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-sm font-medium">Reportes activos</Label>
                                <div className="space-y-2">
                                    {[
                                        { label: 'Reporte Diario', desc: 'Todos los dias a las 8:00 AM', value: dailyEnabled, setter: setDailyEnabled },
                                        { label: 'Reporte Semanal', desc: 'Cada lunes a las 8:00 AM', value: weeklyEnabled, setter: setWeeklyEnabled },
                                        { label: 'Reporte Mensual', desc: 'El 1ro de cada mes a las 8:00 AM', value: monthlyEnabled, setter: setMonthlyEnabled },
                                    ].map(toggle => (
                                        <label key={toggle.label} className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                                            <div>
                                                <p className="text-sm font-medium">{toggle.label}</p>
                                                <p className="text-xs text-muted-foreground">{toggle.desc}</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={toggle.value}
                                                onChange={e => toggle.setter(e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Save button */}
                            <Button onClick={saveReportSettings} disabled={reportSaving} className="w-full">
                                {reportSaving ? (
                                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
                                ) : (
                                    <><Save className="h-4 w-4 mr-2" /> Guardar configuracion</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </section>
        </div>
    )
}
