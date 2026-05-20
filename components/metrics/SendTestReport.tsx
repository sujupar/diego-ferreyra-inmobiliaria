'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Send, Loader2 } from 'lucide-react'

type Variant = 'daily' | 'weekly' | 'monthly'

interface ResultState {
  success: boolean
  message: string
  errors?: Record<string, string>
}

/**
 * Botones para disparar manualmente el envío de un reporte (diario, semanal,
 * mensual) — incluye la sección Embudo CRM agregada en Fase 6. Llama a
 * /api/marketing/reports y se envía a los recipients configurados en
 * report_settings.
 */
export function SendTestReport() {
  const [sending, setSending] = useState<Variant | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)

  async function handleSend(variant: Variant) {
    setSending(variant)
    setResult(null)

    try {
      const today = new Date()
      let dateFrom: string
      let dateTo: string
      let type: Variant

      if (variant === 'daily') {
        const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1)
        dateFrom = yesterday.toISOString().slice(0, 10)
        dateTo = dateFrom
        type = 'daily'
      } else if (variant === 'weekly') {
        const to = new Date(today); to.setUTCDate(today.getUTCDate() - 1)
        const from = new Date(to); from.setUTCDate(to.getUTCDate() - 6)
        dateFrom = from.toISOString().slice(0, 10)
        dateTo = to.toISOString().slice(0, 10)
        type = 'weekly'
      } else {
        const to = new Date(today); to.setUTCDate(today.getUTCDate() - 1)
        const from = new Date(today); from.setUTCDate(today.getUTCDate() - 30)
        dateFrom = from.toISOString().slice(0, 10)
        dateTo = to.toISOString().slice(0, 10)
        type = 'monthly'
      }

      const res = await fetch('/api/marketing/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, dateFrom, dateTo }),
      })
      const data = await res.json()

      if (data.success) {
        const errCount = data.report?.errors ? Object.keys(data.report.errors).length : 0
        setResult({
          success: true,
          message: `Reporte ${type} enviado · ${data.report?.meta_campaigns ?? 0} campañas, ${data.report?.pipeline_stages ?? 0} etapas${errCount > 0 ? ` · ${errCount} fuente(s) con error` : ''}`,
          errors: data.report?.errors,
        })
      } else {
        setResult({ success: false, message: data.error || 'Error desconocido' })
      }
    } catch {
      setResult({ success: false, message: 'Error de red al enviar el reporte' })
    } finally {
      setSending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Enviar reporte por email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Dispara el reporte a los destinatarios configurados (mismo que llega del cron). Útil para previsualizar el formato sin esperar al horario automático.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => handleSend('daily')} disabled={sending !== null}>
            {sending === 'daily' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Diario (ayer)
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSend('weekly')} disabled={sending !== null}>
            {sending === 'weekly' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Semanal (últimos 7 días)
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSend('monthly')} disabled={sending !== null}>
            {sending === 'monthly' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Mensual (últimos 30 días)
          </Button>
        </div>
        {result && (
          <div className={`rounded-md border p-3 text-sm ${result.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            <p className="font-medium">{result.success ? '✓ Enviado' : '✗ Error'}: {result.message}</p>
            {result.errors && (
              <ul className="mt-2 space-y-1 text-xs">
                {Object.entries(result.errors).map(([source, error]) => (
                  <li key={source}>
                    {source === 'meta_ads' ? 'Meta Ads' : source === 'ghl_pipeline' ? 'Pipeline GHL' : source === 'ghl_calls' ? 'Llamadas' : source === 'funnel_crm' ? 'Embudo CRM' : source}: {error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
