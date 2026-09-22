# Reels de Instagram por propiedad — plan de implementación

> **Para quien ejecute:** una tarea por vez, en orden. Cada tarea termina con pruebas en
> verde y un commit. Los pasos van con casilla (`- [ ]`).

**Objetivo:** que un asesor suba o enganche un reel desde la ficha de la propiedad y que
cada comentario con una palabra elegida dispare solo la respuesta pública, el mensaje
privado con botón y el enlace de la landing de esa propiedad.

**Arquitectura:** toda la decisión vive en módulos puros de `lib/social/reels/` (sin red ni
base), las rutas son finas, Instagram se toca solo desde `lib/integrations/instagram/` con
modo de prueba, y nada que tarde se hace dentro de un request: publica un cron de `pg_cron`.

**Tecnologías:** Next.js 16, React 19, Supabase (Postgres + Storage + RLS), Graph API de
Meta v21.0, vitest, Zod, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-22-reels-instagram-design.md`

## Restricciones globales (valen para TODAS las tareas)

- **Nombres del negocio en castellano** (funciones, variables, tests). En la base se respeta
  la convención de cada tabla.
- **TypeScript estricto:** sin `any`, sin `as` para callar errores, sin `!` sin comentario.
- **Verificación de tipos acotada:** `npx tsc --noEmit -p tsconfig.reels.json` (se crea en la
  Tarea 1). El `tsconfig.json` raíz **se cuelga** por iCloud.
- **Pruebas acotadas:** `npx vitest run --config vitest.reels.config.ts` (se crea en la
  Tarea 1). La config raíz rastrea el proyecto entero y tarda minutos.
- **Commits:** autor `Sujupar <redstyle50@gmail.com>` (si no, Netlify no deploya), mensaje en
  castellano que dice el cambio y el porqué, trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Formatos de video aceptados: solo `mp4` y `mov`.** Instagram no toma `webm` ni `m4v`.
- **Permisos:** todas las rutas usan `requireAuth` + `puedeDifundir(propertyId, userId, role,
  'difundir')` de `lib/properties/difusion-access-server.ts`. Nunca una regla de roles nueva.
- **Fallos ruidosos:** nada de `catch` vacío; un cron que no hace nada deja escrito el motivo.
- **Cerrado ante la duda:** si un interruptor no se puede leer, se asume apagado.
- Versión de la Graph API: **`v21.0`**, la misma que ya usa `lib/marketing/meta-campaign-builder.ts`.
- Cuenta de Instagram: `17841421542114621` · Página: `103823292484521` (verificados 2026-09-22).

---

## Mapa de archivos

**Módulos puros (toda la decisión vive acá):**

| Archivo | Responsabilidad |
|---|---|
| `lib/social/reels/palabra-clave.ts` | Normalizar texto y decidir si un comentario contiene la palabra |
| `lib/social/reels/descripcion.ts` | Armar la descripción del reel **sin precio** |
| `lib/social/reels/respuestas.ts` | Elegir, de forma estable, una de las respuestas públicas |
| `lib/social/reels/decision.ts` | Qué hacer ante un comentario: ignorar, simular o actuar |
| `lib/social/reels/estados.ts` | Qué transiciones de estado son válidas para un reel |

**Instagram (lo único que toca la red):**

| Archivo | Responsabilidad |
|---|---|
| `lib/integrations/instagram/client.ts` | `instagramFetch` + errores en castellano |
| `lib/integrations/instagram/publicar.ts` | Contenedor, consulta de estado y publicación |
| `lib/integrations/instagram/comentarios.ts` | Responder un comentario |
| `lib/integrations/instagram/mensajes.ts` | Mensaje privado con botón |
| `lib/integrations/instagram/webhook.ts` | Firma y parseo del aviso de Meta |

**Base de datos:** `supabase/migrations/20260922000001_reels_instagram.sql` ·
`scripts/apply-reels-instagram-pg.ts` · `supabase/migrations/20260922000002_cron_reels.sql` ·
`scripts/apply-cron-reels-pg.ts`

**Rutas:** `app/api/properties/[id]/reels/route.ts` ·
`app/api/properties/[id]/reels/[reelId]/route.ts` ·
`app/api/properties/[id]/reels/[reelId]/publicar/route.ts` ·
`app/api/instagram/media/route.ts` · `app/api/webhooks/instagram/route.ts` ·
`app/api/cron/reels-publish/route.ts`

**Interfaz:** `components/properties/reels/ReelsCard.tsx` ·
`components/properties/reels/SubirReelDialog.tsx` ·
`components/properties/reels/EngancharReelDialog.tsx` ·
`components/properties/reels/ReelFila.tsx`

**Modificados:** `components/properties/detail/tabs/MarketingTab.tsx` (montar la tarjeta) ·
`lib/supabase/middleware.ts` (lista blanca del webhook) ·
`lib/properties/media.ts` (constantes de formato del reel)

---

## Tarea 1: Andamiaje de verificación y migración de datos

Sin esto, ninguna tarea siguiente se puede probar ni escribir en la base.

**Archivos:**
- Crear: `vitest.reels.config.ts`, `tsconfig.reels.json`
- Crear: `supabase/migrations/20260922000001_reels_instagram.sql`
- Crear: `scripts/apply-reels-instagram-pg.ts`

**Produce:** las tablas `property_reels`, `reel_comentarios`, `instagram_ajustes` y los dos
comandos de verificación que usan todas las tareas.

- [ ] **Paso 1: Config de pruebas acotada**

`vitest.reels.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/social/reels/**/*.test.ts', 'lib/integrations/instagram/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

`tsconfig.reels.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": [
    "lib/social/reels/**/*.ts",
    "lib/integrations/instagram/**/*.ts",
    "app/api/properties/[id]/reels/**/*.ts",
    "app/api/instagram/**/*.ts",
    "app/api/webhooks/instagram/**/*.ts",
    "app/api/cron/reels-publish/**/*.ts",
    "components/properties/reels/**/*.tsx"
  ]
}
```

- [ ] **Paso 2: Escribir la migración**

`supabase/migrations/20260922000001_reels_instagram.sql`. Puntos que NO se pueden cambiar:
`created_by` va `ON DELETE SET NULL` (regla del repo: sin eso, borrar un usuario desde
Supabase Auth falla); `ig_media_id` y `ig_comment_id` llevan **UNIQUE** (es lo que hace
idempotente el reintento del webhook de Meta); las políticas de RLS copian el patrón de
`property_landings` (`20260723000002`), o sea operaciones **más** asesor asignado.

