'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { IdentifyAvisoDialog, type AvisoPendiente } from '@/components/inbox/IdentifyAvisoDialog'
import {
  cargarAvisos,
  cargarAsesores,
  cargarPropiedades,
  type Fallo,
  type PropiedadOpcion,
} from '@/components/inbox/avisos-carga'

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

/**
 * Tres estados, no dos. El bug que arregla esta pantalla es haber tenido uno
 * solo: cualquier fallo del endpoint (403 de un asesor, 401 de sesión vencida,
 * 500 de Supabase) se convertía en `{ data: [] }` y salía por pantalla como la
 * tarjeta verde "Todas las consultas están identificadas" — con avisos
 * pendientes de verdad del otro lado.
 */
type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; fallo: Fallo }
  | { fase: 'listo'; avisos: AvisoPendiente[] }

export function AvisosClient() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string | null }[]>([])
  const [properties, setProperties] = useState<PropiedadOpcion[]>([])
  // Los datos del formulario (asesores y propiedades) son SECUNDARIOS: si
  // fallan, la cola igual se muestra. Pero no se pueden tragar en silencio —
  // sin asesores no se puede guardar nada, y un selector de propiedades corto
  // parece "esa propiedad no existe".
  const [avisoDatos, setAvisoDatos] = useState<string | null>(null)

  const load = useCallback(async () => {
    setEstado({ fase: 'cargando' })
    setAvisoDatos(null)

    const [cola, asesores, props] = await Promise.all([
      cargarAvisos(fetch),
      cargarAsesores(fetch),
      cargarPropiedades(fetch),
    ])

    if (!cola.ok) {
      setEstado({ fase: 'error', fallo: cola.fallo })
      return
    }
    setEstado({ fase: 'listo', avisos: cola.valor })

    const problemas: string[] = []
    if (asesores.ok) setAdvisors(asesores.valor)
    else problemas.push(asesores.fallo.motivo)

    if (props.ok) {
      setProperties(props.valor.propiedades)
      if (props.valor.incompleta) {
        problemas.push('Son tantas propiedades que no entraron todas en el desplegable. Usá el link del aviso para identificarlo.')
      }
    } else {
      problemas.push(props.fallo.motivo)
    }
    setAvisoDatos(problemas.length > 0 ? problemas.join(' ') : null)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el estado inicial YA es 'cargando'; esto solo dispara el pedido
    load()
  }, [load])

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Avisos por identificar</h1>
        <p className="text-sm text-muted-foreground">
          Estos avisos recibieron consultas, pero el sistema no sabe de qué propiedad son ni quién la muestra.
          Identificá cada uno y sus consultas — las de antes y las que lleguen — se asignan solas.
        </p>
      </header>

      {estado.fase === 'cargando' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando avisos pendientes…
        </p>
      )}

      {estado.fase === 'error' && (
        <Card className="border-amber-400/60">
          <CardContent className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
            <div>
              <p className="font-medium">No pudimos mostrar los avisos</p>
              <p className="text-sm text-muted-foreground">{estado.fallo.motivo}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Esto NO quiere decir que esté todo identificado — quiere decir que no lo pudimos leer.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {estado.fallo.reintentable && (
                <Button size="sm" variant="outline" onClick={load}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              )}
              {estado.fallo.sesionVencida && (
                <Button size="sm" asChild>
                  <Link href="/login">Volver a entrar</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {estado.fase === 'listo' && avisoDatos && (
        <p className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          {avisoDatos}
        </p>
      )}

      {estado.fase === 'listo' && estado.avisos.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="font-medium">No hay avisos pendientes</p>
            <p className="text-sm text-muted-foreground">Todas las consultas están identificadas.</p>
          </CardContent>
        </Card>
      )}

      {estado.fase === 'listo' &&
        estado.avisos.map(aviso => (
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
