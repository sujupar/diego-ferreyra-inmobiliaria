'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, Globe, Loader2, Megaphone } from 'lucide-react'
import type { PropertyTypeVenta, VisitPortalesData, VisitLandingData, ValorAtributoPortal } from '@/types/visit-data.types'
import { AttrField, type CampoAtributo } from '@/components/properties/wizards/AttrField'
import { preguntasFijasLanding } from '@/lib/landing/questions-generator'

interface CamposPortalesResponse {
  ml: { categoryId: string | null; checklist: CampoAtributo[]; otros: CampoAtributo[] }
  mlError: string | null
  ap: CampoAtributo[]
  error?: string
}

interface Props {
  dealId: string
  propertyType: PropertyTypeVenta
  neighborhood: string | null
  portales: VisitPortalesData
  landing: VisitLandingData
  onPortalesChange: (next: VisitPortalesData) => void
  onLandingChange: (next: VisitLandingData) => void
}

function SectionTitle({ icon: Icon, eyebrow, children }: { icon: typeof Globe; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="eyebrow">{eyebrow}</p>
      <CardTitle className="display text-base flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {children}
      </CardTitle>
    </div>
  )
}

/**
 * Secciones 08 ("Datos para portales") y 09 ("Datos para la landing") del
 * formulario de visita (pedido del dueño, 2026-09-14): lo que piden
 * MercadoLibre, Argenprop y la landing se carga acá, donde el asesor está
 * parado adentro de la propiedad, y no cuando la asistente publica.
 *
 * Los campos de ML salen del schema real de la categoría (menos los que ya se
 * derivan de las secciones 01–03). Si ML no responde, se avisa y la visita
 * sigue: esos campos se piden al publicar, como hasta ahora.
 */
export function VisitDifusionSections({ dealId, propertyType, neighborhood, portales, landing, onPortalesChange, onLandingChange }: Props) {
  const [campos, setCampos] = useState<CamposPortalesResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      const r = await fetch(`/api/deals/${dealId}/campos-portales?tipo=${encodeURIComponent(propertyType)}`)
      const texto = await r.text()
      let j: CamposPortalesResponse | null = null
      try { j = JSON.parse(texto) as CamposPortalesResponse } catch { j = null }
      if (!r.ok || !j) throw new Error(j?.error ?? `No se pudieron traer los campos de los portales (error ${r.status}).`)
      setCampos(j)
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudieron traer los campos de los portales.')
    } finally {
      setCargando(false)
    }
  }, [dealId, propertyType])

  useEffect(() => { void cargar() }, [cargar])

  const setMl = (id: string, v: ValorAtributoPortal | undefined) => {
    const ml = { ...portales.ml }
    if (v) ml[id] = v
    else delete ml[id]
    onPortalesChange({ ...portales, ml })
  }
  const setAp = (id: string, v: ValorAtributoPortal | undefined) => {
    const ap = { ...portales.ap }
    if (v) ap[id] = v
    else delete ap[id]
    onPortalesChange({ ...portales, ap })
  }
  const marcado = (id: string) => portales.ml[id]?.value_name === 'Sí'

  const preguntas = preguntasFijasLanding(neighborhood)
  const mlError = errorCarga ?? campos?.mlError ?? null
  const checklist = campos?.ml.checklist ?? []
  const otros = campos?.ml.otros ?? []
  const ap = campos?.ap ?? []

  return (
    <>
      {/* Sección 08 — Datos para portales */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader>
          <SectionTitle icon={Building2} eyebrow="Sección 08">Datos para portales</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Lo que piden MercadoLibre y Argenprop además de lo de arriba. Lo que ya cargaste
            (ambientes, metros, antigüedad, orientación…) no se vuelve a pedir.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="max-w-xs">
            <Label>Expensas (ARS por mes)</Label>
            <Input
              type="number" inputMode="numeric" min="0"
              value={portales.expensas ?? ''}
              onChange={e => onPortalesChange({ ...portales, expensas: e.target.value ? Number(e.target.value) : null })}
              placeholder="Ej: 85000"
            />
          </div>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">MercadoLibre</p>
            {cargando && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Trayendo los campos de la categoría…</p>
            )}
            {!cargando && mlError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
                <p className="text-xs text-amber-800">No se pudieron traer los campos de MercadoLibre. Podés seguir: se van a pedir al publicar.</p>
                <p className="text-[11px] text-amber-700">{mlError}</p>
                <button type="button" onClick={() => void cargar()} className="text-xs underline text-amber-900">Reintentar</button>
              </div>
            )}
            {!cargando && !mlError && checklist.length === 0 && otros.length === 0 && (
              <p className="text-xs text-muted-foreground">MercadoLibre no pide nada más para esta categoría.</p>
            )}
            {checklist.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Marcá lo que tiene la propiedad o el edificio:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
                  {checklist.map(a => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 max-md:min-h-9">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={marcado(a.id)}
                        onChange={e => setMl(a.id, e.target.checked ? { value_name: 'Sí' } : undefined)}
                      />
                      <span>{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {otros.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {otros.map(a => (
                  <label key={a.id} className="space-y-1">
                    <span className="text-sm">{a.name}</span>
                    <AttrField attr={a} value={portales.ml[a.id]} onSet={v => setMl(a.id, v)} />
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Argenprop</p>
            {ap.length === 0 && !cargando && (
              <p className="text-xs text-muted-foreground">Argenprop no pide nada más para este tipo de propiedad.</p>
            )}
            {ap.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ap.map(f => (
                  <label key={f.id} className="space-y-1">
                    <span className="text-sm">{f.name}</span>
                    <AttrField attr={f} value={portales.ap[f.id]} onSet={v => setAp(f.id, v)} />
                  </label>
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Sección 09 — Datos para la landing */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader>
          <SectionTitle icon={Megaphone} eyebrow="Sección 09">Datos para la landing</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Con esto la landing se crea y se publica sola cuando la propiedad esté captada.
            Si dejás alguna vacía, se pregunta desde la ficha.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {preguntas.map(q => (
            <div key={q.id} className="space-y-1">
              <Label htmlFor={`landing-${q.id}`} className="text-sm font-medium">{q.question}</Label>
              {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
              <textarea
                id={`landing-${q.id}`}
                rows={2}
                maxLength={1500}
                className="w-full rounded-md border px-3 py-2 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                value={landing[q.id] ?? ''}
                onChange={e => onLandingChange({ ...landing, [q.id]: e.target.value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
