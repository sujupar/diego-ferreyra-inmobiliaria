'use client'

/**
 * Buscar y elegir la propiedad de un aviso. Lo comparten la hoja de una
 * consulta suelta ("¿Qué propiedad quiere ver?") y la de "Conectar avisos".
 *
 * Orden: primero hasta 3 SUGERIDAS (misma calle o barrio del aviso,
 * `sugerirPropiedades`), después las del barrio, después el resto. Es un orden,
 * no un filtro: si el aviso dice mal el barrio, la buena sigue en la lista.
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { ordenarCercanasPrimero } from '@/lib/consultas/agendar-desde-consulta'
import { sugerirPropiedades } from '@/lib/consultas/avisos'
import { cn } from '@/lib/utils'

export interface PropiedadParaAgendar {
  id: string
  address: string
  neighborhood: string | null
  foto: string | null
  assigned_to: string | null
}

function OpcionPropiedad({ p, elegida, onElegir }: { p: PropiedadParaAgendar; elegida: boolean; onElegir: () => void }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3',
      elegida ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
      <input type="radio" name="propiedad-del-aviso" checked={elegida} onChange={onElegir}
        className="h-5 w-5 shrink-0 accent-brand" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{p.address}</span>
        {p.neighborhood && <span className="truncate text-xs text-muted-foreground">{p.neighborhood}</span>}
      </span>
    </label>
  )
}

export function BuscadorDePropiedades({ textosDelAviso, elegida, onElegir }: {
  /** Lo que sabemos del aviso (título, dirección): de ahí salen las sugeridas. */
  textosDelAviso: ReadonlyArray<string | null>
  elegida: PropiedadParaAgendar | null
  onElegir: (p: PropiedadParaAgendar) => void
}) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<PropiedadParaAgendar[]>([])
  const [buscando, setBuscando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        // Sin texto se pide el inventario entero (≈40 hoy): las sugeridas y el
        // orden por barrio necesitan verlas todas, no las primeras 20.
        const limite = texto.trim() ? '' : '&limite=200'
        const r = await leerRespuesta<PropiedadParaAgendar[]>(await fetch(`/api/visits/propiedades?q=${encodeURIComponent(texto)}${limite}`))
        if (!vigente) return
        if (r.ok) { setLista(r.data); setError(null) } else setError(r.error)
      } catch {
        if (vigente) setError('No hay conexión. Probá de nuevo.')
      } finally {
        if (vigente) setBuscando(false)
      }
    }, texto ? 300 : 0)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  const pistas = textosDelAviso.filter((t): t is string => !!t).join(' · ')
  const { sugeridas, cercanas, resto, barrios } = useMemo(() => {
    // Las sugeridas solo con el buscador vacío: si la persona escribe, manda lo que escribió.
    const sug = texto.trim() ? [] : sugerirPropiedades(pistas, lista)
    const yaSugeridas = new Set(sug.map((p) => p.id))
    const orden = ordenarCercanasPrimero(lista.filter((p) => !yaSugeridas.has(p.id)), textosDelAviso)
    return { sugeridas: sug, ...orden }
  }, [lista, pistas, texto, textosDelAviso])

  const opcion = (p: PropiedadParaAgendar) => (
    <OpcionPropiedad key={p.id} p={p} elegida={elegida?.id === p.id} onElegir={() => onElegir(p)} />
  )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Buscar propiedad
        <span className="flex h-12 items-center gap-2 rounded-lg border bg-card px-3 font-normal">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Calle, número o barrio" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </span>
      </label>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {buscando && !error && lista.length === 0 && <p className="text-sm text-muted-foreground">Buscando…</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Propiedades</legend>
        {sugeridas.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Sugeridas para este aviso
          </p>
        )}
        {sugeridas.map(opcion)}
        {cercanas.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Primero las de {barrios.join(' y ')}</p>}
        {cercanas.map(opcion)}
        {(sugeridas.length > 0 || cercanas.length > 0) && resto.length > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">Otras propiedades</p>
        )}
        {resto.map(opcion)}
      </fieldset>
      {!buscando && !error && lista.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay propiedades captadas disponibles con ese texto.</p>
      )}
    </div>
  )
}
