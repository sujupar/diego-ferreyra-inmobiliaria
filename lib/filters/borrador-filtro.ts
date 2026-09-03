/**
 * La parte difícil de un control de filtro con espera (buscador, rango de
 * precio): cómo convive lo que la persona está escribiendo con el valor que
 * vuelve desde la barra de direcciones.
 *
 * Se separó del componente a propósito. Son tres reglas que se contradicen
 * entre sí y que un `useEffect` escrito de memoria resuelve mal:
 *
 *  1. El campo NO puede leerse directo de la dirección: la dirección se
 *     escribe con espera, así que el campo iría siempre atrasado y a los
 *     saltos. Por eso hay un borrador local.
 *  2. Pero el borrador tampoco puede ignorar la dirección: "Limpiar todo", el
 *     botón atrás y un link compartido cambian el filtro desde afuera, y el
 *     campo tiene que reflejarlo o queda mintiendo.
 *  3. Y lo que vuelve después de que uno mismo escribió NO es un cambio de
 *     afuera: es el eco propio, y para cuando llega la persona ya siguió
 *     tecleando. Adoptarlo le come letras.
 *
 * La versión ingenua de la regla 3 —"ignorá el valor si coincide con lo último
 * que mandé"— rompe el botón atrás: volver al mismo texto que uno había
 * buscado deja de funcionar para siempre. Por eso el eco se consume UNA sola
 * vez y, además, solo se reacciona cuando el valor externo efectivamente
 * CAMBIÓ (React puede volver a dibujar con la misma prop muchas veces).
 *
 * Es el mismo criterio del `valorPrevioRef` de `DateRangeFilter`, acá escrito
 * como función pura para poder probarlo.
 */

export interface EstadoBorrador {
    /** Lo que se ve en el control. */
    borrador: string
    /** El último valor externo ya procesado — sirve para detectar el cambio. */
    externoVisto: string
    /** Lo último que este control mandó hacia afuera; `null` si no hay eco pendiente. */
    ultimoEmitido: string | null
}

export const BORRADOR_INICIAL: EstadoBorrador = {
    borrador: '',
    externoVisto: '',
    ultimoEmitido: null,
}

/**
 * Decide qué mostrar cuando llega un valor desde afuera.
 *
 * Devuelve el MISMO objeto si no hay nada que hacer, así el componente puede
 * cortar el redibujo comparando por identidad.
 */
export function sincronizarBorrador(estado: EstadoBorrador, valorExterno: string): EstadoBorrador {
    // Nada cambió afuera: no tocar el borrador. Sin esto, cada redibujo con la
    // misma prop volvería a adoptar el valor externo y el campo sería inusable.
    if (valorExterno === estado.externoVisto) return estado

    // Es el eco de lo que mandamos nosotros: la persona ya siguió escribiendo.
    // Se consume (ultimoEmitido queda en null) para que un regreso POSTERIOR
    // al mismo texto —botón atrás— sí se adopte.
    if (valorExterno === estado.ultimoEmitido) {
        return { borrador: estado.borrador, externoVisto: valorExterno, ultimoEmitido: null }
    }

    // Cambio de afuera de verdad: "Limpiar todo", botón atrás, link compartido.
    return { borrador: valorExterno, externoVisto: valorExterno, ultimoEmitido: null }
}

/**
 * ¿Hay que avisar hacia afuera?
 *
 * Escribir una letra y borrarla deja el texto como estaba: eso no puede costar
 * un pedido al servidor ni una entrada nueva en el historial del navegador.
 *
 * `borrador` tiene que venir YA normalizado por quien llama (con el mismo
 * criterio con que se normaliza la dirección), o el eco no se reconoce.
 */
export function debeEmitir(borrador: string, valorAplicado: string): boolean {
    return borrador !== valorAplicado
}
