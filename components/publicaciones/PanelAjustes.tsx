'use client'

/**
 * Ajustes de Publicaciones (panel lateral): el interruptor general, los horarios
 * por ritmo y el documento de estilo que usa la IA para escribir las descripciones.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { HorariosPorDefecto } from '@/lib/publicaciones/calendario'
import { PLATAFORMAS } from '@/lib/publicaciones/tipos'
import { REDES } from './IconosRedes'
import { api } from './leer-json'
import { ESPERA_AUTOGUARDADO_MS } from './useAutoguardado'

type ResumenEstilo =
  | { etapa: 'sin_aprender' | 'redactando'; vigente: boolean }
  | { etapa: 'clasificando'; elegidos: number; revisados: number; total: number; vigente: boolean }
  | { etapa: 'listo'; guia: string; ejemplos: { caption: string; fecha: string }[]; aprendido_en: string; vigente: true }

interface Ajustes {
  publicacion_automatica: boolean
  horarios: HorariosPorDefecto
  estilo: ResumenEstilo
}

const ETIQUETAS_HORARIO: { clave: keyof HorariosPorDefecto; titulo: string }[] = [
  { clave: '1', titulo: '1 por día' },
  { clave: '2', titulo: '2 por día' },
  { clave: '3', titulo: '3 por día' },
  { clave: 'semana', titulo: '1 por semana' },
]

function textoProgreso(e: ResumenEstilo): string {
  if (e.etapa === 'clasificando') return `Separando videos de Diego (${Math.min(e.elegidos, 100)} de 100)`
  if (e.etapa === 'redactando') return 'Escribiendo la guía'
  return 'Leyendo publicaciones…'
}

export function PanelAjustes({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [puede, setPuede] = useState(false)
  const [horarios, setHorarios] = useState<HorariosPorDefecto | null>(null)
  const [guia, setGuia] = useState('')
  const [aprendiendo, setAprendiendo] = useState<string | null>(null)
  const timerGuia = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ ajustes: Ajustes; puedeCambiarInterruptor: boolean }>('/api/publicaciones/ajustes')
      setAjustes(r.ajustes)
      setPuede(r.puedeCambiarInterruptor)
      setHorarios(r.ajustes.horarios)
      if (r.ajustes.estilo.etapa === 'listo') setGuia(r.ajustes.estilo.guia)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los ajustes')
    }
  }, [])

  useEffect(() => {
    if (abierto) void cargar()
  }, [abierto, cargar])

  const patch = async (body: Record<string, unknown>) => {
    const r = await api<{ ajustes: Ajustes }>('/api/publicaciones/ajustes', { method: 'PATCH', body })
    setAjustes(r.ajustes)
    return r.ajustes
  }

  const cambiarInterruptor = async (valor: boolean) => {
    if (
      valor &&
      !window.confirm('Al prenderla, los videos programados se publican solos en su horario. ¿La prendemos?')
    ) {
      return
    }
    try {
      await patch({ publicacion_automatica: valor })
      toast.success(valor ? 'Publicación automática prendida' : 'Publicación automática apagada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar')
    }
  }

  const guardarHorarios = async () => {
    if (!horarios) return
    try {
      await patch({ horarios })
      toast.success('Horarios guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron guardar los horarios')
    }
  }

  const editarGuia = (texto: string) => {
    setGuia(texto)
    if (timerGuia.current) clearTimeout(timerGuia.current)
    timerGuia.current = setTimeout(() => {
      if (!texto.trim()) return
      patch({ guia: texto }).catch((e: Error) => toast.error(e.message))
    }, ESPERA_AUTOGUARDADO_MS)
  }

  const aprender = async (empezar: boolean) => {
    setAprendiendo('Leyendo publicaciones…')
    try {
      let primera = true
      for (let i = 0; i < 20; i++) {
        const r = await api<{ estilo: ResumenEstilo }>('/api/publicaciones/estilo/aprender', {
          method: 'POST',
          body: primera ? { empezar } : {},
        })
        primera = false
        setAjustes((a) => (a ? { ...a, estilo: r.estilo } : a))
        if (r.estilo.etapa === 'listo') {
          setGuia(r.estilo.guia)
          toast.success('Listo: ya aprendí cómo escribe Diego')
          return
        }
        if (r.estilo.etapa === 'sin_aprender') throw new Error('No encontré videos de Diego hablando para aprender')
        setAprendiendo(textoProgreso(r.estilo))
      }
      throw new Error('Tardó más de lo esperado. Tocá de nuevo para seguir.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aprender el estilo')
    } finally {
      setAprendiendo(null)
    }
  }

  const estilo = ajustes?.estilo

  return (
    <Sheet open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Ajustes de publicaciones</SheetTitle>
          <SheetDescription>Valen para todas las tandas.</SheetDescription>
        </SheetHeader>

        {!ajustes || !horarios ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
          </div>
        ) : (
          <div className="space-y-8 px-4 pb-8">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="automatica" className="text-base">
                  Publicación automática
                </Label>
                <Switch
                  id="automatica"
                  checked={ajustes.publicacion_automatica}
                  disabled={!puede}
                  onCheckedChange={(v) => void cambiarInterruptor(v)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {puede
                  ? 'Apagada, nada sale a las redes aunque esté programado.'
                  : 'Lo cambian admin y dueño.'}{' '}
                Las redes todavía no están conectadas: en esta etapa nada se publica.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="font-medium">Horarios por ritmo</h3>
              {ETIQUETAS_HORARIO.map(({ clave, titulo }) => (
                <div key={clave} className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-sm">{titulo}</span>
                  {horarios[clave].map((h, i) => (
                    <Input
                      key={i}
                      type="time"
                      value={h}
                      aria-label={`${titulo}, horario ${i + 1}`}
                      className="h-8 w-28"
                      onChange={(e) =>
                        setHorarios({ ...horarios, [clave]: horarios[clave].map((x, j) => (j === i ? e.target.value : x)) })
                      }
                    />
                  ))}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => void guardarHorarios()}>
                Guardar horarios
              </Button>
            </section>

            <section className="space-y-3">
              <h3 className="font-medium">Estilo de las descripciones</h3>
              {aprendiendo ? (
                <p className="flex items-center gap-2 text-sm" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {aprendiendo}
                </p>
              ) : estilo?.etapa === 'listo' ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    La IA escribe siguiendo esta guía y {estilo.ejemplos.length} descripciones reales de Diego. Podés corregirla:
                    se guarda sola.
                  </p>
                  <Textarea rows={14} value={guia} aria-label="Guía de estilo" onChange={(e) => editarGuia(e.target.value)} />
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="px-0">
                        Ver los {estilo.ejemplos.length} ejemplos
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ol className="space-y-3 pt-2">
                        {estilo.ejemplos.map((e, i) => (
                          <li key={i} className="rounded-md bg-muted/50 p-2 text-xs">
                            <p className="mb-1 font-medium text-muted-foreground">{e.fecha}</p>
                            <p className="whitespace-pre-line">{e.caption}</p>
                          </li>
                        ))}
                      </ol>
                    </CollapsibleContent>
                  </Collapsible>
                  <Button variant="outline" size="sm" onClick={() => void aprender(true)}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Volver a aprender
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Leo los últimos reels de Instagram, me quedo con 100 donde Diego habla y armo una guía de cómo escribe.
                  </p>
                  <Button onClick={() => void aprender(false)}>
                    <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                    {estilo?.etapa === 'sin_aprender' ? 'Aprender del Instagram' : 'Seguir aprendiendo'}
                  </Button>
                </>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-medium">Cuentas</h3>
              <ul className="space-y-1.5 text-sm">
                {PLATAFORMAS.map((p) => {
                  const { nombre, Icono } = REDES[p]
                  return { n: nombre.replace(' (borrador)', ''), Icono }
                }).map(({ n, Icono }) => (
                  <li key={n} className="flex items-center gap-2">
                    <Icono className="h-4 w-4 text-muted-foreground" /> {n}
                    <span className="ml-auto text-xs text-muted-foreground">Se conecta en la próxima etapa</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
