/**
 * Borrador local del asistente "Propiedad a Tasar".
 *
 * Auditoría del 2026-10-03 (B7): el borrador vivía en UNA clave global
 * (`propertyWizardDraft`) y el asistente lo restauraba en su propio efecto,
 * que corre ANTES que el efecto del padre que lo borraba (los efectos de un
 * hijo corren primero). Resultado: una "Nueva tasación" podía arrancar con la
 * dirección y las superficies de otra.
 *
 * Ahora el borrador es por proceso (dealId): solo se restaura el del MISMO
 * proceso, y el global viejo se descarta siempre. Nada depende del orden de
 * los efectos.
 */
export const CLAVE_BORRADOR_LEGACY = 'propertyWizardDraft'

export function claveDeBorrador(dealId: string | null | undefined): string | null {
    return dealId ? `${CLAVE_BORRADOR_LEGACY}:${dealId}` : null
}

type Almacen = Pick<Storage, 'getItem' | 'removeItem'>

/** Devuelve el borrador a restaurar, o null. Limpia lo que no corresponde. */
export function leerBorrador(
    almacen: Almacen,
    clave: string | null,
    hayDatosIniciales: boolean,
): Record<string, unknown> | null {
    almacen.removeItem(CLAVE_BORRADOR_LEGACY)
    if (!clave) return null
    if (hayDatosIniciales) {
        almacen.removeItem(clave)
        return null
    }
    const guardado = almacen.getItem(clave)
    if (!guardado) return null
    try {
        const valor: unknown = JSON.parse(guardado)
        if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, unknown>
    } catch { /* corrupto: se descarta abajo */ }
    almacen.removeItem(clave)
    return null
}