```sql
CREATE TABLE IF NOT EXISTS public.property_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('subido', 'existente')),
  video_url text,
  descripcion text NOT NULL DEFAULT '',
  palabra_clave text,
  dm_texto text,
  dm_boton text NOT NULL DEFAULT 'Sí, pasámela',
  dm_seguimiento text,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','programado','procesando','publicado','fallido')),
  programado_para timestamptz,
  ig_creation_id text,
  ig_media_id text UNIQUE,
  ig_permalink text,
  publicado_en timestamptz,
  ultimo_error text,
  automatizacion_activa boolean NOT NULL DEFAULT false,
  automatizacion_desde timestamptz,
  simulacro boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_reels_property_idx ON public.property_reels(property_id);
CREATE INDEX IF NOT EXISTS property_reels_pendientes_idx
  ON public.property_reels(estado, programado_para)
  WHERE estado IN ('programado','procesando');

CREATE TABLE IF NOT EXISTS public.reel_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES public.property_reels(id) ON DELETE CASCADE,
  ig_comment_id text NOT NULL UNIQUE,
  ig_user_id text NOT NULL,
  username text,
  texto text,
  coincide boolean NOT NULL DEFAULT false,
  motivo_ignorado text,
  respondido_en timestamptz,
  dm_enviado_en timestamptz,
  boton_tocado_en timestamptz,
  enlace_enviado_en timestamptz,
  error text,
  simulado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reel_comentarios_persona_idx
  ON public.reel_comentarios(reel_id, ig_user_id);

CREATE TABLE IF NOT EXISTS public.instagram_ajustes (
  id text PRIMARY KEY DEFAULT 'default',
  automatizacion_habilitada boolean NOT NULL DEFAULT false,
  dm_habilitado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.instagram_ajustes (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.property_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reels_ops_all ON public.property_reels;
CREATE POLICY reels_ops_all ON public.property_reels FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS reels_asesor_own ON public.property_reels;
CREATE POLICY reels_asesor_own ON public.property_reels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()));

DROP POLICY IF EXISTS reel_comentarios_ops ON public.reel_comentarios;
CREATE POLICY reel_comentarios_ops ON public.reel_comentarios FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS reel_comentarios_asesor ON public.reel_comentarios;
CREATE POLICY reel_comentarios_asesor ON public.reel_comentarios FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.property_reels r JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reel_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.property_reels r JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reel_id AND p.assigned_to = auth.uid()));

DROP POLICY IF EXISTS instagram_ajustes_ops ON public.instagram_ajustes;
CREATE POLICY instagram_ajustes_ops ON public.instagram_ajustes FOR ALL TO authenticated
  USING (public.is_operations_user()) WITH CHECK (public.is_operations_user());
```

- [ ] **Paso 3: Script que la aplica y la verifica**

`scripts/apply-reels-instagram-pg.ts`, copiando el patrón de `scripts/apply-short-links-pg.ts`
(conexión por el *session pooler*, `SUPABASE_DB_PASSWORD` de `.env.local`). Después del
`CREATE`, el script **verifica y aborta si algo no cuadra**:

```ts
const chequeos = [
  { nombre: 'ig_media_id es UNIQUE', sql: `SELECT 1 FROM pg_constraint WHERE conname LIKE '%property_reels%ig_media_id%' AND contype='u'` },
  { nombre: 'ig_comment_id es UNIQUE', sql: `SELECT 1 FROM pg_constraint WHERE conname LIKE '%reel_comentarios%ig_comment_id%' AND contype='u'` },
  { nombre: 'los interruptores nacen apagados', sql: `SELECT 1 FROM instagram_ajustes WHERE id='default' AND automatizacion_habilitada=false AND dm_habilitado=false` },
  { nombre: 'created_by con ON DELETE SET NULL', sql: `SELECT 1 FROM pg_constraint WHERE conrelid='public.property_reels'::regclass AND confdeltype='n'` },
]
for (const c of chequeos) {
  const { rowCount } = await cliente.query(c.sql)
  if (!rowCount) throw new Error(`VERIFICACIÓN FALLIDA: ${c.nombre}`)
  console.log('  ok —', c.nombre)
}
```

- [ ] **Paso 4: Aplicar y comprobar contra la base**

```bash
node --env-file=../../../.env.local --import tsx scripts/apply-reels-instagram-pg.ts
```

Esperado: las cuatro líneas `ok —`. Si alguna falla, el script corta y no se sigue.

**OJO:** confirmar que es el proyecto `mncsnastmcjdjxrehdep`. Hay más de uno en el panel y
ya pasó una vez que una migración se aplicó en el equivocado y "no apareció la columna".

- [ ] **Paso 5: Commit**

```bash
git add vitest.reels.config.ts tsconfig.reels.json supabase/migrations/20260922000001_reels_instagram.sql scripts/apply-reels-instagram-pg.ts
git commit -m "feat(reels): tablas, RLS e interruptores apagados de fábrica"
```

---

## Tarea 2: Reconocer la palabra en un comentario

**Archivos:**
- Crear: `lib/social/reels/palabra-clave.ts`
- Test: `lib/social/reels/palabra-clave.test.ts`

**Produce:** `normalizarParaComparar(texto: string): string` y
`comentarioCoincide(comentario: string | null | undefined, palabra: string | null | undefined): boolean`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { comentarioCoincide, normalizarParaComparar } from './palabra-clave'

describe('normalizarParaComparar', () => {
  it('pasa a minúsculas y saca las tildes', () => {
    expect(normalizarParaComparar('TASACIÓN')).toBe('tasacion')
  })

  it('trata igual la tilde pegada y la tilde suelta (NFD de macOS)', () => {
    // 'ó' en una sola pieza vs 'o' + U+0301. El Finder, los PDF y la terminal
    // de macOS entregan la segunda forma: sin normalizar, la búsqueda devuelve
    // cero resultados SIN ERROR y parece que la palabra no estuviera.
    expect(normalizarParaComparar('tasación')).toBe(normalizarParaComparar('tasación'))
  })
})

describe('comentarioCoincide', () => {
  it('reconoce la palabra escrita igual', () => {
    expect(comentarioCoincide('PROPIEDAD', 'propiedad')).toBe(true)
  })

  it('la reconoce dentro de una frase', () => {
    expect(comentarioCoincide('me interesa, tasación por favor', 'TASACIÓN')).toBe(true)
  })

  it('la reconoce con tildes de un lado y no del otro', () => {
    expect(comentarioCoincide('quiero la tasacion', 'Tasación')).toBe(true)
  })

  it('no coincide cuando la palabra no está', () => {
    expect(comentarioCoincide('qué lindo departamento', 'propiedad')).toBe(false)
  })

  it('no coincide con comentario vacío ni nulo', () => {
    expect(comentarioCoincide('', 'propiedad')).toBe(false)
    expect(comentarioCoincide(null, 'propiedad')).toBe(false)
  })

  it('sin palabra configurada nunca coincide', () => {
    // Un reel sin palabra NO debe automatizar nada: si devolviera true,
    // cualquier comentario dispararía un mensaje a una persona real.
    expect(comentarioCoincide('lo que sea', null)).toBe(false)
    expect(comentarioCoincide('lo que sea', '   ')).toBe(false)
  })

  it('no confunde la palabra metida adentro de otra', () => {
    expect(comentarioCoincide('impropiedades varias', 'propiedad')).toBe(false)
  })
})
```

- [ ] **Paso 2: Verlas fallar**

Correr: `npx vitest run --config vitest.reels.config.ts lib/social/reels/palabra-clave.test.ts`
Esperado: FALLA con "Failed to resolve import ./palabra-clave".

- [ ] **Paso 3: Implementar lo mínimo**

```ts
/**
 * Reconocer la palabra del llamado a la acción dentro de un comentario.
 *
 * POR QUÉ NORMALIZAMOS A NFC: macOS entrega el texto DESCOMPUESTO — la "ó" son
 * dos caracteres ('o' + U+0301). Sin esto, "tasación" escrito desde un teclado
 * y "tasación" pegado desde el Finder no son la misma cadena y la comparación
 * devuelve false SIN ERROR. Ya mordió al buscador de los listados (CLAUDE.md).
 */
