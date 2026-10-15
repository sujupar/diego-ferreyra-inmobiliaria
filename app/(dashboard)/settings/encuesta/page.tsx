'use client'
/**
 * /settings/encuesta (adenda §11.1.5): interruptores del envío de la encuesta y del regalo por
 * WhatsApp, teléfonos de prueba y estado de las plantillas. Prender algo que le escribe a clientes
 * pide confirmación ACÁ (no un confirm() del navegador). La barrera de permisos es la ruta.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import type { AjustesEncuesta } from '@/lib/visitas/encuesta/tipos'
import type { EstadoPlantilla } from '@/lib/visitas/encuesta/ajustes'

interface Datos { ajustes: AjustesEncuesta; plantillas: EstadoPlantilla[]; whatsappModoPrueba: boolean }
type Fase = { tipo: 'cargando' } | { tipo: 'sin_permiso' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; datos: Datos }
type Interruptor = 'envio_automatico' | 'solo_con_regalo' | 'regalo_por_whatsapp'

const INTERRUPTORES: ReadonlyArray<{ clave: Interruptor; titulo: string; ayuda: string; confirmar: string | null }> = [
  {
    clave: 'envio_automatico', titulo: 'Mandar la encuesta por WhatsApp',
    ayuda: 'Al marcar una visita "Se realizó", se le manda la encuesta a la persona.',
    confirmar: 'Cada visita marcada "Se realizó" le va a mandar la encuesta por WhatsApp a la persona (en las propiedades con regalo, salvo que apagues "Solo propiedades con regalo"). ¿Prender?',
  },
  {
    clave: 'solo_con_regalo', titulo: 'Solo propiedades con regalo',
    ayuda: 'Si está prendido, la encuesta sale sola únicamente en propiedades que tienen su regalo cargado.',
    confirmar: null,
  },
  {
    clave: 'regalo_por_whatsapp', titulo: 'Mandar el regalo por WhatsApp',
    ayuda: 'Quien completa la encuesta recibe el PDF por WhatsApp. Prendelo solo cuando Meta haya aprobado la plantilla del regalo.',
    confirmar: 'Quien complete la encuesta va a recibir el PDF del regalo por WhatsApp. Prendelo solo si Meta ya aprobó la plantilla regalo_visita_v1. ¿Prender?',
  },
]

function cambio(clave: Interruptor, valor: boolean): Partial<AjustesEncuesta> {
  const c: Partial<AjustesEncuesta> = {}
  c[clave] = valor
  return c
}

export default function AjustesEncuestaPage() {
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aConfirmar, setAConfirmar] = useState<Interruptor | null>(null)
  const [telefonos, setTelefonos] = useState<string[]>([])
  const [nuevo, setNuevo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await leerRespuesta<Datos>(await fetch('/api/settings/encuesta-visitas'))
      if (!r.ok) {
        setFase(r.status === 403 ? { tipo: 'sin_permiso' } : { tipo: 'error', mensaje: r.error })
        return
      }
      setFase({ tipo: 'listo', datos: r.data }); setTelefonos(r.data.ajustes.telefonos_prueba)
    } catch {
      setFase({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' })
    }
  }, [])

  useEffect(() => {
    // Dispara la primera lectura; el estado inicial ya es 'cargando'.
    void cargar()
  }, [cargar])

  async function guardar(cambios: Partial<AjustesEncuesta>) {
    setGuardando(true); setError(null)
    try {
      const r = await leerRespuesta<Datos>(await fetch('/api/settings/encuesta-visitas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
      }))
      if (!r.ok) { setError(r.error); return }
      setFase({ tipo: 'listo', datos: r.data }); setTelefonos(r.data.ajustes.telefonos_prueba)
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function alTocar(clave: Interruptor, valor: boolean) {
    const def = INTERRUPTORES.find(i => i.clave === clave)
    if (valor && def?.confirmar) { setAConfirmar(clave); return }
    void guardar(cambio(clave, valor))
  }

  if (fase.tipo === 'cargando') return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (fase.tipo === 'sin_permiso') return <p className="text-sm text-muted-foreground">Solo admin y dueño pueden ver esta configuración.</p>
  if (fase.tipo === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <span>{fase.mensaje}</span>
        <Button variant="outline" className="min-h-11" onClick={() => { setFase({ tipo: 'cargando' }); void cargar() }}>Reintentar</Button>
      </div>
    )
  }

  const { ajustes, plantillas, whatsappModoPrueba } = fase.datos
  const confirmacion = INTERRUPTORES.find(i => i.clave === aConfirmar)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">Encuesta de visitas</h1>
        <p className="text-muted-foreground">Qué se le manda a la persona después de una visita realizada.</p>
        {whatsappModoPrueba && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">WhatsApp está en modo prueba: no sale ningún mensaje real.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Envío por WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {INTERRUPTORES.map(i => (
            <div key={i.clave} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor={`sw-${i.clave}`} className="font-medium">{i.titulo}</Label>
                <p className="text-sm text-muted-foreground">{i.ayuda}</p>
              </div>
              <Switch id={`sw-${i.clave}`} aria-label={i.titulo} checked={ajustes[i.clave]} disabled={guardando}
                onCheckedChange={v => alTocar(i.clave, v)} className="mt-1" />
            </div>
          ))}
          {confirmacion?.confirmar && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>{confirmacion.confirmar}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" disabled={guardando} onClick={() => { const c = confirmacion.clave; setAConfirmar(null); void guardar(cambio(c, true)) }}>Sí, prender</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setAConfirmar(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Teléfonos de prueba</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Estos números reciben la encuesta y el regalo aunque el envío esté apagado. Vaciá la lista al terminar de probar.</p>
          <ul className="flex flex-wrap gap-2">
            {telefonos.map(t => (
              <li key={t} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                <span>{t}</span>
                <button type="button" aria-label={`Quitar ${t}`} className="min-h-11 min-w-11 inline-flex items-center justify-center" onClick={() => setTelefonos(ts => ts.filter(x => x !== t))}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Agregar teléfono de prueba" inputMode="tel" className="min-h-11 max-w-xs text-base" value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="11 5823-4521" />
            <Button type="button" variant="outline" className="min-h-11" disabled={!nuevo.trim() || telefonos.length >= 10}
              onClick={() => { setTelefonos(ts => [...ts, nuevo.trim()]); setNuevo('') }}>Agregar</Button>
            <Button type="button" className="min-h-11" disabled={guardando} onClick={() => void guardar({ telefonos_prueba: telefonos })}>Guardar teléfonos</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Plantillas de WhatsApp</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {plantillas.map(p => (
              <li key={p.uso} className="space-y-1">
                <p className="font-medium">{p.uso === 'encuesta' ? 'Encuesta' : 'Regalo'} <span className="font-mono text-xs text-muted-foreground">({p.variable})</span></p>
                {p.configurada ? <p className="font-mono">{p.configurada}</p> : <p className="text-muted-foreground">Sin configurar: no se manda nada</p>}
                {p.configurada && !p.conocida && <p className="text-destructive">No es una de las plantillas conocidas: no se manda (Meta rechazaría el mensaje).</p>}
                {p.conocida && <p className="text-muted-foreground">{p.conBoton ? 'Con botón "Completar ficha".' : ''}{p.conDocumento ? 'Lleva el PDF adjunto.' : ''}</p>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
