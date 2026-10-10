/** Período de datos de mercado = primer día del mes VIGENTE en Buenos Aires.
 *  ART es UTC-3 fijo (sin DST) — restamos 3h y leemos el mes en UTC. */
export function currentPeriod(now: Date = new Date()): string {
    const art = new Date(now.getTime() - 3 * 3600_000)
    const y = art.getUTCFullYear()
    const m = String(art.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
}

/** Período (primer día del mes) inmediatamente anterior a `period` ('AAAA-MM-DD').
 *  Se calcula sobre año/mes en aritmética entera, sin Date, para que ni la zona
 *  horaria ni el día del período corran el resultado de mes. */
export function periodoAnterior(period: string): string {
    const [y, m] = period.split('-').map(Number)
    const anio = m === 1 ? y - 1 : y
    const mes = m === 1 ? 12 : m - 1
    return `${anio}-${String(mes).padStart(2, '0')}-01`
}
