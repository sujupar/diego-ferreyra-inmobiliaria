'use client'

/**
 * Hoja "¿Qué propiedad quiere ver?" (lienzo, pantalla 2b): la consulta llegó por
 * un aviso que todavía no está conectado con ninguna propiedad. Se elige la
 * propiedad y se la conecta con `POST /api/consultas/[id]/propiedad` ANTES de
 * agendar: `POST /api/visits` rechaza una consulta sin su propiedad.
 *
 * Solo operaciones identifica avisos (recordar cambia a quién se le avisan las
 * consultas futuras). Un asesor ve lo que sabemos del aviso y a quién pedírselo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { enlaceSeguro, etiquetaPortal, nombreVisible } from '@/lib/consultas/pantalla'
import { leerConexion, ordenarCercanasPrimero } from '@/lib/consultas/agendar-desde-consulta'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'
import { cn } from '@/lib/utils'
import { HojaArmazon } from './HojaArmazon'

export interface PropiedadParaAgendar {
  id: string
  address: string
  neighborhood: string | null
  foto: string | null
  assigned_to: string | null
}

const AVISO_NO_RECORDADO =
  'No se pudo recordar el aviso (la propiedad no tiene asesor o el aviso no tiene código). Esta consulta sí quedó conectada.'

interface Props {
  consulta: ConsultaEnBandeja
  puedeIdentificar: boolean
  /** Si después viene la hoja del teléfono, el botón lo dice. */
  siguienteEsTelefono: boolean
  onConectada: (propiedad: PropiedadParaAgendar) => void
  onCerrar: () => void
}

function OpcionPropiedad({ p, elegida, onElegir }: { p: PropiedadParaAgendar; elegida: boolean; onElegir: () => void }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3',
      elegida ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
      <input type="radio" name="propiedad-de-la-consulta" checked={elegida} onChange={onElegir}
        className="h-5 w-5 shrink-0 accent-brand" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{p.address}</span>
        {p.neighborhood && <span className="truncate text-xs text-muted-foreground">{p.neighborhood}</span>}
      </span>
    </label>
  )
}

export function HojaElegirPropiedad({ consulta: c, puedeIdentificar, siguienteEsTelefono, onConectada, onCerrar }: Props) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<PropiedadParaAgendar[]>([])
  const [buscando, setBuscando] = useState(true)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [elegida, setElegida] = useState<PropiedadParaAgendar | null>(null)
  const [recordar, setRecordar] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!puedeIdentificar) return
    let vigente = true
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const r = await leerRespuesta<PropiedadParaAgendar[]>(await fetch(`/api/visits/propiedades?q=${encodeURIComponent(texto)}`))
        if (!vigente) return
        if (r.ok) { setLista(r.data); setErrorBusqueda(null) } else setErrorBusqueda(r.error)
      } catch {
        if (vigente) setErrorBusqueda('No hay conexión. Probá de nuevo.')
      } finally {
        if (vigente) setBuscando(false)
      }
    }, 300)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto, puedeIdentificar])

  const { cercanas, resto, barrios } = useMemo(
    () => ordenarCercanasPrimero(lista, [c.aviso_direccion, c.aviso_titulo]),
    [lista, c.aviso_direccion, c.aviso_titulo],
  )
  // Recordar necesita el código del aviso: sin código no hay nada que recordar.
  const ofreceRecordar = puedeIdentificar && !!c.aviso_codigo?.trim()

  async function seguir() {
    if (!elegida || enviando) return
    setEnviando(true)
    setError(null)
    const pidioRecordar = ofreceRecordar && recordar
    try {
      const r = await leerConexion(await fetch(`/api/consultas/${c.id}/propiedad`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId: elegida.id, recordar: pidioRecordar }),
      }))
      if (!r.ok) { setError(r.error); return }
      // No frena: la consulta ya quedó conectada y se puede agendar igual.
      if (pidioRecordar && !r.recordado) toast.warning(AVISO_NO_RECORDADO)
      onConectada(elegida)
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const enlaceAviso = enlaceSeguro(c.aviso_url)
  const codigo = c.aviso_codigo?.trim()
  const titulo = c.aviso_titulo?.trim()
  const direccion = c.aviso_direccion?.trim()

  const pie = puedeIdentificar ? (
    <Button type="button" onClick={seguir} disabled={!elegida || enviando}
      className="min-h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90">
      {enviando ? 'Conectando…' : siguienteEsTelefono ? 'Seguir: revisar el teléfono' : 'Seguir: elegir día y hora'}
    </Button>
  ) : (
    <Button type="button" variant="outline" className="min-h-12 w-full text-base" onClick={onCerrar}>Cerrar</Button>
  )

  return (
    <HojaArmazon
      titulo="¿Qué propiedad quiere ver?"
      descripcion={`${nombreVisible(c)} consultó por un aviso que todavía no conectamos con ninguna propiedad.`}
      pie={pie}
      onCerrar={onCerrar}
    >
      <div className="flex flex-col gap-1 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <span className="font-semibold">Lo que sabemos del aviso</span>
        <span>{etiquetaPortal(c.portal)}{codigo ? ` · código ${codigo}` : ''}</span>
        {titulo && <span className="break-words">«{titulo}»</span>}
        {direccion && <span className="break-words">{direccion}</span>}
        {enlaceAviso && (
          <a href={enlaceAviso} target="_blank" rel="noopener noreferrer" className="mt-1 font-semibold underline">
            Abrir el aviso para mirarlo
          </a>
        )}
      </div>

      {!puedeIdentificar ? (
        <p className="rounded-xl border p-3 text-sm">
          Pedile a un coordinador que identifique este aviso. Cuando la consulta tenga su propiedad, vas a poder agendar desde acá.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Buscar propiedad
            <span className="flex h-12 items-center gap-2 rounded-lg border bg-card px-3 font-normal">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Calle, número o barrio" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            </span>
          </label>

          {errorBusqueda && <p role="alert" className="text-sm text-destructive">{errorBusqueda}</p>}
          {buscando && !errorBusqueda && lista.length === 0 && <p className="text-sm text-muted-foreground">Buscando…</p>}

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Propiedades</legend>
            {cercanas.length > 0 && (
              <p className="text-xs text-muted-foreground">Primero las de {barrios.join(' y ')}</p>
            )}
            {cercanas.map((p) => (
              <OpcionPropiedad key={p.id} p={p} elegida={elegida?.id === p.id} onElegir={() => setElegida(p)} />
            ))}
            {cercanas.length > 0 && resto.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Otras propiedades</p>}
            {resto.map((p) => (
              <OpcionPropiedad key={p.id} p={p} elegida={elegida?.id === p.id} onElegir={() => setElegida(p)} />
            ))}
          </fieldset>
          {!buscando && !errorBusqueda && lista.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay propiedades captadas disponibles con ese texto.</p>
          )}

          {ofreceRecordar && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Recordar que este aviso es {elegida ? elegida.address : 'la propiedad que elijas'}</span>
                <span className="text-xs text-muted-foreground">
                  Las otras consultas de ese aviso pasan a esta propiedad y las próximas entran solas.
                </span>
              </span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </HojaArmazon>
  )
}