export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize('NFC')
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca las tildes ya separadas
    .trim()
}

/** Límite de palabra en Unicode: `\b` no sirve con acentos ni con la ñ. */
const NO_ES_LETRA = /[^\p{L}\p{N}]/u

export function comentarioCoincide(
  comentario: string | null | undefined,
  palabra: string | null | undefined,
): boolean {
  if (!comentario || !palabra || !palabra.trim()) return false
  const aguja = normalizarParaComparar(palabra)
  if (!aguja) return false
  const pajar = normalizarParaComparar(comentario)

  let desde = 0
  for (;;) {
    const i = pajar.indexOf(aguja, desde)
    if (i === -1) return false
    const antes = i === 0 ? '' : pajar[i - 1]
    const despues = pajar[i + aguja.length] ?? ''
    // "impropiedades" NO contiene la palabra "propiedad" a los fines del
    // llamado a la acción: la persona tiene que haberla escrito, no rozarla.
    if ((!antes || NO_ES_LETRA.test(antes)) && (!despues || NO_ES_LETRA.test(despues))) return true
    desde = i + 1
  }
}
```

- [ ] **Paso 4: Verlas pasar**

Correr: `npx vitest run --config vitest.reels.config.ts lib/social/reels/palabra-clave.test.ts`
Esperado: 9 pruebas en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/social/reels/palabra-clave.ts lib/social/reels/palabra-clave.test.ts
git commit -m "feat(reels): reconocer la palabra del comentario sin importar tildes ni mayúsculas"
```

---

## Tarea 3: Armar la descripción sin precio

**Archivos:**
- Crear: `lib/social/reels/descripcion.ts`
- Test: `lib/social/reels/descripcion.test.ts`

**Consume:** nada. **Produce:**

```ts
export interface DatosDescripcion {
  property_type?: string | null
  operation_type?: string | null
  neighborhood?: string | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  amenities?: string[] | null
}
export function armarDescripcionReel(datos: DatosDescripcion, palabra: string): string
```

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { armarDescripcionReel } from './descripcion'

const depto = {
  property_type: 'departamento', operation_type: 'venta', neighborhood: 'Almagro',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1, covered_area: 78,
}

describe('armarDescripcionReel', () => {
  it('nombra el tipo con mayúscula inicial y el barrio', () => {
    const texto = armarDescripcionReel(depto, 'PROPIEDAD')
    expect(texto).toContain('Departamento')
    expect(texto).not.toContain('departamento en Almagro'.toLowerCase().slice(0, 12))
    expect(texto).toContain('Almagro')
  })

  it('termina con el llamado a la acción y la palabra en mayúsculas', () => {
    expect(armarDescripcionReel(depto, 'propiedad')).toMatch(/Comentá la palabra PROPIEDAD\b/)
  })

  it('NUNCA incluye un precio, aunque venga entre los datos', () => {
    // El tipo no tiene precio a propósito. Esta prueba existe para que si
    // alguien agrega el campo "price" a DatosDescripcion, tenga que venir acá
    // y decidirlo conscientemente en vez de que se cuele solo.
    const texto = armarDescripcionReel({ ...depto }, 'propiedad')
    expect(texto).not.toMatch(/\$|USD|U\$S|\d{3}\.\d{3}/)
  })

  it('omite los datos que no están en vez de dejar huecos', () => {
    const texto = armarDescripcionReel({ property_type: 'casa', neighborhood: 'Flores' }, 'info')
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
    expect(texto).not.toMatch(/\s—\s*$/m)
  })

  it('dice la operación en castellano', () => {
    expect(armarDescripcionReel({ ...depto, operation_type: 'alquiler' }, 'info')).toContain('alquiler')
  })

  it('sin barrio no escribe "en "', () => {
    expect(armarDescripcionReel({ property_type: 'ph', neighborhood: null }, 'info')).not.toMatch(/\ben\s*\n/)
  })
})
```

- [ ] **Paso 2: Verlas fallar**

Correr: `npx vitest run --config vitest.reels.config.ts lib/social/reels/descripcion.test.ts`
Esperado: FALLA por import inexistente.

- [ ] **Paso 3: Implementar**

Reusar `normalizePropertyTypeLabel` y `operationLabelFor` de
`lib/marketing/ad-image-generator-v2.ts` (ya resuelven "departamento" → "Departamento" y
`venta` → "En venta"); si arrastran dependencias que no corresponden, moverlas a
`lib/properties/etiquetas.ts` y que **ambos** las importen de ahí — no duplicarlas.

La descripción se arma por partes y se saltean las vacías. **No existe ningún camino que
escriba un precio:** el tipo `DatosDescripcion` no lo tiene.

- [ ] **Paso 4: Verlas pasar** — 6 pruebas en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/social/reels/descripcion.ts lib/social/reels/descripcion.test.ts
git commit -m "feat(reels): descripción del reel a partir de la propiedad, sin precio"
```

---

## Tarea 4: Respuestas públicas que no parezcan un robot

**Archivos:**
- Crear: `lib/social/reels/respuestas.ts`
- Test: `lib/social/reels/respuestas.test.ts`

**Produce:** `RESPUESTAS_PUBLICAS: readonly string[]` y `elegirRespuesta(semilla: string): string`

- [ ] **Paso 1: Pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { elegirRespuesta, RESPUESTAS_PUBLICAS } from './respuestas'

