/**
 * Kit de diseño compartido de los carruseles (sistema de marca + layouts).
 * Cada carrusel (aversion-perdida, errores-venta, momento-vender…) importa de acá,
 * así todos comparten identidad. Es la base de las "plantillas" de la Fase 1.
 */
import { h, type El } from './render.ts';

// ---- Marca ----
export const C = {
  navy: '#0d2d49',
  navyDeep: '#071b2e',
  green: '#00BF63',
  greenBright: '#15d67a',
  red: '#FF4D57', // pérdida / error sobre fondo oscuro
  redInk: '#E23744', // pérdida sobre fondo claro
  offwhite: '#f5f8fa',
  tinta: '#122334',
  onDark: '#cfdde8',
  onDarkSoft: '#93aabd',
};

export const PAD = '108px 92px 96px';
export const PAD_PANEL = '100px 52px 84px 80px';

// ---- Piezas reutilizables ----
export const eyebrow = (text: string, color = C.green): El =>
  h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 25, letterSpacing: 4, textTransform: 'uppercase', color } }, text);

export const paginator = (n: number, total = 5, light = false): El =>
  h('div', { style: { position: 'absolute', top: 68, right: 92, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 23, letterSpacing: 2, color: light ? '#9aacbb' : '#5f7a91' } }, `0${n} / 0${total}`);

export const logo = (text: string, dark = true): El =>
  h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
    h('div', { style: { width: 18, height: 18, borderRadius: 5, backgroundColor: C.green } }),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 25, letterSpacing: 1, color: dark ? '#eaf2f8' : C.navy } }, text),
  );

export const footer = (opts: { logoText?: string; swipe?: boolean; dark?: boolean } = {}): El => {
  const dark = opts.dark ?? true;
  return h('div', { style: { marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    logo(opts.logoText || 'DIEGO FERREYRA', dark),
    opts.swipe
      ? h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 22, letterSpacing: 1, color: dark ? C.onDarkSoft : '#8aa0b2' } }, 'Deslizá »')
      : null,
  );
};

// ---- Bases de layout ----
export const darkBase = (children: El[], scene?: string): El => {
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

export const lightBase = (children: El[]): El =>
  h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: C.offwhite, backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #eef3f7 100%)' } }, ...children);

export const content = (children: El[]): El =>
  h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: PAD } }, ...children);

export const spacer = (): El => h('div', { style: { display: 'flex', flex: 1 } });

// Layout partido: panel de marca (izq) + persona bien encuadrada (der).
export const splitSlide = (opts: { scene?: string; panel: El[]; page: number; total?: number }): El =>
  h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'row', position: 'relative', backgroundColor: C.navyDeep } },
    h('div', { style: { width: '56%', height: '100%', display: 'flex', flexDirection: 'column', padding: PAD_PANEL, position: 'relative', backgroundImage: 'linear-gradient(155deg, #123f68 0%, #0d2d49 46%, #071b2e 100%)' } }, ...opts.panel),
    h('div', { style: { width: '44%', height: '100%', position: 'relative', display: 'flex', backgroundColor: C.navy } },
      opts.scene
        ? h('img', { src: opts.scene, style: { width: '100%', height: '100%', objectFit: 'cover' } })
        : h('div', { style: { width: '100%', height: '100%', backgroundImage: 'radial-gradient(120% 100% at 55% 18%, #12406b 0%, #0d2d49 60%, #071b2e 100%)' } }),
      h('div', { style: { position: 'absolute', top: 0, left: 0, width: '46%', height: '100%', backgroundImage: 'linear-gradient(90deg, #071b2e 0%, rgba(7,27,46,0) 100%)' } }),
    ),
    h('div', { style: { position: 'absolute', top: 68, right: 52, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 22, letterSpacing: 2, color: '#a9bccb' } }, `0${opts.page} / 0${opts.total || 5}`),
  );

