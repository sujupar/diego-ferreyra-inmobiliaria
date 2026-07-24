'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { CategoryAttribute, AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'
import type { MlAttributesResponse, MlDraft, MlPreviewProperty } from '../types'
import { parseAddress, buildGeocodeQuery } from '@/lib/properties/address'
import { findNeighborhood } from '@/lib/marketing/neighborhood-data'

const GeoPinMap = dynamic(() => import('../GeoPinMap').then(m => m.GeoPinMap), { ssr: false })

interface Props {
  property: MlPreviewProperty
  attrs: MlAttributesResponse | null
  draft: MlDraft
  onChange: (p: Partial<MlDraft>) => void
  onValidityChange: (ok: boolean) => void
}

function geoDefaultCenter(neighborhood: string): [number, number] {
  const n = findNeighborhood(neighborhood)
  return n ? [n.lat, n.lng] : [-34.6037, -58.3816] // fallback: Obelisco / CABA
}

function hasValue(v: AttributeOverride | undefined): boolean {
  return !!(v?.value_id || v?.value_name)
}

function AttrField({
  attr,
  value,
  onSet,
}: {
  attr: CategoryAttribute
  value: AttributeOverride | undefined
  onSet: (v: AttributeOverride | undefined) => void
}) {
  const border = attr.required && !hasValue(value) ? 'border-red-400 bg-red-50' : 'border-input'
  if (attr.valueType === 'list' && attr.allowedValues) {
    return (
      <select
        value={value?.value_id ?? ''}
        onChange={e => onSet(e.target.value ? { value_id: e.target.value } : undefined)}
        className={`w-full rounded-md border px-3 py-2 text-sm ${border}`}
      >
        <option value="">— elegí —</option>
        {attr.allowedValues.map(v => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
    )
  }
  if (attr.valueType === 'boolean') {
    return (
      <select
        value={value?.value_name ?? ''}
        onChange={e => onSet(e.target.value ? { value_name: e.target.value } : undefined)}
        className={`w-full rounded-md border px-3 py-2 text-sm ${border}`}
      >
        <option value="">— elegí —</option>
        <option value="Sí">Sí</option>
        <option value="No">No</option>
      </select>
    )
  }
  return (
    <input
      value={value?.value_name ?? ''}
      onChange={e => onSet(e.target.value ? { value_name: e.target.value } : undefined)}
      placeholder={attr.allowedUnits?.[0] ? `valor (${attr.allowedUnits[0]})` : 'valor'}
      className={`w-full rounded-md border px-3 py-2 text-sm ${border}`}
    />
  )
}

export function StepFields({ property, attrs, draft, onChange, onValidityChange }: Props) {
  const [geocoding, setGeocoding] = useState(false)
  const required = useMemo(() => attrs?.required ?? [], [attrs])
  const recommended = useMemo(() => attrs?.recommended ?? [], [attrs])

  function setAttr(id: string, v: AttributeOverride | undefined) {
    const next = { ...draft.mlAttributes }
    if (v) next[id] = v
    else delete next[id]
    onChange({ mlAttributes: next })
  }

  const completeness = useMemo(() => {
    const all = [...required, ...recommended]
    if (all.length === 0) return 100
    const filled = all.filter(a => hasValue(draft.mlAttributes[a.id])).length
    return Math.round((filled / all.length) * 100)
  }, [required, recommended, draft.mlAttributes])

  const requiredOk = required.every(a => hasValue(draft.mlAttributes[a.id]))
  const geoOk = draft.latitude != null && draft.longitude != null

  useEffect(() => {
    onValidityChange(requiredOk && geoOk)
  }, [requiredOk, geoOk, onValidityChange])

  async function geocode() {
    setGeocoding(true)
    try {
      const parts = parseAddress(draft.address ?? property.address, {
        neighborhood: property.neighborhood,
        city: property.city,
        province: property.province ?? null,
      })
      const addressQuery = buildGeocodeQuery(parts)
      const r = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: addressQuery,
          expected: { province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality, number: parts.number, isCaba: parts.isCaba },
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onChange({ latitude: j.lat, longitude: j.lng, geoConfidence: j.confidence })
      const msg = j.confidence === 'high'
        ? 'Ubicación encontrada — verificá el pin.'
        : 'Ubicación aproximada (baja confianza). Ajustá el pin a la ubicación exacta.'
      toast[j.confidence === 'high' ? 'success' : 'warning'](msg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Datos que pide MercadoLibre</h3>
        {attrs && <p className="text-sm text-muted-foreground">Categoría: {attrs.categoryId}. Completá para una publicación de excelencia.</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${completeness}%` }} />
        </div>
        <span className="text-xs font-semibold text-emerald-700">Completitud {completeness}%</span>
      </div>

      {!attrs && <p className="text-sm text-amber-600">No se pudieron traer los campos de ML (se publicará con los datos básicos).</p>}

      {required.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase text-red-700">Obligatorios de ML</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {required.map(a => (
              <label key={a.id} className="space-y-1">
                <span className="text-sm">{a.name}</span>
                <AttrField attr={a} value={draft.mlAttributes[a.id]} onSet={v => setAttr(a.id, v)} />
              </label>
            ))}
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase text-blue-700">Recomendados (suman al score)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {recommended.map(a => (
              <label key={a.id} className="space-y-1">
                <span className="text-sm">{a.name}</span>
                <AttrField attr={a} value={draft.mlAttributes[a.id]} onSet={v => setAttr(a.id, v)} />
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Tipo de publicación</p>
        <select
          value={draft.listingType}
          onChange={e => onChange({ listingType: e.target.value })}
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
        >
          {(attrs?.listingTypes ?? [{ id: 'free', label: 'Gratuita' }]).map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ubicación</p>
          <button type="button" onClick={geocode} disabled={geocoding} className="text-xs underline text-[color:var(--brand)]">
            {geocoding ? 'Buscando…' : 'Geocodificar dirección'}
          </button>
        </div>
        <input
          value={draft.address ?? property.address}
          onChange={e => onChange({ address: e.target.value })}
          placeholder="Calle y altura, barrio, ciudad"
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
        />
        {!geoOk && (
          <p className="text-sm text-amber-600">Sin ubicación confirmada. Geocodificá o colocá el pin en el mapa (click) y confirmá.</p>
        )}
        {geoOk && draft.geoConfidence && draft.geoConfidence !== 'high' && draft.geoConfidence !== 'manual' && (
          <p className="text-sm text-amber-600">Ubicación aproximada (confianza {draft.geoConfidence}). Verificá y ajustá el pin.</p>
        )}
        <GeoPinMap
          lat={draft.latitude ?? null}
          lng={draft.longitude ?? null}
          defaultCenter={geoDefaultCenter(property.neighborhood)}
          onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng, geoConfidence: 'manual' })}
        />
      </section>
    </div>
  )
}
