'use client'
/**
 * Selector de ubicación en cascada: Provincia → Partido → Localidad → Barrio.
 *
 * Las opciones salen del catálogo REAL de Argenprop, así que lo que se elige acá
 * es publicable por definición. Antes esto eran dos campos de texto libre y la
 * publicación dependía de emparejar strings: "General San Martín" contra
 * "Partido de General San Martín" contra la localidad "General San Martin" (sin
 * tilde) contra "Villa Libertad", que ni siquiera es una localidad sino un barrio.
 *
 * Capital NO es un caso especial: en el catálogo tiene la misma jerarquía de
 * cuatro niveles (Capital Federal → Capital Federal → CABA → 54 barrios). Lo
 * único distinto es que ahí el barrio es obligatorio (regla de la API).
 *
 * Si el catálogo no responde, avisa hacia arriba (`onCatalogoNoDisponible`) para
 * que la pantalla caiga a los campos de texto de siempre. Nadie se queda sin
 * poder cargar una propiedad porque un portal esté caído.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  ID_LOCALIDAD_CABA,
  buscarEnCatalogoPorNombre,
  esSeleccionCompleta,
  pistaDeProvincia,
  type ItemCatalogo,
  type SeleccionUbicacion,
} from '@/lib/properties/location-selection'

type Nivel = 'provincias' | 'partidos' | 'localidades' | 'barrios'

interface Seleccion {
  provincia?: ItemCatalogo
  partido?: ItemCatalogo
  localidad?: ItemCatalogo
  barrio?: ItemCatalogo | null
}

interface Props {
  /** Lo que dice la ficha hoy. Se usa para preseleccionar y ahorrar clics. */
  pista?: { province?: string | null; city?: string | null; neighborhood?: string | null }
  onChange: (seleccion: SeleccionUbicacion | null) => void
  /** El catálogo no está disponible: la pantalla debería ofrecer los campos de texto. */
  onCatalogoNoDisponible?: () => void
  disabled?: boolean
}

/**
 * Lee la respuesta sin explotar si el servidor devolvió HTML (una función que
 * se pasó de tiempo responde una página de error, y `res.json()` tira
 * "Unexpected token '<'", que no le dice nada a nadie).
 */
async function leerJson(res: Response): Promise<Record<string, unknown>> {
  const texto = await res.text()
  try { return JSON.parse(texto) as Record<string, unknown> } catch { return {} }
}

