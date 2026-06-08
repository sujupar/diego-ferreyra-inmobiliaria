'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { ApField, AttributeOverride } from '../types'
import type { ApAttributesResponse, ApDraft, ApPreviewProperty } from '../types'

const GeoPinMap = dynamic(() => import('../GeoPinMap').then(m => m.GeoPinMap), { ssr: false })

interface Props {
  property: ApPreviewProperty
  attrs: ApAttributesResponse | null
  draft: ApDraft
  onChange: (p: Partial<ApDraft>) => void
  onValidityChange: (ok: boolean) => void
}

function hasValue(v: AttributeOverride | undefined): boolean {
  return !!(v?.value_id || v?.value_name)
}

function AttrField({
  attr,
  value,
  onSet,
}: {
  attr: ApField
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
    const next = { ...draft.apAttributes }
    if (v) next[id] = v
    else delete next[id]
    onChange({ apAttributes: next })
  }

  const completeness = useMemo(() => {
    const all = [...required, ...recommended]
    if (all.length === 0) return 100
    const filled = all.filter(a => hasValue(draft.apAttributes[a.id])).length
    return Math.round((filled / all.length) * 100)
  }, [required, recommended, draft.apAttributes])

  const requiredOk = required.every(a => hasValue(draft.apAttributes[a.id]))
  const geoOk = draft.latitude != null && draft.longitude != null

  useEffect(() => {
    onValidityChange(requiredOk && geoOk)
  }, [requiredOk, geoOk, onValidityChange])

  async function geocode() {
    setGeocoding(true)
    try {
      const addressQuery = [property.address, property.neighborhood, property.city || 'CABA']
        .filter(Boolean)
        .join(', ')
      const r = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addressQuery }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onChange({ latitude: j.lat, longitude: j.lng })
      toast.success('Ubicación encontrada — ajustá el pin si hace falta')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Datos que pide Argenprop</h3>
        {attrs && <p className="text-sm text-muted-foreground">Categoría: {attrs.categoryId}. Completá para una publicación de excelencia.</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${completeness}%` }} />
        </div>
        <span className="text-xs font-semibold text-emerald-700">Completitud {completeness}%</span>
      </div>

      {!attrs && <p className="text-sm text-amber-600">No se pudieron traer los campos de Argenprop (se publicará con los datos básicos).</p>}

      {required.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase text-red-700">Obligatorios de Argenprop</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {required.map(a => (
              <label key={a.id} className="space-y-1">
                <span className="text-sm">{a.name}</span>
                <AttrField attr={a} value={draft.apAttributes[a.id]} onSet={v => setAttr(a.id, v)} />
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
                <AttrField attr={a} value={draft.apAttributes[a.id]} onSet={v => setAttr(a.id, v)} />
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
          {(attrs?.listingTypes ?? [{ id: 'estandar', label: 'Estándar' }]).map(t => (
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
        {geoOk ? (
          <GeoPinMap lat={draft.latitude!} lng={draft.longitude!} onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng })} />
        ) : (
          <p className="text-sm text-red-600">Falta la ubicación. Tocá “Geocodificar dirección” y confirmá el pin.</p>
        )}
      </section>
    </div>
  )
}
