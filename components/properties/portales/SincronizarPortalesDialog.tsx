'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PortalSincronizable } from '@/lib/portals/diferencias-con-ficha'
import {
  NOMBRE_PORTAL, esAccionable, filasAMostrar, interpretarRespuesta, leerCuerpo, lineaDiferencia,
  parsearFilas, textoAccion, type FilaPortal,
} from './sincronizar-estado'

type EstadoFila =
  | { t: 'idle' }
  | { t: 'enviando' }
  | { t: 'listo'; externalUrl: string | null }
  | { t: 'error'; mensaje: string }
  | { t: 'planB'; mensaje: string; confirmando: boolean }

interface Props {
  propertyId: string
  abierto: boolean
  /** Se llama al cerrar el cuadro (con o sin cambios): la ficha recarga. */
  onCerrar: () => void
}

/**
 * "¿Actualizamos los avisos?": muestra qué avisos publicados quedaron distintos a
 * la ficha y los actualiza a pedido. Si al abrir no hay nada distinto, se cierra
 * solo sin mostrarse (así el asesor no ve un cuadro vacío después de guardar).
 */
export function SincronizarPortalesDialog({ propertyId, abierto, onCerrar }: Props) {
  // Se monta solo mientras está abierto: cada apertura arranca con el estado limpio.
  return abierto ? <Cuadro propertyId={propertyId} onCerrar={onCerrar} /> : null
}

function Cuadro({ propertyId, onCerrar }: Omit<Props, 'abierto'>) {
  const [filas, setFilas] = useState<FilaPortal[] | null>(null)
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const [estados, setEstados] = useState<Partial<Record<PortalSincronizable, EstadoFila>>>({})
  const [corriendo, setCorriendo] = useState(false)
  const [terminado, setTerminado] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // onCerrar suele ser una función nueva en cada render: por ref, para que no dispare recargas.
  const onCerrarRef = useRef(onCerrar)
  useEffect(() => { onCerrarRef.current = onCerrar })

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/properties/${propertyId}/portales/diferencias`)
      const cuerpo = leerCuerpo(r.status, await r.text())
      if (!r.ok) { onCerrarRef.current(); return }
      const visibles = filasAMostrar(parsearFilas(cuerpo))
      if (visibles.length === 0) { onCerrarRef.current(); return }
      setFilas(visibles)
      setMarcadas(Object.fromEntries(visibles.filter(esAccionable).map(f => [f.portal, true])))
    } catch {
      setErrorCarga('No se pudo revisar los avisos. Revisá la conexión.')
    }
  }, [propertyId])

  // Carga al montar (lectura de red); el setState ocurre después del await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])

  function poner(portal: PortalSincronizable, e: EstadoFila) {
    setEstados(s => ({ ...s, [portal]: e }))
  }

  async function mandar(portal: PortalSincronizable, planB: boolean) {
    poner(portal, { t: 'enviando' })
    try {
      const r = await fetch(`/api/properties/${propertyId}/portales/sincronizar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(planB ? { portal, planB: true } : { portal }),
      })
      const res = interpretarRespuesta(r.status, leerCuerpo(r.status, await r.text()))
      if (res.tipo === 'ok') poner(portal, { t: 'listo', externalUrl: res.externalUrl })
      else if (res.tipo === 'planB') poner(portal, { t: 'planB', mensaje: res.mensaje, confirmando: false })
      else poner(portal, { t: 'error', mensaje: res.mensaje })
    } catch {
      poner(portal, { t: 'error', mensaje: 'No se pudo conectar. Revisá la conexión y probá de nuevo.' })
    }
  }

  async function actualizar() {
    if (!filas) return
    setCorriendo(true)
    // En serie: cada request tiene que quedar corto (límite de tiempo de Netlify).
    for (const f of filas) {
      if (esAccionable(f) && marcadas[f.portal]) await mandar(f.portal, false)
    }
    setCorriendo(false)
    setTerminado(true)
  }

  async function planB(portal: PortalSincronizable) {
    setCorriendo(true)
    await mandar(portal, true)
    setCorriendo(false)
  }

  const hayMarcadas = (filas ?? []).some(f => esAccionable(f) && marcadas[f.portal])
  const cerrar = () => { if (!corriendo) onCerrar() }

  return (
    <Dialog open={filas !== null || errorCarga !== null} onOpenChange={o => { if (!o) cerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Actualizamos los avisos?</DialogTitle>
          <DialogDescription>
            Estos avisos publicados quedaron distintos a la ficha.
          </DialogDescription>
        </DialogHeader>

        {errorCarga && <p className="text-sm text-[color:var(--destructive)]">{errorCarga}</p>}

        <ul className="space-y-3">
          {(filas ?? []).map(f => {
            const est: EstadoFila = estados[f.portal] ?? { t: 'idle' }
            return (
              <li key={f.portal} className="rounded-lg border p-3 space-y-2">
                {f.tipo === 'error' ? (
                  <>
                    <p className="text-sm font-medium opacity-60">{NOMBRE_PORTAL[f.portal]}</p>
                    <p className="text-sm text-muted-foreground">No pudimos revisar este aviso: {f.error}</p>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!marcadas[f.portal]}
                        disabled={corriendo || est.t === 'listo'}
                        onChange={e => setMarcadas(m => ({ ...m, [f.portal]: e.target.checked }))}
                      />
                      {NOMBRE_PORTAL[f.portal]}
                    </label>
                    <ul className="text-sm space-y-0.5">
                      {f.diferencias.map(d => <li key={d.campo}>{lineaDiferencia(d)}</li>)}
                    </ul>
                    <p className="text-xs text-muted-foreground">{textoAccion(f)}</p>
                  </>
                )}

                {est.t === 'enviando' && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Actualizando…
                  </p>
                )}
                {est.t === 'listo' && (
                  <p className="text-sm text-emerald-700">
                    ✅ Listo
                    {est.externalUrl && (
                      <> · <a href={est.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">Ver aviso</a></>
                    )}
                  </p>
                )}
                {est.t === 'error' && <p className="text-sm text-[color:var(--destructive)]">❌ {est.mensaje}</p>}
                {est.t === 'planB' && (
                  <div className="space-y-2">
                    <p className="text-sm text-[color:var(--destructive)]">❌ {est.mensaje}</p>
                    {!est.confirmando ? (
                      <Button size="sm" variant="outline" disabled={corriendo}
                        onClick={() => poner(f.portal, { ...est, confirmando: true })}>
                        Publicar uno nuevo y cerrar el actual
                      </Button>
                    ) : (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-2">
                        <p className="text-sm text-amber-900">El aviso nuevo empieza sin visitas ni preguntas.</p>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={corriendo} onClick={() => void planB(f.portal)}>
                            Sí, publicar uno nuevo
                          </Button>
                          <Button size="sm" variant="outline" disabled={corriendo}
                            onClick={() => poner(f.portal, { ...est, confirmando: false })}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end bg-background pt-2">
          <Button variant="outline" className="h-11 sm:h-9" disabled={corriendo} onClick={cerrar}>
            {terminado ? 'Cerrar' : 'Ahora no'}
          </Button>
          {!terminado && (
            <Button className="h-11 sm:h-9" disabled={corriendo || !hayMarcadas} onClick={() => void actualizar()}>
              {corriendo ? 'Actualizando…' : 'Actualizar avisos'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