describe('elegirRespuesta', () => {
  it('siempre devuelve una de las respuestas del catálogo', () => {
    for (const semilla of ['a', 'b', '17943666861343348', '']) {
      expect(RESPUESTAS_PUBLICAS).toContain(elegirRespuesta(semilla))
    }
  })

  it('con la misma semilla devuelve siempre lo mismo', () => {
    // Determinística a propósito: si Meta reintenta el mismo aviso, el
    // reintento no puede elegir OTRA frase y dejar dos respuestas distintas.
    expect(elegirRespuesta('17943666861343348')).toBe(elegirRespuesta('17943666861343348'))
  })

  it('reparte entre varias frases y no se queda pegada en una', () => {
    const vistas = new Set(Array.from({ length: 50 }, (_, i) => elegirRespuesta(`c${i}`)))
    expect(vistas.size).toBeGreaterThan(1)
  })

  it('hay al menos tres frases distintas', () => {
    expect(new Set(RESPUESTAS_PUBLICAS).size).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Paso 2: Verlas fallar.**

- [ ] **Paso 3: Implementar** — suma de códigos de carácter módulo el largo del catálogo.
El catálogo arranca con: `'¡Listo! Ya te lo mandé por privado 📩'`,
`'Gracias por comentar, te escribí al privado 🙌'`, `'Hecho, fijate tu bandeja 👀'`,
`'Te acabo de mandar todo por mensaje privado ✅'`.

- [ ] **Paso 4: Verlas pasar** — 4 en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/social/reels/respuestas.ts lib/social/reels/respuestas.test.ts
git commit -m "feat(reels): catálogo de respuestas públicas con elección estable"
```

---

## Tarea 5: La decisión ante un comentario (el corazón)

Acá viven **todos** los frenos. Que sea puro es lo que permite probar sin tocar Instagram.

**Archivos:**
- Crear: `lib/social/reels/decision.ts`
- Test: `lib/social/reels/decision.test.ts`

**Consume:** `comentarioCoincide` de la Tarea 2.

**Produce:**

```ts
export interface AjustesGlobales { automatizacion_habilitada: boolean; dm_habilitado: boolean }
export interface ReelParaDecidir {
  palabra_clave: string | null
  automatizacion_activa: boolean
  automatizacion_desde: string | null
  simulacro: boolean
  estado: string
}
export interface ComentarioEntrante {
  texto: string | null
  creado_en: string
  autor_ig_id: string
  es_de_la_cuenta: boolean
  ya_recibio_dm: boolean
}
export type Decision =
  | { accion: 'ignorar'; motivo: string }
  | { accion: 'simular' }
  | { accion: 'responder_y_dm' }
  | { accion: 'solo_responder'; motivo: string }

export function decidirQueHacer(
  reel: ReelParaDecidir, comentario: ComentarioEntrante,
  ajustes: AjustesGlobales, ahora: Date,
): Decision
```

- [ ] **Paso 1: Pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { decidirQueHacer } from './decision'

const AHORA = new Date('2026-09-22T12:00:00Z')
const reelOk = {
  palabra_clave: 'propiedad', automatizacion_activa: true,
  automatizacion_desde: '2026-09-22T10:00:00Z', simulacro: false, estado: 'publicado',
}
const todoPrendido = { automatizacion_habilitada: true, dm_habilitado: true }
const comentarioOk = {
  texto: 'hola, propiedad', creado_en: '2026-09-22T11:00:00Z',
  autor_ig_id: '123', es_de_la_cuenta: false, ya_recibio_dm: false,
}

describe('decidirQueHacer', () => {
  it('con todo en orden, responde y manda el privado', () => {
    expect(decidirQueHacer(reelOk, comentarioOk, todoPrendido, AHORA)).toEqual({ accion: 'responder_y_dm' })
  })

  it('con el interruptor global apagado no hace NADA', () => {
    const d = decidirQueHacer(reelOk, comentarioOk, { automatizacion_habilitada: false, dm_habilitado: true }, AHORA)
    expect(d).toEqual({ accion: 'ignorar', motivo: 'automatizacion_global_apagada' })
  })

  it('con la automatización del reel apagada no hace nada', () => {
    const d = decidirQueHacer({ ...reelOk, automatizacion_activa: false }, comentarioOk, todoPrendido, AHORA)
    expect(d).toEqual({ accion: 'ignorar', motivo: 'reel_sin_automatizacion' })
  })

  it('en simulacro no manda nada, solo registra', () => {
    const d = decidirQueHacer({ ...reelOk, simulacro: true }, comentarioOk, todoPrendido, AHORA)
    expect(d).toEqual({ accion: 'simular' })
  })

  it('ignora un comentario ANTERIOR a activar la automatización', () => {
    // El caso de los 33 comentarios viejos: enganchar un reel no puede
    // escribirle a quien comentó hace días esperando otra cosa.
    const viejo = { ...comentarioOk, creado_en: '2026-09-20T15:00:00Z' }
    expect(decidirQueHacer(reelOk, viejo, todoPrendido, AHORA)).toEqual({ accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' })
  })

  it('ignora los comentarios de la propia cuenta', () => {
    const propio = { ...comentarioOk, es_de_la_cuenta: true }
    expect(decidirQueHacer(reelOk, propio, todoPrendido, AHORA)).toEqual({ accion: 'ignorar', motivo: 'comentario_propio' })
  })

  it('ignora el comentario que no contiene la palabra', () => {
    const otro = { ...comentarioOk, texto: 'qué lindo' }
    expect(decidirQueHacer(reelOk, otro, todoPrendido, AHORA)).toEqual({ accion: 'ignorar', motivo: 'no_coincide' })
  })

  it('a quien ya recibió el privado le responde igual, pero no le manda otro', () => {
    // Meta permite UN solo privado por persona que comenta. Y quedarse callado
    // en público haría que el comentario parezca ignorado.
    const repetido = { ...comentarioOk, ya_recibio_dm: true }
    expect(decidirQueHacer(reelOk, repetido, todoPrendido, AHORA)).toEqual({ accion: 'solo_responder', motivo: 'ya_recibio_dm' })
  })

  it('con los privados deshabilitados responde en público pero no manda el privado', () => {
    // Es el estado del día uno: Meta todavía no destrabó pages_messaging.
    const d = decidirQueHacer(reelOk, comentarioOk, { automatizacion_habilitada: true, dm_habilitado: false }, AHORA)
    expect(d).toEqual({ accion: 'solo_responder', motivo: 'dm_deshabilitado' })
  })

  it('no manda el privado pasados los 7 días del comentario', () => {
    const vencido = { ...comentarioOk, creado_en: '2026-09-10T11:00:00Z' }
    const reelViejo = { ...reelOk, automatizacion_desde: '2026-09-01T00:00:00Z' }
    expect(decidirQueHacer(reelViejo, vencido, todoPrendido, AHORA)).toEqual({ accion: 'solo_responder', motivo: 'ventana_de_7_dias_vencida' })
  })

  it('un reel que no está publicado no automatiza', () => {
    const d = decidirQueHacer({ ...reelOk, estado: 'borrador' }, comentarioOk, todoPrendido, AHORA)
    expect(d).toEqual({ accion: 'ignorar', motivo: 'reel_no_publicado' })
  })

  it('sin fecha de activación NO automatiza (falla cerrado)', () => {
    // Si no sabemos desde cuándo, no podemos distinguir un comentario nuevo de
    // uno viejo. Ante la duda, no se le escribe a nadie.
    const d = decidirQueHacer({ ...reelOk, automatizacion_desde: null }, comentarioOk, todoPrendido, AHORA)
    expect(d).toEqual({ accion: 'ignorar', motivo: 'sin_fecha_de_activacion' })
  })
})
```

- [ ] **Paso 2: Verlas fallar.**

- [ ] **Paso 3: Implementar** respetando **este orden** de evaluación: interruptor global →
estado del reel → automatización del reel → fecha de activación presente → comentario propio
→ comentario anterior a la activación → coincidencia de la palabra → simulacro → ya recibió
privado → privados habilitados → ventana de 7 días.

El orden importa: lo que ignora por completo va **antes** que lo que responde en público,
así un comentario que no coincide nunca genera una respuesta.

- [ ] **Paso 4: Verlas pasar** — 12 en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/social/reels/decision.ts lib/social/reels/decision.test.ts
git commit -m "feat(reels): la decisión ante un comentario, con los frenos cerrados ante la duda"
```

---

## Tarea 6: Estados válidos del reel

**Archivos:** Crear `lib/social/reels/estados.ts` + `lib/social/reels/estados.test.ts`

**Produce:**

```ts
export type EstadoReel = 'borrador' | 'programado' | 'procesando' | 'publicado' | 'fallido'
export function puedePedirPublicacion(estado: EstadoReel): boolean
export function puedeCancelar(estado: EstadoReel): boolean
export function puedeReintentar(estado: EstadoReel): boolean
export function etiquetaEstado(estado: EstadoReel): string
```

- [ ] **Paso 1: Pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { puedePedirPublicacion, puedeCancelar, puedeReintentar, etiquetaEstado } from './estados'

describe('estados del reel', () => {
  it('solo se publica desde borrador o fallido', () => {
    expect(puedePedirPublicacion('borrador')).toBe(true)
    expect(puedePedirPublicacion('fallido')).toBe(true)
    expect(puedePedirPublicacion('publicado')).toBe(false)
    // Pedir de nuevo mientras Instagram procesa crearía un SEGUNDO reel.
    expect(puedePedirPublicacion('procesando')).toBe(false)
    expect(puedePedirPublicacion('programado')).toBe(false)
  })

  it('solo se cancela lo programado', () => {
    expect(puedeCancelar('programado')).toBe(true)
    expect(puedeCancelar('procesando')).toBe(false)
    expect(puedeCancelar('publicado')).toBe(false)
  })

  it('solo se reintenta lo fallido', () => {
    expect(puedeReintentar('fallido')).toBe(true)
    expect(puedeReintentar('borrador')).toBe(false)
  })

  it('cada estado tiene etiqueta en castellano', () => {
    for (const e of ['borrador','programado','procesando','publicado','fallido'] as const) {
      expect(etiquetaEstado(e)).toMatch(/[a-záéíóúñ]/i)
    }
  })
})
```

- [ ] **Paso 2: Verlas fallar.** **Paso 3: Implementar.** **Paso 4: Verlas pasar** (4 en verde).

- [ ] **Paso 5: Commit**

```bash
git add lib/social/reels/estados.ts lib/social/reels/estados.test.ts
git commit -m "feat(reels): transiciones válidas de estado del reel"
```

---

## Tarea 7: Cliente de Instagram con modo de prueba

**Archivos:**
- Crear: `lib/integrations/instagram/client.ts`, `publicar.ts`, `comentarios.ts`, `mensajes.ts`
- Test: `lib/integrations/instagram/publicar.test.ts`, `mensajes.test.ts`

**Produce:**

```ts
// client.ts
export function cuentaInstagram(): { igId: string; token: string }
export async function instagramFetch<T>(ruta: string, init?: RequestInit): Promise<T>
export class ErrorInstagram extends Error { readonly code?: number; readonly subcode?: number; readonly crudo: string }
export function mensajeLegible(e: unknown): string

// publicar.ts
export async function crearContenedorReel(a: { videoUrl: string; descripcion: string }): Promise<string>
export async function estadoContenedor(creationId: string): Promise<'EN_PROCESO' | 'LISTO' | 'ERROR' | 'VENCIDO'>
export async function publicarContenedor(creationId: string): Promise<{ igMediaId: string; permalink: string | null }>
export async function listarReelsPublicados(limite?: number): Promise<ReelPublicado[]>

// comentarios.ts
export async function responderComentario(comentarioId: string, mensaje: string): Promise<void>

// mensajes.ts
export async function mandarPrivadoConBoton(a: {
  comentarioId: string; texto: string; textoBoton: string; datoDelBoton: string
}): Promise<void>
export async function mandarTexto(a: { destinatarioId: string; texto: string }): Promise<void>
```

- [ ] **Paso 1: Pruebas que fallan (con `fetch` simulado, nunca la red real)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mandarPrivadoConBoton } from './mensajes'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = '17841421542114621'
})

describe('mandarPrivadoConBoton', () => {
  it('manda el botón como respuesta rápida, con el dato del reel adentro', async () => {
    // El dato viaja en el botón para saber DE QUÉ propiedad hablaba la persona
    // sin cruzar identificadores de usuario, que no siempre coinciden entre
    // el aviso de comentarios y el de mensajes.
    const espia = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"message_id":"m1"}' })
    vi.stubGlobal('fetch', espia)

    await mandarPrivadoConBoton({
      comentarioId: 'c1', texto: 'Hola', textoBoton: 'Sí, pasámela', datoDelBoton: 'reel:abc',
    })

    const cuerpo = JSON.parse(espia.mock.calls[0][1].body as string)
    expect(cuerpo.recipient).toEqual({ comment_id: 'c1' })
    expect(cuerpo.message.text).toBe('Hola')
    expect(cuerpo.message.quick_replies).toEqual([
      { content_type: 'text', title: 'Sí, pasámela', payload: 'reel:abc' },
    ])
  })

  it('traduce el error de permisos de Meta a algo entendible', async () => {
    // Es EXACTAMENTE el error que da hoy la cuenta (verificado 2026-09-22).
    // Sin traducir, el asesor ve "(#3) Application does not have the capability".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ error: { code: 3, message: '(#3) Application does not have the capability to make this API call.' } }),
    }))

    await expect(mandarPrivadoConBoton({
      comentarioId: 'c1', texto: 'Hola', textoBoton: 'Sí', datoDelBoton: 'reel:abc',
    })).rejects.toThrow(/permiso.*Instagram|mensajes privados/i)
  })
})
```

Y para `publicar.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estadoContenedor } from './publicar'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = '17841421542114621'
})

