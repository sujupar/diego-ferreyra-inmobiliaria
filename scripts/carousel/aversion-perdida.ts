/**
 * Carrusel #1 — "Aversión a la pérdida" (5 slides).
 * Concepto: al vender, no importa el precio de publicación; importa cuánto te
 * queda en la mano. Cifra ilustrativa USD 16.000; testimonio representativo.
 *
 * Correr:
 *   node --env-file=.env.local --import tsx scripts/carousel/aversion-perdida.ts        (solo texto, fondos de marca)
 *   node --env-file=.env.local --import tsx scripts/carousel/aversion-perdida.ts --ai    (con escenas de Diego por IA)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { h, renderSlide, W, H, type El } from './render.ts';
import { generateScene, generateBackground, buildScenePrompt } from './openai-image.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, 'output');
const DIEGO_REF = join(REPO, 'fondo y foto diego', 'Foto Diego sin fondo.png');
const DIEGO_HEAD = join(REPO, 'public', 'pdf-assets', 'photos', 'Foto Diego.png');
const DIEGO_REFS = [DIEGO_HEAD, DIEGO_REF]; // headshot primero (cara clara) + cuerpo

// ---- Marca ----
const C = {
  navy: '#0d2d49',
  navyDeep: '#071b2e',
  green: '#00BF63',
  greenBright: '#15d67a',
  red: '#FF4D57', // pérdida sobre fondo oscuro
  redInk: '#E23744', // pérdida sobre fondo claro
  offwhite: '#f5f8fa',
  tinta: '#122334',
  onDark: '#cfdde8',
  onDarkSoft: '#93aabd',
};

const PAD = '108px 92px 96px';
const PAD_PANEL = '100px 52px 84px 80px'; // panel del layout partido

// ---- Piezas reutilizables ----
const eyebrow = (text: string, color = C.green): El =>
  h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 25, letterSpacing: 4, textTransform: 'uppercase', color } }, text);

const paginator = (n: number, light = false): El =>
  h('div', { style: { position: 'absolute', top: 74, right: 92, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 23, letterSpacing: 2, color: light ? '#9aacbb' : '#5f7a91' } }, `0${n} / 05`);

const logo = (text: string, dark = true): El =>
  h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
    h('div', { style: { width: 18, height: 18, borderRadius: 5, backgroundColor: C.green } }),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 25, letterSpacing: 1, color: dark ? '#eaf2f8' : C.navy } }, text),
  );

const footer = (opts: { logoText?: string; swipe?: boolean; dark?: boolean }): El => {
  const dark = opts.dark ?? true;
  return h('div', { style: { marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    logo(opts.logoText || 'DIEGO FERREYRA', dark),
    opts.swipe
      ? h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 22, letterSpacing: 1, color: dark ? C.onDarkSoft : '#8aa0b2' } }, 'Deslizá »')
      : null,
  );
};

// Fondo con escena IA (o degradado navy de fallback) + scrim para legibilidad del texto.
const darkBase = (children: El[], scene?: string): El => {
  const layers: El[] = [];
  const style: Record<string, any> = {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
    backgroundColor: C.navyDeep,
  };
  if (scene) {
    layers.push(h('img', { src: scene, style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' } }));
    layers.push(h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: 'linear-gradient(90deg, rgba(7,27,46,0.95) 0%, rgba(7,27,46,0.86) 40%, rgba(7,27,46,0.35) 72%, rgba(7,27,46,0.08) 100%)' } }));
  } else {
    style.backgroundImage = 'radial-gradient(120% 90% at 82% 8%, #12406b 0%, #0d2d49 46%, #071b2e 100%)';
  }
  return h('div', { style }, ...layers, ...children);
};

const lightBase = (children: El[]): El =>
  h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
      backgroundColor: C.offwhite,
      backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #eef3f7 100%)',
    },
  }, ...children);

const content = (children: El[]): El =>
  h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: PAD } }, ...children);

// Layout partido: panel de marca (izq) + Diego bien encuadrado (der) = "estructurado".
const splitSlide = (opts: { scene?: string; panel: El[]; page: number }): El =>
  h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'row', position: 'relative', backgroundColor: C.navyDeep } },
    h('div', { style: { width: '56%', height: '100%', display: 'flex', flexDirection: 'column', padding: PAD_PANEL, position: 'relative', backgroundImage: 'linear-gradient(155deg, #123f68 0%, #0d2d49 46%, #071b2e 100%)' } }, ...opts.panel),
    h('div', { style: { width: '44%', height: '100%', position: 'relative', display: 'flex', backgroundColor: C.navy } },
      opts.scene
        ? h('img', { src: opts.scene, style: { width: '100%', height: '100%', objectFit: 'cover' } })
        : h('div', { style: { width: '100%', height: '100%', backgroundImage: 'radial-gradient(120% 100% at 55% 18%, #12406b 0%, #0d2d49 60%, #071b2e 100%)' } }),
      h('div', { style: { position: 'absolute', top: 0, left: 0, width: '46%', height: '100%', backgroundImage: 'linear-gradient(90deg, #071b2e 0%, rgba(7,27,46,0) 100%)' } }),
    ),
    h('div', { style: { position: 'absolute', top: 68, right: 52, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 22, letterSpacing: 2, color: '#a9bccb' } }, `0${opts.page} / 05`),
  );

// Ícono monolínea SVG (para las infografías).
const svgIcon = (inner: string, color: string, size = 64): El => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`;
  return h('img', { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, style: { width: size, height: size } });
};
const starIcon = (color: string, size = 36): El => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${color}'><path d='M12 2l2.9 6.1 6.7.9-4.9 4.6 1.2 6.7L12 17.9 6.1 20.9l1.2-6.7L2.4 9.6 9.1 8.1z'/></svg>`;
  return h('img', { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, style: { width: size, height: size } });
};
const stars = (n: number, color: string): El =>
  h('div', { style: { display: 'flex', gap: 7 } }, ...Array.from({ length: n }, () => starIcon(color)));

// Íconos de las 4 fugas (representación visual — se entiende sin leer).
const ICON = {
  tag: `<path d='M20.5 13.4 12 21.9l-8.9-8.9V3.1h9.9z'/><circle cx='7.1' cy='7.1' r='1.2'/>`,
  clock: `<circle cx='12' cy='12' r='9'/><path d='M12 7.4V12l3.6 2.1'/>`,
  shield: `<path d='M12 3 5 5.4V11c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V5.4z'/><path d='M12 8.4v3.3'/><path d='M12 15.1v.2'/>`,
  hourglass: `<path d='M6 3h12M6 21h12'/><path d='M8 3v3.5l4 5 4-5V3'/><path d='M8 21v-3.5l4-5 4 5V21'/>`,
};

const leakCard = (iconKey: keyof typeof ICON, label: string): El =>
  h('div', { style: { width: '47.5%', display: 'flex', flexDirection: 'column', gap: 18, padding: '28px 26px', marginBottom: 24, backgroundColor: 'rgba(10,28,46,0.66)', borderRadius: 20, borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,90,100,0.32)' } },
    svgIcon(ICON[iconKey], '#FF7A82', 58),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 29, lineHeight: 1.18, color: '#ffffff' } }, label),
  );

// Layout cinematográfico: imagen conceptual full-bleed + scrim + contenido (no "plano").
const cinematicBase = (image: string | undefined, scrim: string, children: El[]): El =>
  h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: C.navyDeep } },
    image ? h('img', { src: image, style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: 'radial-gradient(120% 90% at 50% 20%, #12406b 0%, #0d2d49 55%, #071b2e 100%)' } }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: scrim } }),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: PAD } }, ...children),
  );
const spacer = (): El => h('div', { style: { display: 'flex', flex: 1 } });

// ---- Slides ----
function slide1(image?: string): El {
  return cinematicBase(image,
    'linear-gradient(0deg, rgba(6,20,34,0.97) 0%, rgba(6,20,34,0.82) 33%, rgba(6,20,34,0.34) 60%, rgba(6,20,34,0.10) 100%)',
    [
      paginator(1, true),
      spacer(),
      eyebrow('Lo que nadie te cuenta al vender', C.red),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 14 } },
        h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 33, letterSpacing: 3, color: '#ffffff' } }, 'CASI PERDIÓ'),
        h('div', { style: { display: 'flex', alignItems: 'flex-end', marginTop: 2 } },
          h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 54, color: C.red, marginRight: 13, marginBottom: 20 } }, 'USD'),
          h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 152, lineHeight: 1, color: C.red } }, '16.000'),
        ),
      ),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 58, lineHeight: 1.12, letterSpacing: -1, color: '#ffffff', marginTop: 10 } }, 'en la venta de su departamento.'),
      h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 33, lineHeight: 1.4, color: C.onDark, marginTop: 16 } }, 'Y no fue por el precio de venta.'),
      footer({ swipe: true }),
    ],
  );
}

function slide2(image?: string): El {
  return cinematicBase(image,
    'linear-gradient(180deg, rgba(6,20,34,0.96) 0%, rgba(6,20,34,0.8) 33%, rgba(6,20,34,0.42) 60%, rgba(6,20,34,0.14) 100%)',
    [
      paginator(2, true),
      eyebrow('El error más caro', C.greenBright),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 62, lineHeight: 1.1, letterSpacing: -1, color: '#ffffff', marginTop: 20 } }, 'El precio de venta no es lo que importa.'),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 50, lineHeight: 1.14, letterSpacing: -0.5, color: C.greenBright, marginTop: 16 } }, 'Importa cuánto te queda en la mano.'),
      h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 32, lineHeight: 1.5, color: C.onDark, marginTop: 24, maxWidth: 720 } }, 'Del precio de cierre salen comisiones, impuestos, gastos de escritura y honorarios. Lo único que cuenta es tu neto.'),
      spacer(),
      footer({ swipe: true }),
    ],
  );
}

function slide3(image?: string): El {
  return cinematicBase(image,
    'linear-gradient(180deg, rgba(6,20,34,0.9) 0%, rgba(6,20,34,0.88) 45%, rgba(6,20,34,0.94) 100%)',
    [
      paginator(3, true),
      eyebrow('Dónde se van los USD 16.000', C.red),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 56, lineHeight: 1.14, letterSpacing: -0.5, color: '#ffffff', marginTop: 22 } }, 'No se pierden en el precio. Se pierden acá:'),
      h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' } },
          leakCard('tag', 'No sabés a cuánto CIERRA tu zona'),
          leakCard('clock', 'Aceptás la primera oferta por apuro'),
          leakCard('shield', 'Escritura e impuestos sin blindar'),
          leakCard('hourglass', 'Vendés contra el reloj'),
        ),
      ),
      footer({ swipe: true }),
    ],
  );
}

function slide4(photo?: string): El {
  return darkBase([
    paginator(4, true),
    content([
      eyebrow('Lo que dicen los que ya vendieron', C.greenBright),
      h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%' } },
          h('div', { style: { width: 300, height: 392, borderRadius: 26, overflow: 'hidden', display: 'flex', flexShrink: 0, marginRight: 46, borderWidth: 3, borderStyle: 'solid', borderColor: 'rgba(21,214,122,0.55)' } },
            photo
              ? h('img', { src: photo, style: { width: '100%', height: '100%', objectFit: 'cover' } })
              : h('div', { style: { width: '100%', height: '100%', backgroundColor: '#16324c' } }),
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
            stars(5, C.greenBright),
            h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 42, lineHeight: 1.32, letterSpacing: -0.5, color: '#ffffff', marginTop: 22 } }, '“Vender es un proceso lleno de desconfianza. El resultado fue una experiencia segura y sin el estrés que tanto temíamos.”'),
            h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 30, color: '#ffffff', marginTop: 28 } }, 'Claudia'),
            h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 25, color: C.onDarkSoft, marginTop: 3 } }, 'Propietaria en CABA · testimonio real'),
          ),
        ),
      ),
      footer({ swipe: true }),
    ]),
  ]);
}

function slide5(scene?: string): El {
  return splitSlide({
    page: 5,
    scene,
    panel: [
      eyebrow('Antes de vender', C.greenBright),
      h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 54, lineHeight: 1.12, letterSpacing: -0.5, color: '#ffffff', marginTop: 20 } }, 'Sabé cuánto te queda realmente en la mano.'),
      h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 29, lineHeight: 1.42, color: C.onDark, marginTop: 18 } }, 'Análisis de precio estratégico con Diego Ferreyra.'),
      h('div', { style: { display: 'flex', marginTop: 30 } },
        h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 29, letterSpacing: 0.2, color: '#062416', backgroundColor: C.greenBright, padding: '26px 34px', borderRadius: 14 } }, 'Solicitá tu tasación'),
      ),
      footer({ logoText: 'DIEGO FERREYRA' }),
    ],
  });
}

// ---- Orquestación ----
// Imágenes CONCEPTUALES (representan la idea, no "fondo plano"). Sin personas, sin texto.
const CONCEPTS = {
  s1: [
    'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica, muy dramática y de alto impacto.',
    'Una mano masculina abierta de la que se escapan y vuelan varios billetes de cien dólares estadounidenses hacia la oscuridad;',
    'algunos billetes se desintegran en partículas de humo y ceniza al alejarse. Junto a la mano, una llave de una propiedad.',
    'Fondo azul marino muy oscuro (#0d2d49) con profundidad y viñeta. Iluminación de estudio dramática con un sutil resplandor rojo',
    'de alerta sobre los billetes que se pierden. La mitad INFERIOR del cuadro debe quedar oscura, limpia y despejada para superponer texto.',
    'Atmósfera de pérdida de dinero, urgencia, algo que se te escapa de las manos.',
    'Sin ningún texto, sin letras, sin números, sin logos, sin marcas de agua.',
  ].join(' '),
  s2: [
    'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica.',
    'Dos manos ahuecadas, en el centro-inferior del cuadro, sosteniendo con cuidado un pequeño fajo ordenado de billetes de dólar,',
    'iluminadas por una luz suave verde esmeralda que sugiere valor conservado y seguridad. Fondo azul marino oscuro y desenfocado con bokeh.',
    'La parte SUPERIOR del cuadro debe quedar oscura y despejada para superponer texto.',
    'Sensación de lo que realmente te queda en la mano, valor real, calma y control.',
    'Sin ningún texto, sin letras, sin logos, sin marcas de agua.',
  ].join(' '),
  s3: [
    'Imagen conceptual publicitaria, vertical 4:5, fotorrealista y cinematográfica, muy oscura y sobria.',
    'Billetes de dólar y monedas cayéndose y filtrándose lentamente hacia abajo a través de grietas en una superficie oscura,',
    'escapándose en la penumbra. Fondo azul marino casi negro (#071b2e). Luz muy tenue con un leve tinte rojo de alerta.',
    'La composición debe ser mayormente oscura y de bajo contraste, sin un foco central fuerte, para superponer una infografía encima.',
    'Sin ningún texto, sin letras, sin logos, sin marcas de agua.',
  ].join(' '),
};

// Diego SOLO en el cierre (S5): confianza para el llamado a la acción.
const SCENES = {
  slide5: buildScenePrompt({
    escena: 'una oficina inmobiliaria luminosa y cálida, desenfocada al fondo.',
    gesto: 'con expresión de confianza y cercanía, una sonrisa sobria y profesional, postura abierta',
    luz: 'luz cálida y envolvente, hora dorada suave entrando por ventanales',
    ladoSujeto: 'centro',
  }),
};

/** Compone la escena: fondo (IA) + Diego REAL (recorte) encima. 100% su cara. */
async function composeScene(bg: Buffer, cutoutPath: string, centerX: number, heightRatio: number): Promise<Buffer> {
  const bgR = await sharp(bg).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
  const targetH = Math.round(H * heightRatio);
  const cut = await sharp(cutoutPath).trim().resize({ height: targetH }).png().toBuffer();
  const cw = (await sharp(cut).metadata()).width || 0;
  const left = Math.round(centerX * W - cw / 2);
  const top = H - targetH;
  return sharp(bgR).composite([{ input: cut, left, top }]).png().toBuffer();
}

