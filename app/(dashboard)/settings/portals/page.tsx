'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

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
  properati: 'Properati',
  mudafy: 'Mudafy',
}

export default function PortalsSettingsPage() {
  const [creds, setCreds] = useState<Credential[] | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function load() {
    try {
      const r = await fetch('/api/admin/portal-credentials')
      if (r.ok) {
        const { data } = await r.json()
        setCreds(data ?? [])
      }
    } catch (err) {
      console.error('[portals-settings] load failed', err)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggle(portal: string, enabled: boolean) {
    setToggling(portal)
    try {
      await fetch('/api/admin/portal-credentials', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portal, enabled }),
      })
      await load()
    } finally {
      setToggling(null)
    }
  }

  if (!creds) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="display text-3xl">Portales</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Habilitá cada portal cuando recibas sus credenciales. Los listings
          encolados se procesarán automáticamente en el siguiente ciclo del
          worker (cada 1 min).
        </p>
      </div>

      {creds.map(c => (
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
            {c.portal === 'properati' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Setear <code>PROPERATI_API_KEY</code> y{' '}
                <code>PROPERATI_CLIENT_CODE</code> en env vars de Netlify y
                volver acá a activar.
              </p>
            )}
            {c.portal === 'mudafy' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Setear <code>MUDAFY_API_KEY</code> y{' '}
                <code>MUDAFY_CLIENT_CODE</code> en env vars de Netlify y
                volver acá a activar.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
