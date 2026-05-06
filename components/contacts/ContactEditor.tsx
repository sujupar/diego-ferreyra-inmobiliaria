'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface ContactPayload {
    full_name: string
    phone?: string | null
    email?: string | null
    origin?: string | null
    notes?: string | null
}

export interface ContactEditorProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Si está presente, abrimos en modo EDICIÓN. */
    contactId?: string | null
    /** Si NO hay contactId pero sí appraisalId, creamos contacto y lo asociamos a la tasación. */
    appraisalId?: string | null
    /** Si NO hay contactId pero sí dealId, también lo asociamos al deal. */
    dealId?: string | null
    /** Datos sugeridos para precargar al crear (ej: desde una tasación con nombre/tel inline). */
    initial?: Partial<ContactPayload>
    /** Llamado tras guardar exitosamente con el contactId resultante. */
    onSaved?: (contactId: string) => void
}

const ORIGINS = [
    { value: 'embudo', label: 'Embudo' },
    { value: 'referido', label: 'Referido' },
    { value: 'historico', label: 'Histórico' },
    { value: 'tasacion', label: 'Tasación' },
]

export function ContactEditor({
    open,
    onOpenChange,
    contactId,
    appraisalId,
    dealId,
    initial,
    onSaved,
}: ContactEditorProps) {
    const isEdit = Boolean(contactId)

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState<ContactPayload>({
        full_name: '',
        phone: '',
        email: '',
        origin: '',
        notes: '',
    })

    // Cargar contacto / resetear el form SOLO cuando el modal se abre
    // (open: false → true). No dependemos de `initial.*` para evitar loops
    // cuando el caller pasa un objeto inline que se recrea en cada render
    // del padre.
    //
    // `initial` se lee via ref para tener siempre el último valor sin
    // disparar re-runs del effect.
    const initialRef = useRef(initial)
    useEffect(() => { initialRef.current = initial })
    const wasOpenRef = useRef(false)

    useEffect(() => {
        if (!open) {
            wasOpenRef.current = false
            return
        }
        // Solo correr la lógica cuando el modal acaba de abrir.
        if (wasOpenRef.current) return
        wasOpenRef.current = true

        setError(null)
        const seed = initialRef.current

        if (contactId) {
            setLoading(true)
            fetch(`/api/contacts/${contactId}`)
                .then(r => r.json())
                .then((j) => {
                    const c = j.contact || j.data || j
                    if (c && c.full_name !== undefined) {
                        setForm({
                            full_name: c.full_name || '',
                            phone: c.phone || '',
                            email: c.email || '',
                            origin: c.origin || '',
                            notes: c.notes || '',
                        })
                    }
                })
                .catch(err => {
                    console.error('[ContactEditor] load:', err)
                    setError('No se pudo cargar el contacto.')
                })
                .finally(() => setLoading(false))
        } else {
            setForm({
                full_name: seed?.full_name || '',
                phone: seed?.phone || '',
                email: seed?.email || '',
                origin: seed?.origin || (appraisalId ? 'tasacion' : ''),
                notes: seed?.notes || '',
            })
        }
    }, [open, contactId, appraisalId])

    function update<K extends keyof ContactPayload>(field: K, value: ContactPayload[K]) {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (!form.full_name.trim()) {
            setError('El nombre es obligatorio.')
            return
        }
        setError(null)
        setSaving(true)

        try {
            const body: ContactPayload = {
                full_name: form.full_name.trim(),
                phone: form.phone?.trim() || null,
                email: form.email?.trim() || null,
                origin: form.origin || null,
                notes: form.notes?.trim() || null,
            }

            let resultId: string

            if (contactId) {
                const r = await fetch(`/api/contacts/${contactId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}))
                    throw new Error(j.error || 'Error al actualizar contacto')
                }
                resultId = contactId
            } else {
                const r = await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}))
                    throw new Error(j.error || 'Error al crear contacto')
                }
                const j = await r.json()
                resultId = j.id

                // Asociar a la tasación / deal si vinieron con esos IDs.
                // Si la asociación falla, mostramos el error pero NO cerramos —
                // el contacto YA fue creado y dejarlo desligado en silencio
                // confunde al usuario.
                const linkErrors: string[] = []
                if (appraisalId) {
                    const r = await fetch(`/api/appraisals/${appraisalId}/contact`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contact_id: resultId }),
                    }).catch(() => null)
                    if (!r || !r.ok) {
                        const j = r ? await r.json().catch(() => ({})) : {}
                        linkErrors.push(`No se pudo asociar el contacto a la tasación${j?.error ? `: ${j.error}` : ''}`)
                    }
                }
                if (dealId) {
                    const r = await fetch(`/api/deals/${dealId}/contact`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contact_id: resultId }),
                    }).catch(() => null)
                    if (!r || !r.ok) {
                        const j = r ? await r.json().catch(() => ({})) : {}
                        linkErrors.push(`No se pudo asociar el contacto al proceso${j?.error ? `: ${j.error}` : ''}`)
                    }
                }

                if (linkErrors.length > 0) {
                    setError(`Contacto creado, pero: ${linkErrors.join(' / ')}. Asocialo manualmente.`)
                    onSaved?.(resultId)
                    return
                }
            }

            onSaved?.(resultId)
            onOpenChange(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : (
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="contact-name">Nombre completo *</Label>
                            <Input
                                id="contact-name"
                                value={form.full_name}
                                onChange={e => update('full_name', e.target.value)}
                                required
                                placeholder="Juan Pérez"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="contact-phone">Teléfono</Label>
                                <Input
                                    id="contact-phone"
                                    value={form.phone || ''}
                                    onChange={e => update('phone', e.target.value)}
                                    placeholder="+54 9 11 …"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contact-email">Email</Label>
                                <Input
                                    id="contact-email"
                                    type="email"
                                    value={form.email || ''}
                                    onChange={e => update('email', e.target.value)}
                                    placeholder="email@dominio.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contact-origin">Origen</Label>
                            <select
                                id="contact-origin"
                                value={form.origin || ''}
                                onChange={e => update('origin', e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">Seleccionar…</option>
                                {ORIGINS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contact-notes">Notas</Label>
                            <textarea
                                id="contact-notes"
                                value={form.notes || ''}
                                onChange={e => update('notes', e.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                                placeholder="Notas internas…"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded px-3 py-2">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={saving} className="flex-1">
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEdit ? 'Guardar Cambios' : 'Crear Contacto'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
