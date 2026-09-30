'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, ExternalLink, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttrField, type CampoAtributo } from './AttrField'
import { aplicarCambios, diferencias, type Valores } from '@/lib/portals/edicion-comun'
import { resumenDeCambios } from './editar-aviso-estado'

type Portal = 'mercadolibre' | 'argenprop'
interface Aviso {
  titulo: string; descripcion: string; descripcionFicha: string | null; tituloMax: number
  valores: Valores; sugeridos: Valores; required: CampoAtributo[]; recommended: CampoAtributo[]
  externalUrl: string | null; permiteVaciar: boolean; otroPortal: string | null
}
const NOMBRE: Record<Portal, string> = { mercadolibre: 'MercadoLibre', argenprop: 'Argenprop' }
const RUTA: Record<Portal, string> = { mercadolibre: 'ml-aviso', argenprop: 'ap-aviso' }

/** Lee el body sin romperse si el servidor devolvió una página de error HTML (504 de Netlify). */
async function leerJson(r: Response): Promise<Record<string, unknown>> {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { error: r.status === 504 ? 'El portal tardó demasiado. Probá de nuevo.' : `Error ${r.status}` } }
}

export function EditarAvisoPanel({ propertyId, portal, onCerrar }: { propertyId: string; portal: Portal; onCerrar: () => void }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [valores, setValores] = useState<Valores>({})
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState<{ expensasEnFicha: boolean } | null>(null)

  const cargar = useCallback(async () => {
    setError(null); setAviso(null); setListo(null)
    const r = await fetch(`/api/properties/${propertyId}/${RUTA[portal]}`)
    const j = await leerJson(r)
    if (!r.ok) { setError(String(j.error ?? 'No se pudo traer el aviso.')); return }
    const a = j as unknown as Aviso
    setAviso(a); setTitulo(a.titulo); setDescripcion(a.descripcion)
    setValores(aplicarCambios(a.valores, a.sugeridos)) // lo sugerido arranca completado y cuenta como cambio
  }, [propertyId, portal])
  useEffect(() => { void cargar() }, [cargar])

  const cambiosValores = useMemo(() => (aviso ? diferencias(aviso.valores, valores) : {}), [aviso, valores])
  const cambioTitulo = aviso && titulo.trim() !== aviso.titulo.trim()
  const cambioDescripcion = aviso && descripcion !== aviso.descripcion
  const total = Object.keys(cambiosValores).length + (cambioTitulo ? 1 : 0) + (cambioDescripcion ? 1 : 0)
  const campos = aviso ? [...aviso.required, ...aviso.recommended] : []

  async function guardar() {
    if (!aviso) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/properties/${propertyId}/${RUTA[portal]}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cambios: {
          ...(cambioTitulo ? { titulo: titulo.trim() } : {}),
          ...(cambioDescripcion ? { descripcion } : {}),
          valores: cambiosValores,
        } }),
      })
      const j = await leerJson(r)
      if (!r.ok) { setError(String(j.error ?? 'El portal rechazó el cambio.')); setConfirmando(false); return }
      setListo({ expensasEnFicha: j.expensasEnFicha === true })
    } finally { setEnviando(false) }
  }

  if (error && !aviso) return (
    <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p>{error}</p>
      <div className="flex gap-2"><Button size="sm" onClick={() => void cargar()}>Reintentar</Button><Button size="sm" variant="ghost" onClick={onCerrar}>Volver</Button></div>
    </div>
  )
  if (!aviso) return <p className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Trayendo el aviso de {NOMBRE[portal]}…</p>
  if (listo) return (
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
      <p className="font-medium text-emerald-800">Listo, el aviso se actualizó.</p>
      {listo.expensasEnFicha && aviso.otroPortal && <p>También quedaron en la ficha y se van a mandar a {aviso.otroPortal} en unos minutos.</p>}
      {aviso.externalUrl && <a href={aviso.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-[color:var(--brand)]">Ver en {NOMBRE[portal]}<ExternalLink className="h-3 w-3" /></a>}
      <div><Button size="sm" variant="ghost" onClick={onCerrar}>Volver</Button></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onCerrar}><ArrowLeft className="h-4 w-4 mr-1" />Volver</Button>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Título y descripción (como están hoy en {NOMBRE[portal]})</p>
        <input value={titulo} maxLength={aviso.tituloMax} onChange={e => setTitulo(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm max-md:min-h-11" />
        <textarea value={descripcion} maxLength={5000} rows={8} onChange={e => setDescripcion(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        {aviso.descripcionFicha && aviso.descripcionFicha !== descripcion && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDescripcion(aviso.descripcionFicha ?? '')}>Usar la descripción de la ficha</Button>
        )}
      </section>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Datos del aviso</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {campos.map(a => {
            const sugerido = !!aviso.sugeridos[a.id] && !!cambiosValores[a.id]
            const tieneEnPortal = !!aviso.valores[a.id]
            return (
              <label key={a.id} className="space-y-1">
                <span className="text-sm">{a.name}{sugerido && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">Se va a agregar</span>}</span>
                <AttrField attr={a} value={valores[a.id]} onSet={v => {
                  if (!v && tieneEnPortal && !aviso.permiteVaciar) return // ML no deja vaciar (sonda T1)
                  setValores(prev => { const n = { ...prev }; if (v) n[a.id] = v; else delete n[a.id]; return n })
                }} />
              </label>
            )
          })}
        </div>
      </section>
      {error && <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {confirmando ? (
        <div className="space-y-3 rounded-lg border p-4 text-sm">
          <p className="font-medium">Vas a cambiar en {NOMBRE[portal]}:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {cambioTitulo && <li>Título</li>}
            {cambioDescripcion && <li>Descripción</li>}
            {resumenDeCambios(cambiosValores, campos, aviso.valores).map(l => <li key={l}>{l}</li>)}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => void guardar()} disabled={enviando}>{enviando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Enviando…</> : 'Confirmar y enviar'}</Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>Volver a editar</Button>
          </div>
        </div>
      ) : (
        <div className="max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:border-t max-md:bg-background max-md:px-4 max-md:pt-3 max-md:pb-safe">
          <Button className="w-full" disabled={total === 0} onClick={() => setConfirmando(true)}>Guardar cambios ({total})</Button>
        </div>
      )}
    </div>
  )
}
