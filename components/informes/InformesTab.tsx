'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { textoDelPeriodo, type Periodo } from '@/lib/informes/periodo'

interface FilaInforme { id: string; desde: string; hasta: string; origen: 'ciclo' | 'manual'; estado: 'borrador' | 'listo'; listoAt: string | null }
interface Listado { informes: FilaInforme[]; atajos: { ultimaQuincena: Periodo | null; cicloDeLaPropiedad: Periodo | null; sinFechaDeCaptacion?: boolean } }

type Estado = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; listado: Listado }

/**
 * Pestaña "Informes" de la ficha (spec, "Qué ve cada persona"): la lista de informes quincenales
 * de la propiedad y "Nuevo informe" con los atajos y fechas libres. Quién la ve lo decide la ruta.
 */
export function InformesTab({ propertyId }: { propertyId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al montar ya es 'cargando'; esto dispara el pedido (y vuelve a pasar al reintentar)
    setEstado({ tipo: 'cargando' })
    fetch(`/api/properties/${encodeURIComponent(propertyId)}/informes`)
      .then(r => leerRespuesta<Listado>(r))
      .then(r => { if (vigente) setEstado(r.ok ? { tipo: 'listo', listado: r.data } : { tipo: 'error', mensaje: r.error }) })
      .catch(() => { if (vigente) setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' }) })
    return () => { vigente = false }
  }, [propertyId, intento])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Para el propietario</p>
          <h2 className="display mt-1 text-xl">Informes quincenales</h2>
        </div>
        {estado.tipo === 'listo' && (
          <Button type="button" className="min-h-11" onClick={() => setNuevoAbierto(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Nuevo informe
          </Button>
        )}
      </div>

      {estado.tipo === 'cargando' && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" /></div>}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
        </div>
      )}
      {estado.tipo === 'listo' && <ListaDeInformes informes={estado.listado.informes} />}
      {estado.tipo === 'listo' && (
        <NuevoInforme
          propertyId={propertyId}
          atajos={estado.listado.atajos}
          abierto={nuevoAbierto}
          onCerrar={() => setNuevoAbierto(false)}
        />
      )}
    </div>
  )
}

// Componentes de MÓDULO: ver CLAUDE.md § "NUNCA declarar un componente dentro de otro".
function ListaDeInformes({ informes }: { informes: FilaInforme[] }) {
  if (informes.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay informes. Armá el primero con &quot;Nuevo informe&quot;.</p>
  }
  return (
    <ul className="space-y-2">
      {informes.map(i => (
        <li key={i.id}>
          <Link href={`/informes/${i.id}`} className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-medium">Período {textoDelPeriodo(i.desde, i.hasta)}</span>
            <span className="text-xs text-muted-foreground">{i.origen === 'ciclo' ? 'Automático' : 'A medida'}</span>
            <span className={i.estado === 'listo' ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800' : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900'}>
              {i.estado === 'listo' ? 'Listo' : 'Para completar'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

type Opcion = 'quincena' | 'ciclo' | 'fechas'

function NuevoInforme({ propertyId, atajos, abierto, onCerrar }: {
  propertyId: string
  atajos: Listado['atajos']
  abierto: boolean
  onCerrar: () => void
}) {
  const router = useRouter()
  const [opcion, setOpcion] = useState<Opcion>(atajos.ultimaQuincena ? 'quincena' : atajos.cicloDeLaPropiedad ? 'ciclo' : 'fechas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegido: Periodo | null = opcion === 'quincena' ? atajos.ultimaQuincena : opcion === 'ciclo' ? atajos.cicloDeLaPropiedad : desde && hasta ? { desde, hasta } : null

  async function crear() {
    if (!elegido) { setError('Elegí las fechas del informe'); return }
    setEnviando(true)
    setError(null)
    try {
      const r = await leerRespuesta<{ id: string }>(await fetch(`/api/properties/${encodeURIComponent(propertyId)}/informes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(elegido),
      }))
      if (!r.ok) { setError(r.error); return }
      router.push(`/informes/${r.data.id}`)
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const opciones: Array<{ valor: Opcion; titulo: string; detalle: string | null; disponible: boolean }> = [
    { valor: 'quincena', titulo: 'Última quincena', detalle: atajos.ultimaQuincena ? textoDelPeriodo(atajos.ultimaQuincena.desde, atajos.ultimaQuincena.hasta) : 'La propiedad se captó después', disponible: !!atajos.ultimaQuincena },
    { valor: 'ciclo', titulo: 'Ciclo de la propiedad', detalle: atajos.cicloDeLaPropiedad ? textoDelPeriodo(atajos.cicloDeLaPropiedad.desde, atajos.cicloDeLaPropiedad.hasta) : (atajos.sinFechaDeCaptacion ? 'La propiedad no tiene fecha de captación cargada' : 'Todavía no cumplió 15 días captada'), disponible: !!atajos.cicloDeLaPropiedad },
    { valor: 'fechas', titulo: 'Elegir fechas', detalle: null, disponible: true },
  ]

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo informe</DialogTitle>
          <DialogDescription>Elegí el período. Si ya hay un informe para esas fechas, se abre ese.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="sr-only">Período</legend>
          {opciones.map(o => (
            <label key={o.valor} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${opcion === o.valor ? 'border-primary bg-primary/5' : ''} ${o.disponible ? '' : 'cursor-not-allowed opacity-50'}`}>
              <input type="radio" name="periodo" className="mt-1" checked={opcion === o.valor} disabled={!o.disponible} onChange={() => setOpcion(o.valor)} />
              <span>
                <span className="block text-sm font-medium">{o.titulo}</span>
                {o.detalle ? <span className="block text-xs text-muted-foreground">{o.detalle}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        {opcion === 'fechas' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="informe-desde">Desde</Label>
              <Input id="informe-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="informe-hasta">Hasta</Label>
              <Input id="informe-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-11" />
            </div>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onCerrar}>Cancelar</Button>
          <Button type="button" className="min-h-11" disabled={enviando || !elegido} onClick={crear}>
            {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null} Armar informe
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
