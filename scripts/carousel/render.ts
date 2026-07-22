/**
 * Motor de render de la CAPA 2 (texto determinístico).
 * satori vectoriza el layout (JSX-like) a SVG con las tipografías de marca embebidas,
 * y resvg lo rasteriza a PNG exacto de 1080×1350. Cero errores de tipografía.
 *
 * No usa React ni JSX (evita problemas de transpile con tsx): `h()` construye
 * los elementos que satori entiende (objetos { type, props }).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fontDir = join(HERE, 'fonts');
const font = (f: string) => readFileSync(join(fontDir, f));

export const W = 1080;
export const H = 1350;

const FONTS = [
  { name: 'Montserrat', data: font('mont-600.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Montserrat', data: font('mont-700.woff'), weight: 700 as const, style: 'normal' as const },
  { name: 'Montserrat', data: font('mont-800.woff'), weight: 800 as const, style: 'normal' as const },
  { name: 'Lato', data: font('lato-400.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Lato', data: font('lato-700.woff'), weight: 700 as const, style: 'normal' as const },
];

export type El = { type: string; props: Record<string, any> };

/** Hyperscript mínimo compatible con satori. */
export function h(type: string, props?: Record<string, any> | null, ...children: any[]): El {
  const kids = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return {
    type,
    props: {
      ...(props || {}),
      children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids,
    },
  };
}

export async function renderSlide(element: El): Promise<Buffer> {
  const svg = await satori(element as any, { width: W, height: H, fonts: FONTS as any });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}
