'use client'

/**
 * Paso 2: "¿Cómo querés repartir estos N videos?". Seis tarjetas; debajo, la
 * frase y un mini calendario calculados en el momento.
 *
 * Animación: solo movimiento (y/scale), NUNCA opacidad 0 de arranque, y
 * `prefers-reduced-motion` solo acorta la duración — la estructura del DOM es
 * la misma siempre (regla de la landing en CLAUDE.md).
 */
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarDays, Clock, Loader2, Plus, Sparkles, Sun, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  aHoraArgentina,
  armarCalendario,
  fraseCalendario,
  mananaEnArgentina,
  type DiaSemana,
  type HorariosPorDefecto,
  type Ritmo,
} from '@/lib/publicaciones/calendario'

interface Props {
  cantidad: number
  ritmoInicial: Ritmo | null
  inicioInicial: string | null
  soloHabilesInicial: boolean
  horarios: HorariosPorDefecto
  guardando: boolean
  onConfirmar: (ritmo: Ritmo, inicio: string, soloHabiles: boolean) => void
}

type Opcion = 'todos_ya' | 'por_dia_1' | 'por_dia_2' | 'por_dia_3' | 'por_semana' | 'personalizado'

const DIAS_CHIPS: { d: DiaSemana; letra: string; nombre: string }[] = [
  { d: 1, letra: 'L', nombre: 'lunes' },
  { d: 2, letra: 'M', nombre: 'martes' },
  { d: 3, letra: 'X', nombre: 'miércoles' },
  { d: 4, letra: 'J', nombre: 'jueves' },
  { d: 5, letra: 'V', nombre: 'viernes' },
  { d: 6, letra: 'S', nombre: 'sábado' },
  { d: 0, letra: 'D', nombre: 'domingo' },
]
const HORARIOS_EXTRA = ['09:00', '13:00', '19:00', '11:00', '17:00']

function opcionDe(r: Ritmo | null): Opcion {
  if (!r) return 'por_dia_1'
  if (r.tipo === 'por_dia') return `por_dia_${r.cantidad}` as Opcion
  return r.tipo
}

function unir(hs: string[]): string {
  return hs.length <= 1 ? hs.join('') : `${hs.slice(0, -1).join(', ')} y ${hs[hs.length - 1]}`
}

