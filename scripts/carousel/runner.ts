/**
 * Motor compartido de generación + render de carruseles.
 * Cachea las imágenes (concept text2image / Diego edit) por carrusel y rasteriza los slides.
 * Cada carrusel define sus prompts + slides y llama a estas funciones.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderSlide, type El } from './render.ts';
import { generateScene, generateBackground } from './openai-image.ts';

export function parseMode() {
  return {
    mode: process.argv.includes('--composite') ? 'composite' : process.argv.includes('--ai') ? 'ai' : 'text',
    refresh: process.argv.includes('--refresh-scenes'),
  } as const;
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

const dataUri = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

/** Imágenes CONCEPTUALES (text2image, sin personas), cacheadas por clave. */
export async function genConcepts(prompts: Record<string, string>, outDir: string, refresh: boolean): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const [key, prompt] of Object.entries(prompts)) {
    const cache = join(outDir, `_concept-${key}.png`);
    try {
      let buf: Buffer;
      if (!refresh && existsSync(cache)) { buf = readFileSync(cache); console.log(`[concept] ${key} cache`); }
      else { console.log(`[concept] gen ${key}…`); buf = await generateBackground(prompt, { size: '1024x1536', quality: 'high' }); writeFileSync(cache, buf); }
      out[key] = dataUri(buf);
    } catch (e) { console.warn(`[concept] ${key} FALLÓ: ${(e as Error).message}`); }
  }
  return out;
}

/** Escenas de Diego (edit con fotos de referencia), cacheadas por clave. */
export async function genDiego(prompts: Record<string, string>, refs: string[], outDir: string, refresh: boolean): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const [key, prompt] of Object.entries(prompts)) {
    const cache = join(outDir, `_ai-${key}.png`);
    try {
      let buf: Buffer;
      if (!refresh && existsSync(cache)) { buf = readFileSync(cache); console.log(`[ai] ${key} cache`); }
      else { console.log(`[ai] gen ${key}…`); buf = await generateScene({ prompt, referencePaths: refs, size: '1024x1536', quality: 'high' }); writeFileSync(cache, buf); }
      out[key] = dataUri(buf);
    } catch (e) { console.warn(`[ai] ${key} FALLÓ: ${(e as Error).message}`); }
  }
  return out;
}

/** Recorta un retrato (de un thumbnail de testimonio) a data URI. */
export async function cropPortrait(path: string, extract: { left: number; top: number; width: number; height: number }, size = { w: 600, h: 785 }): Promise<string | undefined> {
  try {
    const buf = await sharp(path).extract(extract).resize(size.w, size.h, { fit: 'cover' }).png().toBuffer();
    return dataUri(buf);
  } catch (e) {
    console.warn(`[portrait] ${path} FALLÓ: ${(e as Error).message}`);
    return undefined;
  }
}

export async function renderAll(slides: Array<[string, El]>, outDir: string) {
  for (const [name, el] of slides) {
    const png = await renderSlide(el);
    writeFileSync(join(outDir, `${name}.png`), png);
    console.log(`✓ ${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\nListo → ${outDir}`);
}
