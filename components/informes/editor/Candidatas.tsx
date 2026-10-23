'use client'
import { ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Candidata } from '@/lib/informes/competencia/puntaje'
import type { BusquedaPortal } from '@/lib/informes/tipos'

const miles = new Intl.NumberFormat('es-AR')
const NOMBRE = { argenprop: 'Argenprop', mercadolibre: 'MercadoLibre' } as const

function estadoDeLaBusqueda(portal: 'argenprop' | 'mercadolibre', b: BusquedaPortal | undefined): string {
  if (!b) return `${NOMBRE[portal]}: todavía no se buscó`
  if (b.estado === 'ok') return `${NOMBRE[portal]}: ${b.avisos.length} avisos revisados`
  if (b.estado === 'sin_busqueda') return `${NOMBRE[portal]}: ${b.error ?? 'no se puede buscar'}`
  return `${NOMBRE[portal]}: no se pudo buscar (${b.error ?? 'error'})`
}

/**
 * Las propiedades que la plataforma encontró en Argenprop y MercadoLibre, ordenadas por parecido, con el porqué y
 * "Ver en el portal" para mirarlas antes de elegirlas. Elegir = pasa a las competidoras del informe.
 */
export function Candidatas({ candidatas, argenprop, mercadolibre, progreso, elegidas, lleno, deshabilitado, onElegir, onBuscarDeNuevo }: {
  candidatas: Candidata[]
  argenprop: BusquedaPortal | undefined
  mercadolibre: BusquedaPortal | undefined
  /** "Buscando en Argenprop…", "Revisando avisos (2/6)…"; null = quieto. */
  progreso: string | null
  elegidas: string[]
  lleno: boolean
  deshabilitado: boolean
  onElegir: (c: Candidata) => void
  onBuscarDeNuevo: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Encontradas por la plataforma</p>
        {progreso ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {progreso}</span>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={deshabilitado} onClick={onBuscarDeNuevo}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden /> Buscar de nuevo
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{estadoDeLaBusqueda('argenprop', argenprop)} · {estadoDeLaBusqueda('mercadolibre', mercadolibre)}. Zonaprop no permite buscar: si querés una de ahí, pegá su link abajo.</p>
      {!candidatas.length && !progreso ? <p className="text-sm text-muted-foreground">No hay candidatas todavía.</p> : null}
      <ul className="space-y-2">
        {candidatas.map(c => {
          const elegida = elegidas.includes(c.url)
          const valorM2 = c.precio && c.m2 ? Math.round(c.precio / c.m2) : null
          return (
            <li key={c.url} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto del portal, dominio externo */}
                {c.foto ? <img src={c.foto} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-medium">{c.direccion || c.titulo}</p>
                <p className="text-muted-foreground">
                  {[c.precio ? `${c.moneda ?? 'USD'} ${miles.format(c.precio)}` : 'sin precio', c.m2 ? `${c.m2} m²` : null,
                    valorM2 ? `${c.moneda ?? 'USD'} ${miles.format(valorM2)}/m²` : null, c.ambientes ? `${c.ambientes} amb.` : null,
                    c.disposicion, c.estado, c.antiguedad !== null ? `${c.antiguedad} años` : null].filter(Boolean).join(' · ')}
                </p>
                {c.porque.length ? <p className="text-xs text-emerald-800">Parecida: {c.porque.join(', ')}</p> : null}
                <p className="text-xs text-muted-foreground">{NOMBRE[c.portal]}{c.inmobiliaria ? ` · ${c.inmobiliaria}` : ''}{c.vistas ? ` · ${miles.format(c.vistas)} vistas` : ''}</p>
              </div>
              <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <a href={c.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" aria-hidden /> Ver en el portal</a>
                </Button>
                <Button type="button" size="sm" className="min-h-11" disabled={deshabilitado || elegida || lleno} onClick={() => onElegir(c)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden /> {elegida ? 'Agregada' : 'Agregar al informe'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
