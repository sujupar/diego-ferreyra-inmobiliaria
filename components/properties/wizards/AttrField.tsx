'use client'

/**
 * Control de UN atributo de portal (lista → select, Sí/No → select, número o
 * texto → input). Lo comparten el paso Campos de los wizards de MercadoLibre y
 * Argenprop y la Sección 08 de la visita: un solo lugar para el mismo control.
 */
export interface CampoAtributo {
  id: string
  name: string
  valueType: 'string' | 'number' | 'number_unit' | 'boolean' | 'list'
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface ValorAtributo {
  value_name?: string
  value_id?: string
}

export function hasValue(v: ValorAtributo | undefined): boolean {
  return !!(v?.value_id || v?.value_name)
}

export function AttrField({
  attr,
  value,
  onSet,
}: {
  attr: CampoAtributo
  value: ValorAtributo | undefined
  onSet: (v: ValorAtributo | undefined) => void
}) {
  const border = attr.required && !hasValue(value) ? 'border-red-400 bg-red-50' : 'border-input'
  if (attr.valueType === 'list' && attr.allowedValues) {
    return (
      <select
        value={value?.value_id ?? ''}
        onChange={e => onSet(e.target.value ? { value_id: e.target.value } : undefined)}
        className={`w-full rounded-md border px-3 py-2 text-sm max-md:min-h-11 ${border}`}
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
        className={`w-full rounded-md border px-3 py-2 text-sm max-md:min-h-11 ${border}`}
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
      className={`w-full rounded-md border px-3 py-2 text-sm max-md:min-h-11 ${border}`}
    />
  )
}