// Fondos SIN personas (para el modo --composite: Diego real se compone encima).
const BACKGROUNDS = {
  slide1: 'Interior de una oficina inmobiliaria moderna y elegante, completamente vacía, sin ninguna persona. Fuertemente desenfocada con bokeh suave. Paleta azul marino y neutros fríos, iluminación tenue, sobria y cinematográfica, con una zona más oscura a la izquierda del cuadro. Fotorrealista, formato vertical 4:5. Sin ningún texto, sin letras, sin logos, sin marcas de agua, sin personas.',
  slide5: 'Interior de una oficina inmobiliaria luminosa y cálida, completamente vacía, sin ninguna persona. Ventanales amplios con luz de hora dorada entrando, algunas plantas, fondo desenfocado con bokeh suave. Paleta cálida y acogedora. Fotorrealista, formato vertical 4:5. Sin ningún texto, sin letras, sin logos, sin marcas de agua, sin personas.',
};

async function main() {
  const mode = process.argv.includes('--composite') ? 'composite' : process.argv.includes('--ai') ? 'ai' : 'text';
  const refresh = process.argv.includes('--refresh-scenes');
  const scenes: Record<string, string | undefined> = {};
  const concepts: Record<string, string | undefined> = {};

  if (mode === 'ai') {
    // Imágenes CONCEPTUALES (sin personas) para S1, S2, S3.
    for (const key of ['s1', 's2', 's3'] as const) {
      const cache = join(OUT, `_concept-${key}.png`);
      try {
        let buf: Buffer;
        if (!refresh && existsSync(cache)) { buf = readFileSync(cache); console.log(`[concept] ${key} cache`); }
        else { console.log(`[concept] gen ${key}…`); buf = await generateBackground(CONCEPTS[key], { size: '1024x1536', quality: 'high' }); writeFileSync(cache, buf); }
        concepts[key] = `data:image/png;base64,${buf.toString('base64')}`;
      } catch (err) { console.warn(`[concept] ${key} FALLÓ → fondo marca. ${(err as Error).message}`); }
    }
    // Diego SOLO en el cierre (S5).
    const cache5 = join(OUT, '_ai-slide5.png');
    try {
      let buf: Buffer;
      if (!refresh && existsSync(cache5)) { buf = readFileSync(cache5); console.log('[ai] slide5 cache'); }
      else { console.log('[ai] gen slide5…'); buf = await generateScene({ prompt: SCENES.slide5, referencePaths: DIEGO_REFS, size: '1024x1536', quality: 'high' }); writeFileSync(cache5, buf); }
      scenes.slide5 = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (err) { console.warn(`[ai] slide5 FALLÓ → fondo marca. ${(err as Error).message}`); }
  } else if (mode === 'composite') {
    // Fondo IA (sin personas) + Diego REAL compuesto. Cara 100% fiel.
    const place = { slide1: { cx: 0.70, hr: 0.98 }, slide5: { cx: 0.70, hr: 0.98 } };
    for (const key of ['slide1', 'slide5'] as const) {
      const bgCache = join(OUT, `_bg-${key}.png`);
      try {
        let bg: Buffer;
        if (!refresh && existsSync(bgCache)) { bg = readFileSync(bgCache); console.log(`[comp] fondo ${key} cache`); }
        else { console.log(`[comp] gen fondo ${key}…`); bg = await generateBackground(BACKGROUNDS[key], { size: '1024x1536', quality: 'high' }); writeFileSync(bgCache, bg); }
        const scene = await composeScene(bg, DIEGO_REF, place[key].cx, place[key].hr);
        writeFileSync(join(OUT, `_scene-${key}.png`), scene);
        scenes[key] = `data:image/png;base64,${scene.toString('base64')}`;
        console.log(`[comp] ${key} compuesto ✓`);
      } catch (err) { console.warn(`[comp] ${key} FALLÓ → fondo marca. ${(err as Error).message}`); }
    }
  } else {
    console.log('[modo texto] sin escenas (--ai = Diego IA · --composite = Diego real sobre fondo IA)');
  }

  // Testimonio real: recorte del retrato de Claudia (foto de la landing).
  let claudia: string | undefined;
  try {
    const crop = await sharp(join(HERE, 'assets', 'testimonios', 'claudia.png'))
      .extract({ left: 52, top: 22, width: 340, height: 445 })
      .resize(600, 785, { fit: 'cover' })
      .png()
      .toBuffer();
    claudia = `data:image/png;base64,${crop.toString('base64')}`;
  } catch (err) {
    console.warn('[testim] claudia FALLÓ:', (err as Error).message);
  }

  const slides: Array<[string, El]> = [
    ['slide-1-gancho', slide1(concepts.s1)],
    ['slide-2-reencuadre', slide2(concepts.s2)],
    ['slide-3-desarrollo', slide3(concepts.s3)],
    ['slide-4-testimonio', slide4(claudia)],
    ['slide-5-llamado', slide5(scenes.slide5)],
  ];

  for (const [name, el] of slides) {
    const png = await renderSlide(el);
    const path = join(OUT, `${name}.png`);
    writeFileSync(path, png);
    console.log(`✓ ${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\nListo → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
