/**
 * Historial que se le manda al modelo: los últimos mensajes que entran en un
 * presupuesto de caracteres. Sin resumen hecho por IA: sería una segunda
 * llamada dentro del mismo request (regla dura de CLAUDE.md).
 */
export interface MensajeDeHistorial { role: 'user' | 'assistant'; texto: string }

export function recortarHistorial<T extends MensajeDeHistorial>(mensajes: T[], maxCaracteres: number): T[] {
    const elegidos: T[] = []
    let usados = 0
    for (let i = mensajes.length - 1; i >= 0; i--) {
        const n = mensajes[i].texto.length
        if (usados + n > maxCaracteres) break
        elegidos.unshift(mensajes[i])
        usados += n
    }
    // El modelo espera que la conversación arranque con el usuario.
    while (elegidos.length && elegidos[0].role !== 'user') elegidos.shift()
    return elegidos
}
