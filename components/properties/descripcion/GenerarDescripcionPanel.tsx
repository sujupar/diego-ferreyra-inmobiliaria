'use client'

/**
 * Panel "Generar descripción" con el método de Diego: mirar las fotos →
 * investigar la zona → [preguntar lo que falta] → escribir → vista previa.
 *
 * Cada paso es UN pedido al servidor (regla dura: una llamada de IA por pedido,
 * Netlify corta antes de los 60 s). Si uno falla, "Reintentar" repite solo ese.
 * Nada se guarda en la ficha hasta tocar "Guardar": lo que se guarda es lo que
 * la persona leyó y, si quiso, retocó.
 *
 * Las preguntas aparecen SOLO si no se contestaron en la visita ni en la landing
 * (pedido del dueño, 2026-09-19): lo que se conteste acá queda en la ficha y no
 * se vuelve a preguntar en ningún lado.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { EstadoDescripcion, ResultadoEscritura } from '@/lib/descripcion/servicio'
import type { InventarioFotos, TextoGenerado, ZonaInvestigada } from '@/lib/descripcion/tipos'
import { debePedirCorreccion, etiquetaFuente, respuestasParaEnviar, siguientePaso, type PasoPanel } from '@/lib/descripcion/flujo-panel'
import { lineasATexto } from '@/lib/descripcion/zona-mapa'

type Etapa = 'fotos' | 'zona' | 'escribir'
type EstadoPaso = 'pendiente' | 'en_curso' | 'listo' | 'error'

const PORTALES: Record<string, string> = { mercadolibre: 'MercadoLibre', argenprop: 'Argenprop', zonaprop: 'ZonaProp' }

/**
 * Lee la respuesta como JSON tolerando que NO lo sea: si la función de Netlify
 * se pasa de tiempo, el gateway devuelve una página HTML y `res.json()`
 * explotaría con "Unexpected token '<'" (mismo helper que LandingSection).
 */
