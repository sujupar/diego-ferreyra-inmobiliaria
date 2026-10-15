'use client'
/**
 * "Regalo de la encuesta" en la pestaña Visitas de la ficha (adenda §11.2): el PDF que recibe quien
 * completa la encuesta de ESTA propiedad. Sin permiso (403) no se muestra: la barrera es la ruta.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gift, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { subirRegalo, quitarRegalo } from '@/lib/visitas/encuesta/subir-regalo'
import { validarArchivoRegalo, validarPortada, type RegaloVista } from '@/lib/visitas/encuesta/regalo'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin_permiso' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; regalo: RegaloVista | null }

function megas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`
}

export function RegaloDeLaEncuesta({ propertyId }: { propertyId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [portada, setPortada] = useState<File | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    try {
      const r = await leerRespuesta<RegaloVista | null>(await fetch(`/api/properties/${propertyId}/regalo`))
      if (!r.ok) {
        setEstado(r.status === 403 || r.status === 401 ? { tipo: 'sin_permiso' } : { tipo: 'error', mensaje: r.error })
        return
      }
      setEstado({ tipo: 'listo', regalo: r.data })
    } catch {
      setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' })
    }
  }, [propertyId])

  useEffect(() => {
    // Dispara la primera lectura; el estado inicial ya es 'cargando'.
    void cargar()
  }, [cargar])

  function elegirArchivo(f: File | null) {
    setError(f ? validarArchivoRegalo({ nombre: f.name, bytes: f.size }) : null)
    setArchivo(f && !validarArchivoRegalo({ nombre: f.name, bytes: f.size }) ? f : null)
  }
  function elegirPortada(f: File | null) {
    setError(f ? validarPortada({ nombre: f.name, bytes: f.size }) : null)
    setPortada(f && !validarPortada({ nombre: f.name, bytes: f.size }) ? f : null)
  }

  async function subir() {
    if (!archivo) return
    setError(null); setAvance(0)
    try {
      const regalo = await subirRegalo(propertyId, { titulo, archivo, portada }, setAvance)
      setEstado({ tipo: 'listo', regalo }); setEditando(false); setArchivo(null); setPortada(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir el regalo')
    } finally {
      setAvance(null)
    }
  }

  async function quitar() {
    setError(null)
    try {
      await quitarRegalo(propertyId)
      setConfirmarQuitar(false); setTitulo('')
      setEstado({ tipo: 'listo', regalo: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos quitar el regalo')
    }
  }

  if (estado.tipo === 'sin_permiso') return null

  const regalo = estado.tipo === 'listo' ? estado.regalo : null
  const mostrarFormulario = estado.tipo === 'listo' && (!regalo || editando)
  const subiendo = avance !== null

  return (
    <section aria-labelledby="regalo-encuesta" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-brand" aria-hidden="true" />
        <h3 id="regalo-encuesta" className="text-base font-semibold">Regalo de la encuesta</h3>
      </div>

      {estado.tipo === 'cargando' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void cargar()}>Reintentar</Button>
        </div>
      )}

      {regalo && !editando && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {regalo.portadaUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado, de vida corta
            <img src={regalo.portadaUrl} alt="" className="h-20 w-16 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-medium">{regalo.titulo}</p>
            <p className="break-all text-sm text-muted-foreground">{regalo.archivoNombre} · {megas(regalo.archivoBytes)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {regalo.descargaUrl && (
              <a href={regalo.descargaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm">Ver PDF</a>
            )}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => { setEditando(true); setTitulo(regalo.titulo) }}>Reemplazar</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmarQuitar(true)}>Quitar</Button>
          </div>
        </div>
      )}

      {confirmarQuitar && (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm">
          <p>¿Quitar el regalo? La encuesta de esta propiedad deja de ofrecerlo y, con &quot;solo propiedades con regalo&quot;, deja de mandarse.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void quitar()}>Sí, quitar el regalo</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmarQuitar(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {mostrarFormulario && (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void subir() }}>
          {!regalo && (
            <p className="text-sm text-muted-foreground">
              Es el material (PDF de hasta 20 MB) que recibe quien responde la encuesta de esta propiedad. Sin regalo, la encuesta se ofrece igual pero no sale sola por WhatsApp.
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="regalo-titulo">Título</Label>
            <Input id="regalo-titulo" className="min-h-11 text-base" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Ej.: Guía del barrio de Caballito" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regalo-archivo">Archivo PDF</Label>
            <Input id="regalo-archivo" type="file" accept="application/pdf,.pdf" className="min-h-11" onChange={e => elegirArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regalo-portada">Portada (opcional, JPG/PNG/WEBP)</Label>
            <Input id="regalo-portada" type="file" accept="image/jpeg,image/png,image/webp" className="min-h-11" onChange={e => elegirPortada(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Sin portada, la encuesta muestra la primera foto de la propiedad.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="min-h-11 bg-brand text-brand-foreground hover:bg-brand/90" disabled={subiendo || !archivo || titulo.trim().length < 3}>
              {subiendo ? `Subiendo… ${avance} %` : 'Subir regalo'}
            </Button>
            {regalo && <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditando(false)} disabled={subiendo}>Cancelar</Button>}
          </div>
          <p role="status" aria-live="polite" className="sr-only">{subiendo ? `Subiendo, ${avance} por ciento` : ''}</p>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
