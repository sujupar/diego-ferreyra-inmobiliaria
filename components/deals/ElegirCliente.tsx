'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, UserPlus, ArrowRight } from 'lucide-react'
import { ORIGENES_MANUALES, type MotivoProceso } from '@/lib/deals/proceso-manual'

/**
 * Primer paso de todo trabajo MANUAL: ¿de qué cliente es?
 *
 * POR QUÉ (2026-09-17): antes la tasación manual inventaba el cliente con la
 * dirección y creaba el proceso sin asesor, así que el asesor no lo veía en su
 * CRM y el trabajo quedaba fuera del embudo. Acá se elige un proceso que ya
 * existe (lo normal cuando la visita se coordinó antes) o se cargan los datos
 * del cliente una sola vez.
 */

const ETIQUETA_ORIGEN: Record<string, string> = {
  embudo: 'Embudo (landing)',
  referido: 'Referido',
  historico: 'Histórico',
}

const ETIQUETA_ETAPA: Record<string, string> = {
  clase_gratuita: 'Clase Gratuita',
  request: 'Solicitud',
  scheduled: 'Coordinada',
  not_visited: 'No Realizada',
  visited: 'Visita Realizada',
  appraisal_sent: 'Tasación Entregada',
  followup: 'En Seguimiento',
  captured: 'Captada',
  lost: 'Descartado',
  comprador: 'Comprador',
}

interface ProcesoEncontrado {
  id: string
  propertyAddress?: string | null
  contactoNombre?: string | null
  stage?: string
  origin?: string | null
}

interface Props {
  motivo: MotivoProceso
  /**
   * Se llama con el proceso elegido o recién creado. `stage` sirve para saber
   * si todavía falta cargar la visita antes de seguir.
   */
  onProceso: (dealId: string, esNuevo: boolean, stage?: string) => void
  /** Texto de arriba, para que la pantalla explique dónde está parado el asesor. */
  titulo?: string
  descripcion?: string
}

