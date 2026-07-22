/**
 * CAPA 1 (escena por IA). Genera la escena fotográfica de Diego con gpt-image-1
 * a partir de su foto de referencia (recorte sin fondo) + el prompt de secciones.
 * fetch plano, sin SDK (mismo enfoque que el codebase usa con Gemini).
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

export interface SceneOpts {
  prompt: string;
  /** Varias fotos del MISMO Diego (headshot + cuerpo) mejoran la fidelidad facial. */
  referencePaths: string[];
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

export async function generateScene(opts: SceneOpts): Promise<Buffer> {
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) throw new Error('OPENAI_API_KEY no está seteada (corré con --env-file=.env.local)');

  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', opts.prompt);
  form.append('size', opts.size || '1024x1536');
  form.append('n', '1');
  if (opts.quality) form.append('quality', opts.quality);
  // input_fidelity solo existe en gpt-image-1 (preserva la cara de la referencia).
  // gpt-image-2 ya trae alta fidelidad nativa y rechaza el parámetro.
  if (MODEL.startsWith('gpt-image-1')) form.append('input_fidelity', 'high');

  for (const p of opts.referencePaths) {
    const buf = readFileSync(p);
    form.append('image[]', new Blob([new Uint8Array(buf)], { type: 'image/png' }), basename(p).replace(/\s+/g, '-'));
  }

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status} — ${JSON.stringify(json?.error || json).slice(0, 400)}`);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Respuesta sin imagen: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}

/** Genera SOLO el fondo/escena (sin personas), para compositar a Diego real encima. */
export async function generateBackground(prompt: string, opts?: { size?: string; quality?: string }): Promise<Buffer> {
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) throw new Error('OPENAI_API_KEY no está seteada');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, size: opts?.size || '1024x1536', quality: opts?.quality || 'high', n: 1 }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status} — ${JSON.stringify(json?.error || json).slice(0, 400)}`);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Respuesta sin imagen: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}

/** Bloque de preservación facial (spec §7, bloque 6 — no negociable). */
export const FACIAL_LOCK = [
  'PRESERVACIÓN DE IDENTIDAD (CRÍTICO): el hombre es la persona EXACTA de la imagen de referencia.',
  'Reproducí su rostro sin alterar ningún rasgo: misma estructura ósea, misma forma y separación de',
  'ojos, misma nariz, misma boca y sonrisa, mismas cejas, mismo mentón, misma línea de nacimiento del',
  'pelo y mismo peinado, mismo tono y textura de piel, misma edad. NO rejuvenecer, NO adelgazar, NO',
  'idealizar, NO suavizar rasgos, NO cambiar color de ojos ni de pelo. Debe ser reconocible al 100%',
  'como la foto de referencia. Mantené saco azul marino y camisa blanca. Cambiá SOLO la pose, el gesto',
  'corporal y el entorno — nunca la cara.',
].join(' ');

/** Arma un prompt de escena con la estructura de secciones de la spec. */
export function buildScenePrompt(p: {
  escena: string;
  gesto: string;
  luz: string;
  ladoSujeto: 'derecha' | 'izquierda' | 'centro';
}): string {
  const encuadre =
    p.ladoSujeto === 'centro'
      ? `ENCUADRE: retrato en plano medio (de la cintura hacia arriba), el hombre CENTRADO y llenando el encuadre vertical; el fondo de oficina detrás, desenfocado.`
      : `ENCUADRE: el sujeto ocupa el lado ${p.ladoSujeto} del cuadro; dejá amplio espacio negativo y limpio del lado ${p.ladoSujeto === 'derecha' ? 'izquierda' : 'derecha'} (ahí irá texto, no lo llenes con objetos).`;
  return [
    `Usá a la MISMA PERSONA EXACTA de las fotos de referencia: el mismo hombre, con su rostro idéntico.`,
    FACIAL_LOCK,
    `Fotografía editorial vertical (relación 4:5), fotorrealista, calidad premium.`,
    `ESCENA: ${p.escena}`,
    `El hombre aparece ${p.gesto}, mirando a cámara, en plano medio (de la cintura hacia arriba).`,
    encuadre,
    `LUZ Y ESTILO: ${p.luz}. Estética sobria, corporativa, cinematográfica.`,
    `PALETA: tonos azul marino (navy) y neutros fríos, coherentes con una marca navy + verde.`,
    `NEGATIVOS: sin ningún texto, sin letras, sin logos, sin gráficos, sin marcas de agua, sin bordes,`,
    `sin deformaciones, manos y dedos naturales, no cambies la cara.`,
  ].join(' ');
}
