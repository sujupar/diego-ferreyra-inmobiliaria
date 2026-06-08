'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  Megaphone,
  CheckCircle2,
  Pause,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-react'

interface Props {
  propertyId: string
}

interface ListingsResponse {
  data?: Array<{
    portal: string
    status: string
    external_url: string | null
    last_error: string | null
  }>
}

interface MetaResponse {
  campaign?: {
    campaign_id: string
    status: string
    budget_daily?: number | null
  } | null
}

export function PostCaptureActions({ propertyId }: Props) {
  const [mlState, setMlState] = useState<{
    status: 'no_publicado' | 'publicado' | 'pausado' | 'en_proceso' | 'error' | 'loading'
    url?: string
    error?: string
  }>({ status: 'loading' })
  const [apState, setApState] = useState<{
    status: 'no_publicado' | 'publicado' | 'baja' | 'error' | 'loading'
    url?: string; error?: string
  }>({ status: 'loading' })
  const [metaState, setMetaState] = useState<{
    status: 'sin_campana' | 'activa' | 'pausada' | 'error' | 'loading'
    campaignId?: string
  }>({ status: 'loading' })

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/properties/${propertyId}/listings`)
        if (r.ok) {
          const { data }: ListingsResponse = await r.json()
          const ml = data?.find(d => d.portal === 'mercadolibre')
          if (!ml) {
            setMlState({ status: 'no_publicado' })
          } else if (ml.status === 'published') {
            setMlState({ status: 'publicado', url: ml.external_url ?? undefined })
          } else if (ml.status === 'paused') {
            setMlState({ status: 'pausado', url: ml.external_url ?? undefined })
          } else if (ml.status === 'failed') {
            setMlState({ status: 'error', error: ml.last_error ?? 'Error desconocido' })
          } else if (ml.status === 'pending' || ml.status === 'publishing') {
            // Estado intermedio — el worker está procesando o lo va a procesar.
            // Mostramos "en proceso" para que el asesor no presione "Publicar"
            // de nuevo y cree un duplicado en ML.
            setMlState({ status: 'en_proceso' })
          } else {
            setMlState({ status: 'no_publicado' })
          }

          const apr = data?.find(d => d.portal === 'argenprop')
          if (!apr) setApState({ status: 'no_publicado' })
          else if (apr.status === 'published') setApState({ status: 'publicado', url: apr.external_url ?? undefined })
          else if (apr.status === 'paused') setApState({ status: 'baja', url: apr.external_url ?? undefined })
          else if (apr.status === 'failed') setApState({ status: 'error', error: apr.last_error ?? 'Error' })
          else setApState({ status: 'no_publicado' })
        } else {
          setMlState({ status: 'no_publicado' })
          setApState({ status: 'no_publicado' })
        }
      } catch {
        setMlState({ status: 'no_publicado' })
        setApState({ status: 'no_publicado' })
      }

      try {
        const r = await fetch(`/api/properties/${propertyId}/meta-campaign`)
        if (r.ok) {
          const { campaign }: MetaResponse = await r.json()
          // El status en DB se guarda en lowercase ('active', 'paused',
          // 'provisioning', 'failed', 'archived'). Antes comparábamos con
          // uppercase y siempre caía en sin_campana — el asesor veía
          // "Sin campaña" después de haber lanzado una.
          const status = campaign?.status?.toLowerCase()
          if (!campaign) {
            setMetaState({ status: 'sin_campana' })
          } else if (status === 'active') {
            setMetaState({ status: 'activa', campaignId: campaign.campaign_id })
          } else if (status === 'paused') {
            setMetaState({ status: 'pausada', campaignId: campaign.campaign_id })
          } else if (status === 'failed') {
            setMetaState({ status: 'error', campaignId: campaign.campaign_id })
          } else if (status === 'provisioning') {
            // Está creándose en este momento. Mostrar como "pausada" porque
            // el flow final deja PAUSED.
            setMetaState({ status: 'pausada', campaignId: campaign.campaign_id })
          } else {
            setMetaState({ status: 'sin_campana' })
          }
        } else {
          setMetaState({ status: 'sin_campana' })
        }
      } catch {
        setMetaState({ status: 'sin_campana' })
      }
    }
    load()
  }, [propertyId])

  return (
    <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50/30 to-transparent">
      <CardContent className="py-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base">
              Propiedad captada ✓ — ¿qué hacemos con ella?
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              La propiedad está lista para difundirse. Podés publicarla en
              MercadoLibre, lanzar una campaña en Meta Ads, ambas, o ninguna.
              Cada una tiene su asistente que te guía paso a paso.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* MercadoLibre */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">MercadoLibre</span>
              </div>
              <MlStatusBadge state={mlState} />
            </div>
            <p className="text-xs text-muted-foreground min-h-[2.5em]">
              {mlState.status === 'no_publicado' &&
                'Vista previa, edición de título/descripción/fotos y publicación en un click.'}
              {mlState.status === 'publicado' && 'El aviso está activo en MercadoLibre.'}
              {mlState.status === 'pausado' && 'Aviso pausado — no visible al público.'}
              {mlState.status === 'en_proceso' &&
                'Procesando publicación… puede tardar 1-2 minutos.'}
              {mlState.status === 'error' && (mlState.error ?? 'Error de publicación.')}
              {mlState.status === 'loading' && 'Cargando estado…'}
            </p>
            <div className="flex gap-2">
              <Button
                asChild
                size="sm"
                className="flex-1"
                variant={mlState.status === 'no_publicado' ? 'default' : 'outline'}
                disabled={mlState.status === 'en_proceso'}
              >
                <Link href={`/properties/${propertyId}/marketing/mercadolibre`}>
                  {mlState.status === 'no_publicado'
                    ? 'Publicar en MercadoLibre'
                    : mlState.status === 'en_proceso'
                      ? 'En proceso…'
                      : 'Ver / Gestionar'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              {mlState.url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={mlState.url} target="_blank" rel="noopener noreferrer">
                    Abrir
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Argenprop */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Argenprop</span>
              </div>
              <Badge
                variant={apState.status === 'publicado' ? undefined : 'outline'}
                className={apState.status === 'publicado' ? 'bg-emerald-600 text-white text-[10px] h-5' : 'text-[10px] h-5'}
              >
                {apState.status === 'publicado' ? 'Publicado'
                  : apState.status === 'baja' ? 'De baja'
                  : apState.status === 'error' ? 'Error' : 'No publicado'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground min-h-[2.5em]">
              {apState.status === 'no_publicado' && 'Campos prellenados, edición y publicación en Argenprop en un click.'}
              {apState.status === 'publicado' && 'El aviso está activo en Argenprop.'}
              {apState.status === 'baja' && 'Aviso dado de baja.'}
              {apState.status === 'error' && (apState.error ?? 'Error de publicación.')}
              {apState.status === 'loading' && 'Cargando estado…'}
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" className="flex-1" variant={apState.status === 'no_publicado' ? 'default' : 'outline'}>
                <Link href={`/properties/${propertyId}/marketing/argenprop`}>
                  {apState.status === 'no_publicado' ? 'Publicar en Argenprop' : 'Ver / Gestionar'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              {apState.url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={apState.url} target="_blank" rel="noopener noreferrer">Abrir</a>
                </Button>
              )}
            </div>
          </div>

          {/* Meta Ads */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Campaña Meta Ads</span>
              </div>
              <MetaStatusBadge state={metaState} />
            </div>
            <p className="text-xs text-muted-foreground min-h-[2.5em]">
              {metaState.status === 'sin_campana' &&
                'Asistente con análisis de fotos, perfil de comprador, segmentación geográfica simple y presupuesto en pesos.'}
              {metaState.status === 'activa' && 'Campaña corriendo en Meta Ads.'}
              {metaState.status === 'pausada' && 'Campaña pausada — no gasta presupuesto.'}
              {metaState.status === 'error' && 'Error en la campaña.'}
              {metaState.status === 'loading' && 'Cargando estado…'}
            </p>
            <Button
              asChild
              size="sm"
              className="w-full"
              variant={metaState.status === 'sin_campana' ? 'default' : 'outline'}
            >
              <Link href={`/properties/${propertyId}/marketing/meta-ads`}>
                {metaState.status === 'sin_campana'
                  ? 'Lanzar campaña Meta Ads'
                  : 'Ver / Gestionar campaña'}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MlStatusBadge({ state }: { state: { status: string } }) {
  if (state.status === 'loading') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  }
  if (state.status === 'publicado') {
    return (
      <Badge className="bg-emerald-600 text-white text-[10px] h-5">
        <CheckCircle2 className="h-3 w-3 mr-0.5" />
        Publicado
      </Badge>
    )
  }
  if (state.status === 'pausado') {
    return (
      <Badge className="bg-amber-500 text-white text-[10px] h-5">
        <Pause className="h-3 w-3 mr-0.5" />
        Pausado
      </Badge>
    )
  }
  if (state.status === 'en_proceso') {
    return (
      <Badge className="bg-blue-500 text-white text-[10px] h-5">
        <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
        En proceso
      </Badge>
    )
  }
  if (state.status === 'error') {
    return (
      <Badge className="bg-red-500 text-white text-[10px] h-5">
        <AlertTriangle className="h-3 w-3 mr-0.5" />
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] h-5">
      No publicado
    </Badge>
  )
}

function MetaStatusBadge({ state }: { state: { status: string } }) {
  if (state.status === 'loading') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  }
  if (state.status === 'activa') {
    return (
      <Badge className="bg-emerald-600 text-white text-[10px] h-5">
        <CheckCircle2 className="h-3 w-3 mr-0.5" />
        Activa
      </Badge>
    )
  }
  if (state.status === 'pausada') {
    return (
      <Badge className="bg-amber-500 text-white text-[10px] h-5">
        <Pause className="h-3 w-3 mr-0.5" />
        Pausada
      </Badge>
    )
  }
  if (state.status === 'error') {
    return (
      <Badge className="bg-red-500 text-white text-[10px] h-5">
        <AlertTriangle className="h-3 w-3 mr-0.5" />
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] h-5">
      Sin campaña
    </Badge>
  )
}
