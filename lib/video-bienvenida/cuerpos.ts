/**
 * El texto que se le PIDE a Meta para las plantillas con video (design.md D1). Lo usa
 * `scripts/create-whatsapp-template-tasacion-video.ts` para crearlas.
 *
 * NO es lo que muestra el Inbox: eso sale de `cuerpos-aprobados.ts`, generado desde Meta con
 * `scripts/sincronizar-cuerpos-plantillas.ts` una vez aprobadas. Un test compara las dos cosas
 * cuando la aprobada ya está sincronizada, para que nadie edite una sin la otra.
 *
 * `{{1}}` nombre de pila · `{{2}}` enlace completo (`https://inmodf.com.ar/t/<código>`).
 * El botón "Ver el video" va a `https://inmodf.com.ar/t/{{1}}` con el código.
 * Cierra con Paula y su número: decisión del dueño (2026-11-27). Lo lee todo el que recibe el
 * mensaje aunque no abra la página, y ata el mensaje a la solicitud (ayuda a quedar en UTILIDAD).
 */

export const CUERPOS_PEDIDOS: Record<'tasacion_video_ahorro_v1' | 'tasacion_video_caso_v1' | 'tasacion_video_sobria_v1', string> = {
  // Texto final del dueño (2026-11-28). Cierra con la firma porque Meta rechaza un cuerpo que
  // TERMINA en una variable, y el enlace es la última idea del mensaje.
  tasacion_video_ahorro_v1:
    'Hola {{1}}, recibimos tu solicitud de tasación.\n' +
    'Paula, desde el +54 9 11 2292-6434, te llamará para coordinar.\n\n' +
    'Si te interesa ahorrar miles de dólares en impuestos y costos, mirá este video corto:\n' +
    '{{2}}\n\n' +
    'Diego Ferreyra Inmobiliaria',
  tasacion_video_caso_v1:
    'Hola {{1}}, recibimos tu solicitud de tasación.\n\n' +
    'Antes de coordinar la visita, mirá este caso: la dueña de una casa terminó con USD 16.606 más en mano por cómo se publicó, cómo se negoció y cómo se calcularon los impuestos de la venta.\n\n' +
    'Diego te lo cuenta acá: {{2}}\n\n' +
    'Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar.',
  tasacion_video_sobria_v1:
    'Hola {{1}}, recibimos tu solicitud de tasación.\n\n' +
    'Antes de coordinar la visita, Diego Ferreyra te comparte un video donde cuenta, con un caso real, cómo trabajamos la venta de una propiedad.\n\n' +
    'Lo ves acá: {{2}}\n\n' +
    'Te va a llamar Paula desde el +54 9 11 2292-6434 para coordinar.',
}

export const TEXTO_DEL_BOTON = 'Ver el video'
/** Meta exige que la parte variable vaya al final de la URL del botón. */
export const URL_DEL_BOTON = 'https://inmodf.com.ar/t/{{1}}'
