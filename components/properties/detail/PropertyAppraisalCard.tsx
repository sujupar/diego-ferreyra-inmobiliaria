'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList, Loader2 } from 'lucide-react'
import { formatMoney } from '@/lib/properties/detail-view'

/**
 * La tasación de ESTA propiedad, en modo lectura, dentro de la ficha.
 *
 * POR QUÉ ACÁ Y NO UN ENLACE A `/appraisals/[id]` (decisión, 2026-08-10): esa
 * pantalla está construida sobre la tasación COMPLETA —recalcula la valuación
 * con `calculateValuation`, arma el informe web, ofrece PDF, editar campos y
 * asociar contacto—. Mandarle al abogado una tasación resumida la rompe, y
 * mandársela completa contradice lo que se decidió que puede ver. Neutralizar
 * esa pantalla por rol sería un cambio grande sobre 664 líneas para un solo
 * caso, y con acciones que hay que acordarse de tapar una por una.
 *
 * Un panel propio, en cambio, se lleva bien con la regla del dueño: la entrada
 * es CONTEXTUAL. El abogado llega a esta tasación porque está mirando esta
 * propiedad; no existe para él una URL `/appraisals/<cualquier-id>`, ni un ítem
 * de menú, ni un listado. (Y si igual escribe la URL a mano, esa pantalla lo
 * manda de vuelta acá: ver el aviso `resumida` en `/api/appraisals/[id]`.)
 *
 * Vive en la pestaña «Propiedad» y no en «Documentación» —que es donde el
 * abogado trabaja— porque la tasación es un dato DE LA PROPIEDAD, hermano de
 * «Características», no una pieza del expediente legal.
 *
 * No hay ni un botón: no hay nada que pueda hacer con esto. El servidor
 * tampoco se lo permitiría (PUT/PATCH/DELETE le responden 403), pero un botón
 * que solo sabe fallar es peor que no tenerlo.
 */

/**
 * Lo que devuelve el servidor con el alcance `vinculadas`. Nada más — y el
 * "nada más" es del `select`, no de esta interfaz: ver
 * `COLUMNAS_TASACION_RESUMIDA` en lib/auth/appraisal-access.ts.
 */
interface TasacionResumida {
  id: string
  property_title: string | null
  property_location: string | null
  publication_price: number | null
  sale_value: number | null
  currency: string | null
  comparable_count: number | null
  created_at: string | null
}

function formatFecha(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="font-medium text-sm mt-0.5 tabular-n">{value}</p>
    </div>
  )
}

export function PropertyAppraisalCard({ appraisalId }: { appraisalId: string }) {
  const [tasacion, setTasacion] = useState<TasacionResumida | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'sin-acceso' | 'error'>('cargando')

  useEffect(() => {
    let cancelado = false
    setEstado('cargando')
    fetch(`/api/appraisals/${appraisalId}`)
      .then(async r => {
        if (r.status === 403 || r.status === 404) return { estado: 'sin-acceso' as const, data: null }
        if (!r.ok) throw new Error(`GET /api/appraisals respondió ${r.status}`)
        const { data } = await r.json()
        return { estado: 'lista' as const, data: data as TasacionResumida | null }
      })
      .then(({ estado: e, data }) => {
        if (cancelado) return
        if (e === 'sin-acceso' || !data) { setEstado('sin-acceso'); return }
        setTasacion(data)
        setEstado('lista')
      })
      .catch(err => {
        if (cancelado) return
        console.error(err)
        setEstado('error')
      })
    return () => { cancelado = true }
  }, [appraisalId])

  // Sin acceso o sin fila, el panel no existe: mostrar un cartel de "no podés"
  // sobre algo que el abogado no pidió es ruido. El caso normal es que la
  // propiedad no tenga tasación cargada, y entonces esta tarjeta ni se monta.
  if (estado === 'sin-acceso') return null

  const moneda = tasacion?.currency ?? 'USD'
  const datos: Array<{ label: string; value: string }> = []
  if (tasacion) {
    if (tasacion.publication_price) datos.push({ label: 'Valor de publicación', value: formatMoney(tasacion.publication_price, moneda) })
    if (tasacion.sale_value) datos.push({ label: 'Valor de venta estimado', value: formatMoney(tasacion.sale_value, moneda) })
    if (tasacion.comparable_count) datos.push({ label: 'Comparables', value: String(tasacion.comparable_count) })
  }
  const fecha = formatFecha(tasacion?.created_at ?? null)

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[color:var(--brand)]" />
          <p className="eyebrow">Tasación de esta propiedad</p>
        </div>

        {estado === 'cargando' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando la tasación…
          </p>
        )}

        {estado === 'error' && (
          <p className="text-sm text-muted-foreground">
            No se pudo cargar la tasación de esta propiedad.
          </p>
        )}

        {estado === 'lista' && tasacion && (
          <>
            <div>
              <p className="font-medium text-sm break-words">
                {tasacion.property_title || tasacion.property_location || 'Tasación sin título'}
              </p>
              {tasacion.property_location && tasacion.property_title && (
                <p className="text-sm text-muted-foreground break-words">{tasacion.property_location}</p>
              )}
              {fecha && <p className="text-xs text-muted-foreground mt-1">Tasada el {fecha}</p>}
            </div>

            {datos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {datos.map(d => <Dato key={d.label} label={d.label} value={d.value} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                La tasación no tiene valores cargados.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Resumen de solo lectura, para cotejar los papeles con lo tasado.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
