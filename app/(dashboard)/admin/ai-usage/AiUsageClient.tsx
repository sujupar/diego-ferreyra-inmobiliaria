'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertCircle, Sparkles, MessageSquareText, CalendarCheck2, Info } from 'lucide-react'

interface AiUsageTotals {
  conversationsAnalyzed: number
  analysesCount: number
  tokensUsedTotal: number
  estimatedCostUsd: number
  estimatedCostArs: number
  agentMessagesSent: number
  agentHandedOff: number
}

interface AiUsageDayBucket {
  date: string
  conversationsCount: number
  analysesCount: number
  tokensUsedTotal: number
  estimatedCostUsd: number
  estimatedCostArs: number
}

interface AiUsageResponse {
  totals: AiUsageTotals
  byDay: AiUsageDayBucket[]
  visits: { proposed: number; confirmed: number }
  pricePerMillionUsd: number
  usdToArs: { rate: number; source: string }
}

function money(usd: number, ars: number): string {
  const usdStr = usd < 0.01 && usd > 0 ? '< USD 0,01' : `USD ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const arsStr = ars.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  return `${usdStr} (≈ $${arsStr})`
}

function formatDate(dateStr: string): string {
  // dateStr = YYYY-MM-DD, parseamos como fecha "civil" (sin hora) para no correr de día por zona horaria.
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/**
 * Panel de costo del agente de IA (task 5). Solo lectura — muestra ceros con
 * una explicación (no un error) mientras la IA todavía no corrió ningún
 * análisis, que es el estado real de hoy (2026-08-03: la tabla existe pero
 * está vacía).
 */
export function AiUsageClient() {
  const [data, setData] = useState<AiUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/ai-usage')
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el panel.')
        return body as AiUsageResponse
      })
      .then(body => {
        if (!cancelled) setData(body)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar el panel.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Costo del agente de IA</h1>
        <p className="text-muted-foreground mt-1">
          Cuánto está gastando el agente que lee y prioriza WhatsApp — solo lectura, el interruptor que lo prende o
          apaga se maneja en otro lado.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : data ? (
        <>
          {data.totals.analysesCount === 0 && (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              La IA todavía no analizó ninguna conversación — los números de abajo están en cero porque no gastó
              nada, no porque el panel esté roto. En cuanto corra el primer análisis, va a aparecer acá.
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-4 w-4" /> Análisis corridos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totals.analysesCount.toLocaleString('es-AR')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.totals.conversationsAnalyzed.toLocaleString('es-AR')} conversación
                  {data.totals.conversationsAnalyzed === 1 ? '' : 'es'} tocada
                  {data.totals.conversationsAnalyzed === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tokens usados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totals.tokensUsedTotal.toLocaleString('es-AR')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Costo estimado: {money(data.totals.estimatedCostUsd, data.totals.estimatedCostArs)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MessageSquareText className="h-4 w-4" /> Mensajes que mandó el agente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totals.agentMessagesSent.toLocaleString('es-AR')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.totals.agentHandedOff.toLocaleString('es-AR')} conversación
                  {data.totals.agentHandedOff === 1 ? '' : 'es'} pasada
                  {data.totals.agentHandedOff === 1 ? '' : 's'} a un humano (llegó al tope de mensajes)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarCheck2 className="h-4 w-4" /> Visitas del agente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.visits.proposed.toLocaleString('es-AR')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.visits.confirmed.toLocaleString('es-AR')} confirmada{data.visits.confirmed === 1 ? '' : 's'} por
                  el equipo
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold">Por día</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Aproximado: cada conversación aporta su acumulado al día de su ÚLTIMO análisis (la tabla guarda
                totales por conversación, no un registro de cada análisis individual) — sirve para ver si el gasto es
                el esperable, no como ledger exacto.
              </p>
            </div>

            {data.byDay.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-card">
                Sin actividad todavía.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Día</th>
                      <th className="px-4 py-2 font-medium text-right">Conversaciones</th>
                      <th className="px-4 py-2 font-medium text-right">Análisis</th>
                      <th className="px-4 py-2 font-medium text-right">Tokens</th>
                      <th className="px-4 py-2 font-medium text-right">Costo estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map(b => (
                      <tr key={b.date} className="border-b last:border-0">
                        <td className="px-4 py-2">{formatDate(b.date)}</td>
                        <td className="px-4 py-2 text-right">{b.conversationsCount.toLocaleString('es-AR')}</td>
                        <td className="px-4 py-2 text-right">{b.analysesCount.toLocaleString('es-AR')}</td>
                        <td className="px-4 py-2 text-right">{b.tokensUsedTotal.toLocaleString('es-AR')}</td>
                        <td className="px-4 py-2 text-right">{money(b.estimatedCostUsd, b.estimatedCostArs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Dólar usado para la conversión: ${data.usdToArs.rate.toLocaleString('es-AR')} (
            {data.usdToArs.source === 'blue' ? 'blue' : data.usdToArs.source === 'oficial' ? 'oficial' : 'de respaldo'}
            ) · precio estimado USD {data.pricePerMillionUsd} cada millón de tokens.
          </p>
        </>
      ) : null}
    </div>
  )
}
