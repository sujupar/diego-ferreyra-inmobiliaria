'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface FlowItem {
  label: string
  value: React.ReactNode
}

export interface FlowHistoryData {
  scheduledAppraisalId?: string | null
  appraisalId?: string | null
  schedulingNotes?: string | null
  buyerInterest?: Record<string, unknown> | null
  visitData?: Record<string, unknown> | null
  visitCompletedAt?: string | null
}

export function FlowHistoryCard({
  title = 'Información del proceso',
  data,
}: {
  title?: string
  data: FlowHistoryData | null
}) {
  if (!data) return null

  const items: FlowItem[] = []

  if (data.schedulingNotes) {
    items.push({ label: 'Notas al agendar', value: data.schedulingNotes })
  }
  if (data.buyerInterest && Object.keys(data.buyerInterest).length > 0) {
    items.push({
      label: 'Interés de compra',
      value: (
        <pre className="text-xs bg-muted p-2 rounded">
          {JSON.stringify(data.buyerInterest, null, 2)}
        </pre>
      ),
    })
  }
  if (data.visitData && Object.keys(data.visitData).length > 0) {
    items.push({
      label: data.visitCompletedAt
        ? `Datos relevados en visita (${new Date(data.visitCompletedAt).toLocaleString('es-AR')})`
        : 'Datos relevados en visita',
      value: (
        <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-auto">
          {JSON.stringify(data.visitData, null, 2)}
        </pre>
      ),
    })
  }

  if (items.length === 0 && !data.scheduledAppraisalId && !data.appraisalId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items.map(it => (
          <div key={it.label}>
            <p className="font-medium text-xs uppercase text-muted-foreground">{it.label}</p>
            <div className="mt-1">{it.value}</div>
          </div>
        ))}
        {(data.scheduledAppraisalId || data.appraisalId) && (
          <div className="flex gap-3 pt-2 border-t">
            {data.scheduledAppraisalId && (
              <Link
                className="text-primary underline text-sm"
                href={`/scheduled-appraisals/${data.scheduledAppraisalId}`}
              >
                Ver agendamiento original →
              </Link>
            )}
            {data.appraisalId && (
              <Link
                className="text-primary underline text-sm"
                href={`/appraisals/${data.appraisalId}`}
              >
                Ver tasación →
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