describe('estadoContenedor', () => {
  const casos = [
    ['IN_PROGRESS', 'EN_PROCESO'], ['FINISHED', 'LISTO'],
    ['ERROR', 'ERROR'], ['EXPIRED', 'VENCIDO'], ['PUBLISHED', 'LISTO'],
  ] as const

  for (const [deMeta, nuestro] of casos) {
    it(`traduce ${deMeta} a ${nuestro}`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, text: async () => JSON.stringify({ status_code: deMeta }),
      }))
      expect(await estadoContenedor('c1')).toBe(nuestro)
    })
  }

  it('un estado desconocido se trata como EN_PROCESO, no como listo', async () => {
    // Falla cerrado: dar por listo algo que no entendemos publicaría un reel a
    // medio procesar o rompería el flujo con un id vacío.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: async () => JSON.stringify({ status_code: 'ALGO_NUEVO' }),
    }))
    expect(await estadoContenedor('c1')).toBe('EN_PROCESO')
  })
})
```

- [ ] **Paso 2: Verlas fallar.**

- [ ] **Paso 3: Implementar.** `instagramFetch` lee el cuerpo como texto y recién ahí intenta
`JSON.parse` — si Meta devuelve HTML de error, `res.json()` explotaría con
`Unexpected token '<'`, que no dice nada del problema real (regla dura de `CLAUDE.md`).
`mensajeLegible` traduce al menos: código 3 y 230 → *"Falta el permiso de mensajes privados
de Instagram (`pages_messaging`). Avisale al administrador."*; 100/33 → *"Instagram no
encontró ese comentario (puede haber sido borrado)."*; el resto → mensaje de Meta + el crudo
aparte, nunca solo el crudo.

- [ ] **Paso 4: Verlas pasar** — 8 en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/integrations/instagram/
git commit -m "feat(reels): cliente de Instagram con errores en castellano"
```

