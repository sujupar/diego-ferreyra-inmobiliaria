/**
 * Carrusel #3 — "No es momento de vender" (estructura objeción + dato).
 * Objeción (hook) → El dato → Reencuadre → Testimonio real (Federico) → CTA (Diego).
 *
 * Correr: node --env-file=.env.local --import tsx scripts/carousel/momento-vender.ts --ai
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { h, type El } from './render.ts';
import { C, eyebrow, footer, paginator, splitSlide, cinematicBase, darkBase, content, spacer, stars, SCRIM } from './kit.ts';
import { buildScenePrompt } from './openai-image.ts';
import { parseMode, ensureDir, genConcepts, genDiego, cropPortrait, renderAll } from './runner.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = ensureDir(join(HERE, 'output', 'momento'));
const DIEGO_REFS = [join(REPO, 'public', 'pdf-assets', 'photos', 'Foto Diego.png'), join(REPO, 'fondo y foto diego', 'Foto Diego sin fondo.png')];
const FEDERICO = join(HERE, 'assets', 'testimonios', 'federico.png');

const CONCEPTS = {
  s1: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Una mano masculina dudando en el aire, a punto de tomar la llave de una propiedad que descansa sobre una mesa oscura, pero deteniéndose; atmósfera de indecisión, duda y freno. Fondo azul marino muy oscuro (#0d2d49), luz dramática y sobria. La MITAD INFERIOR del cuadro oscura y despejada para texto. Sin ningún texto legible, sin letras, sin logos, sin marcas de agua.',
  s2: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Vista elegante de los edificios modernos de Buenos Aires al anochecer, con muchas ventanas iluminadas de luz cálida, transmitiendo una ciudad viva y un mercado inmobiliario activo y en movimiento; sutil energía ascendente. Tonos azul marino profundo con acentos verdes. La MITAD SUPERIOR del cuadro más oscura y despejada para texto. Sin ningún texto legible, sin gráficos con números, sin letras, sin logos, sin marcas de agua.',
  s3: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Un reloj de arena de vidrio casi vacío junto a la llave de una propiedad, sobre una superficie oscura y elegante, con una luz dramática lateral que marca el paso del tiempo que se agota. Fondo azul marino muy oscuro. La MITAD INFERIOR del cuadro oscura y despejada para texto. Sin ningún texto legible, sin letras, sin logos, sin marcas de agua.',
};

const DIEGO = {
  s5: buildScenePrompt({
    escena: 'una oficina inmobiliaria luminosa y moderna, desenfocada al fondo.',
    gesto: 'con expresión decidida y confiable, una sonrisa sobria, postura firme y abierta',
    luz: 'luz clara y envolvente, tono cálido',
    ladoSujeto: 'centro',
  }),
};

// ---- Slides ----
function slide1(image?: string): El {
  return cinematicBase(image, SCRIM.bottom, [
    paginator(1, 5, true),
    spacer(),
    eyebrow('La frase que te frena', C.red),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 66, lineHeight: 1.1, letterSpacing: -1, color: '#ffffff', marginTop: 12 } }, '“No es momento de vender.”'),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 44, lineHeight: 1.15, letterSpacing: -0.5, color: C.red, marginTop: 16 } }, 'Es la excusa más cara.'),
    footer({ swipe: true }),
  ]);
}

function slide2(image?: string): El {
  return cinematicBase(image, SCRIM.top, [
    paginator(2, 5, true),
    eyebrow('El dato que no te cuentan', C.greenBright),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 62, lineHeight: 1.1, letterSpacing: -1, color: '#ffffff', marginTop: 20 } }, 'Mientras dudás, el mercado se mueve.'),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 46, lineHeight: 1.16, letterSpacing: -0.5, color: C.greenBright, marginTop: 16 } }, 'La demanda de compradores reales no espera.'),
    h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 32, lineHeight: 1.5, color: C.onDark, marginTop: 24, maxWidth: 760 } }, 'Los que compran hoy en tu zona no van a estar cuando llegue tu “momento perfecto”.'),
    spacer(),
    footer({ swipe: true }),
  ]);
}

function slide3(image?: string): El {
  return cinematicBase(image, SCRIM.bottom, [
    paginator(3, 5, true),
    spacer(),
    eyebrow('La verdad incómoda', C.red),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 60, lineHeight: 1.1, letterSpacing: -1, color: '#ffffff', marginTop: 12 } }, 'El “momento perfecto” no existe.'),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 44, lineHeight: 1.16, letterSpacing: -0.5, color: C.greenBright, marginTop: 16 } }, 'Lo que cambia el resultado es la estrategia, no el timing.'),
    h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 32, lineHeight: 1.45, color: C.onDark, marginTop: 18, maxWidth: 780 } }, 'El que espera el mercado ideal llega tarde y vende peor.'),
    footer({ swipe: true }),
  ]);
}

function slide4(photo?: string): El {
  return darkBase([
    paginator(4, 5, true),
    content([
      eyebrow('Los que no esperaron', C.greenBright),
      h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%' } },
          h('div', { style: { width: 300, height: 392, borderRadius: 26, overflow: 'hidden', display: 'flex', flexShrink: 0, marginRight: 46, borderWidth: 3, borderStyle: 'solid', borderColor: 'rgba(21,214,122,0.55)' } },
            photo ? h('img', { src: photo, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { width: '100%', height: '100%', backgroundColor: '#16324c' } }),
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
            stars(5, C.greenBright),
            h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 40, lineHeight: 1.32, letterSpacing: -0.5, color: '#ffffff', marginTop: 22 } }, '“Vendimos 3 propiedades: la primera en 5 días, la segunda en 15, y la más difícil en solo 25.”'),
            h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 30, color: '#ffffff', marginTop: 26 } }, 'Federico'),
            h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 25, color: C.onDarkSoft, marginTop: 3 } }, 'Propietario en Zona Norte · testimonio real'),
          ),
        ),
      ),
      footer({ swipe: true }),
    ]),
  ]);
}

function slide5(image?: string): El {
  return splitSlide({
    page: 5,
    scene: image,
    panel: [
      eyebrow('El mejor momento', C.greenBright),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 56, lineHeight: 1.12, letterSpacing: -0.5, color: '#ffffff', marginTop: 20 } }, 'No esperes el momento. Creá el momento.'),
      h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 29, lineHeight: 1.42, color: C.onDark, marginTop: 18 } }, 'Empezá con una tasación estratégica de Diego Ferreyra.'),
      h('div', { style: { display: 'flex', marginTop: 30 } },
        h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 29, letterSpacing: 0.2, color: '#062416', backgroundColor: C.greenBright, padding: '26px 34px', borderRadius: 14 } }, 'Solicitá tu tasación'),
      ),
      footer({ logoText: 'DIEGO FERREYRA' }),
    ],
  });
}

async function main() {
  const { mode, refresh } = parseMode();
  const concepts = mode === 'ai' ? await genConcepts(CONCEPTS, OUT, refresh) : {};
  const diego = mode === 'ai' ? await genDiego(DIEGO, DIEGO_REFS, OUT, refresh) : {};
  const federico = await cropPortrait(FEDERICO, { left: 70, top: 35, width: 380, height: 605 });

  const slides: Array<[string, El]> = [
    ['slide-1-objecion', slide1(concepts.s1)],
    ['slide-2-dato', slide2(concepts.s2)],
    ['slide-3-reencuadre', slide3(concepts.s3)],
    ['slide-4-testimonio', slide4(federico)],
    ['slide-5-cta', slide5(diego.s5)],
  ];

  await renderAll(slides, OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
