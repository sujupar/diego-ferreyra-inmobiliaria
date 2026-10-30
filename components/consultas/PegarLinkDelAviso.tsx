'use client'

/**
 * La salida SECUNDARIA para elegir la propiedad de un aviso: pegar su link.
 * Lo principal es elegirla de la lista (dueño, 2026-10-30): todas las
 * propiedades están cargadas en la plataforma. El link sirve solo si el aviso se
 * publicó DESDE la plataforma (`GET /api/portal-inquiries/resolve-link` lo busca
 * por `properties.import_external_id`); si no, se dice y se vuelve a la lista.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PropiedadParaAgendar } from './BuscadorDePropiedades'

function propiedadDe(cuerpo: unknown): PropiedadParaAgendar | null {
  if (!cuerpo || typeof cuerpo !== 'object' || !('property' in cuerpo)) return null
  const p = cuerpo.property
  if (!p || typeof p !== 'object' || !('id' in p) || typeof p.id !== 'string') return null
  const address = 'address' in p && typeof p.address === 'string' ? p.address : 'Propiedad'
  const asesor = 'assignedTo' in p && typeof p.assignedTo === 'string' ? p.assignedTo : null
  return { id: p.id, address, neighborhood: null, foto: null, assigned_to: asesor }
}

export function PegarLinkDelAviso({ onEncontrada }: { onEncontrada: (p: PropiedadParaAgendar) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [link, setLink] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function buscar() {
    const texto = link.trim()
    if (!texto || buscando) return
    setBuscando(true)
    setAviso(null)
    try {
      const res = await fetch(`/api/portal-inquiries/resolve-link?url=${encodeURIComponent(texto)}`)
      let cuerpo: unknown = null
      try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
      if (res.status === 400) { setAviso('Ese link no es de un aviso de ZonaProp, Argenprop o MercadoLibre.'); return }
      if (!res.ok) { setAviso('No pudimos revisar el link. Probá de nuevo.'); return }
      const propiedad = propiedadDe(cuerpo)
      if (!propiedad) {
        setAviso('Ese aviso no se publicó desde la plataforma: buscá la propiedad en la lista de arriba.')
        return
      }
      onEncontrada(propiedad)
      setAviso(`Es ${propiedad.address}.`)
    } catch {
      setAviso('No hay conexión. Probá de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="min-h-11 self-start text-sm text-muted-foreground underline underline-offset-2">
        ¿No la encontrás? Pegá el link del aviso
      </button>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border p-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Link del aviso
        <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar() } }}
          placeholder="https://www.zonaprop.com.ar/propiedades/…"
          className="h-12 w-full min-w-0 rounded-lg border bg-card px-3 text-base font-normal" />
      </label>
      <Button type="button" variant="outline" className="min-h-11" onClick={buscar} disabled={!link.trim() || buscando}>
        {buscando ? 'Buscando…' : 'Buscar la propiedad'}
      </Button>
      {aviso && <p role="status" className="text-sm">{aviso}</p>}
    </div>
  )
}
