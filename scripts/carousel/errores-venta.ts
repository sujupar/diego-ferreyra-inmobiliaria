/**
 * Carrusel #2 — "Los 3 errores que te cuestan la venta" (estructura educativa).
 * Gancho (3 errores) → Error 1 → Error 2 → Error 3 → CTA (Diego).
 *
 * Correr: node --env-file=.env.local --import tsx scripts/carousel/errores-venta.ts --ai
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { h, type El } from './render.ts';
import { C, eyebrow, footer, paginator, splitSlide, cinematicBase, spacer, SCRIM } from './kit.ts';
import { buildScenePrompt } from './openai-image.ts';
import { parseMode, ensureDir, genConcepts, genDiego, renderAll } from './runner.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = ensureDir(join(HERE, 'output', 'errores'));
const DIEGO_REFS = [join(REPO, 'public', 'pdf-assets', 'photos', 'Foto Diego.png'), join(REPO, 'fondo y foto diego', 'Foto Diego sin fondo.png')];

// ---- Imágenes conceptuales (representan cada idea) ----
const CONCEPTS = {
  s1: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Un cartel de "EN VENTA" torcido frente a un elegante edificio de departamentos moderno al atardecer, con un cielo dramático de tinte rojizo y nubes densas. Atmósfera de una venta estancada, algo que salió mal. Fondo y penumbra en tonos azul marino muy oscuro (#0d2d49). La MITAD INFERIOR del cuadro debe quedar oscura, limpia y despejada para superponer texto. Sin ningún texto legible, sin letras, sin logos, sin marcas de agua.',
  s2: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Una etiqueta de precio física, enorme y desproporcionada, colgando con un hilo sobre una pequeña y elegante maqueta de un departamento, sugiriendo un precio inflado y fuera de lugar. Fondo azul marino muy oscuro con luz dramática de estudio. La MITAD INFERIOR del cuadro oscura y despejada para texto. Sin ningún texto legible, sin números, sin letras, sin logos, sin marcas de agua.',
  s3: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Un cartel de "EN VENTA" viejo, descolorido y cubierto de polvo y telarañas, plantado frente a una propiedad, bajo una luz fría, gris y solitaria, transmitiendo el paso del tiempo y el abandono. Fondo en tonos azul marino oscuro y desaturado. La MITAD INFERIOR del cuadro oscura y despejada para texto. Sin ningún texto legible, sin letras, sin logos, sin marcas de agua.',
  s4: 'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica. Un grupo de personas curiosas recorriendo distraídamente un departamento en venta, mirando sin verdadero interés de compra, algunas revisando el teléfono, sensación de tiempo perdido y desorden. Luz interior neutra y desangelada, tonos fríos azul marino. La MITAD INFERIOR del cuadro más oscura y despejada para texto. Sin ningún texto legible, sin letras, sin logos, sin marcas de agua.',
};

const DIEGO = {
  s5: buildScenePrompt({
    escena: 'una oficina inmobiliaria luminosa y profesional, desenfocada al fondo.',
    gesto: 'con expresión serena y confiable, una leve sonrisa profesional, postura firme',
    luz: 'luz suave y clara, tono neutro-cálido',
    ladoSujeto: 'centro',
  }),
};

// ---- Slides ----
function slide1(image?: string): El {
  return cinematicBase(image, SCRIM.bottom, [
    paginator(1, 5, true),
    spacer(),
    eyebrow('Propietario, prestá atención', C.red),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 96, lineHeight: 1, letterSpacing: -1, color: C.red, marginTop: 12 } }, '3 ERRORES'),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 56, lineHeight: 1.12, letterSpacing: -1, color: '#ffffff', marginTop: 10 } }, 'que te cuestan miles de dólares al vender.'),
    h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 33, lineHeight: 1.4, color: C.onDark, marginTop: 16 } }, 'El precio no es el problema. Estos 3 sí.'),
    footer({ swipe: true }),
  ]);
}

function errorSlide(page: number, image: string | undefined, nro: string, titulo: string, cuerpo: string): El {
  return cinematicBase(image, SCRIM.bottom, [
    paginator(page, 5, true),
    spacer(),
    eyebrow(`Error 0${nro}`, C.red),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 62, lineHeight: 1.1, letterSpacing: -1, color: '#ffffff', marginTop: 12 } }, titulo),
    h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 34, lineHeight: 1.45, color: C.onDark, marginTop: 18, maxWidth: 780 } }, cuerpo),
    footer({ swipe: true }),
  ]);
}

function slide5(image?: string): El {
  return splitSlide({
    page: 5,
    scene: image,
    panel: [
      eyebrow('La forma correcta', C.greenBright),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 54, lineHeight: 1.12, letterSpacing: -0.5, color: '#ffffff', marginTop: 20 } }, 'Empezá bien: con una tasación profesional.'),
      h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 29, lineHeight: 1.42, color: C.onDark, marginTop: 18 } }, 'Precio al que realmente se cierra, con estrategia y sin errores.'),
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

  const slides: Array<[string, El]> = [
    ['slide-1-gancho', slide1(concepts.s1)],
    ['slide-2-error1', errorSlide(2, concepts.s2, '1', 'Tasás con la emoción, no con datos.', 'Le ponés el precio que “sentís” que vale, no al que se está cerrando en tu zona.')],
    ['slide-3-error2', errorSlide(3, concepts.s3, '2', 'Publicás caro “por las dudas”.', 'El aviso se queda parado, se quema, y los compradores que sí pagan empiezan a desconfiar.')],
    ['slide-4-error3', errorSlide(4, concepts.s4, '3', 'No filtrás a los curiosos.', 'Tu casa se llena de gente que mira, opina y no compra. Perdés tiempo, energía y el mejor comprador.')],
    ['slide-5-cta', slide5(diego.s5)],
  ];

  await renderAll(slides, OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
