'use client'

import { useEffect, useState } from 'react'
import { Select } from '@/components/ui/select'
import { CABA_BARRIOS } from '@/lib/market-data/neighborhoods'

interface Option { slug: string; name: string; isGeneral?: boolean }

const STATIC_OPTIONS: Option[] = CABA_BARRIOS.map(b => ({ slug: b.slug, name: b.name, isGeneral: b.isGeneral }))

/** Valor sentinela para el texto libre legacy — NO dispara onChange. */
const LEGACY_VALUE = '__legacy__'

/** Combobox de barrio canónico. DB-first (permite sumar GBA sin deploy) con
 *  fallback al catálogo estático. Si el valor inicial es texto libre legacy que
 *  no matchea el catálogo, se muestra como opción extra (valor sentinela) para
 *  no perderlo — elegir un barrio real lo reemplaza.
 *
 *  Usa el Select bespoke existente de components/ui/select.tsx (wrapper de
 *  <select> nativo con options + placeholder), NO el Select de shadcn/Radix. */
export function NeighborhoodSelect({ valueSlug, valueName, onChange }: {
    valueSlug: string
    valueName: string
    onChange: (slug: string, name: string) => void
}) {
    const [options, setOptions] = useState<Option[]>(STATIC_OPTIONS)

    useEffect(() => {
        let cancelled = false
        fetch('/api/neighborhoods')
            .then(r => r.json())
            .then(({ data }) => { if (!cancelled && Array.isArray(data) && data.length) setOptions(data) })
            .catch(() => { /* fallback estático ya seteado */ })
        return () => { cancelled = true }
    }, [])

    const legacyFreeText = !valueSlug && valueName.trim() !== '' && !options.some(o => o.name === valueName)
    const selectValue = valueSlug || (legacyFreeText ? LEGACY_VALUE : '')

    const selectOptions = [
        ...(legacyFreeText ? [{ value: LEGACY_VALUE, label: `«${valueName}» (texto libre)` }] : []),
        ...options.filter(o => o.isGeneral).map(o => ({ value: o.slug, label: 'General / CABA' })),
        ...options.filter(o => !o.isGeneral).map(o => ({ value: o.slug, label: o.name })),
    ]

    return (
        <Select
            id="neighborhood"
            className="h-12"
            value={selectValue}
            placeholder="Elegí el barrio"
            options={selectOptions}
            onChange={(e) => {
                const v = e.target.value
                if (v === LEGACY_VALUE) return
                const opt = options.find(o => o.slug === v)
                if (opt) onChange(opt.slug, opt.isGeneral ? 'CABA' : opt.name)
            }}
        />
    )
}
