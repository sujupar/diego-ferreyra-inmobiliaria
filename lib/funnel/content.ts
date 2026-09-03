export const TASACION_CONTENT = {
  topbar: 'Exclusivo para Propietarios en CABA y Zona Norte',
  hero: {
    headline: 'Evita Perder un 20% del Valor de tu Propiedad por Errores Evitables',
    subhead:
      'La mayoría de los propietarios se enfoca en el "precio de venta". Nosotros nos enfocamos en cuánto te queda en mano. Descubrí cómo la mayoría pierde miles de dólares sin darse cuenta en impuestos evitables, IVA, gastos, comisiones y malas negociaciones.',
    videoPath: 'web/tasacion-hero-web.mp4',
    posterPath: 'web/tasacion-hero-poster.jpg',
  },
  benefits: [
    {
      title: 'Conocé el dinero que te quedará en mano',
      body: 'Calculamos el dinero que te quedará luego de vender tomando en cuenta el precio de cierre real de tu propiedad.',
    },
    {
      title: 'Evitá Costos Ocultos',
      body: 'Identificamos exactamente qué impuestos, gastos de escritura, IVA y comisiones podrías evitar.',
    },
    {
      title: 'Defendé tu Precio Máximo',
      body: 'Te entrego una tasación estratégica con datos reales para que conozcas el mejor precio de tu propiedad para este mercado.',
    },
  ],
  stat: {
    number: '91%',
    body: 'De nuestros clientes que solicitaron la Tasación Estratégica y aplican el método, venden su propiedad en un máximo de 60 días.',
  },
  testimonialsHeading: 'No Hablemos Nosotros. Que Hablen los Resultados.',
  cta: {
    label: 'SOLICITAR MI TASACIÓN GRATUITA',
    note: '100% Gratuito, Confidencial y Sin Compromiso.',
  },
  finalHeading:
    '¿Listo para conocer el mejor precio de tu propiedad y el dinero que te quedará en mano?',
  form: {
    title: 'Completá estos datos para coordinar tu tasación gratuita',
    subtitle: 'Te escribimos por WhatsApp en los próximos segundos.',
    submitLabel: 'Solicitar mi tasación gratuita',
    footnote: 'Coordinás el día y la hora por WhatsApp. Sin costo y sin compromiso.',
  },
} as const

/**
 * Variante B del embudo de tasación — "La Tasación Neta".
 *
 * Sale del método de ofertas trabajado con el dueño (docs/oferta/): promesa
 * X-en-Y-sin-Z, el precio al que NO se vende como diferencial, y el caso real
 * con cifras como prueba. La estructura de la página emula una VSL de dos pasos:
 * el video es el centro y el resto solo lo sostiene.
 *
 * OJO con `heroAmountBefore`/`heroAmountAfter`: son cifras de una operación real
 * y van arriba de todo. Si cambian, tienen que cambiar también en el guion del
 * video, o la página y el video se contradicen a los 20 segundos.
 */
export const TASACION_B_CONTENT = {
  hero: {
    headlineA: 'No es cuánto pedís por tu propiedad.',
    headlineB: 'Es cuánto te queda el día que escriturás.',
    highlight: 'cuánto te queda',
    subhead:
      'En 72 horas te entregamos el plan completo de tu venta: a cuánto se vende de verdad, a cuánto no se vende, y cuánta plata te queda limpia después de impuestos, IVA, escritura y honorarios.',
    heroAmountBefore: 'US$221.000',
    heroAmountAfter: 'US$237.600',
    credit:
      'Con el mismo método con el que un propietario que iba a quedarse con {antes} terminó con {despues} — por la misma propiedad, con la misma reserva.',
    videoPath: 'web/tasacion-hero-web.mp4',
    posterPath: 'web/tasacion-hero-poster.jpg',
  },
  qualifier: {
    lead: '*Pedila solamente si',
    body: 'sos el propietario (o uno de los propietarios) y la propiedad está en CABA o Zona Norte. No hace falta que tengas fecha para vender: si lo estás pensando, este es el momento de saber los números.',
  },
  cta: {
    label: 'SOLICITAR MI TASACIÓN GRATUITA',
    note: '100% gratuito, confidencial y sin compromiso. Te escribimos por WhatsApp en los próximos minutos.',
    noteShort: '100% gratuito, confidencial y sin compromiso.',
  },
  testimonialsHeading: 'Algunos de nuestros casos',
  finalHeading: 'Antes de publicar tu propiedad, sabé con cuánto te vas a quedar.',
  form: {
    title: 'Completá estos datos para coordinar tu tasación',
    subtitle: 'Te escribimos por WhatsApp en los próximos segundos.',
    submitLabel: 'Solicitar mi tasación gratuita',
    footnote: 'Coordinás el día y la hora por WhatsApp. Sin costo y sin compromiso.',
  },
} as const

export const CLASE_CONTENT = {
  topbar: 'Esta página es solo para propietarios de CABA y Zona Norte',
  badge: 'CLASE GRATUITA',
  hero: {
    headline:
      'El método probado para vender tu propiedad al MEJOR Precio de Mercado en Menos de 30 Días.',
    subhead:
      'Accedé a la clase gratuita donde te revelo el plan exacto para atraer compradores calificados y cerrar una venta segura, incluso con un mercado tan complejo.',
    videoPath: 'web/clase-vsl-web.mp4',
    posterPath: 'raw/689e7d20f20a61e8e7ecf499.png',
    soundHint: 'Activá el sonido',
  },
  cta: { label: '¡Ver Clase GRATIS!', note: 'Clase 100% Virtual' },
  socialProofHeading:
    'Ayudamos a cientos de dueños a vender al mejor precio, sin estrés y en tiempo récord.',
  bio: {
    heading: '¿Quién Soy?',
    headshotPath: 'raw/68669289ec92f406df0238d6.png',
    name: 'Diego Ferreyra',
    role: 'Martillero Público — CUCICBA 8266',
  },
  form: {
    heading: 'Registrate a la Clase Gratuita',
    subtitle:
      'Ingresá tus datos y accedé ya a la clase: el método paso a paso para vender tu propiedad al mejor precio y en menos de 30 días.',
    submitLabel: '¡Ver Clase GRATIS!',
    tipoClienteLabel: 'Soy...',
    tipoClienteOptions: ['Trabajo en el sector', 'Soy Propietario/a'] as const,
  },
} as const

export const BRAND = {
  logoPath: 'raw/682c6cc8e10a088724d26be6.png',
  footer: 'Inmobiliaria Diego Ferreyra — Todos los derechos reservados.',
  navy: '#0d2d49',
  green: '#00BF63',
} as const
