'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  PlayCircle,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Plug,
} from 'lucide-react'

interface StepResult {
  attempted?: boolean
  ok: boolean
  error?: string
}

interface MercadoLibreStep extends StepResult {
  externalId?: string
  externalUrl?: string
  status?: string
}

interface MetaStep extends StepResult {
  campaignId?: string
  adsetId?: string
  adIds?: string[]
  adsManagerUrl?: string
}

interface SlugStep extends StepResult {
  slug?: string
}

interface TestRunResult {
  propertyId: string
  testPrefix: string
  steps: {
    propertyCreated: boolean
    slugAssigned: SlugStep
    mercadolibre: MercadoLibreStep
    meta: MetaStep
    landingUrl?: string
  }
}

interface CleanupResult {
  mercadolibre: { attempted: boolean; ok: boolean; error?: string }
  meta: { attempted: boolean; ok: boolean; error?: string }
  property: { ok: boolean; error?: string }
}

interface PreflightStatus {
  mercadolibre: {
    enabled: boolean
    hasEnvVars: boolean
    hasOAuth: boolean
    expiresAt: string | null
    reason: string | null
  }
  meta: {
    enabled: boolean
    reason: string | null
  }
}

function StatusIcon({ ok, attempted }: { ok: boolean; attempted?: boolean }) {
  if (attempted === false) {
    return <AlertTriangle className="h-5 w-5 text-amber-500" />
  }
  return ok ? (
    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  ) : (
    <XCircle className="h-5 w-5 text-red-600" />
  )
}