export function LocationPicker({ pista, onChange, onCatalogoNoDisponible, disabled }: Props) {
  const [provincias, setProvincias] = useState<ItemCatalogo[]>([])
  const [partidos, setPartidos] = useState<ItemCatalogo[]>([])
  const [localidades, setLocalidades] = useState<ItemCatalogo[]>([])
  const [barrios, setBarrios] = useState<ItemCatalogo[]>([])
  const [sel, setSel] = useState<Seleccion>({})
  const [cargando, setCargando] = useState<Nivel | null>('provincias')
  const [error, setError] = useState<string | null>(null)

  // `onChange` suele venir como función nueva en cada render del padre: si
  // entrara en las dependencias del efecto, avisaría en bucle.
  const avisar = useRef(onChange)
  avisar.current = onChange
  const avisarCaido = useRef(onCatalogoNoDisponible)
  avisarCaido.current = onCatalogoNoDisponible

  // Una pista que llega tarde (el alta precarga datos de la tasación después de
  // montar) NO debe pisar lo que la persona ya eligió a mano.
  const tocado = useRef(false)

  const traer = useCallback(async (nivel: Nivel, padre?: string): Promise<ItemCatalogo[]> => {
    const url = `/api/locations/argenprop?nivel=${nivel}${padre ? `&padre=${encodeURIComponent(padre)}` : ''}`
    const res = await fetch(url)
    const data = await leerJson(res)
    if (!res.ok) {
      if (data.catalogoNoDisponible) avisarCaido.current?.()
      throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo traer la lista de ubicaciones.')
    }
    return Array.isArray(data.items) ? (data.items as ItemCatalogo[]) : []
  }, [])

  // Carga inicial + preselección a partir de lo que ya dice la ficha.
  useEffect(() => {
    if (tocado.current) return
    let vivo = true
    ;(async () => {
      try {
        setCargando('provincias')
        const provs = await traer('provincias')
        if (!vivo) return
        setProvincias(provs)

        const provincia = buscarEnCatalogoPorNombre(provs, pistaDeProvincia(pista?.province))
        if (!provincia) { setCargando(null); return }
        setSel({ provincia })

        setCargando('partidos')
        const parts = await traer('partidos', provincia.id)
        if (!vivo) return
        setPartidos(parts)
        // Fuera de Capital la ficha guarda la localidad en `city`, y muchas veces
        // se llama igual que el partido; en Capital el partido es único.
        const partido = parts.length === 1 ? parts[0] : buscarEnCatalogoPorNombre(parts, pista?.city)
        if (!partido) { setCargando(null); return }
        setSel(s => ({ ...s, partido }))

        setCargando('localidades')
        const locs = await traer('localidades', partido.id)
        if (!vivo) return
        setLocalidades(locs)
        // La ficha a veces guarda la localidad en `neighborhood` (ej. ciudad
        // "General San Martín" = el partido, barrio "Villa Ballester" = la localidad).
        const localidad = locs.length === 1
          ? locs[0]
          : buscarEnCatalogoPorNombre(locs, pista?.city) ?? buscarEnCatalogoPorNombre(locs, pista?.neighborhood)
        if (!localidad) { setCargando(null); return }
        setSel(s => ({ ...s, localidad }))

        setCargando('barrios')
        const brs = await traer('barrios', localidad.id)
        if (!vivo) return
        setBarrios(brs)
        const barrio = buscarEnCatalogoPorNombre(brs, pista?.neighborhood) ?? null
        setSel(s => ({ ...s, barrio }))
        setCargando(null)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo traer la lista de ubicaciones.')
        setCargando(null)
      }
    })()
    return () => { vivo = false }
  }, [traer, pista?.province, pista?.city, pista?.neighborhood])

  // Avisa hacia arriba solo cuando la selección está completa (y el barrio, si
  // es Capital, elegido). Incompleta = null: el padre deshabilita "Guardar".
  useEffect(() => {
    const completa = esSeleccionCompleta(sel)
    const enCapital = sel.localidad?.id === ID_LOCALIDAD_CABA
    const listo = completa && (!enCapital || Boolean(sel.barrio))
    avisar.current(listo ? (sel as SeleccionUbicacion) : null)
  }, [sel])

  async function elegirProvincia(id: string) {
    tocado.current = true
    const provincia = provincias.find(p => p.id === id)
    setSel({ provincia })
    setPartidos([]); setLocalidades([]); setBarrios([])
    if (!provincia) return
    try {
      setError(null); setCargando('partidos')
      const items = await traer('partidos', provincia.id)
      setPartidos(items)
      // Capital tiene un solo partido: elegirlo a mano sería un clic vacío.
      if (items.length === 1) await elegirPartidoCon(items[0])
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setCargando(null) }
  }

  async function elegirPartidoCon(partido: ItemCatalogo) {
    tocado.current = true
    setSel(s => ({ provincia: s.provincia, partido }))
    setLocalidades([]); setBarrios([])
    try {
      setError(null); setCargando('localidades')
      const items = await traer('localidades', partido.id)
      setLocalidades(items)
      if (items.length === 1) await elegirLocalidadCon(items[0])
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setCargando(null) }
  }

  async function elegirLocalidadCon(localidad: ItemCatalogo) {
    tocado.current = true
    setSel(s => ({ provincia: s.provincia, partido: s.partido, localidad }))
    setBarrios([])
    try {
      setError(null); setCargando('barrios')
      const items = await traer('barrios', localidad.id)
      setBarrios(items)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setCargando(null) }
  }

  const enCapital = sel.localidad?.id === ID_LOCALIDAD_CABA
  const bloqueado = Boolean(disabled) || cargando === 'provincias'
  const claseSelect = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11 disabled:opacity-60'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium flex items-center gap-1.5">
            Provincia *{cargando === 'provincias' && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <select
            aria-label="Provincia"
            className={claseSelect}
            disabled={bloqueado}
            value={sel.provincia?.id ?? ''}
            onChange={e => elegirProvincia(e.target.value)}
          >
            <option value="">Elegí una provincia…</option>
            {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium flex items-center gap-1.5">
            Partido *{cargando === 'partidos' && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <select
            aria-label="Partido"
            className={claseSelect}
            disabled={bloqueado || !sel.provincia || partidos.length === 0}
            value={sel.partido?.id ?? ''}
            onChange={e => {
              const p = partidos.find(x => x.id === e.target.value)
              if (p) elegirPartidoCon(p)
              else setSel(s => ({ provincia: s.provincia }))
            }}
          >
            <option value="">{sel.provincia ? 'Elegí un partido…' : 'Elegí primero la provincia'}</option>
            {partidos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium flex items-center gap-1.5">
            Localidad *{cargando === 'localidades' && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <select
            aria-label="Localidad"
            className={claseSelect}
            disabled={bloqueado || !sel.partido || localidades.length === 0}
            value={sel.localidad?.id ?? ''}
            onChange={e => {
              const l = localidades.find(x => x.id === e.target.value)
              if (l) elegirLocalidadCon(l)
              else setSel(s => ({ provincia: s.provincia, partido: s.partido }))
            }}
          >
            <option value="">{sel.partido ? 'Elegí una localidad…' : 'Elegí primero el partido'}</option>
            {localidades.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium flex items-center gap-1.5">
            Barrio{enCapital ? ' *' : ''}{cargando === 'barrios' && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <select
            aria-label="Barrio"
            className={claseSelect}
            disabled={bloqueado || !sel.localidad || barrios.length === 0}
            value={sel.barrio?.id ?? ''}
            onChange={e => {
              tocado.current = true
              const b = barrios.find(x => x.id === e.target.value) ?? null
              setSel(s => ({ ...s, barrio: b }))
            }}
          >
            <option value="">
              {!sel.localidad ? 'Elegí primero la localidad'
                : barrios.length === 0 ? 'Esta localidad no tiene barrios'
                : enCapital ? 'Elegí un barrio…' : 'Sin barrio (opcional)'}
            </option>
            {barrios.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </label>
      </div>

      {enCapital && !sel.barrio && (
        <p className="text-xs text-muted-foreground">
          En Capital el barrio es obligatorio: Argenprop no acepta el aviso sin él.
        </p>
      )}
      {error && <p className="text-sm text-[color:var(--destructive)]">{error}</p>}
    </div>
  )
}
