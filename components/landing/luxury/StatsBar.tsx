/**
 * E1.9 — Barra de datos rápidos (ambientes · dorm · m² · etc). Banda editorial
 * con número serif + eyebrow. Toma hasta 7 datos presentes, en orden de
 * prioridad. Server component.
 */
interface StatsBarProps {
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  coveredArea: number | null
  totalArea: number | null
  floor: number | null
  age: number | null
  expensas: number | null
}

export function StatsBar(p: StatsBarProps) {
  const stats: { value: string; label: string }[] = []
  if (p.rooms) stats.push({ value: String(p.rooms), label: 'Ambientes' })
  if (p.bedrooms) stats.push({ value: String(p.bedrooms), label: 'Dormitorios' })
  if (p.bathrooms) stats.push({ value: String(p.bathrooms), label: 'Baños' })
  if (p.coveredArea) stats.push({ value: String(p.coveredArea), label: 'm² cubiertos' })
  if (p.garages) stats.push({ value: String(p.garages), label: 'Cocheras' })
  if (p.floor != null) stats.push({ value: String(p.floor), label: 'Piso' })
  if (p.age != null) stats.push({ value: p.age === 0 ? 'A estrenar' : String(p.age), label: p.age === 0 ? 'Estado' : 'Años' })
  if (p.expensas) stats.push({ value: `$${p.expensas.toLocaleString('es-AR')}`, label: 'Expensas' })
  const shown = stats.slice(0, 7)
  if (shown.length === 0) return null

  return (
    <section
      className="lx-reveal border-y"
      style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg-2)' }}
    >
      <ul className="mx-auto flex max-w-6xl flex-wrap items-stretch justify-center">
        {shown.map((s, i) => (
          <li
            key={i}
            className="min-w-[128px] flex-1 border-l px-4 py-8 text-center first:border-l-0"
            style={{ borderColor: 'var(--lx-line)' }}
          >
            <p className="text-2xl font-medium tabular-nums md:text-3xl" style={{ fontFamily: 'var(--lx-serif)' }}>
              {s.value}
            </p>
            <p className="lx-eyebrow mt-2" style={{ color: 'var(--lx-ink-soft)' }}>
              {s.label}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