export function PipelineTestClient() {
  const [running, setRunning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState<TestRunResult | null>(null)
  const [cleanup, setCleanup] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preflight, setPreflight] = useState<PreflightStatus | null>(null)
  const [loadingPreflight, setLoadingPreflight] = useState(true)

  async function loadPreflight() {
    setLoadingPreflight(true)
    try {
      const r = await fetch('/api/admin/pipeline-test')
      if (r.ok) {
        const data = await r.json()
        setPreflight(data.preflight)
      }
    } catch (err) {
      console.error('[pipeline-test] preflight failed', err)
    } finally {
      setLoadingPreflight(false)
    }
  }

  useEffect(() => {
    loadPreflight()
  }, [])

  async function runTest() {
    if (
      !confirm(
        '¿Iniciamos la prueba?\n\n' +
          'Se va a crear una propiedad ficticia y se va a probar:\n' +
          '✓ Publicar en MercadoLibre (queda PAUSADO, no visible al público)\n' +
          '✓ Crear campaña en Meta Ads (queda PAUSADO, no gasta dinero)\n' +
          '✓ Generar landing pública de la propiedad\n\n' +
          'Vas a poder ver cada cosa en sus paneles oficiales antes de eliminar todo.',
      )
    ) {
      return
    }
    setRunning(true)
    setError(null)
    setCleanup(null)
    try {
      const res = await fetch('/api/admin/pipeline-test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error en la prueba')
      setResult(data.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setRunning(false)
    }
  }

  async function runCleanup() {
    if (!result) return
    if (
      !confirm(
        '¿Eliminar todo lo de esta prueba?\n\n' +
          '✓ El item de MercadoLibre se cierra definitivamente\n' +
          '✓ La campaña de Meta se archiva\n' +
          '✓ La propiedad ficticia y todos sus datos se borran\n\n' +
          'Esta acción no se puede deshacer.',
      )
    ) {
      return
    }
    setCleaning(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/pipeline-test?propertyId=${result.propertyId}`,
        { method: 'DELETE' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al limpiar')
      setCleanup(data.cleanup)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setCleaning(false)
    }
  }

  function resetAll() {
    setResult(null)
    setCleanup(null)
    setError(null)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Auditoría</p>
        <h1 className="display text-3xl">Probar todo el sistema</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Esta página corre una prueba completa del flujo automático:
          publica en MercadoLibre, crea campaña en Meta Ads y genera la
          landing. Todo en modo prueba —{' '}
          <strong>nada se publica al público ni gasta dinero</strong>.
          Después de auditar los resultados podés eliminar todo con un click.
        </p>
      </div>

      {/* Estado de conexiones (pre-flight) */}
      {!result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Estado de conexiones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingPreflight && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando conexiones…
              </div>
            )}
            {!loadingPreflight && preflight && (
              <>
                <div className="flex items-start justify-between gap-3 border-b pb-3">
                  <div className="flex items-start gap-3">
                    <StatusIcon ok={preflight.mercadolibre.enabled} />
                    <div>
                      <p className="font-medium text-sm">MercadoLibre</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {preflight.mercadolibre.enabled
                          ? `OAuth conectado${
                              preflight.mercadolibre.expiresAt
                                ? `. Token expira ${new Date(preflight.mercadolibre.expiresAt).toLocaleString('es-AR')}`
                                : ''
                            }`
                          : preflight.mercadolibre.reason ?? 'No conectado'}
                      </p>
                    </div>
                  </div>
                  {!preflight.mercadolibre.enabled && (
                    <Link
                      href="/settings/portals"
                      className="text-xs underline text-[color:var(--brand)] shrink-0"
                    >
                      Conectar →
                    </Link>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <StatusIcon ok={preflight.meta.enabled} />
                    <div>
                      <p className="font-medium text-sm">Meta Ads</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {preflight.meta.enabled
                          ? 'Variables de entorno configuradas'
                          : preflight.meta.reason ?? 'No configurado'}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botón de arranque */}
      {!result && !error && (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Sparkles className="h-12 w-12 mx-auto text-[color:var(--brand)]" />
            <p className="text-lg font-medium">¿Listo para empezar la prueba?</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Se va a crear una propiedad ficticia ("Av Test 1234, Palermo")
              con todas las fotos y datos completos, y vamos a empujar todo el
              flujo automático.
            </p>
            {preflight && !preflight.mercadolibre.enabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 max-w-md mx-auto">
                <strong>Atención:</strong> MercadoLibre no está conectado. La
                prueba va a correr igual pero el paso de publicación va a
                quedar marcado como "no intentado". Si querés probar la
                publicación, primero{' '}
                <Link href="/settings/portals" className="underline">
                  conectá la cuenta acá
                </Link>
                .
              </div>
            )}
            <Button
              size="lg"
              onClick={runTest}
              disabled={running || loadingPreflight}
              className="mt-4"
            >
              {running ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Ejecutando prueba…
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5 mr-2" />
                  Iniciar prueba completa
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Tarda entre 10 y 30 segundos
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-300">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Algo falló</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAll}
                  className="mt-3"
                >
                  Reintentar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados de la prueba */}
      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="display text-base">
                Resultados de la prueba
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Paso 1: Propiedad creada */}
              <Step
                ok={result.steps.propertyCreated}
                title="Propiedad ficticia creada"
                description="Se creó una propiedad de prueba en la base de datos con todos los datos completos (3 fotos, 3 ambientes, dirección Palermo CABA)."
              >
                <p className="text-xs text-muted-foreground">
                  ID interno: <code className="text-foreground">{result.propertyId}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Identificador de la prueba:{' '}
                  <code className="text-foreground">{result.testPrefix}</code>
                </p>
              </Step>

              {/* Paso 2: Landing */}
              <Step
                ok={result.steps.slugAssigned.ok}
                title="Landing pública generada"
                description="Se generó la página propia con la URL única en inmodf.com.ar/p/[slug]. Esta sí es accesible al público pero solo para vos por el momento (nadie tiene el link)."
              >
                {result.steps.landingUrl && (
                  <a
                    href={result.steps.landingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline"
                  >
                    Abrir landing de prueba
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Step>

              {/* Paso 3: MercadoLibre */}
              <Step
                ok={result.steps.mercadolibre.ok}
                attempted={result.steps.mercadolibre.attempted}
                title="MercadoLibre"
                description={
                  result.steps.mercadolibre.attempted
                    ? 'Se publicó el aviso y se lo dejó en estado PAUSADO. No es visible al público, pero podés verlo en tu panel de MercadoLibre.'
                    : 'MercadoLibre no está conectado. Andá a Settings → Portales para conectarlo.'
                }
              >
                {result.steps.mercadolibre.ok && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      ID del aviso en ML:{' '}
                      <code className="text-foreground">
                        {result.steps.mercadolibre.externalId}
                      </code>
                    </p>
                    <Badge className="bg-amber-500 text-white">
                      Estado: pausado
                    </Badge>
                    {result.steps.mercadolibre.externalUrl && (
                      <div>
                        <a
                          href={result.steps.mercadolibre.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline"
                        >
                          Ver aviso en MercadoLibre
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      También podés verlo entrando a tu cuenta de MercadoLibre
                      → Mis publicaciones → Pausadas.
                    </p>
                  </div>
                )}
                {result.steps.mercadolibre.error && (
                  <p className="text-xs text-red-600 mt-2">
                    {result.steps.mercadolibre.error}
                  </p>
                )}
              </Step>

              {/* Paso 4: Meta Ads */}
              <Step
                ok={result.steps.meta.ok}
                attempted={result.steps.meta.attempted}
                title="Meta Ads (Facebook + Instagram)"
                description={
                  result.steps.meta.attempted
                    ? 'Se creó la campaña con su anuncio. Queda en PAUSADO — no se activa ni gasta dinero hasta que vos la actives manualmente desde el panel de Meta.'
                    : 'Meta Ads no está configurado. Faltan las variables META_AD_ACCOUNT_ID / META_ACCESS_TOKEN / META_PAGE_ID en Netlify.'
                }
              >
                {result.steps.meta.ok && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      ID de campaña:{' '}
                      <code className="text-foreground">
                        {result.steps.meta.campaignId}
                      </code>
                    </p>
                    <Badge className="bg-amber-500 text-white">
                      Estado: pausada (modo prueba)
                    </Badge>
                    {result.steps.meta.adsManagerUrl && (
                      <div>
                        <a
                          href={result.steps.meta.adsManagerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[color:var(--brand)] underline"
                        >
                          Ver campaña en Meta Ads Manager
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      En el Ads Manager vas a poder revisar el target, el
                      presupuesto sugerido, el creative y el copy — todo sin
                      activar nada.
                    </p>
                  </div>
                )}
                {result.steps.meta.error && (
                  <p className="text-xs text-red-600 mt-2">
                    {result.steps.meta.error}
                  </p>
                )}
              </Step>
            </CardContent>
          </Card>

          {/* Botón de cleanup */}
          {!cleanup && (
            <Card className="border-amber-300">
              <CardContent className="py-6 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Cuando termines de auditar, borrá todo</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Si dejás esto sin borrar, va a aparecer la propiedad
                      ficticia en tu lista de propiedades y la campaña va a
                      quedar pausada en Meta. Es preferible limpiar para no
                      ensuciar los datos.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={runCleanup}
                  disabled={cleaning}
                  className="w-full"
                >
                  {cleaning ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Eliminando…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-5 w-5 mr-2" />
                      Eliminar todo lo de la prueba
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {cleanup && (
            <Card className="border-emerald-300">
              <CardHeader>
                <CardTitle className="display text-base">
                  Limpieza completada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Step
                  ok={cleanup.mercadolibre.ok}
                  attempted={cleanup.mercadolibre.attempted}
                  title="MercadoLibre"
                  description={
                    cleanup.mercadolibre.attempted
                      ? 'Aviso cerrado definitivamente en MercadoLibre.'
                      : 'No había nada que borrar.'
                  }
                  small
                />
                <Step
                  ok={cleanup.meta.ok}
                  attempted={cleanup.meta.attempted}
                  title="Meta Ads"
                  description={
                    cleanup.meta.attempted
                      ? 'Campaña archivada en Meta Ads Manager.'
                      : 'No había campaña que borrar.'
                  }
                  small
                />
                <Step
                  ok={cleanup.property.ok}
                  title="Propiedad ficticia"
                  description="Propiedad y todos sus datos asociados (listings, métricas, leads) borrados de la base de datos."
                  small
                />
                <Button onClick={resetAll} variant="outline" className="mt-3">
                  Hacer otra prueba
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Step({
  ok,
  attempted,
  title,
  description,
  children,
  small,
}: {
  ok: boolean
  attempted?: boolean
  title: string
  description: string
  children?: React.ReactNode
  small?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 ${small ? '' : 'border-b last:border-0 pb-4 last:pb-0'}`}>
      <StatusIcon ok={ok} attempted={attempted} />
      <div className="flex-1 space-y-1">
        <p className={small ? 'text-sm font-medium' : 'font-medium'}>{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children && <div className="mt-2 space-y-1">{children}</div>}
      </div>
    </div>
  )
}