async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó este paso. Tocá "Reintentar".' } as T & { error?: string }
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Tocá "Reintentar".` } as T & { error?: string }
  }
}

/**
 * Esperas de los reintentos automáticos ante un corte momentáneo (5xx o red):
 * el dueño pidió que funcione "1.000 de 1.000 veces", y un 504 aislado de
 * Netlify o de OpenAI no puede terminar en un error en pantalla. Los errores de
 * datos (4xx: falta algo, sin permiso) NO se reintentan: repetirlos da lo mismo.
 */
const ESPERAS_REINTENTO_MS = [2_000, 5_000]

const dormir = (ms: number) => new Promise(resolver => setTimeout(resolver, ms))

/**
 * Espera antes de reintentar, y corta si la corrida ya no está vigente (se
 * cerró el panel o se tocó "Analizar todo de nuevo"): cada pedido es trabajo
 * pago que nadie va a ver, y escribiría `descripcion_ia` en paralelo con la
 * corrida nueva.
 */
async function esperarSiSigue(ms: number, vigente: () => boolean): Promise<void> {
  await dormir(ms)
  if (!vigente()) throw new Error('corrida cancelada')
}

async function pedir<T>(url: string, body: unknown, esperas: number[] = ESPERAS_REINTENTO_MS, vigente: () => boolean = () => true): Promise<T> {
  for (let intento = 0; ; intento++) {
    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      if (intento < esperas.length) { await esperarSiSigue(esperas[intento], vigente); continue }
      throw new Error('No hay conexión con el servidor. Tocá "Reintentar".')
    }
    const json = await leerJson<T>(res)
    if (res.ok) return json
    if (res.status >= 500 && intento < esperas.length) { await esperarSiSigue(esperas[intento], vigente); continue }
    throw new Error(json.error || 'No se pudo completar el paso.')
  }
}

function contarPalabras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length
}

export function GenerarDescripcionPanel({
  propertyId,
  estado,
  abierto,
  onCerrar,
  onGuardado,
  esperasReintentoMs = ESPERAS_REINTENTO_MS,
}: {
  propertyId: string
  estado: EstadoDescripcion
  abierto: boolean
  onCerrar: () => void
  onGuardado: (t: TextoGenerado) => void
  /** Solo para tests: esperas de los reintentos automáticos. */
  esperasReintentoMs?: number[]
}) {
  const url = `/api/properties/${propertyId}/descripcion`
  const [paso, setPaso] = useState<PasoPanel>('fotos')
  const [pasos, setPasos] = useState<Record<Etapa, EstadoPaso>>({ fotos: 'pendiente', zona: 'pendiente', escribir: 'pendiente' })
  const [reusado, setReusado] = useState<Record<Etapa, boolean>>({ fotos: false, zona: false, escribir: false })
  // 'guardar' aparte: "Reintentar" tiene que volver a GUARDAR lo editado, no
  // reescribir (eso pagaba otra escritura y pisaba las ediciones del asesor).
  const [error, setError] = useState<{ etapa: Etapa | 'guardar'; mensaje: string } | null>(null)
  const [avisosZona, setAvisosZona] = useState<string[]>([])
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState(estado.notas ?? '')
  const [comprador, setComprador] = useState('')
  const [sugerencia, setSugerencia] = useState('')
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [texto, setTexto] = useState<TextoGenerado>({ title: '', subtitle: '', body: '' })
  const [reescribiendo, setReescribiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const corrida = useRef(0)

  const marcar = (etapa: Etapa, e: EstadoPaso) => setPasos(prev => ({ ...prev, [etapa]: e }))

  const escribir = useCallback(async (o: { primeraVez: boolean; compradorElegido?: string }) => {
    const mia = corrida.current
    setPaso('escribir'); setError(null); marcar('escribir', 'en_curso')
    try {
      const base = {
        etapa: 'escribir' as const,
        notas,
        ...(o.primeraVez ? { respuestas: respuestasParaEnviar(estado.pendientes, respuestas) } : {}),
        ...(o.compradorElegido?.trim() ? { comprador: o.compradorElegido.trim() } : {}),
      }
      const vigente = () => mia === corrida.current
      let r = await pedir<ResultadoEscritura>(url, base, esperasReintentoMs, vigente)
      if (debePedirCorreccion(r.problemas, false) && vigente()) {
        r = await pedir<ResultadoEscritura>(url, { ...base, respuestas: undefined, corregir: r.problemas }, esperasReintentoMs, vigente)
      }
      if (mia !== corrida.current) return
      setResultado(r)
      setTexto(r.texto)
      setComprador(r.usado.comprador ?? '')
      marcar('escribir', 'listo')
      setReescribiendo(false)
      setPaso(siguientePaso('escribir', { pendientes: 0 }))
    } catch (e) {
      if (mia !== corrida.current) return
      marcar('escribir', 'error')
      setError({ etapa: 'escribir', mensaje: e instanceof Error ? e.message : 'Error' })
    }
  }, [estado.pendientes, notas, respuestas, url, esperasReintentoMs])

  const correrZona = useCallback(async (forzar: boolean) => {
    const mia = corrida.current
    setPaso('zona'); setError(null); marcar('zona', 'en_curso')
    try {
      const r = await pedir<{ reusada: boolean; zona: ZonaInvestigada; avisos: string[] }>(url, { etapa: 'zona', forzar }, esperasReintentoMs, () => mia === corrida.current)
      if (mia !== corrida.current) return
      setReusado(prev => ({ ...prev, zona: r.reusada }))
      setAvisosZona(r.avisos)
      marcar('zona', 'listo')
      const siguiente = siguientePaso('zona', { pendientes: estado.pendientes.length })
      if (siguiente === 'preguntas') setPaso('preguntas')
      else await escribir({ primeraVez: true })
    } catch (e) {
      if (mia !== corrida.current) return
      marcar('zona', 'error')
      setError({ etapa: 'zona', mensaje: e instanceof Error ? e.message : 'Error' })
    }
  }, [escribir, estado.pendientes.length, url, esperasReintentoMs])

  const correrFotos = useCallback(async (forzar: boolean) => {
    const mia = corrida.current
    setPaso('fotos'); setError(null); marcar('fotos', 'en_curso')
    try {
      const r = await pedir<{ reusada: boolean; inventario: InventarioFotos; cantidad: number }>(url, { etapa: 'fotos', forzar }, esperasReintentoMs, () => mia === corrida.current)
      if (mia !== corrida.current) return
      setReusado(prev => ({ ...prev, fotos: r.reusada }))
      // La sugerencia de comprador NO se precarga en el campo: lo que queda como
      // respuesta en la ficha tiene que haberlo escrito una persona (si no, la
      // landing tampoco lo preguntaría y la "respuesta del asesor" sería de la IA).
      // Si el campo queda vacío, el servidor igual escribe para esta sugerencia.
      setSugerencia(r.inventario.compradorSugerido.perfil ?? '')
      marcar('fotos', 'listo')
      await correrZona(forzar)
    } catch (e) {
      if (mia !== corrida.current) return
      marcar('fotos', 'error')
      setError({ etapa: 'fotos', mensaje: e instanceof Error ? e.message : 'Error' })
    }
  }, [correrZona, url, esperasReintentoMs])

  const empezar = useCallback((forzar: boolean) => {
    corrida.current += 1
    setPasos({ fotos: 'pendiente', zona: 'pendiente', escribir: 'pendiente' })
    setResultado(null); setError(null); setAvisosZona([])
    void correrFotos(forzar)
  }, [correrFotos])

  // Arranca al abrir. El contador `corrida` descarta respuestas de una corrida
  // anterior (cerrar y volver a abrir, o "Analizar todo de nuevo").
  const arrancado = useRef(false)
  useEffect(() => {
    if (abierto && !arrancado.current) {
      arrancado.current = true
      empezar(false)
    }
    if (!abierto) {
      arrancado.current = false
      corrida.current += 1
    }
  }, [abierto, empezar])

  function reintentar() {
    if (!error) return
    if (error.etapa === 'guardar') void guardar()
    else if (error.etapa === 'fotos') void correrFotos(false)
    else if (error.etapa === 'zona') void correrZona(false)
    else void escribir({ primeraVez: !resultado, compradorElegido: comprador })
  }

  async function guardar() {
    setGuardando(true); setError(null)
    try {
      await pedir<{ ok: true }>(`${url}/guardar`, texto, esperasReintentoMs)
      onGuardado(texto)
      onCerrar()
    } catch (e) {
      setError({ etapa: 'guardar', mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  const trabajando = Object.values(pasos).includes('en_curso')
  const portales = estado.portalesPublicados.map(p => PORTALES[p] ?? p)

  const cantidad = Math.min(estado.cantidadFotos, 30)
  const filas: Array<{ etapa: Etapa; pendiente: string; enCurso: string; listo: string }> = [
    { etapa: 'fotos', pendiente: `Mirar las ${cantidad} fotos`, enCurso: `Mirando las ${cantidad} fotos…`, listo: reusado.fotos ? 'Fotos ya analizadas (sin cambios desde la última vez)' : 'Fotos analizadas' },
    { etapa: 'zona', pendiente: 'Investigar la zona', enCurso: 'Investigando la zona…', listo: reusado.zona ? 'Zona ya investigada (misma dirección)' : 'Zona investigada' },
    { etapa: 'escribir', pendiente: 'Escribir con el método de Diego', enCurso: 'Escribiendo con el método de Diego…', listo: 'Descripción escrita' },
  ]

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !guardando) onCerrar() }}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Descripción con el método de Diego</DialogTitle>
          <DialogDescription>
            Mira las fotos, investiga la zona y escribe con las reglas y los ejemplos de Diego. Nada se guarda hasta que toques Guardar.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2" aria-label="Pasos">
          {filas.map(f => {
            const e = pasos[f.etapa]
            return (
              <li key={f.etapa} className="flex items-center gap-2 text-sm">
                {e === 'en_curso' && <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden />}
                {e === 'listo' && <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
                {e === 'error' && <X className="h-4 w-4 text-red-600" aria-hidden />}
                {e === 'pendiente' && <span className="h-4 w-4 rounded-full border" aria-hidden />}
                <span className={e === 'pendiente' ? 'text-muted-foreground' : ''}>
                  {e === 'listo' ? f.listo : e === 'pendiente' ? f.pendiente : f.enCurso}
                </span>
              </li>
            )
          })}
        </ol>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1 min-w-0">{error.mensaje}</span>
            <Button size="sm" variant="outline" onClick={reintentar}><RotateCcw className="h-4 w-4 mr-1" />Reintentar</Button>
          </div>
        )}

        {avisosZona.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
            {avisosZona.map(a => <p key={a}>{a}</p>)}
          </div>
        )}

        {paso === 'preguntas' && (
          <div className="space-y-4 rounded-xl border p-4">
            <div>
              <p className="font-medium text-sm">Antes de escribir, contame lo que no está en ningún lado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todo es opcional. Lo que contestes queda guardado en la ficha: no se vuelve a preguntar ni acá ni al crear la landing.
              </p>
            </div>
            {estado.pendientes.map(p => (
              <div key={p.id} className="space-y-1.5">
                <label htmlFor={`preg-${p.id}`} className="text-sm font-medium">{p.pregunta}</label>
                <Textarea
                  id={`preg-${p.id}`}
                  rows={2}
                  value={respuestas[p.id] ?? ''}
                  onChange={e => setRespuestas(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={p.ayuda}
                />
                {p.tema === 'comprador' && sugerencia && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Sugerencia del análisis de las fotos: «{sugerencia}». Si lo dejás vacío, se escribe para ese comprador.</span>
                    {!(respuestas[p.id] ?? '').trim() && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setRespuestas(prev => ({ ...prev, [p.id]: sugerencia }))}>
                        Usar la sugerencia
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="space-y-1.5">
              <label htmlFor="notas-descripcion" className="text-sm font-medium">Lo que no se ve en las fotos</label>
              <Textarea
                id="notas-descripcion"
                rows={3}
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Orientación, expensas, estado de las instalaciones, apto crédito, medidas de los ambientes…"
              />
            </div>
            <Button onClick={() => void escribir({ primeraVez: true })} disabled={trabajando} className="w-full">
              <Sparkles className="h-4 w-4 mr-1" />Escribir la descripción
            </Button>
          </div>
        )}

        {paso === 'vista' && resultado && (
          <div className="space-y-4">
            {[...resultado.avisos, ...resultado.problemas.map(p => `Revisá el texto: ${p}.`)].length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
                {resultado.avisos.map(a => <p key={a} className="font-medium">{a}</p>)}
                {resultado.problemas.map(p => <p key={p}>Revisá el texto: {p}.</p>)}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="desc-titulo" className="text-sm font-medium">Titular</label>
              <Input id="desc-titulo" value={texto.title} onChange={e => setTexto(t => ({ ...t, title: e.target.value }))} />
              <p className={`text-xs ${contarPalabras(texto.title) > 10 ? 'text-red-600' : 'text-muted-foreground'}`}>{contarPalabras(texto.title)}/10 palabras</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="desc-subtitulo" className="text-sm font-medium">Subtitular</label>
              <Textarea id="desc-subtitulo" rows={3} value={texto.subtitle} onChange={e => setTexto(t => ({ ...t, subtitle: e.target.value }))} />
              <p className={`text-xs ${contarPalabras(texto.subtitle) > 50 ? 'text-red-600' : 'text-muted-foreground'}`}>{contarPalabras(texto.subtitle)}/50 palabras</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="desc-cuerpo" className="text-sm font-medium">Cuerpo</label>
              <Textarea id="desc-cuerpo" rows={16} value={texto.body} onChange={e => setTexto(t => ({ ...t, body: e.target.value }))} />
            </div>

            <details className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Qué tuvo en cuenta</summary>
              <div className="mt-3 space-y-3 text-muted-foreground">
                <p><span className="font-medium text-foreground">Comprador ideal:</span> {resultado.usado.comprador || 'no definido'}</p>
                {resultado.usado.respuestas.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Respuestas usadas</p>
                    <ul className="list-disc pl-5">
                      {resultado.usado.respuestas.map(r => (
                        <li key={`${r.fuente}-${r.pregunta}`}>{r.pregunta} → {r.respuesta} <span className="text-xs">({etiquetaFuente(r.fuente)})</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {resultado.usado.inventario && (
                  <div>
                    <p className="font-medium text-foreground">Lo que vio en las fotos</p>
                    <ul className="list-disc pl-5">
                      {resultado.usado.inventario.ambientes.map(a => <li key={a.nombre}>{a.nombre}: {a.detalle}</li>)}
                      {resultado.usado.inventario.exteriores.map(e => (
                        <li key={e.espacio}>{e.espacio} ({e.uso === 'propio' ? 'propio' : e.uso === 'comun' ? 'común' : 'no se sabe de quién es'}): {e.detalle}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {resultado.usado.zona?.mapa && (
                  <div>
                    <p className="font-medium text-foreground">Zona (del mapa)</p>
                    <pre className="whitespace-pre-wrap font-sans">{lineasATexto(resultado.usado.zona.mapa.lugares)}</pre>
                    {(resultado.usado.zona.mapa.colectivos ?? []).length > 0 && (
                      <p>Colectivos a menos de 4 cuadras: {(resultado.usado.zona.mapa.colectivos ?? []).join(', ')}</p>
                    )}
                  </div>
                )}
                {resultado.usado.zona?.web && (
                  <div>
                    <p className="font-medium text-foreground">Zona (de la web)</p>
                    <p className="whitespace-pre-wrap">{resultado.usado.zona.web}</p>
                  </div>
                )}
                {resultado.usado.notas && <p><span className="font-medium text-foreground">Tus notas:</span> {resultado.usado.notas}</p>}
              </div>
            </details>

            {reescribiendo && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="space-y-1.5">
                  <label htmlFor="desc-comprador" className="text-sm font-medium">Comprador ideal para esta versión</label>
                  <Input id="desc-comprador" value={comprador} onChange={e => setComprador(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="desc-notas" className="text-sm font-medium">Lo que no se ve en las fotos</label>
                  <Textarea id="desc-notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder="Orientación, expensas, estado de las instalaciones, apto crédito, medidas de los ambientes…" />
                </div>
                <Button onClick={() => void escribir({ primeraVez: false, compradorElegido: comprador })} disabled={trabajando} className="w-full">
                  <Sparkles className="h-4 w-4 mr-1" />Escribir de nuevo (no se vuelven a analizar fotos ni zona)
                </Button>
              </div>
            )}

            {portales.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Esta propiedad está publicada en {portales.join(' y ')}: al guardar, la descripción se actualiza también ahí.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void guardar()} disabled={guardando || trabajando || !texto.title.trim() || !texto.body.trim()} className="flex-1 min-w-40">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}Guardar
              </Button>
              {!reescribiendo && (
                <Button variant="outline" onClick={() => setReescribiendo(true)} disabled={trabajando}>Volver a escribir</Button>
              )}
              <Button variant="ghost" onClick={() => empezar(true)} disabled={trabajando || guardando}>Analizar todo de nuevo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
