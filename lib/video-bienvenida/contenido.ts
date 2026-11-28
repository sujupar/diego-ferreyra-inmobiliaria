/**
 * Todo lo que se LEE en la página del video de bienvenida (design.md D4). Cambiar un texto o el
 * video se hace acá, sin tocar la página.
 *
 * Cuando llegue el video editado: subirlo como `bienvenida/tasacion-v2.mp4`, cambiar `src`,
 * `poster` y `trackKey` a `-v2`, y marcar `bienvenida-tasacion-v1` como `retirada` en
 * lib/funnel/video-keys.ts (dos videos distintos no pueden compartir clave: se mezclaría su
 * retención). El nombre nuevo además evita que el CDN siga sirviendo el archivo viejo.
 */
import { funnelMediaUrl } from '@/lib/funnel/media'

export const CONTENIDO = {
  titular(nombre: string | null): string {
    const n = nombre?.trim()
    return n
      ? `${n}, lo que vale tu propiedad no es lo que te queda al venderla`
      : 'Lo que vale tu propiedad no es lo que te queda al venderla'
  },
  subtitulo:
    'Entre impuestos, costos y negociación se pueden ir miles de dólares. En este video, Diego te ' +
    'cuenta cómo una propietaria de Villa del Parque lo evitó y se quedó con USD 16.606 más en mano.',
  /** Lo concreto que se lleva de la tasación (valor). Se ve siempre, aunque no toque play. */
  valor: {
    titulo: 'Lo que te llevás de la tasación',
    items: [
      { titulo: 'El precio al que conviene salir', texto: 'Con propiedades comparables reales de tu zona, no con lo que piden los avisos.' },
      { titulo: 'Cuánto te queda en mano', texto: 'Lo que te queda después de impuestos, comisiones y gastos de la venta, antes de decidir nada.' },
      { titulo: 'Un plan para vender en tiempo', texto: 'Para no quedar meses publicado y terminar bajando el precio.' },
    ],
  },
  /** Referencias: testimonios REALES de `funnel_testimonials`, cada uno atado al miedo que resolvió.
   *  Los rótulos salen de lo que dice cada uno en su testimonio: no ponerles palabras que no dijeron. */
  referencias: {
    titulo: 'Propietarios que ya pasaron por esto',
    bajada: 'Tocá cada foto para ver su testimonio.',
    orden: ['claudia', 'federico', 'pablo'],
    miedo: {
      claudia: 'El miedo: la desconfianza y el estrés de vender',
      federico: 'El riesgo: quedar meses publicado',
      pablo: 'El desafío: vender dos para comprar una',
    } as Record<string, string>,
  },
  firma: { titulo: 'Te lo cuenta Diego Ferreyra', bajada: 'Un caso real, paso a paso' },
  video: {
    src: funnelMediaUrl('bienvenida/tasacion-v1.mp4'),
    poster: funnelMediaUrl('bienvenida/tasacion-v1-poster.jpg'),
    trackKey: 'bienvenida-tasacion-v1',
  },
  logo: funnelMediaUrl('raw/682c6cc8e10a088724d26be6.png'),
  paula: {
    nombre: 'Paula',
    telefonoE164: '+5491122926434',
    telefonoVisible: '+54 9 11 2292-6434',
  },
  quePasaAhora: {
    titulo: 'Qué pasa ahora',
    texto: 'Paula, de nuestro equipo, te va a llamar para coordinar la visita de tasación. Te llama desde este número:',
    nota: 'Guardalo, así cuando suene sabés que somos nosotros.',
    boton: 'Guardar el contacto de Paula',
  },
  whatsapp: {
    pregunta: '¿Preferís escribirnos?',
    boton: 'Escribinos por WhatsApp',
    // El número de la empresa (manda las plantillas): lo que escriba la persona entra al Inbox.
    url: `https://wa.me/5491139070865?text=${encodeURIComponent('Hola, ya vi el video. Quiero coordinar la tasación.')}`,
  },
  pie: 'Diego Ferreyra Inmobiliaria · CABA y Zona Norte',
  avisoEquipo: 'Vista del equipo: esta visita no se mide.',
} as const

/** Tarjeta de contacto (vCard 3.0) de Paula, para "Guardar el contacto". */
export function vcardDePaula(): string {
  const p = CONTENIDO.paula
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${p.nombre};;;`,
    `FN:${p.nombre} · Diego Ferreyra Inmobiliaria`,
    'ORG:Diego Ferreyra Inmobiliaria',
    `TEL;TYPE=CELL:${p.telefonoE164}`,
    'END:VCARD',
    '',
  ].join('\r\n')
}