---

## Tarea 8: Rutas del reel (crear, editar, borrar, pedir publicación)

**Archivos:**
- Crear: `app/api/properties/[id]/reels/route.ts` (GET listar, POST crear)
- Crear: `app/api/properties/[id]/reels/[reelId]/route.ts` (PATCH, DELETE)
- Crear: `app/api/properties/[id]/reels/[reelId]/publicar/route.ts` (POST)
- Modificar: `lib/properties/media.ts` — agregar `REEL_EXTS = ['mp4','mov'] as const`

**Consume:** `armarDescripcionReel` (T3), `puedePedirPublicacion` (T6).

- [ ] **Paso 1: Escribir las rutas**

Cada una: `requireAuth` → `puedeDifundir(id, user.id, user.profile.role, 'difundir')` → Zod →
módulo puro → Supabase → respuesta. `POST /publicar` **no llama a Instagram**: valida que
haya landing publicada (`property_landings.status = 'published'`), valida el estado con
`puedePedirPublicacion` y deja `estado='programado'` con `programado_para` (ahora, o la fecha
elegida). Publicar dentro del request se cortaría por el límite de tiempo de Netlify.

El `PATCH` acepta **solo** estos campos, con lista blanca explícita: `descripcion`,
`palabra_clave`, `dm_texto`, `dm_boton`, `dm_seguimiento`, `programado_para`,
`automatizacion_activa`, `simulacro`. Nunca el cuerpo entero — el `PUT` genérico de
propiedades es un antecedente de por qué.

Al pasar `automatizacion_activa` de `false` a `true`, la ruta escribe
`automatizacion_desde = now()`. Es lo que hace que los comentarios viejos no se toquen.

- [ ] **Paso 2: Verificar tipos y lint**

```bash
npx tsc --noEmit -p tsconfig.reels.json
npx eslint "app/api/properties/[id]/reels/**/*.ts"
```

- [ ] **Paso 3: Commit**

```bash
git add "app/api/properties/[id]/reels" lib/properties/media.ts
git commit -m "feat(reels): rutas para crear, editar y pedir la publicación de un reel"
```

---

## Tarea 9: Listar los reels ya publicados de la cuenta

**Archivos:** Crear `app/api/instagram/media/route.ts`

**Consume:** `listarReelsPublicados` (T7).

- [ ] **Paso 1: Escribir la ruta.** `GET` con `requireAuth` + capacidad `difundir` sobre
*alguna* propiedad (usa `alcanceDifusion(capacidad, rol) !== 'ninguna'`, porque acá no hay
propiedad todavía). Devuelve id, miniatura, fecha, comentarios y los primeros 80 caracteres
de la descripción. Filtra `media_product_type === 'REELS'`. Marca con `yaEnganchado: true`
los que ya existen en `property_reels` para no ofrecerlos dos veces.

- [ ] **Paso 2: Probar contra la API real** (lectura, no escribe nada):

```bash
node --env-file=../../../.env.local --import tsx scripts/_qa-listar-reels.ts
```

Esperado: al menos 5 reels con su cantidad de comentarios. (Script de diagnóstico, **no se
commitea**; el prefijo `_qa-` está fuera del control de versiones.)

- [ ] **Paso 3: Commit**

```bash
git add app/api/instagram/media/route.ts
git commit -m "feat(reels): listar los reels publicados de la cuenta para engancharlos"
```

---

## Tarea 10: Webhook de Instagram

La pieza más delicada: es una puerta abierta a internet que dispara mensajes a personas.

**Archivos:**
- Crear: `lib/integrations/instagram/webhook.ts` + `webhook.test.ts`
- Crear: `app/api/webhooks/instagram/route.ts`
- Modificar: `lib/supabase/middleware.ts` (lista blanca)

**Consume:** `decidirQueHacer` (T5), `elegirRespuesta` (T4), `responderComentario` y
`mandarPrivadoConBoton` (T7).

**Produce:**

```ts
export function verificarFirmaInstagram(crudo: string, cabecera: string | null): boolean
export interface ComentarioDelAviso { igMediaId: string; comentarioId: string; autorId: string; username: string | null; texto: string | null; creadoEn: string }
export interface BotonTocado { remitenteId: string; dato: string }
export function parsearAviso(cuerpo: unknown): { comentarios: ComentarioDelAviso[]; botones: BotonTocado[] }
```

- [ ] **Paso 1: Pruebas que fallan**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { verificarFirmaInstagram, parsearAviso } from './webhook'

beforeEach(() => { process.env.META_APP_SECRET = 'secreto-de-prueba' })

describe('verificarFirmaInstagram', () => {
  const crudo = '{"object":"instagram"}'
  const buena = 'sha256=' + createHmac('sha256', 'secreto-de-prueba').update(crudo, 'utf8').digest('hex')

  it('acepta la firma correcta', () => {
    expect(verificarFirmaInstagram(crudo, buena)).toBe(true)
  })

  it('rechaza una firma cambiada', () => {
    expect(verificarFirmaInstagram(crudo, 'sha256=' + '0'.repeat(64))).toBe(false)
  })

  it('rechaza cuando no viene firma', () => {
    expect(verificarFirmaInstagram(crudo, null)).toBe(false)
  })

  it('rechaza si falta el secreto (falla cerrado)', () => {
    delete process.env.META_APP_SECRET
    expect(verificarFirmaInstagram(crudo, buena)).toBe(false)
  })

  it('rechaza una firma con largo distinto sin explotar', () => {
    expect(verificarFirmaInstagram(crudo, 'sha256=abcd')).toBe(false)
  })
})

