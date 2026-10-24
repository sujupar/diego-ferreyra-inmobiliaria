'use client'
import { useState } from 'react'
import { Link2, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { valorDelM2 } from '@/lib/informes/resumen'
import { sanearCambios, TOPES_COMPETIDORA } from '@/lib/informes/sanear'
import type { Competidora } from '@/lib/informes/tipos'
import { buscarCompetidora } from './api'
import { Candidatas } from './Candidatas'
import { competidoraDesdeCandidata } from '@/lib/informes/editor'
import type { Candidata } from '@/lib/informes/competencia/puntaje'
import type { BusquedaPortal } from '@/lib/informes/tipos'
import { CampoLinea, CampoNumero, type AvisarPendiente } from './campos'

export const MAX_COMPETIDORAS = 8

const vacia = (url: string): Competidora => ({
  url, direccion: '', barrio: null, precio: null, moneda: 'USD', m2: null, valorM2: null, ambientes: null, banos: null,
  dormitorios: null, antiguedad: null, cocheras: null, foto: null, publicadoHace: null, visualizaciones: null, bajoDePrecio: false,
})

function esHttps(v: string): boolean {
  if (v.length > TOPES_COMPETIDORA.link) return false
  try { return new URL(v).protocol === 'https:' } catch { return false }
}

/**
 * Propiedades que compiten: Paula pega el link y la plataforma completa los datos con el scraper
 * de las tasaciones (criterio 4); lo que el portal no muestra queda para completar. Se guarda la
 * lista ENTERA en cada cambio, y solo cuando todas tienen dirección (el servidor la exige: es el
 * título de la tarjeta en el PDF).
 */
export interface BusquedaDeCompetencia {
  candidatas: Candidata[]
  argenprop: BusquedaPortal | undefined
  mercadolibre: BusquedaPortal | undefined
  progreso: string | null
  onBuscarDeNuevo: () => void
}

export function Competidoras({ iniciales, onGuardar, deshabilitado, busqueda, onPendiente }: {
  iniciales: Competidora[]
  onGuardar: (lista: Competidora[]) => Promise<void>
  deshabilitado: boolean
  /** Avisa lo escrito sin mandar (para el aviso del navegador y el envío al cerrar la pestaña). */
  onPendiente?: AvisarPendiente
  /** Las candidatas que buscó la plataforma (Argenprop + MercadoLibre). */
  busqueda?: BusquedaDeCompetencia
}) {
  const [lista, setLista] = useState<Competidora[]>(iniciales)
  const [link, setLink] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkFallido, setLinkFallido] = useState<string | null>(null)

  const sinDireccion = lista.some(c => !c.direccion.trim())

  async function cambiar(nueva: Competidora[]) {
    setLista(nueva)
    setError(null)
    if (nueva.some(c => !c.direccion.trim())) return
    // Misma regla que el servidor ANTES de mandar: una competidora inválida no puede trabar el
    // guardado de toda la lista (el servidor recibe la lista entera en cada cambio).
    const validado = sanearCambios({ competidoras: nueva })
    if (!validado.ok) { setError(`No se guardó: ${validado.error}. Revisá los datos de la última propiedad que cambiaste.`); return }
    await onGuardar(nueva)
  }

  async function traer() {
    const url = link.trim()
    setError(null)
    setLinkFallido(null)
    if (!esHttps(url)) { setError('Pegá el link completo del aviso (empieza con https://)'); return }
    if (lista.some(c => c.url === url)) { setError('Esa propiedad ya está en la lista'); return }
    setBuscando(true)
    try {
      const c = await buscarCompetidora(url)
      setLink('')
      await cambiar([...lista, c])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos leer ese aviso')
      setLinkFallido(url)
    } finally {
      setBuscando(false)
    }
  }

  function actualizar(i: number, cambios: Partial<Competidora>) {
    const nueva = lista.map((c, j) => {
      if (j !== i) return c
      const sig = { ...c, ...cambios }
      // Si cambia el precio o los m², se vuelve a proponer el valor del m² (Paula lo puede corregir después).
      if ('precio' in cambios || 'm2' in cambios) sig.valorM2 = valorDelM2(sig.precio, sig.m2)
      return sig
    })
    void cambiar(nueva)
  }

  return (
    <div className="space-y-4">
      {busqueda ? (
        <Candidatas {...busqueda} elegidas={lista.map(c => c.url)} lleno={lista.length >= MAX_COMPETIDORAS} deshabilitado={deshabilitado}
          onElegir={c => void cambiar([...lista, competidoraDesdeCandidata(c)])} />
      ) : null}
      {lista.length ? <p className="text-sm font-medium">Elegidas para el informe ({lista.length} de {MAX_COMPETIDORAS})</p> : null}
      {lista.map((c, i) => (
        <FichaCompetidora key={c.url} indice={i} c={c} deshabilitado={deshabilitado} onPendiente={onPendiente}
          onCambiar={cambios => actualizar(i, cambios)}
          onQuitar={() => void cambiar(lista.filter((_, j) => j !== i))} />
      ))}
      {sinDireccion ? <p role="alert" className="text-sm text-orange-700">Completá la dirección de cada propiedad para que se guarde.</p> : null}

      {lista.length < MAX_COMPETIDORAS ? (
        <div className="space-y-2">
          <Label htmlFor="competidora-link">¿Falta alguna? Pegá el link de una propiedad que compite</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="competidora-link" value={link} placeholder="https://www.zonaprop.com.ar/propiedades/…" disabled={deshabilitado || buscando}
              className="h-11" onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void traer() }} />
            <Button type="button" className="min-h-11" disabled={deshabilitado || buscando || !link.trim()} onClick={() => void traer()}>
              {buscando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="mr-1 h-4 w-4" aria-hidden />}
              {buscando ? 'Leyendo el aviso…' : 'Traer datos'}
            </Button>
          </div>
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>{error}</span>
              {linkFallido ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => { setLista([...lista, vacia(linkFallido)]); setLink(''); setError(null); setLinkFallido(null) }}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden /> Cargarla a mano
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">Ya hay {MAX_COMPETIDORAS} propiedades: es el máximo del informe.</p>}
    </div>
  )
}

