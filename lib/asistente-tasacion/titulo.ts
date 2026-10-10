/** Título de un hilo a partir de la primera pregunta (sin IA). */
const MAX = 60

export function tituloDelHilo(primeraPregunta: string): string {
    const t = primeraPregunta.replace(/\s+/g, ' ').trim()
    if (!t) return 'Consulta con adjuntos'
    if (t.length <= MAX) return t
    const corte = t.slice(0, MAX)
    const ultimoEspacio = corte.lastIndexOf(' ')
    return `${(ultimoEspacio > 20 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`
}
