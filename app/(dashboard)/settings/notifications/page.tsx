'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertTriangle, CheckCircle2, Mail, RefreshCw } from 'lucide-react'

interface NotificationSettings {
  id: string
  test_mode_enabled: boolean
  test_recipient_email: string | null
  alert_admins_on_lawyer_failure: boolean
  updated_at: string
}

interface LogRow {
  id: string
  notification_type: string
  recipient_email: string
  original_recipient_email: string | null
  subject: string
  entity_type: string | null
  entity_id: string | null
  status: 'sent' | 'failed' | 'skipped_idempotent'
  error_message: string | null
  test_mode: boolean
  sent_at: string
}

const TYPE_LABELS: Record<string, string> = {
  deal_created_advisor: 'Deal creado (asesor)',
  deal_created_admins: 'Deal creado (admins)',
  visit_completed: 'Visita realizada',
  appraisal_sent: 'Tasación entregada',
  property_created: 'Propiedad cargada',
  docs_ready_for_lawyer: 'Docs a revisión legal',
  doc_rejected: 'Doc rechazado',
  docs_resubmitted: 'Docs actualizados',
  property_captured_advisor: 'Captación (asesor)',
  property_captured_admins: 'Captación (admins)',
  user_invitation: 'Invitación',
  admin_failure_alert: 'Alerta admin',
}

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [alertAdmins, setAlertAdmins] = useState(true)

  const [logs, setLogs] = useState<LogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { loadSettings() }, [])
  useEffect(() => { loadLogs() }, [filterType, filterStatus])

  async function loadSettings() {
    setLoadingSettings(true)
    try {
      const res = await fetch('/api/settings/notifications')
      const json = await res.json()
      if (json.data) {
        setSettings(json.data)
        setTestEmail(json.data.test_recipient_email || '')
        setTestMode(json.data.test_mode_enabled)
        setAlertAdmins(json.data.alert_admins_on_lawyer_failure)
      }
    } finally {
      setLoadingSettings(false)
    }
  }

  async function loadLogs() {
    setLoadingLogs(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filterType) params.set('type', filterType)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/settings/notifications/history?${params}`)
      const json = await res.json()
      setLogs(json.data || [])
    } finally {
      setLoadingLogs(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_mode_enabled: testMode,
          test_recipient_email: testEmail || null,
          alert_admins_on_lawyer_failure: alertAdmins,
        }),
      })
      await loadSettings()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notificaciones por email</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurá el modo prueba y revisá el historial de notificaciones transaccionales.</p>
      </div>

      {/* === Modo prueba === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Modo prueba</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Cuando el modo prueba está <strong>activo</strong>, TODAS las notificaciones se redirigen al email de abajo y el asunto lleva prefijo <code>[PRUEBA]</code>. Los destinatarios reales se muestran en un banner dentro del email para que puedas validar el routing sin spamear al equipo.
              </p>

              <div>
                <Label htmlFor="test-email">Email de prueba</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="contacto.julianparra@gmail.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="max-w-sm mt-1"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm">Activar modo prueba <span className="text-muted-foreground">(redirige todos los envíos)</span></span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={alertAdmins} onChange={e => setAlertAdmins(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm">Alertar al admin si falla un email al abogado</span>
              </label>

              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando</> : 'Guardar'}
              </Button>

              {testMode && (
                <div className="flex items-start gap-2 rounded bg-amber-50 border border-amber-200 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-amber-900">Modo prueba activo.</strong>
                    <span className="text-amber-800"> Todas las notificaciones nuevas se envían a <code>{testEmail || '(sin email)'}</code> en vez de los destinatarios reales.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* === Historial === */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Historial</CardTitle>
          <Button variant="outline" size="sm" onClick={loadLogs}><RefreshCw className="h-4 w-4 mr-1" /> Refrescar</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <select className="rounded border px-3 py-1.5 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="rounded border px-3 py-1.5 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="sent">Enviados</option>
              <option value="failed">Fallidos</option>
              <option value="skipped_idempotent">Skipped (idempotencia)</option>
            </select>
          </div>

          {loadingLogs ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No hay registros aún.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Fecha</th>
                    <th className="text-left py-2 px-2">Tipo</th>
                    <th className="text-left py-2 px-2">Destinatario</th>
                    <th className="text-left py-2 px-2">Asunto</th>
                    <th className="text-left py-2 px-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(log.sent_at).toLocaleString('es-AR')}</td>
                      <td className="py-2 px-2 text-xs">{TYPE_LABELS[log.notification_type] || log.notification_type}</td>
                      <td className="py-2 px-2 text-xs">
                        {log.recipient_email}
                        {log.test_mode && <span className="ml-1 text-amber-700 font-semibold">[PRUEBA]</span>}
                        {log.original_recipient_email && log.test_mode && (
                          <div className="text-muted-foreground">original: {log.original_recipient_email}</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs max-w-xs truncate" title={log.subject}>{log.subject}</td>
                      <td className="py-2 px-2 text-xs">
                        {log.status === 'sent' && <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Enviado</span>}
                        {log.status === 'failed' && <span className="inline-flex items-center gap-1 text-red-700" title={log.error_message || ''}><AlertTriangle className="h-3 w-3" /> Fallo</span>}
                        {log.status === 'skipped_idempotent' && <span className="text-muted-foreground">Skipped</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
