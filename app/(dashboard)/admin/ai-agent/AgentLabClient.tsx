'use client'
/**
 * Banco de pruebas del agente de IA.
 *
 * Escribís lo que diría un cliente y ves qué contestaría, SIN mandar un
 * WhatsApp. Es la herramienta que corta el ciclo de "probá / no funcionó /
 * esperá el deploy": acá se ve la respuesta, los archivos que mandaría, si
 * agendaría la visita, y el prompt exacto con el que decide.
 */
import { useEffect, useState } from 'react'
import { Loader2, Play, Plus, Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Turno {
  from: 'cliente' | 'nosotros'
  text: string
}

interface Resultado {
  respuesta: string | null
  archivos: Array<{ tipo: string; link: string }>
  visita: { fecha?: string; hora?: number; rechazada?: string; propuestaPorElModelo?: string } | null
  analisis: { resumen: string; intencion: string; prioridad: number; motivo: string; proximoPaso: string }
  material: { fotos: boolean; plano: boolean; video: boolean }
  loQueSabe: {
    propiedad: string
    datos: string[]
    materialDisponible: { fotos: boolean; plano: boolean; video: boolean }
    materialYaEntregado: string[]
    suMensajeAnterior: string | null
    resumenPrevio: string
    hoy: string
  }
  prompts: { sistema: string; contexto: string }
  tokens: number
  modelo: string
}

export function AgentLabClient({ propiedades }: { propiedades: Array<{ id: string; label: string }> }) {
  const [propertyId, setPropertyId] = useState(propiedades[0]?.id ?? '')
  const [nombre, setNombre] = useState('Julián')
  const [turnos, setTurnos] = useState<Turno[]>([{ from: 'cliente', text: '¿cómo es la casa?' }])
  const [resumen, setResumen] = useState('')
  const [yaHayVisita, setYaHayVisita] = useState(false)
  // Qué material ya recibió esta persona. Es la variable que causó el peor bug
  // del agente y hasta ahora no se podía simular.
  const [yaMandado, setYaMandado] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)
  const [verPrompt, setVerPrompt] = useState(false)

  useEffect(() => {
    if (!propertyId && propiedades[0]) setPropertyId(propiedades[0].id)
  }, [propiedades, propertyId])

  async function correr() {
    setCargando(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/ai-agent/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId, mensajes: turnos, resumenPrevio: resumen, clientName: nombre, yaHayVisita, yaMandado }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'No se pudo simular')
      setRes(data as Resultado)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setRes(null)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Probar el agente</h1>
        <p className="mt-1 text-muted-foreground">
          Escribí lo que diría un cliente y mirá qué contestaría. No se manda ningún WhatsApp ni se
          agenda ninguna visita: es una prueba en seco.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ---- Guion ---- */}
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Propiedad</span>
              <select
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {propiedades.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Nombre del cliente</span>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">La conversación</span>
            {turnos.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <select
                  value={t.from}
                  onChange={e => setTurnos(ts => ts.map((x, j) => (j === i ? { ...x, from: e.target.value as Turno['from'] } : x)))}
                  className="rounded-md border bg-background px-2 py-2 text-xs"
                >
                  <option value="cliente">Cliente</option>
                  <option value="nosotros">Agente</option>
                </select>
                <Textarea
                  rows={2}
                  value={t.text}
                  onChange={e => setTurnos(ts => ts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className="flex-1"
                />
                {turnos.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTurnos(ts => ts.filter((_, j) => j !== i))}
                    aria-label={`Quitar el mensaje ${i + 1} de la simulación`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setTurnos(ts => [...ts, { from: 'cliente', text: '' }])}>
              <Plus className="mr-1 h-4 w-4" /> Agregar mensaje
            </Button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Resumen previo (lo que el agente ya sabía de conversaciones anteriores)
            </span>
            <Textarea rows={2} value={resumen} onChange={e => setResumen(e.target.value)} placeholder="Opcional" />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Material que esta persona ya recibió</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {(['fotos', 'plano', 'video'] as const).map(tipo => (
                <label key={tipo} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={yaMandado.includes(tipo)}
                    onChange={e =>
                      setYaMandado(prev => (e.target.checked ? [...prev, tipo] : prev.filter(t => t !== tipo)))
                    }
                  />
                  {tipo}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Marcá acá lo que ya salió antes de este mensaje — por ejemplo el plano que viaja en la
              plantilla de una consulta de portal.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={yaHayVisita} onChange={e => setYaHayVisita(e.target.checked)} />
            Esta persona ya tiene una visita coordinada
          </label>

          <Button onClick={correr} disabled={cargando || !propertyId} className="w-full">
            {cargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            Ver qué contestaría
          </Button>
        </section>

        {/* ---- Resultado ---- */}
        <section className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {res && (
            <>
              <div className="rounded-lg border bg-card p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Le contestaría</p>
                {res.respuesta ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
                    {res.respuesta}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nada. Decidió que este mensaje no necesita respuesta.
                  </p>
                )}

                {res.archivos.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Y le mandaría {res.archivos.length} archivo{res.archivos.length === 1 ? '' : 's'}
                    </p>
                    <ul className="space-y-1 text-xs">
                      {res.archivos.map((a, i) => (
                        <li key={i} className="truncate">
                          <span className="rounded bg-muted px-1.5 py-0.5">{a.tipo}</span>{' '}
                          <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                            {a.link.split('/').pop()}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {res.visita && (
                  <div className="mt-3 rounded-lg border p-3 text-sm">
                    {res.visita.fecha ? (
                      <>
                        <span className="font-medium">Agendaría la visita</span> para el {res.visita.fecha} a las {res.visita.hora}.
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-amber-700">No la agenda:</span> {res.visita.rechazada}.
                        {' '}El modelo había propuesto {res.visita.propuestaPorElModelo}.
                      </>
                    )}
                  </div>
                )}
              </div>

              {/*
                La mitad que faltaba. Viendo solo la respuesta no se puede
                distinguir "el modelo entendió mal" de "le pasamos un dato
                falso", y las tres fallas del 6 de agosto de 2026 fueron lo
                segundo: la memoria decía que ya había mandado fotos y video de
                otra propiedad.
              */}
              <div className="rounded-lg border bg-card p-4 text-sm">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Con qué información decidió</p>
                <dl className="space-y-1.5">
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Propiedad</dt>
                    <dd>{res.loQueSabe.propiedad}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Material disponible</dt>
                    <dd>
                      {[
                        res.loQueSabe.materialDisponible.fotos && 'fotos',
                        res.loQueSabe.materialDisponible.plano && 'plano',
                        res.loQueSabe.materialDisponible.video && 'video',
                      ].filter(Boolean).join(', ') || 'ninguno cargado'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Cree que ya mandó</dt>
                    <dd>{res.loQueSabe.materialYaEntregado.join(', ') || 'nada todavía'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Su mensaje anterior</dt>
                    <dd className={res.loQueSabe.suMensajeAnterior ? '' : 'text-muted-foreground'}>
                      {res.loQueSabe.suMensajeAnterior ?? 'ninguno — arranca sin saber qué dijo antes'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Memoria previa</dt>
                    <dd className={res.loQueSabe.resumenPrevio ? '' : 'text-muted-foreground'}>
                      {res.loQueSabe.resumenPrevio || 'vacía'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">Datos de la ficha</dt>
                    <dd className="text-xs text-muted-foreground">{res.loQueSabe.datos.join(' · ')}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border bg-card p-4 text-sm">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Lo que anota para el equipo</p>
                <p><span className="text-muted-foreground">Resumen:</span> {res.analisis.resumen}</p>
                <p className="mt-1"><span className="text-muted-foreground">Intención:</span> {res.analisis.intencion} · prioridad {res.analisis.prioridad}</p>
                <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {res.analisis.motivo}</p>
                <p className="mt-1"><span className="text-muted-foreground">Próximo paso:</span> {res.analisis.proximoPaso}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Material de esta propiedad: {[
                    res.material.fotos && 'fotos',
                    res.material.plano && 'plano',
                    res.material.video && 'video',
                  ].filter(Boolean).join(', ') || 'ninguno cargado'} · {res.tokens} tokens · {res.modelo}
                </p>
              </div>

              <div className="rounded-lg border bg-card">
                <button
                  onClick={() => setVerPrompt(v => !v)}
                  className="flex w-full items-center justify-between p-4 text-sm font-medium"
                >
                  Ver las instrucciones que recibe
                  <ChevronDown className={`h-4 w-4 transition ${verPrompt ? 'rotate-180' : ''}`} />
                </button>
                {verPrompt && (
                  <div className="space-y-3 border-t p-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Instrucciones fijas</p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-[11px] leading-relaxed">
                        {res.prompts.sistema}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Contexto de esta conversación</p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-[11px] leading-relaxed">
                        {res.prompts.contexto}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