// Layout cinematográfico: imagen conceptual full-bleed + scrim + contenido (no "plano").
export const cinematicBase = (image: string | undefined, scrim: string, children: El[]): El =>
  h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: C.navyDeep } },
    image ? h('img', { src: image, style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: 'radial-gradient(120% 90% at 50% 20%, #12406b 0%, #0d2d49 55%, #071b2e 100%)' } }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: scrim } }),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: PAD } }, ...children),
  );

// Scrims cinematográficos prearmados.
export const SCRIM = {
  bottom: 'linear-gradient(0deg, rgba(6,20,34,0.97) 0%, rgba(6,20,34,0.82) 33%, rgba(6,20,34,0.34) 60%, rgba(6,20,34,0.10) 100%)',
  top: 'linear-gradient(180deg, rgba(6,20,34,0.96) 0%, rgba(6,20,34,0.8) 33%, rgba(6,20,34,0.42) 60%, rgba(6,20,34,0.14) 100%)',
  full: 'linear-gradient(180deg, rgba(6,20,34,0.9) 0%, rgba(6,20,34,0.88) 45%, rgba(6,20,34,0.94) 100%)',
};

// ---- Íconos ----
export const svgIcon = (inner: string, color: string, size = 64): El => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`;
  return h('img', { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, style: { width: size, height: size } });
};
export const starIcon = (color: string, size = 36): El => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${color}'><path d='M12 2l2.9 6.1 6.7.9-4.9 4.6 1.2 6.7L12 17.9 6.1 20.9l1.2-6.7L2.4 9.6 9.1 8.1z'/></svg>`;
  return h('img', { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, style: { width: size, height: size } });
};
export const stars = (n: number, color: string): El =>
  h('div', { style: { display: 'flex', gap: 7 } }, ...Array.from({ length: n }, () => starIcon(color)));

export const ICON = {
  tag: `<path d='M20.5 13.4 12 21.9l-8.9-8.9V3.1h9.9z'/><circle cx='7.1' cy='7.1' r='1.2'/>`,
  clock: `<circle cx='12' cy='12' r='9'/><path d='M12 7.4V12l3.6 2.1'/>`,
  shield: `<path d='M12 3 5 5.4V11c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V5.4z'/><path d='M12 8.4v3.3'/><path d='M12 15.1v.2'/>`,
  hourglass: `<path d='M6 3h12M6 21h12'/><path d='M8 3v3.5l4 5 4-5V3'/><path d='M8 21v-3.5l4-5 4 5V21'/>`,
  heart: `<path d='M12 20s-7-4.5-9.2-8.4C1.3 9 2.4 5.7 5.4 5.1c1.9-.4 3.6.6 4.6 2 1-1.4 2.7-2.4 4.6-2 3 .6 4.1 3.9 2.6 6.5C19 15.5 12 20 12 20z'/>`,
  chart: `<path d='M4 20h16M6 20V9M11 20V5M16 20v-8M21 20V3'/>`,
  eyeoff: `<path d='M9.9 5.1A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.7 2.2-1.9 3.4M6.3 6.3C3.6 7.8 2 10 2 12c0 2.5 4 7 10 7 1.7 0 3.2-.4 4.5-1M3 3l18 18M9.5 9.5a3 3 0 0 0 4 4'/>`,
  megaphone: `<path d='M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 8a4 4 0 0 1 0 8M11 6l7-3v18l-7-3'/>`,
};

export const leakCard = (iconKey: keyof typeof ICON, label: string): El =>
  h('div', { style: { width: '47.5%', display: 'flex', flexDirection: 'column', gap: 18, padding: '28px 26px', marginBottom: 24, backgroundColor: 'rgba(10,28,46,0.66)', borderRadius: 20, borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,90,100,0.32)' } },
    svgIcon(ICON[iconKey], '#FF7A82', 58),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 29, lineHeight: 1.18, color: '#ffffff' } }, label),
  );