describe('parsearAviso', () => {
  it('saca los comentarios del formato real de Meta', () => {
    const aviso = {
      object: 'instagram',
      entry: [{ id: '17841421542114621', time: 1758542636, changes: [{
        field: 'comments',
        value: { id: 'c1', text: 'propiedad', media: { id: 'm1' },
                 from: { id: 'u1', username: 'juan' }, timestamp: '2026-09-22T11:00:00+0000' },
      }] }],
    }
    expect(parsearAviso(aviso).comentarios).toEqual([{
      igMediaId: 'm1', comentarioId: 'c1', autorId: 'u1',
      username: 'juan', texto: 'propiedad', creadoEn: '2026-09-22T11:00:00+0000',
    }])
  })

  it('saca el botón tocado con su dato', () => {
    const aviso = { object: 'instagram', entry: [{ id: 'x', messaging: [{
      sender: { id: 'u1' }, recipient: { id: 'ig' },
      message: { mid: 'm', text: 'Sí, pasámela', quick_reply: { payload: 'reel:abc' } },
    }] }] }
    expect(parsearAviso(aviso).botones).toEqual([{ remitenteId: 'u1', dato: 'reel:abc' }])
  })

  it('un mensaje escrito a mano NO es un botón', () => {
    const aviso = { object: 'instagram', entry: [{ id: 'x', messaging: [{
      sender: { id: 'u1' }, message: { mid: 'm', text: 'hola' } }] }] }
    expect(parsearAviso(aviso).botones).toEqual([])
  })

  it('no explota con un cuerpo con otra forma', () => {
    // Meta cambia formatos sin avisar. Un parser que revienta tumba el webhook
    // entero y nos deja sin los avisos que SÍ entendemos.
    expect(parsearAviso({ cualquier: 'cosa' })).toEqual({ comentarios: [], botones: [] })
    expect(parsearAviso(null)).toEqual({ comentarios: [], botones: [] })
  })
})
```

- [ ] **Paso 2: Verlas fallar.**

- [ ] **Paso 3: Implementar el módulo.** `verificarFirmaInstagram` reusa el algoritmo de
`lib/integrations/whatsapp/webhook.ts:236` (HMAC-SHA256 + `timingSafeEqual`, con el chequeo de
largo antes para que `timingSafeEqual` no tire excepción).

- [ ] **Paso 4: Verlas pasar** — 10 en verde.

- [ ] **Paso 5: Escribir la ruta**

`GET` responde el desafío de alta comparando `hub.verify_token` con
`INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. `POST`: lee el cuerpo **crudo** (`await req.text()`, antes de
cualquier `JSON.parse`, porque la firma se calcula sobre los bytes exactos), verifica la firma
→ 403 si falla, y responde **200 enseguida**. Cada comentario se procesa dentro de su propio
`try/catch`: uno que falla no puede tumbar a los demás.

- [ ] **Paso 6: Agregar la ruta a la lista blanca del middleware**

En `lib/supabase/middleware.ts`, junto a `/api/webhooks/whatsapp`:

```ts
{
  ruta: '/api/webhooks/instagram',
  porque:
    'Los avisos de comentarios y mensajes de Instagram los manda Meta, que no tiene ' +
    'sesión del CRM. La seguridad NO es el login: es la firma x-hub-signature-256 que ' +
    'la ruta verifica con META_APP_SECRET y que falla cerrada. Sin esta entrada el ' +
    'middleware devuelve una redirección al login y la automatización muere EN SILENCIO ' +
    '— Meta no reporta el 307 en ningún lado visible.',
},
```

- [ ] **Paso 7: Commit**

```bash
git add lib/integrations/instagram/webhook.ts lib/integrations/instagram/webhook.test.ts app/api/webhooks/instagram/route.ts lib/supabase/middleware.ts
git commit -m "feat(reels): webhook de Instagram con firma verificada y ruta en la lista blanca"
```

---

## Tarea 11: Cron que publica

**Archivos:**
- Crear: `lib/social/reels/publicador.ts` (el trabajo, reusable y probable)
- Crear: `app/api/cron/reels-publish/route.ts`
- Crear: `supabase/migrations/20260922000002_cron_reels.sql`
- Crear: `scripts/apply-cron-reels-pg.ts`

**Consume:** `crearContenedorReel`, `estadoContenedor`, `publicarContenedor` (T7).

- [ ] **Paso 1: Escribir la ruta.** Copiar **tal cual** el esqueleto de
`app/api/cron/mapa-lugares/route.ts`: `?ping=1` sin auth para confirmar que el deploy está
vivo, y `autorizado()` con **doble validación** (variable `CRON_SECRET` *o* fila
`cron_config` con clave `reels_publish`). En este proyecto conviven dos secretos de cron;
validar contra uno solo deja el job en 403 mudo.

Por corrida: los `programado` vencidos → crear contenedor → `procesando`; los `procesando` →
consultar estado → publicar o marcar fallido. **Tope de 5 reels por corrida** para no pasarse
del tiempo de la función. La respuesta dice qué hizo, y si no hizo nada, por qué.

Antes de crear el contenedor, **vuelve a verificar la landing publicada**: entre que se pidió
la publicación y que corre el cron pudo despublicarse.

- [ ] **Paso 2: Escribir la migración del cron**

Copiar `20260919000012_cron_mapa_lugares.sql`: los marcadores `__SECRETO__` y `__SITIO__`, el
candado `DO $$` que impide aplicarla a mano con el marcador puesto, el `INSERT` en
`cron_config`, y `timeout_milliseconds := 30000` (el default de pg_net es 2000 ms y cortaría).

```sql
SELECT cron.schedule('reels-instagram', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/reels-publish',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
```

**No se aplica todavía.** Va en la Etapa 6, después del deploy: antes apunta a un 404. El
script verifica `?ping=1` antes de programar.

- [ ] **Paso 3: Verificar tipos y lint.**

```bash
npx tsc --noEmit -p tsconfig.reels.json
npx eslint app/api/cron/reels-publish/route.ts lib/social/reels/publicador.ts
```

- [ ] **Paso 4: Commit**

```bash
git add lib/social/reels/publicador.ts app/api/cron/reels-publish supabase/migrations/20260922000002_cron_reels.sql scripts/apply-cron-reels-pg.ts
git commit -m "feat(reels): cron que publica lo programado, con autorización doble"
```

---

## Tarea 12: La tarjeta en la pestaña Difusión

**Archivos:**
- Crear: `components/properties/reels/ReelsCard.tsx`, `ReelFila.tsx`
- Crear: `components/properties/reels/ReelsCard.test.tsx`
- Modificar: `components/properties/detail/tabs/MarketingTab.tsx`

- [ ] **Paso 1: Escribir la prueba de componente**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReelsCard } from './ReelsCard'

