# Plan: revisión obligatoria de mensajes y selector de modo

Spec: [../specs/2026-09-22-reels-mensajes-editables-y-modo-design.md](../specs/2026-09-22-reels-mensajes-editables-y-modo-design.md).
Pruebas: `npx vitest run --config vitest.reels.config.ts`. Tipos: `npx tsc --noEmit -p tsconfig.reels.json`.

## Consumidores (grep hecho)

- `RESPUESTAS_CON_PRIVADO` / `RESPUESTAS_SIN_PRIVADO` / `elegirRespuesta`: `respuestas.ts` (+test), `procesador.ts`.
- `DM_POR_DEFECTO` / `SEGUIMIENTO_POR_DEFECTO`: `procesador.ts`. `dm_boton` default en la migración 000001.
- `automatizacion_activa` / `simulacro` en pantallas: `ConfigurarReelDialog`, `ReelFila`, `ReelsCard.test`.
- Campos editables: `edicion.ts` (lista blanca), ruta PATCH, ruta POST (creación), `servicio.crearReel`.

## Tareas

1. **Migración** `20260922000005_reels_frases_publicas.sql` (+ script `apply-reels-frases-pg.ts`):
   dos columnas `text[]` NOT NULL con default de fábrica, función `reels_frases_validas` y CHECK.
   Verificar: columnas, default en el reel ya enganchado, y que la base rechace 4 frases o una vacía.
2. **`textos-por-defecto.ts`** (puro): frases con/sin privado, privado, botón, mensaje del enlace.
   El procesador y `respuestas.ts` pasan a usarlo.
3. **`mensajes.ts`** (puro): `limpiarFrases` (trim, sin vacías, 1..3, ≤300) y `validarMensajes`
   (privado ≤1000, botón 1..20, seguimiento ≤1000). TDD.
4. **`respuestas.ts`**: `elegirRespuesta(semilla, frases)` con fallback al catálogo. TDD.
5. **`modo.ts`** (puro): `modoDelReel` y `camposDelModo`. TDD.
6. **Guardado**: `edicion.ts` suma las 2 columnas a la lista blanca; POST acepta los mensajes en la
   creación; PATCH y POST validan con `mensajes.ts`. `GET /reels` suma `general`. Procesador usa las
   frases del reel.
7. **Pantallas**: `RevisionMensajes` (chat editable, compartido), `SelectorModo` (3 opciones +
   confirmación de En vivo + aviso del interruptor general), Enganchar/Subir en 2 pasos, Configurar
   con los dos, `ReelFila` con el modo. Pruebas de componente.
