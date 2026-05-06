'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface EmailType {
    id: string
    label: string
    description: string
    fields: Array<{ name: string; label: string; placeholder?: string }>
}

const EMAIL_TYPES: EmailType[] = [
    {
        id: 'deal_created',
        label: 'Tasación agendada',
        description: 'Asesor + admins. Disparado al crear un deal.',
        fields: [{ name: 'dealId', label: 'Deal ID', placeholder: 'uuid del deal' }],
    },
    {
        id: 'visit_completed',
        label: 'Visita realizada',
        description: 'Coordinador + admins + asesor (CC).',
        fields: [{ name: 'dealId', label: 'Deal ID' }],
    },
    {
        id: 'appraisal_sent',
        label: 'Tasación entregada',
        description: 'Coordinador + admins + asesor. Adjunta PDF.',
        fields: [
            { name: 'dealId', label: 'Deal ID' },
            { name: 'appraisalId', label: 'Appraisal ID' },
        ],
    },
    {
        id: 'property_created',
        label: 'Propiedad cargada',
        description: 'Coordinador + admins + asesor (CC).',
        fields: [{ name: 'propertyId', label: 'Property ID' }],
    },
    {
        id: 'docs_ready_for_lawyer',
        label: 'Docs listos para abogado',
        description: 'Todos los abogados activos.',
        fields: [{ name: 'propertyId', label: 'Property ID' }],
    },
    {
        id: 'doc_rejected',
        label: 'Documento rechazado',
        description: 'Asesor + coordinador.',
        fields: [
            { name: 'propertyId', label: 'Property ID' },
            { name: 'itemKey', label: 'Item key', placeholder: 'p.ej. titulo' },
            { name: 'reviewerId', label: 'Reviewer (abogado) ID' },
        ],
    },
    {
        id: 'docs_resubmitted',
        label: 'Docs reenviados tras rechazo',
        description: 'Abogado original (o todos los abogados).',
        fields: [
            { name: 'propertyId', label: 'Property ID' },
            { name: 'itemKey', label: 'Item key' },
            { name: 'reviewerId', label: 'Previous reviewer ID (opcional)' },
        ],
    },
    {
        id: 'property_captured',
        label: 'Propiedad captada',
        description: 'Asesor (felicitación) + admins (KPI).',
        fields: [{ name: 'propertyId', label: 'Property ID' }],
    },
]

interface Settings {
    test_mode_enabled: boolean
    test_recipient_email: string | null
    alert_admins_on_lawyer_failure: boolean
}

interface TestResult {
    ok: boolean
    error?: string
    timestamp: string
}