type CampoNumerico = 'precio' | 'm2' | 'valorM2' | 'ambientes' | 'dormitorios' | 'banos' | 'cocheras' | 'antiguedad' | 'visualizaciones'

function FichaCompetidora({ indice, c, onCambiar, onQuitar, deshabilitado, onPendiente }: {
  indice: number
  onPendiente?: AvisarPendiente
  c: Competidora
  onCambiar: (cambios: Partial<Competidora>) => void
  onQuitar: () => void
  deshabilitado: boolean
}) {
  const id = (campo: string) => `competidora-${indice}-${campo}`
  const numero = (campo: CampoNumerico, etiqueta: string, sufijo?: string) => {
    const v = c[campo]
    // La key incluye el valor: si cambia desde afuera (el valor del m² se recalcula al tocar el
    // precio), el campo se vuelve a montar con el número nuevo en vez de mostrar el viejo.
    return (
      <CampoNumero key={`${campo}-${v ?? ''}`} id={id(campo)} etiqueta={etiqueta} sufijo={sufijo} deshabilitado={deshabilitado}
        valor={v} onGuardar={n => onCambiar({ [campo]: n ?? null })} onPendiente={onPendiente} />
    )
  }
  return (
    <article className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-48">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto del portal, dominio externo variable */}
          {c.foto ? <img src={c.foto} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoLinea id={id('direccion')} etiqueta="Dirección" valor={c.direccion} deshabilitado={deshabilitado} onGuardar={t => onCambiar({ direccion: t })} onPendiente={onPendiente} />
          <CampoLinea id={id('barrio')} etiqueta="Barrio" valor={c.barrio} deshabilitado={deshabilitado} onGuardar={t => onCambiar({ barrio: t || null })} onPendiente={onPendiente} />
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-primary underline sm:col-span-2">{c.url}</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numero('precio', 'Precio')}
        <div className="space-y-1">
          <Label htmlFor={id('moneda')}>Moneda</Label>
          <select id={id('moneda')} className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={c.moneda ?? 'USD'} disabled={deshabilitado}
            onChange={e => onCambiar({ moneda: e.target.value === 'ARS' ? 'ARS' : 'USD' })}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
        {numero('m2', 'Superficie', 'm²')}
        {numero('valorM2', 'Valor del m²')}
        {numero('ambientes', 'Ambientes')}
        {numero('dormitorios', 'Dormitorios')}
        {numero('banos', 'Baños')}
        {numero('cocheras', 'Cocheras')}
        {numero('antiguedad', 'Antigüedad', 'años')}
        {numero('visualizaciones', 'Visualizaciones')}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoLinea id={id('publicado')} etiqueta="Publicado hace" valor={c.publicadoHace} placeholder="Publicado hace 84 días" deshabilitado={deshabilitado}
          onGuardar={t => onCambiar({ publicadoHace: t || null })} onPendiente={onPendiente} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm">
          <input type="checkbox" className="h-4 w-4" checked={c.bajoDePrecio} disabled={deshabilitado} onChange={e => onCambiar({ bajoDePrecio: e.target.checked })} />
          Bajó de precio
        </label>
      </div>
      <Button type="button" variant="ghost" className="min-h-11" disabled={deshabilitado} onClick={onQuitar}>
        <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Quitar esta propiedad
      </Button>
    </article>
  )
}