export function PasoRitmo({ cantidad, ritmoInicial, inicioInicial, soloHabilesInicial, horarios, guardando, onConfirmar }: Props) {
  const reducir = useReducedMotion()
  const [opcion, setOpcion] = useState<Opcion>(opcionDe(ritmoInicial))
  const [inicio, setInicio] = useState(inicioInicial ?? mananaEnArgentina(new Date()))
  const [soloHabiles, setSoloHabiles] = useState(soloHabilesInicial)
  const [dias, setDias] = useState<DiaSemana[]>(
    ritmoInicial?.tipo === 'personalizado' ? ritmoInicial.dias : [1, 2, 3, 4, 5],
  )
  const [propios, setPropios] = useState<string[]>(
    ritmoInicial?.tipo === 'personalizado' ? ritmoInicial.horarios : ['10:00'],
  )

  const tarjetas: { id: Opcion; titulo: string; detalle: string; Icono: typeof Zap }[] = [
    { id: 'todos_ya', titulo: 'Todos ya', detalle: 'Uno cada 10 minutos', Icono: Zap },
    { id: 'por_dia_1', titulo: '1 por día', detalle: `a las ${unir(horarios['1'])}`, Icono: Sun },
    { id: 'por_dia_2', titulo: '2 por día', detalle: `a las ${unir(horarios['2'])}`, Icono: Clock },
    { id: 'por_dia_3', titulo: '3 por día', detalle: `a las ${unir(horarios['3'])}`, Icono: Clock },
    { id: 'por_semana', titulo: '1 por semana', detalle: `a las ${unir(horarios.semana)}`, Icono: CalendarDays },
    { id: 'personalizado', titulo: 'A mi manera', detalle: 'Elegís días y horarios', Icono: Sparkles },
  ]

  const ritmo: Ritmo = useMemo(() => {
    switch (opcion) {
      case 'todos_ya':
        return { tipo: 'todos_ya' }
      case 'por_semana':
        return { tipo: 'por_semana' }
      case 'personalizado':
        return { tipo: 'personalizado', porDia: propios.length, dias, horarios: propios }
      default:
        return { tipo: 'por_dia', cantidad: Number(opcion.slice(-1)) as 1 | 2 | 3 }
    }
  }, [opcion, propios, dias])

  const vista = useMemo(() => {
    try {
      const fechas = armarCalendario(cantidad, { ritmo, inicio, soloHabiles, horarios, ahora: new Date() })
      return { fechas, frase: fraseCalendario(fechas, ritmo), error: null as string | null }
    } catch (e) {
      return { fechas: [] as Date[], frase: '', error: e instanceof Error ? e.message : 'Revisá los datos' }
    }
  }, [cantidad, ritmo, inicio, soloHabiles, horarios])

  const duracion = reducir ? 0 : 0.25

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        ¿Cómo querés repartir {cantidad === 1 ? 'este video' : `estos ${cantidad} videos`}?
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Ritmo de publicación">
        {tarjetas.map((t, i) => {
          const activa = opcion === t.id
          return (
            <motion.button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setOpcion(t.id)}
              initial={{ y: 10 }}
              animate={{ y: 0, scale: activa ? 1.02 : 1 }}
              transition={{ duration: duracion, delay: reducir ? 0 : i * 0.04 }}
              whileTap={reducir ? undefined : { scale: 0.98 }}
              className={`relative flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                activa ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
              }`}
            >
              {activa && (
                <motion.span
                  layoutId="ritmo-elegido"
                  transition={{ duration: duracion }}
                  className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary"
                  aria-hidden
                />
              )}
              <t.Icono className={`mt-0.5 h-5 w-5 shrink-0 ${activa ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <span className="space-y-0.5">
                <span className="block font-medium">{t.titulo}</span>
                <span className="block text-sm text-muted-foreground">{t.detalle}</span>
              </span>
            </motion.button>
          )
        })}
      </div>

      {opcion === 'personalizado' && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="space-y-2">
            <Label>Días</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_CHIPS.map(({ d, letra, nombre }) => {
                const on = dias.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={nombre}
                    onClick={() => setDias(on ? dias.filter((x) => x !== d) : [...dias, d])}
                    className={`h-9 w-9 rounded-full border text-sm font-medium ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {letra}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Horarios de cada día ({propios.length} por día)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {propios.map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={h}
                    aria-label={`Horario ${i + 1}`}
                    className="w-28"
                    onChange={(e) => setPropios(propios.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {propios.length > 1 && (
                    <Button size="icon" variant="ghost" aria-label={`Quitar horario ${h}`} onClick={() => setPropios(propios.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
              {propios.length < 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPropios([...propios, HORARIOS_EXTRA.find((h) => !propios.includes(h)) ?? '12:00'])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> horario
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-6">
        {opcion !== 'todos_ya' && (
          <div className="space-y-1.5">
            <Label htmlFor="inicio">Empieza el</Label>
            <Input id="inicio" type="date" value={inicio} className="w-44" onChange={(e) => e.target.value && setInicio(e.target.value)} />
          </div>
        )}
        {opcion !== 'todos_ya' && (
          <div className="flex items-center gap-2 pb-2">
            <Switch id="habiles" checked={soloHabiles} onCheckedChange={setSoloHabiles} />
            <Label htmlFor="habiles">Solo días hábiles</Label>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl bg-muted/50 p-4" aria-live="polite">
        {vista.error ? (
          <p className="text-sm text-destructive">{vista.error}</p>
        ) : (
          <p className="font-medium">{vista.frase}</p>
        )}
        <MiniCalendario fechas={vista.fechas} reducir={!!reducir} />
      </div>

      <div className="flex justify-end">
        <Button size="lg" disabled={!!vista.error || guardando} onClick={() => onConfirmar(ritmo, inicio, soloHabiles)}>
          {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
          Ver el calendario <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Cinco semanas desde la semana del primer video; un puntito por publicación. */
export function MiniCalendario({ fechas, reducir }: { fechas: Date[]; reducir: boolean }) {
  if (fechas.length === 0) return null
  const porDia = new Map<string, number>()
  for (const f of fechas) {
    const { fecha } = aHoraArgentina(f)
    porDia.set(fecha, (porDia.get(fecha) ?? 0) + 1)
  }
  const primero = aHoraArgentina(fechas[0])
  const desdeLunes = (primero.diaSemana + 6) % 7
  const base = Date.parse(`${primero.fecha}T12:00:00Z`) - desdeLunes * 86_400_000
  const dias = Array.from({ length: 35 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10))
  const restantes = fechas.length - dias.reduce((n, d) => n + (porDia.get(d) ?? 0), 0)

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {LETRAS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d, i) => {
          const n = porDia.get(d) ?? 0
          return (
            <div
              key={d}
              className={`flex h-10 flex-col items-center justify-center rounded-md text-[11px] ${n > 0 ? 'bg-background' : ''}`}
              title={n > 0 ? `${n} el ${d.slice(8, 10)}/${d.slice(5, 7)}` : undefined}
            >
              <span className={n > 0 ? 'font-medium' : 'text-muted-foreground/60'}>{Number(d.slice(8, 10))}</span>
              <span className="flex gap-0.5">
                {Array.from({ length: Math.min(n, 3) }, (_, k) => (
                  <motion.span
                    key={k}
                    initial={{ scale: 0.4 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: reducir ? 0 : 0.2, delay: reducir ? 0 : Math.min(i * 0.012, 0.4) }}
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                  />
                ))}
              </span>
            </div>
          )
        })}
      </div>
      {restantes > 0 && <p className="text-xs text-muted-foreground">+ {restantes} más después</p>}
    </div>
  )
}
