'use client'

import { useEffect, useRef, useState } from 'react'
import {
    BORRADOR_INICIAL,
    debeEmitir,
    debeEmitirTrasEspera,
    sincronizarBorrador,
    type EstadoBorrador,
} from '@/lib/filters/borrador-filtro'

/**
 * Un control de filtro que escribe en la barra de direcciones DESPUÉS de que
 * la persona dejó de tipear.
 *
 * Existe porque el buscador y las dos puntas del rango de precio necesitan
 * exactamente lo mismo, y son tres lugares donde el mismo error sutil se
 * repetiría copiado y pegado.
 *
 * Toda la lógica de cuándo pisar el campo y cuándo no vive en
 * `lib/filters/borrador-filtro.ts` (función pura, con pruebas). Acá solo queda
 * el temporizador y el estado de React.
 */
const ESPERA_POR_DEFECTO_MS = 300

export interface OpcionesBorrador {
    /** El valor que rige hoy (el que está en la dirección). */
    value: string
    /** Se llama con el valor YA normalizado cuando corresponde aplicarlo. */
    onChange: (valor: string) => void
    /**
     * Misma normalización que aplica la pantalla al escribir la dirección. Es
     * obligatoria para que el eco se reconozca: si acá se emite `"almagro "` y
     * la dirección guarda `"almagro"`, lo que vuelve no coincide con lo que se
     * mandó, se toma por un cambio de afuera y pisa el campo mientras la
     * persona escribe.
     */
    normalizar?: (valor: string) => string
    esperaMs?: number
}

export function useBorradorConEspera({
    value,
    onChange,
    normalizar = v => v,
    esperaMs = ESPERA_POR_DEFECTO_MS,
}: OpcionesBorrador) {
    const [estado, setEstado] = useState<EstadoBorrador>(() =>
        sincronizarBorrador(BORRADOR_INICIAL, value),
    )

    // Ajuste del estado DURANTE el render (patrón documentado de React para
    // "props que cambian"). `sincronizarBorrador` devuelve el mismo objeto
    // cuando no hay nada que hacer, así que esto siempre termina.
    const sincronizado = sincronizarBorrador(estado, value)
    if (sincronizado !== estado) setEstado(sincronizado)

    // Lo que el temporizador necesita leer CUANDO SE DISPARA, no cuando se
    // programó. Sin los refs, la espera arrastraría un `value` viejo y podría
    // aplicar un filtro que ya no corresponde, o reiniciarse en cada render del
    // padre (que crea un `onChange` nuevo cada vez).
    const onChangeRef = useRef(onChange)
    const valueRef = useRef(value)
    const normalizarRef = useRef(normalizar)
    onChangeRef.current = onChange
    valueRef.current = value
    normalizarRef.current = normalizar

    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

    function cancelar() {
        if (temporizador.current !== null) {
            clearTimeout(temporizador.current)
            temporizador.current = null
        }
    }

    // Un temporizador vivo después de desmontar avisaría a un componente que ya
    // no está.
    useEffect(() => cancelar, [])

    function emitir(texto: string, valorAlProgramar?: string) {
        cancelar()
        // Lo que quedó esperando puede haber envejecido: ver
        // `debeEmitirTrasEspera`. Sin esto, escribir y tocar "Limpiar todo"
        // hacía que la espera venciera después y volviera a aplicar el texto,
        // deshaciendo la limpieza sola.
        if (!debeEmitirTrasEspera(valorAlProgramar, valueRef.current)) return
        const limpio = normalizarRef.current(texto)
        if (!debeEmitir(limpio, valueRef.current)) return
        setEstado(e => ({ ...e, ultimoEmitido: limpio }))
        onChangeRef.current(limpio)
    }

    return {
        /** Lo que va en el `value` del input. */
        borrador: sincronizado.borrador,
        /** Cada tecla: actualiza el campo y reinicia la espera. */
        escribir(texto: string) {
            setEstado(e => ({ ...e, borrador: texto }))
            cancelar()
            // Se anota contra QUÉ filtro se armó la espera. Al vencer, si el
            // filtro ya es otro, lo pendiente se descarta.
            const valorAlProgramar = valueRef.current
            temporizador.current = setTimeout(() => emitir(texto, valorAlProgramar), esperaMs)
        },
        /** Enter o "limpiar": aplica sin esperar. */
        aplicarYa(texto?: string) {
            emitir(texto ?? sincronizado.borrador)
        },
        /** Vacía el campo y lo aplica en el acto. */
        limpiar() {
            setEstado(e => ({ ...e, borrador: '' }))
            emitir('')
        },
    }
}
