# Plan: reels con varias palabras y cuentas de prueba

Spec: [../specs/2026-09-22-reels-varias-palabras-y-cuentas-de-prueba-design.md](../specs/2026-09-22-reels-varias-palabras-y-cuentas-de-prueba-design.md).
Pruebas: `npx vitest run --config vitest.reels.config.ts`. Tipos: `npx tsc --noEmit -p tsconfig.reels.json`.

## Consumidores de `palabra_clave` (grep hecho)

`lib/social/reels/{palabra-clave,decision,descripcion,edicion,servicio}.ts` ·
`app/api/properties/[id]/reels/route.ts` · `app/api/properties/[id]/reels/[reelId]/route.ts` ·
`components/properties/reels/{SubirReelDialog,EngancharReelDialog,ConfigurarReelDialog,ReelFila}.tsx`.
Consumidores de `AjustesGlobales`: `decision.ts`, `procesador.ts` (`leerAjustes`) y sus pruebas.

## Tareas

1. **Migración** `supabase/migrations/20260922000003_instagram_cuentas_de_prueba.sql`
   (`cuentas_de_prueba text[] NOT NULL DEFAULT '{}'`) + `scripts/apply-instagram-cuentas-prueba-pg.ts`.
   Verificar con `select` que la columna existe y que la fila `default` quedó con `{}`.
2. **`palabra-clave.ts`**: `separarPalabras` (coma, trim, sin vacías, sin repetidas comparando
   normalizado), `limpiarPalabras` (tope 10 palabras / 200 caracteres → error en castellano;
   vacía → `null`) y `comentarioCoincide` con lista (cualquiera). TDD en `palabra-clave.test.ts`.
3. **`descripcion.ts`**: el llamado usa solo la primera palabra. TDD en `descripcion.test.ts`.
4. **`decision.ts`**: `AjustesGlobales.cuentas_de_prueba`, `ComentarioEntrante.autor_username`,
   `esCuentaDePrueba` (sin `@`, minúscula, exacto, null → false). La excepción va dentro del
   bloque del simulacro, después de todos los descartes. TDD en `decision.test.ts`.
5. **`procesador.ts`**: `leerAjustes` lee y normaliza `cuentas_de_prueba` (falla cerrado: lista
   vacía si no se entiende), y le pasa `c.username` a la decisión.
6. **Guardado**: `edicion.ts` y la ruta de creación usan `limpiarPalabras`; el zod sube de 60 a
   200 caracteres y un error de lista vuelve como 400 legible. TDD en `edicion.test.ts`.
7. **Pantallas**: los 3 diálogos ("Palabras que activan la respuesta" + ayuda), `ReelFila`
   (muestra todas), `ReelsCard` (título del tamaño de las otras tarjetas, ancla `reels-instagram`,
   sin el cartel "Falta la landing" mientras carga), y en `PostCaptureActions` una fila "Reels de
   Instagram → Ir a reels" debajo de la grilla. Prueba en `ReelsCard.test.tsx`.
8. **Script de configuración** `scripts/reels-cuentas-de-prueba.ts` (`--ver`, `--agregar <usuario>`,
   `--quitar <usuario>`), para cargar `juliandavidpr` sin tocar SQL a mano.

Después: revisión adversarial, PR, QA en la vista previa, merge, y la prueba con la cuenta del
dueño en el reel del 20/09 (Doblas 248).