export default function EmailTestClient() {
    const [settings, setSettings] = useState<Settings | null>(null)
    const [savingSettings, setSavingSettings] = useState(false)
    const [testRecipient, setTestRecipient] = useState('')
    const [fields, setFields] = useState<Record<string, Record<string, string>>>({})
    const [running, setRunning] = useState<string | null>(null)
    const [results, setResults] = useState<Record<string, TestResult>>({})

    useEffect(() => {
        fetch('/api/settings/notifications')
            .then(r => r.json())
            .then(j => {
                if (j.data) {
                    setSettings(j.data)
                    setTestRecipient(j.data.test_recipient_email || '')
                }
            })
            .catch(err => console.error(err))
    }, [])

    function setFieldValue(typeId: string, field: string, value: string) {
        setFields(prev => ({ ...prev, [typeId]: { ...(prev[typeId] || {}), [field]: value } }))
    }

    async function toggleTestMode(enabled: boolean) {
        setSavingSettings(true)
        try {
            const r = await fetch('/api/settings/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_mode_enabled: enabled,
                    test_recipient_email: testRecipient || null,
                }),
            })
            const j = await r.json()
            if (j.data) setSettings(j.data)
        } finally {
            setSavingSettings(false)
        }
    }

    async function saveRecipient() {
        if (!testRecipient) return
        setSavingSettings(true)
        try {
            const r = await fetch('/api/settings/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test_recipient_email: testRecipient }),
            })
            const j = await r.json()
            if (j.data) setSettings(j.data)
        } finally {
            setSavingSettings(false)
        }
    }

    async function runTest(type: EmailType) {
        const body = fields[type.id] || {}
        const missing = type.fields.filter(f => !f.label.toLowerCase().includes('opcional') && !body[f.name])
        if (missing.length > 0) {
            setResults(prev => ({
                ...prev,
                [type.id]: { ok: false, error: `Faltan campos: ${missing.map(f => f.label).join(', ')}`, timestamp: new Date().toISOString() },
            }))
            return
        }

        setRunning(type.id)
        try {
            const r = await fetch(`/api/admin/email-test/${type.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const j = await r.json()
            setResults(prev => ({
                ...prev,
                [type.id]: { ok: !!j.ok, error: j.ok ? undefined : (j.error || 'Error desconocido'), timestamp: new Date().toISOString() },
            }))
        } catch (err) {
            setResults(prev => ({
                ...prev,
                [type.id]: { ok: false, error: err instanceof Error ? err.message : 'Error de red', timestamp: new Date().toISOString() },
            }))
        } finally {
            setRunning(null)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Mail className="h-6 w-6" /> Test de Notificaciones por Email
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Verificá que cada tipo de email transaccional se envía correctamente.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" /> Modo Prueba
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Cuando está activo, todos los emails se redirigen al destinatario configurado y el subject lleva
                        prefijo <code className="font-mono text-xs">[PRUEBA]</code>. Recomendado para hacer estos tests.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="sm:col-span-2 space-y-2">
                            <Label htmlFor="test-recipient">Destinatario de prueba</Label>
                            <Input
                                id="test-recipient"
                                type="email"
                                value={testRecipient}
                                onChange={e => setTestRecipient(e.target.value)}
                                placeholder="email@dominio.com"
                            />
                        </div>
                        <Button variant="outline" onClick={saveRecipient} disabled={savingSettings || !testRecipient}>
                            Guardar destinatario
                        </Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant={settings?.test_mode_enabled ? 'default' : 'outline'}
                            onClick={() => toggleTestMode(true)}
                            disabled={savingSettings || !testRecipient}
                        >
                            {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Activar modo prueba
                        </Button>
                        <Button
                            variant={settings?.test_mode_enabled ? 'outline' : 'default'}
                            onClick={() => toggleTestMode(false)}
                            disabled={savingSettings}
                        >
                            Desactivar
                        </Button>
                        {settings && (
                            <span className={`text-sm font-medium ${settings.test_mode_enabled ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                Estado: {settings.test_mode_enabled ? 'ACTIVO' : 'desactivado'}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h2 className="text-lg font-semibold">Tipos de email</h2>
                <p className="text-xs text-muted-foreground">
                    Pegá el ID de una entidad real (deal/appraisal/property) y enviá. La notificación usa exactamente la
                    misma lógica que en producción — incluyendo PDF adjunto donde aplique.
                </p>

                {EMAIL_TYPES.map(type => {
                    const result = results[type.id]
                    const isRunning = running === type.id
                    return (
                        <Card key={type.id}>
                            <CardContent className="py-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <h3 className="font-semibold">{type.label}</h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => runTest(type)}
                                        disabled={isRunning}
                                        className="shrink-0"
                                    >
                                        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {type.fields.map(field => (
                                        <div key={field.name} className="space-y-1">
                                            <Label className="text-xs">{field.label}</Label>
                                            <Input
                                                value={fields[type.id]?.[field.name] || ''}
                                                onChange={e => setFieldValue(type.id, field.name, e.target.value)}
                                                placeholder={field.placeholder || field.label}
                                                className="font-mono text-xs"
                                            />
                                        </div>
                                    ))}
                                </div>
                                {result && (
                                    <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded ${result.ok ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'}`}>
                                        {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                        <div>
                                            {result.ok ? (
                                                <span>Envío exitoso. Revisá la inbox del destinatario.</span>
                                            ) : (
                                                <span>Error: {result.error}</span>
                                            )}
                                            <span className="block opacity-70 mt-0.5">
                                                {new Date(result.timestamp).toLocaleTimeString('es-AR')}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