describe('ReelsCard', () => {
  it('sin reels invita a subir o enganchar', () => {
    render(<ReelsCard propertyId="p1" reels={[]} puedeDifundir landingPublicada />)
    expect(screen.getByRole('button', { name: /subir un reel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /enganchar/i })).toBeTruthy()
  })

  it('sin landing publicada, publicar está apagado y se explica por qué', () => {
    render(<ReelsCard propertyId="p1" reels={[]} puedeDifundir landingPublicada={false} />)
    expect(screen.getByText(/falta publicar la landing/i)).toBeTruthy()
  })

  it('sin permiso de difundir no muestra ningún botón de acción', () => {
    // El abogado entra a la pestaña Difusión (capacidad ver_difusion) pero no
    // publica. El permiso real lo decide el servidor; esto evita ofrecerlo.
    render(<ReelsCard propertyId="p1" reels={[]} puedeDifundir={false} landingPublicada />)
    expect(screen.queryByRole('button', { name: /subir un reel/i })).toBeNull()
  })
})
```

**OJO con las pruebas de componente en esta Mac:** en frío tardan más de 60 s en cargar
`happy-dom` y el primer intento puede morir con `Failed to start worker`. **No es el código:**
reintentar una vez y esperar. No usar temporizadores simulados con `userEvent`.

- [ ] **Paso 2: Verlas fallar.** **Paso 3: Implementar.** **Paso 4: Verlas pasar.**

- [ ] **Paso 5: Montar la tarjeta en `MarketingTab.tsx`**, debajo de `LandingSection`,
pasándole si la landing está publicada y el permiso resuelto con `alcanceDifusion`.

**Frontera servidor→cliente:** la tarjeta es `'use client'` y recibe **solo datos planos**
(cadenas, números, booleanos). Ningún ícono ni componente viaja como prop desde el servidor:
eso tira la plataforma entera a pantalla en blanco y ningún test lo atrapa.

- [ ] **Paso 6: Commit**

```bash
git add components/properties/reels components/properties/detail/tabs/MarketingTab.tsx
git commit -m "feat(reels): tarjeta de reels en la pestaña Difusión"
```

---

## Tarea 13: Subir el reel

**Archivos:** Crear `components/properties/reels/SubirReelDialog.tsx`

- [ ] **Paso 1: Implementar.** Reusa el camino de subida que ya existe:
`POST /api/properties/[id]/media/upload-init` con `kind:'video'` → `PUT` a la URL firmada →
y en vez del `commit` de multimedia, `POST /api/properties/[id]/reels` con la URL pública.
**Nunca** subir por el servidor: el cuerpo de un request de Next tiene tope.

Valida la extensión **en el navegador y en el servidor** (`mp4`, `mov`). Muestra la
descripción generada, editable, y los tres campos del privado con texto sugerido.

Las respuestas se leen con un helper tolerante: si el cuerpo no es JSON, mostrar *"el
servidor tardó demasiado"* y no `Unexpected token '<'`.

- [ ] **Paso 2: Tipos y lint.** **Paso 3: Commit**

```bash
git add components/properties/reels/SubirReelDialog.tsx
git commit -m "feat(reels): subida del reel con descripción editable y textos del privado"
```

---

## Tarea 14: Enganchar un reel ya publicado

**Archivos:** Crear `components/properties/reels/EngancharReelDialog.tsx`

- [ ] **Paso 1: Implementar.** Lista desde `GET /api/instagram/media` con miniatura, fecha y
cantidad de comentarios. Los ya enganchados aparecen deshabilitados con la leyenda "Ya
enganchado". Al confirmar: `POST .../reels` con `origen:'existente'` e `ig_media_id`.

**Aviso en pantalla, obligatorio:** *"La automatización solo va a responder los comentarios
nuevos. Los que ya están no se tocan."* Es una decisión de diseño que el asesor tiene que ver
antes de confirmar, no una sorpresa.

- [ ] **Paso 2: Tipos y lint.** **Paso 3: Commit**

```bash
git add components/properties/reels/EngancharReelDialog.tsx
git commit -m "feat(reels): enganchar un reel ya publicado eligiéndolo de la lista"
```

---

## Tarea 15: Dar de alta el webhook en Meta

**Archivos:** Crear `scripts/suscribir-webhook-instagram.ts`

Hoy la app **no tiene ninguna suscripción** (`/{app}/subscriptions` → vacío) y la página
tampoco. Sin esto, nada de la cadena de comentarios se entera de nada.

- [ ] **Paso 1: Escribir el script.** Dos llamadas, ambas idempotentes:

1. `POST /{app-id}/subscriptions` con `object=instagram`,
   `callback_url=https://inmodf.com.ar/api/webhooks/instagram`, `fields=comments,messages`,
   `verify_token=$INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, autenticada con `app_id|app_secret`.
2. `POST /{page-id}/subscribed_apps` con `subscribed_fields=comments,messages`, usando el
   **token de la página** (el de usuario de sistema da error 190: "en la nueva experiencia
   para páginas se necesita un token de acceso a la página"). El token de página sale de
   `GET /me/accounts?fields=access_token`.

Modo `--verificar` que solo lee y muestra el estado, sin escribir.

- [ ] **Paso 2: Correr el modo verificación** (no cambia nada):

```bash
node --env-file=../../../.env.local --import tsx scripts/suscribir-webhook-instagram.ts --verificar
```

Esperado hoy: ambas listas vacías. **El alta real se corre en la Etapa 6**, cuando el deploy
ya sirve la ruta: Meta llama al `callback_url` en el mismo momento del alta y, si devuelve
404, rechaza la suscripción.

- [ ] **Paso 3: Commit**

```bash
git add scripts/suscribir-webhook-instagram.ts
git commit -m "feat(reels): script para dar de alta y verificar el webhook de Instagram"
```

---

## Autorrevisión del plan

**Cobertura del spec:** los 15 criterios de aceptación tienen tarea. 1→T12, 2→T13, 3→T3+T13,
4→T8+T12, 5→T8+T11, 6→T9+T14, 7→T8+T5, 8→T10, 9→T1 (UNIQUE) + T10, 10→T5, 11→T5, 12→T2,
13→T5, 14→T11, 15→T7 (errores legibles) + T11.

**Nombres cruzados verificados:** `comentarioCoincide` (T2) se usa en T5; `elegirRespuesta`
(T4) en T10; `puedePedirPublicacion` (T6) en T8; `estadoContenedor` (T7) en T11;
`decidirQueHacer` (T5) en T10. Sin discrepancias.

**Orden de dependencias:** T1 antes que todo (tablas y comandos de verificación). T2→T5.
T7→T10 y T11. T3→T8 y T13. T8→T12, T13, T14.

## Lo que NO se hace en este plan

Aplicar la migración del cron y dar de alta el webhook en Meta: las dos exigen que el código
esté desplegado. Van en la Etapa 6, en ese orden, y el permiso `pages_messaging` lo resuelve
el dueño en el panel de Meta.