function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function ElegirCliente({ motivo, onProceso, titulo, descripcion }: Props) {
  const [termino, setTermino] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ProcesoEncontrado[] | null>(null)
  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar')
  const [asesores, setAsesores] = useState<{ id: string; full_name: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', origen: 'referido', asesorId: '',
    direccion: '', tipo: 'departamento', tipoOtro: '', barrio: '', ambientes: '',
    fechaVisita: hoyISO(),
  })
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/users/advisors')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => setAsesores(j.data || []))
      .catch(() => {})
  }, [])

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setResultados(null); return }
    setBuscando(true)
    try {
      const r = await fetch(`/api/deals/buscar?q=${encodeURIComponent(q.trim())}`)
      const j = await r.json().catch(() => ({ data: [] }))
      setResultados(r.ok ? (j.data ?? []) : [])
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [])

  function alEscribir(valor: string) {
    setTermino(valor)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => void buscar(valor), 400)
  }

  async function crearCliente(e: React.FormEvent) {
    e.preventDefault()
    setErrores([])
    setGuardando(true)
    try {
      const r = await fetch('/api/deals/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo,
          cliente: { ...form, ambientes: form.ambientes === '' ? undefined : Number(form.ambientes) },
        }),
      })
      const texto = await r.text()
      let j: { dealId?: string; errores?: string[]; error?: string } = {}
      try { j = JSON.parse(texto) } catch { /* el servidor devolvió algo que no es JSON */ }
      if (!r.ok || !j.dealId) {
        setErrores(j.errores?.length ? j.errores : [j.error || 'No se pudo crear el proceso. Probá de nuevo.'])
        return
      }
      onProceso(j.dealId, true, motivo === 'captacion' ? 'captured' : 'scheduled')
    } catch {
      setErrores(['No se pudo crear el proceso. Revisá tu conexión.'])
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value })),
  })

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">{titulo ?? '¿Para qué cliente es?'}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {descripcion ?? (motivo === 'tasacion'
            ? 'Toda tasación pertenece a un proceso del CRM. Buscá el del cliente o cargalo si es la primera vez.'
            : 'Toda propiedad captada pertenece a un proceso del CRM. Buscá el del cliente o cargalo si es la primera vez.')}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="inline-flex rounded-xl border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setModo('buscar')}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${modo === 'buscar' ? 'bg-background font-semibold' : 'text-muted-foreground'}`}
          >
            <Search className="h-4 w-4" /> Buscar proceso
          </button>
          <button
            type="button"
            onClick={() => setModo('nuevo')}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${modo === 'nuevo' ? 'bg-background font-semibold' : 'text-muted-foreground'}`}
          >
            <UserPlus className="h-4 w-4" /> Cliente nuevo
          </button>
        </div>

        {modo === 'buscar' && (
          <div className="space-y-3">
            <Label htmlFor="buscar-proceso">Buscá por nombre del cliente, teléfono o dirección</Label>
            <Input
              id="buscar-proceso"
              value={termino}
              onChange={e => alEscribir(e.target.value)}
              placeholder="Ej: Marta Gómez, 11 5555-4444 o Av. Belgrano 1500"
              autoComplete="off"
            />
            {buscando && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</p>}
            {resultados?.length === 0 && !buscando && (
              <p className="text-sm text-muted-foreground">
                No encontramos ningún proceso con eso. Si es la primera vez que trabajamos con este cliente, cargalo en «Cliente nuevo».
              </p>
            )}
            <ul className="divide-y rounded-lg border">
              {(resultados ?? []).map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onProceso(p.id, false, p.stage)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-center justify-between gap-3"
                  >
                    <span>
                      <span className="block text-sm font-medium">{p.contactoNombre || 'Sin nombre'}</span>
                      <span className="block text-xs text-muted-foreground">{p.propertyAddress}</span>
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {ETIQUETA_ETAPA[p.stage ?? ''] ?? p.stage}
                      {p.origin ? ` · ${ETIQUETA_ORIGEN[p.origin] ?? p.origin}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {modo === 'nuevo' && (
          <form onSubmit={crearCliente} className="space-y-4">
            {errores.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-1">
                {errores.map((e, i) => <p key={i} className="text-sm text-red-800">{e}</p>)}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cl-nombre">Propietario *</Label>
                <Input id="cl-nombre" required placeholder="Nombre y apellido" {...campo('nombre')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-tel">Teléfono *</Label>
                <Input id="cl-tel" required placeholder="11 5555-4444" {...campo('telefono')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-email">Email</Label>
                <Input id="cl-email" type="email" placeholder="Opcional" {...campo('email')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-origen">Origen *</Label>
                <select id="cl-origen" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11" {...campo('origen')}>
                  {ORIGENES_MANUALES.map(o => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-asesor">Asesor *</Label>
                <select id="cl-asesor" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11" {...campo('asesorId')}>
                  <option value="">Elegí quién la atiende…</option>
                  {asesores.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Sin asesor, el proceso no le aparece en su CRM.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-fecha">{motivo === 'tasacion' ? 'Fecha de la visita *' : 'Fecha de la captación *'}</Label>
                <Input id="cl-fecha" type="date" required {...campo('fechaVisita')} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cl-dir">Dirección de la propiedad *</Label>
                <Input id="cl-dir" required placeholder="Av. Belgrano 1500" {...campo('direccion')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-barrio">Barrio o localidad *</Label>
                <Input id="cl-barrio" required placeholder="Monserrat" {...campo('barrio')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-tipo">Tipo *</Label>
                <select id="cl-tipo" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11" {...campo('tipo')}>
                  <option value="departamento">Departamento</option>
                  <option value="casa">Casa</option>
                  <option value="ph">PH</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              {form.tipo === 'otro' && (
                <div className="space-y-1">
                  <Label htmlFor="cl-tipo-otro">¿Qué tipo? *</Label>
                  <Input id="cl-tipo-otro" required placeholder="Cochera, galpón…" {...campo('tipoOtro')} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="cl-amb">Ambientes *</Label>
                <Input id="cl-amb" type="number" min="1" required {...campo('ambientes')} />
              </div>
            </div>
            <Button type="submit" disabled={guardando} className="w-full sm:w-auto">
              {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {motivo === 'tasacion' ? 'Crear el proceso y seguir' : 'Crear el proceso y captar'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
