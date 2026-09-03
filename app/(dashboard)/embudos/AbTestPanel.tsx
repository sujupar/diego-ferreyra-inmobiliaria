'use client'

import { useEffect, useState, useCallback } from 'react'

type Status = 'off' | 'running' | 'paused'
type Variant = 'A' | 'B'

interface Config {
  status: Status
  splitB: number
  winner: Variant | null
  labelA: string
  labelB: string
}
interface Result {
  variante: Variant
  visitas: number
  conversiones: number
  tasa: number
}

/**
 * Panel de A/B testing de landings, dentro del embudo.
 *
 * Tres acciones y son distintas a propósito:
 *  · Activar  — empieza a repartir según la barra.
 *  · Pausar   — frena el test SIN decidir: todos vuelven a la actual y el
 *               reparto queda guardado para retomarlo.
 *  · Terminar — pide con cuál versión te quedás y la deja fija.
 *
 * Sin "Pausar", frenar obligaría a declarar un ganador que a lo mejor todavía no
 * existe. Es la diferencia entre parar el experimento y darlo por concluido.
 */
export function AbTestPanel({ funnel, from, to }: { funnel: string; from: string; to: string }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [split, setSplit] = useState(50)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/funnels/ab?funnel=${funnel}&from=${from}&to=${to}`)
      if (!r.ok) return
      const d = (await r.json()) as { config: Config; results: Result[] }
      setConfig(d.config)
      setResults(d.results ?? [])
      setSplit(d.config.splitB)
      setDirty(false)
    } catch {
      /* la pantalla del embudo no se rompe por el panel del experimento */
    }
  }, [funnel, from, to])

  useEffect(() => { void load() }, [load])

  async function save(patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/funnels/ab', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ funnel, ...patch }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string; config?: Config }
      if (!r.ok || d.error) {
        setError(d.error ?? 'No se pudo guardar.')
        return
      }
      if (d.config) {
        setConfig(d.config)
        setSplit(d.config.splitB)
      }
      setDirty(false)
      setAsking(false)
      void load()
    } finally {
      setBusy(false)
    }
  }

  if (!config) return null

  const a = results.find((r) => r.variante === 'A')
  const b = results.find((r) => r.variante === 'B')
  const corriendo = config.status === 'running'
  const pausado = config.status === 'paused'

  const estado =
    corriendo ? { txt: 'Repartiendo tráfico', cls: 'bg-emerald-100 text-emerald-800' }
    : pausado ? { txt: 'En pausa · todo va a la actual', cls: 'bg-amber-100 text-amber-900' }
    : config.winner ? { txt: `Terminado · quedó ${config.winner === 'A' ? config.labelA : config.labelB}`, cls: 'bg-muted text-muted-foreground' }
    : { txt: 'Apagado', cls: 'bg-muted text-muted-foreground' }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">A/B testing</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${estado.cls}`}>
            {estado.txt}
          </span>
        </div>
        {corriendo && (
          <div className="flex gap-2">
            <button onClick={() => void save({ status: 'paused' })} disabled={busy}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              Pausar
            </button>
            <button onClick={() => setAsking(true)} disabled={busy}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              Terminar test
            </button>
          </div>
        )}
        {!corriendo && (
          <button onClick={() => void save({ status: 'running', splitB: split, winner: null })} disabled={busy}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50">
            {pausado ? 'Retomar test' : 'Activar test'}
          </button>
        )}
      </div>

      {/* Resultados lado a lado */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([['A', config.labelA, a], ['B', config.labelB, b]] as const).map(([v, label, r]) => (
          <div key={v} className={`rounded-lg border p-3 ${config.winner === v ? 'border-brand ring-1 ring-brand/30' : ''}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[11px] text-muted-foreground">Versión {v}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-4 tabular-nums">
              <div>
                <div className="text-lg font-semibold">{r?.visitas ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">visitas</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{r?.conversiones ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">conversiones</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{(r?.tasa ?? 0).toFixed(2)}%</div>
                <div className="text-[11px] text-muted-foreground">conversión</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reparto */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{config.labelA} · {100 - split}%</span>
          <span className="font-medium">{split}% · {config.labelB}</span>
        </div>
        <input
          type="range" min={0} max={100} step={5} value={split}
          onChange={(e) => { setSplit(Number(e.target.value)); setDirty(true) }}
          className="mt-2 w-full accent-[var(--brand,#00BF63)]"
          aria-label="Porcentaje de tráfico a la versión B"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {corriendo
              ? 'El cambio aplica a las visitas nuevas en menos de un minuto.'
              : 'Se guarda ahora y empieza a repartir cuando actives el test.'}
          </p>
          {dirty && (
            <button onClick={() => void save({ splitB: split })} disabled={busy}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50">
              Guardar reparto
            </button>
          )}
        </div>
      </div>

      {/* Terminar: exige elegir con cuál te quedás */}
      {asking && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">¿Con cuál versión te quedás?</p>
          <p className="mt-1 text-xs text-amber-900">
            La que elijas va a ser la única que se sirva de acá en adelante. Si todavía no querés
            decidir, usá <b>Pausar</b>: frena el test sin elegir y guarda el reparto.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void save({ status: 'off', winner: 'A' })} disabled={busy}
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50">
              Quedarme con {config.labelA}
            </button>
            <button onClick={() => void save({ status: 'off', winner: 'B' })} disabled={busy}
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50">
              Quedarme con {config.labelB}
            </button>
            <button onClick={() => setAsking(false)} disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
        Podés ver cada versión sin encender el test:{' '}
        <code className="rounded bg-muted px-1">?lp=A</code> o{' '}
        <code className="rounded bg-muted px-1">?lp=B</code> al final del enlace de la landing.
      </p>
    </section>
  )
}
