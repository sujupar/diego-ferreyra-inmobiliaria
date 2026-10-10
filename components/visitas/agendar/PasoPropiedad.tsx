'use client'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { EstadoAgendar, AccionAgendar, PropiedadElegida } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

interface PropiedadApi { id: string; address: string; neighborhood: string | null; foto: string | null; assigned_to: string | null }

export function PasoPropiedad({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<PropiedadApi[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    const t = setTimeout(async () => {
      try {
        const r = await leerRespuesta<PropiedadApi[]>(await fetch(`/api/visits/propiedades?q=${encodeURIComponent(texto)}`))
        if (!vigente) return
        if (r.ok) { setLista(r.data); setError(null) } else setError(r.error)
      } catch {
        if (vigente) setError('No hay conexión. Probá de nuevo.')
      } finally {
        if (vigente) setCargando(false)
      }
    }, 300)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  const elegir = (p: PropiedadApi) => {
    const propiedad: PropiedadElegida = { id: p.id, address: p.address, neighborhood: p.neighborhood, foto: p.foto, asesorId: p.assigned_to }
    despachar({ tipo: 'elegirPropiedad', propiedad })
  }

  return (
    <div className="space-y-4">
      <h2 tabIndex={-1} className="text-xl font-semibold outline-none">¿Qué propiedad van a visitar?</h2>
      <label className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Buscar por dirección o barrio</span>
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por dirección o barrio"
          className="flex-1 bg-transparent text-base outline-none" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {cargando && !error && <p className="text-sm text-muted-foreground">Buscando…</p>}
      <ul className="space-y-2">
        {lista.map(p => (
          <li key={p.id}>
            <button type="button" aria-pressed={estado.propiedad?.id === p.id} onClick={() => elegir(p)}
              className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left',
                estado.propiedad?.id === p.id ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
              {p.foto
                ? <img src={p.foto} alt="" className="h-12 w-16 rounded-md object-cover" />
                : <span className="h-12 w-16 rounded-md bg-secondary" aria-hidden="true" />}
              <span className="flex flex-col">
                <span className="font-semibold">{p.address}</span>
                <span className="text-xs text-muted-foreground">{p.neighborhood ?? ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!cargando && lista.length === 0 && !error && <p className="text-sm text-muted-foreground">No hay propiedades captadas disponibles con ese texto.</p>}
    </div>
  )
}
