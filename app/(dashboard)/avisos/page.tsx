'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { IdentifyAvisoDialog, type AvisoPendiente } from '@/components/inbox/IdentifyAvisoDialog'

const PORTAL_LABEL: Record<string, string> = {
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-AR')
}

export default function AvisosPage() {
  const [avisos, setAvisos] = useState<AvisoPendiente[] | null>(null)
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string | null }[]>([])
  const [properties, setProperties] = useState<{ id: string; address: string; assigned_to: string | null }[]>([])

  const load = useCallback(async () => {
    const [aRes, advRes, pRes] = await Promise.all([
      fetch('/api/portal-inquiries/unidentified'),
      fetch('/api/users/advisors'),
      fetch('/api/properties?limit=200'),
    ])
    const a = aRes.ok ? await aRes.json() : { data: [] }
    const adv = advRes.ok ? await advRes.json() : { data: [] }
    const p = pRes.ok ? await pRes.json() : { data: [] }
    setAvisos(a.data ?? [])
    setAdvisors(adv.data ?? [])
    setProperties(p.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Avisos por identificar</h1>
        <p className="text-sm text-muted-foreground">
          Estos avisos recibieron consultas, pero el sistema no sabe de qué propiedad son ni quién la muestra.
          Identificá cada uno y sus consultas — las de antes y las que lleguen — se asignan solas.
        </p>
      </header>

      {avisos === null && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {avisos !== null && avisos.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="font-medium">No hay avisos pendientes</p>
            <p className="text-sm text-muted-foreground">Todas las consultas están identificadas.</p>
          </CardContent>
        </Card>
      )}

      {avisos?.map(aviso => (
        <Card key={`${aviso.portal}-${aviso.externalCode}`}>
          <CardContent className="py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">{aviso.title ?? `Aviso ${aviso.externalCode}`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {PORTAL_LABEL[aviso.portal] ?? aviso.portal} · CÓD {aviso.externalCode}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="bg-amber-500 text-white text-xs">
                  {aviso.inquiryCount} consulta{aviso.inquiryCount === 1 ? '' : 's'} esperando
                </Badge>
                <span className="text-xs text-muted-foreground">
                  la última, {relativeDay(aviso.lastInquiryAt)}
                  {aviso.lastLeadName ? ` (${aviso.lastLeadName})` : ''}
                </span>
              </div>
            </div>
            <IdentifyAvisoDialog aviso={aviso} advisors={advisors} properties={properties} onDone={load} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
