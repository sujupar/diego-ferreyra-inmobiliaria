'use client'

/**
 * "¿Están en Google Drive? Pegá el enlace": lista los videos de la carpeta (o el
 * archivo suelto) y deja elegir cuáles traer. Lo que no se puede traer aparece
 * deshabilitado con el motivo, para que nadie se pregunte por qué falta.
 */
import { useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { ArchivoDrive } from '@/lib/publicaciones/drive/archivos'
import { megas } from './formato'
import { api } from './leer-json'

interface Listado {
  nombre: string | null
  archivos: ArchivoDrive[]
  subcarpetas: number
}

export interface ElegidoDrive {
  id: string
  resourceKey: string | null
}

interface Props {
  deshabilitado: boolean
  /** `true` si se dieron de alta: recién ahí se limpia la lista (si falla, lo elegido queda). */
  onTraer: (archivos: ElegidoDrive[]) => Promise<boolean>
}

export function ElegirDeDrive({ deshabilitado, onTraer }: Props) {
  const [enlace, setEnlace] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [trayendo, setTrayendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listado, setListado] = useState<Listado | null>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())

  const buscar = async () => {
    if (!enlace.trim()) return
    setBuscando(true)
    setError(null)
    setListado(null)
    try {
      const r = await api<Listado>('/api/publicaciones/drive/listar', { method: 'POST', body: { enlace } })
      setListado(r)
      setElegidos(new Set(r.archivos.filter((a) => a.apto).map((a) => a.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el enlace')
    } finally {
      setBuscando(false)
    }
  }

  const traer = async () => {
    if (!listado || elegidos.size === 0) return
    setTrayendo(true)
    try {
      const elegidosDrive = listado.archivos
        .filter((a) => a.apto && elegidos.has(a.id))
        .map((a) => ({ id: a.id, resourceKey: a.resourceKey ?? null }))
      if (await onTraer(elegidosDrive)) {
        setListado(null)
        setEnlace('')
      }
    } finally {
      setTrayendo(false)
    }
  }

  const alternar = (id: string, si: boolean) =>
    setElegidos((prev) => {
      const n = new Set(prev)
      if (si) n.add(id)
      else n.delete(id)
      return n
    })

  const aptos = listado?.archivos.filter((a) => a.apto) ?? []

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <label htmlFor="enlace-drive" className="text-sm font-medium">
        ¿Están en Google Drive? Pegá el enlace de la carpeta o del video
      </label>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar()
        }}
      >
        <Input
          id="enlace-drive"
          inputMode="url"
          placeholder="https://drive.google.com/drive/folders/…"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          disabled={buscando || trayendo || deshabilitado}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" disabled={!enlace.trim() || buscando || trayendo || deshabilitado}>
          {buscando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden />}
          Buscar videos
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        La carpeta tiene que estar compartida como &quot;Cualquier persona con el enlace&quot;.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {listado && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {listado.nombre ? `Carpeta «${listado.nombre}»: ` : ''}
            {listado.archivos.length === 0
              ? 'no encontré videos.'
              : `${listado.archivos.length} ${listado.archivos.length === 1 ? 'archivo' : 'archivos'}, ${aptos.length} se ${aptos.length === 1 ? 'puede' : 'pueden'} traer.`}
            {listado.subcarpetas > 0 && ` No reviso las subcarpetas (${listado.subcarpetas}): pegá el enlace de cada una.`}
          </p>
          {listado.archivos.length > 0 && (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
              {listado.archivos.map((a) => (
                <li key={a.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                  <Checkbox
                    id={`drive-${a.id}`}
                    checked={a.apto && elegidos.has(a.id)}
                    disabled={!a.apto || trayendo}
                    onCheckedChange={(v) => alternar(a.id, v === true)}
                  />
                  <label htmlFor={`drive-${a.id}`} className={`min-w-0 flex-1 truncate ${a.apto ? '' : 'text-muted-foreground'}`} title={a.nombre}>
                    {a.nombre}
                  </label>
                  <span className="shrink-0 text-xs text-muted-foreground">{a.apto ? megas(a.tamano) : a.motivo}</span>
                </li>
              ))}
            </ul>
          )}
          {aptos.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={() => void traer()} disabled={elegidos.size === 0 || trayendo || deshabilitado}>
                {trayendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                Traer {elegidos.size} {elegidos.size === 1 ? 'video' : 'videos'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
