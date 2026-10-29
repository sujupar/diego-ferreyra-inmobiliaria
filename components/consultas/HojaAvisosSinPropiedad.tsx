'use client'

/**
 * Hoja "Avisos sin propiedad" (spec Entrega 2 §3.2): una tarjeta por aviso con
 * cuántas consultas tiene; tocar "Conectar", elegir la propiedad (con
 * sugeridas) y un toque más conecta TODAS sus consultas. Las que lleguen
 * después por ese aviso entran solas.
 *
 * Los números son de TODAS las consultas sin propiedad de cada aviso, no solo
 * las del período: tienen que coincidir con lo que se va a conectar.
 * Solo para operaciones (la ruta devuelve 403 al resto).
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { enlaceSeguro, etiquetaPortal } from '@/lib/consultas/pantalla'
import type { AvisoSinPropiedad } from '@/lib/consultas/avisos'
import { formatearFechaHora } from '@/lib/visitas/horario'
import { HojaArmazon } from './HojaArmazon'
import { BuscadorDePropiedades, type PropiedadParaAgendar } from './BuscadorDePropiedades'
import { AVISO_SIN_ASESOR } from './HojaElegirPropiedad'

type Lista = { avisos: AvisoSinPropiedad[]; sueltas: number }

/** Respuestas sin envolver en `{ data }`; tolerante a la página HTML de un 504. */
async function leerJson(res: Response): Promise<{ ok: true; cuerpo: Record<string, unknown> } | { ok: false; error: string }> {
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
  const objeto = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null
  if (res.ok && objeto) return { ok: true, cuerpo: objeto }
  if (objeto && typeof objeto.error === 'string') return { ok: false, error: objeto.error }
  if (res.status === 504) return { ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' }
  return { ok: false, error: 'Algo falló. Probá de nuevo.' }
}

function esLista(v: Record<string, unknown>): v is Lista {
  return Array.isArray(v.avisos) && typeof v.sueltas === 'number'
}

export function TarjetaAviso({ aviso, onConectar }: { aviso: AvisoSinPropiedad; onConectar: () => void }) {
  const enlace = enlaceSeguro(aviso.url)
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold text-muted-foreground">{etiquetaPortal(aviso.portal)} · código {aviso.codigo}</span>
        <span className="break-words font-semibold">{aviso.titulo ?? 'Aviso sin título'}</span>
        <span className="text-sm text-muted-foreground">
          {aviso.n === 1 ? '1 consulta' : `${aviso.n} consultas`} · la última {formatearFechaHora(aviso.ultima)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 flex-1 bg-brand text-brand-foreground hover:bg-brand/90" onClick={onConectar}>
          Conectar
        </Button>
        {enlace && (
          <Button asChild variant="outline" className="min-h-11">
            <a href={enlace} target="_blank" rel="noopener noreferrer">
              Ver aviso <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}

export function HojaAvisosSinPropiedad({ onConectado, onCerrar }: {
  /** Después de conectar un aviso: la bandeja vuelve a pedir el período. */
  onConectado: () => void
  onCerrar: () => void
}) {
  const [lista, setLista] = useState<Lista | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<AvisoSinPropiedad | null>(null)
  const [elegida, setElegida] = useState<PropiedadParaAgendar | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setErrorLista(null)
    fetch('/api/consultas/avisos')
      .then(leerJson)
      .then((r) => {
        if (!vigente) return
        if (!r.ok) setErrorLista(r.error)
        else if (esLista(r.cuerpo)) setLista(r.cuerpo)
        else setErrorLista('Respuesta inesperada del servidor. Probá de nuevo.')
      })
      .catch(() => { if (vigente) setErrorLista('No hay conexión. Probá de nuevo.') })
    return () => { vigente = false }
  }, [recarga])

  const textosDelAviso = useMemo(() => [aviso?.titulo ?? null], [aviso])

  function elegirAviso(a: AvisoSinPropiedad | null) {
    setAviso(a)
    setElegida(null)
    setError(null)
  }

  async function conectar() {
    if (!aviso || !elegida || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await leerJson(await fetch('/api/consultas/avisos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portal: aviso.portal, codigo: aviso.codigo, propertyId: elegida.id }),
      }))
      if (!r.ok) { setError(r.error); return }
      const n = typeof r.cuerpo.actualizadas === 'number' ? r.cuerpo.actualizadas : aviso.n
      toast.success(n === 1 ? `Se conectó 1 consulta con ${elegida.address}` : `Se conectaron ${n} consultas con ${elegida.address}`)
      if (r.cuerpo.recordado !== true) toast.warning(AVISO_SIN_ASESOR)
      const conectado = aviso
      setLista((l) => l && { ...l, avisos: l.avisos.filter((a) => !(a.portal === conectado.portal && a.codigo === conectado.codigo)) })
      elegirAviso(null)
      onConectado()
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (aviso) {
    const n = aviso.n === 1 ? 'la consulta' : `las ${aviso.n} consultas`
    return (
      <HojaArmazon
        titulo="¿Qué propiedad es este aviso?"
        descripcion={`${etiquetaPortal(aviso.portal)} · código ${aviso.codigo}${aviso.titulo ? ` · «${aviso.titulo}»` : ''}`}
        onCerrar={onCerrar}
        pie={(
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => elegirAviso(null)} aria-label="Volver a los avisos">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" onClick={conectar} disabled={!elegida || enviando}
              className="min-h-12 flex-1 bg-brand text-base text-brand-foreground hover:bg-brand/90">
              {enviando ? 'Conectando…' : aviso.n === 1 ? 'Conectar 1 consulta' : `Conectar ${aviso.n} consultas`}
            </Button>
          </div>
        )}
      >
        <BuscadorDePropiedades textosDelAviso={textosDelAviso} elegida={elegida} onElegir={setElegida} />
        {elegida && (
          <p className="rounded-xl border border-brand/40 bg-brand-soft/30 p-3 text-sm" role="status">
            Se van a conectar <strong>{n}</strong> de este aviso a <strong>{elegida.address}</strong>
            {elegida.assigned_to ? ', y las que lleguen después entran solas.' : '. La propiedad no tiene asesor: las próximas consultas de este aviso no se van a conectar solas.'}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </HojaArmazon>
    )
  }

  return (
    <HojaArmazon
      titulo="Avisos sin propiedad"
      descripcion="Conectá cada aviso con su propiedad: se conectan todas sus consultas de una vez y las próximas entran solas."
      onCerrar={onCerrar}
      pie={<Button type="button" variant="outline" className="min-h-12 w-full text-base" onClick={onCerrar}>Listo</Button>}
    >
      {errorLista && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-3 text-sm">
          <span>{errorLista}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setRecarga((n) => n + 1)}>Reintentar</Button>
        </div>
      )}
      {!lista && !errorLista && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
      )}
      {lista && lista.avisos.length === 0 && (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">No quedan avisos sin propiedad. 🎉</p>
      )}
      {lista && lista.avisos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.avisos.map((a) => (
            <TarjetaAviso key={`${a.portal}\u0000${a.codigo}`} aviso={a} onConectar={() => elegirAviso(a)} />
          ))}
        </ul>
      )}
      {lista && lista.sueltas > 0 && (
        <p className="text-xs text-muted-foreground">
          {lista.sueltas === 1 ? 'Hay 1 consulta' : `Hay ${lista.sueltas} consultas`} sin el código del aviso: esas se conectan de a una,
          desde «Agendar visita» en cada consulta.
        </p>
      )}
    </HojaArmazon>
  )
}
