/** Período de datos de mercado = primer día del mes VIGENTE en Buenos Aires.
 *  ART es UTC-3 fijo (sin DST) — restamos 3h y leemos el mes en UTC. */
export function currentPeriod(now: Date = new Date()): string {
    const art = new Date(now.getTime() - 3 * 3600_000)
    const y = art.getUTCFullYear()
    const m = String(art.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
}
