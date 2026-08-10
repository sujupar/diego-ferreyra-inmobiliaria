'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'

interface Credential {
  portal: string
  enabled: boolean
  expires_at: string | null
  updated_at: string
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
}

/** Traduce el fallo a algo que se entienda leyéndolo. */
function motivo(status: number | null, fallback: string): string {
  if (status === 401 || status === 403) return 'Se venció la sesión. Volvé a entrar.'
  return fallback
}

/**
 * El `{error}` de la API sirve para mostrar, salvo cuando es el
 * `NEXT_REDIRECT;replace;/;307;` que sale cuando el `requireRole` de la ruta
 * lanza ADENTRO de su try/catch: eso no es un mensaje, es tubería interna.
 */
function mensajeUtil(cuerpo: unknown): string | null {
  const texto = (cuerpo as { error?: unknown } | null)?.error
  if (typeof texto !== 'string' || !texto || texto.startsWith('NEXT_REDIRECT')) return null
  return texto
}

export function PortalsClient() {
  const [creds, setCreds] = useState<Credential[] | null>(null)
  // Tres estados y no dos: `creds === null` ya no significa "todavía cargando".
  // Antes, si el GET fallaba, `setCreds` no corría nunca y el `if (!creds)`
  // devolvía el spinner PARA SIEMPRE — sin texto, sin error y sin salida.
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [errorToggle, setErrorToggle] = useState<{ portal: string; mensaje: string } | null>(null)

  const load = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      const r = await fetch('/api/admin/portal-credentials')
      if (!r.ok) {
        setErrorCarga(motivo(r.status, 'No se pudieron leer los portales.'))
        return
      }
      const { data } = await r.json()
      setCreds(Array.isArray(data) ? data : [])
    } catch {
      setErrorCarga('No se pudieron leer los portales.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(portal: string, enabled: boolean) {
    setToggling(portal)
    setErrorToggle(null)
    try {
      const res = await fetch('/api/admin/portal-credentials', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portal, enabled }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null)
        setErrorToggle({
          portal,
          mensaje:
            mensajeUtil(cuerpo) ??
            motivo(res.status, enabled ? 'No se pudo activar el portal.' : 'No se pudo desactivar el portal.'),
        })
        // Sin recargar: el estado en pantalla ya es el de la base y recargar
        // solo taparía el error con otro pedido que puede fallar igual.
        return
      }
      await load()
    } catch {
      setErrorToggle({
        portal,
        mensaje: enabled ? 'No se pudo activar el portal.' : 'No se pudo desactivar el portal.',
      })
    } finally {
      setToggling(null)
    }
  }

  const cabecera = (
    <div>
      <p className="eyebrow">Settings</p>
      <h1 className="display text-3xl">Portales</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Habilitá cada portal cuando recibas sus credenciales. Los listings
        encolados se procesarán automáticamente en el siguiente ciclo del
        worker (cada 1 min).
      </p>
    </div>
  )

  if (cargando && !creds) {
    return (
      <div className="max-w-3xl space-y-6">
        {cabecera}
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  if (errorCarga && !creds) {
    return (
      <div className="max-w-3xl space-y-6">
        {cabecera}
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {errorCarga}
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1" /> Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {cabecera}

      {errorCarga && (
        <p className="flex items-start gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {errorCarga} Lo que ves abajo es la última lectura buena.
        </p>
      )}

      {creds && creds.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay portales cargados todavía.</p>
      )}

      {(creds ?? []).map(c => (
        <Card key={c.portal}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {PORTAL_LABEL[c.portal] ?? c.portal}
              <Badge
                className={
                  c.enabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-400 text-white'
                }
              >
                {c.enabled ? 'Activo' : 'Inactivo'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Última actualización:{' '}
              <span className="text-foreground">
                {new Date(c.updated_at).toLocaleString('es-AR')}
              </span>
            </p>
            {c.expires_at && (
              <p className="text-muted-foreground">
                Token expira:{' '}
                <span className="text-foreground">
                  {new Date(c.expires_at).toLocaleString('es-AR')}
                </span>
              </p>
            )}

            <Button
              size="sm"
              variant={c.enabled ? 'outline' : 'default'}
              disabled={toggling === c.portal}
              onClick={() => toggle(c.portal, !c.enabled)}
            >
              {toggling === c.portal && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              {c.enabled ? 'Desactivar' : 'Activar'}
            </Button>

            {errorToggle?.portal === c.portal && (
              <p className="flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {errorToggle.mensaje}
              </p>
            )}

            {c.portal === 'mercadolibre' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Para activar MercadoLibre:{' '}
                <a
                  href="/api/oauth/mercadolibre/start"
                  className="underline text-[color:var(--brand)]"
                >
                  conectar cuenta vía OAuth
                </a>
                .
              </p>
            )}
            {c.portal === 'argenprop' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Setear <code>ARGENPROP_API_KEY</code> y{' '}
                <code>ARGENPROP_CLIENT_CODE</code> en env vars de Netlify y
                volver acá a activar.
              </p>
            )}
            {c.portal === 'zonaprop' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Setear <code>ZONAPROP_API_KEY</code> y{' '}
                <code>ZONAPROP_CLIENT_CODE</code> en env vars de Netlify y
                volver acá a activar.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
