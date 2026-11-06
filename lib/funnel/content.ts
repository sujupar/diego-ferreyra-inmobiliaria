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
    // El día y la hora se coordinan POR TELÉFONO desde el corte del 2026-08-27:
    // el primer WhatsApp (plantilla `tasacion_llamada_v1`) avisa que llama el
    // equipo y ya no pregunta nada. Prometer acá que se coordina por chat sería
    // mentirle a la persona antes de que llegue el mensaje.
    //
    // Este texto se activa con el DEPLOY, y la plantilla nueva con la env var
    // `WHATSAPP_TEMPLATE_TASACION` en Netlify. Entre una cosa y la otra hay una
    // ventana en la que la landing ya dice "te llamamos" y el WhatsApp todavía
    // pregunta por chat: hay que cambiar la env var apenas termine el deploy.
    // (No es contradictorio —la plantilla vieja ofrece "Prefiero que me llamen"—
    // pero sí menos preciso.)
    footnote: 'Te llamamos para coordinar el día y la hora. Sin costo y sin compromiso.',
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
    // Textos del documento "Cambios en Landing" que pidió Diego (2026-11-06).
    // Cada uno con su porqué está en `content-landing-b.test.ts`.
    // Copete: abre una pregunta ("¿qué número?") en vez de anunciar la pérdida.
    kicker: 'Antes de vender, hay un número más importante que el precio de publicación',
    headlineA: 'No es cuánto publicás tu propiedad.',
    headlineB: 'Es cuánto te queda en mano el día que escriturás.',
    // Tiene que aparecer literal al principio de `headlineB` (después de "Es "):
    // el componente parte la línea por este texto para pintarlo de azul.
    highlight: 'cuánto te queda en mano',
    // Sin "impuestos que se podían evitar": sonaba a que siempre se pueden evitar.
    // Sin la promesa de los 3 números en 72 horas: la sacó el dueño (2026-11-06).
    subhead:
      'La mayoría mira solo el precio de publicación. Pero entre la negociación, impuestos, IVA, escritura y honorarios, podés terminar recibiendo miles de dólares menos.',
    heroAmountBefore: 'US$221.000',
    heroAmountAfter: 'US$237.600',
    // Contraste directo. Antes decía "con la misma reserva", que no coincide con
    // el caso que cuenta el video (235.000 de oferta contra 247.500 de reserva).
    credit:
      'Misma propiedad. Mismo precio de publicación. {antes} vs. {despues} en mano. Una diferencia de US$16.600.',
    // Archivos PROPIOS, distintos a los de la variante A y a los del VSL largo
    // (`tasacion-neta-vsl-web.mp4`, que queda en Storage sin uso). Reemplazar un
    // archivo compartido cambia dos páginas a la vez sin que nada avise.
    videoPath: 'web/tasacion-neta-vsl-corto-web.mp4',
    posterPath: 'web/tasacion-neta-vsl-corto-poster.jpg',
  },
  qualifier: {
    lead: '*Pedila si',
    body: 'sos propietario —o uno de los propietarios— de una propiedad en CABA o Zona Norte. No necesitás tener decidido vender. Si lo estás evaluando, conocer estos números es una decisión inteligente.',
  },
  cta: {
    // El botón de debajo del video pide EL NÚMERO, que es la categoría propia de
    // la oferta; "tasación gratuita" la ofrecen todas las inmobiliarias.
    label: 'QUIERO SABER CUÁNTO ME QUEDA',
    // Sin "te escribimos en los próximos minutos": no se puede prometer siempre.
    note: 'Tasación profesional + simulación de costos. Gratis, confidencial y sin compromiso.',
    labelFinal: 'SOLICITAR MI TASACIÓN PROFESIONAL',
    noteShort: 'Tasación profesional + simulación de costos. Sin costo y sin compromiso.',
  },
  testimonialsHeading: 'Algunos de nuestros casos',
  finalHeading: 'Antes de elegir precio o inmobiliaria, sabé cuánto te va a quedar en mano.',
  footerRole: 'Martillero Público · CUCICBA 8266 · CMCPSI 7217',
  form: {
    // Alineado con el documento de Diego (2026-11-06): la misma promesa que la
    // página ("cuánto te queda en mano"), el mismo botón que el final, y sin
    // prometer tiempos de respuesta.
    title: 'Completá tus datos para saber cuánto te queda en mano',
    subtitle: 'Te escribimos por WhatsApp y te llamamos para coordinar la tasación.',
    submitLabel: 'Solicitar mi tasación profesional',
    // Decía "Coordinás el día y la hora por WhatsApp", pero desde el 2026-08-27 se
    // coordina POR TELÉFONO (ver el comentario del formulario de la variante A):
    // le prometía a la persona algo que no iba a pasar.
    footnote: 'Te llamamos para coordinar el día y la hora. Tasación profesional + simulación de costos, sin costo y sin compromiso.',
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
