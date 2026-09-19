# Descripciones en lote — Plan de implementación

> Ejecución inline, tarea por tarea, TDD en todo `lib/`. Spec:
> `docs/superpowers/specs/2026-09-19-descripciones-en-lote-design.md`.

**Objetivo:** que toda propiedad activa (terrenos incluidos) pueda generar su descripción y que admin/dueño puedan regenerar muchas a la vez: borradores en segundo plano, con revisión y aprobación.

**Arquitectura:** cola `descripcion_trabajos` + worker por pg_cron que avanza UNA etapa por trabajo (máximo 3 trabajos en paralelo, máximo 1 de zona) reusando las funciones de etapa que ya existen; vista `vw_descripciones_estado` para la lista paginada; rutas finas bajo `/api/descripciones`; pantalla `/properties/descripciones`.

## Restricciones globales

- Una llamada de IA por trabajo por corrida; ninguna encadenada dentro de un pedido.
- Nada se guarda en `properties.description` sin aprobación de una persona.
- Migraciones antes del deploy; el job de pg_cron DESPUÉS del deploy.
- Rutas: `requireAuth` + permiso `settings.manage`; cron con autenticación dual.
- Commits: autor `Sujupar <redstyle50@gmail.com>`, mensajes en castellano.
- Pruebas: `npx vitest run --config vitest.descripcion.config.ts`; tipos: `tsconfig.descripcion.json` (ampliados con lo nuevo).

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260919000002_descripcion_trabajos.sql` | tabla, índices, columna `descripcion_generada_en`, vista |
| `scripts/apply-descripcion-trabajos-pg.ts` | aplica y verifica |
| `supabase/migrations/20260919000003_cron_descripciones.sql` + `scripts/apply-cron-descripciones-pg.ts` | job de pg_cron (después del deploy) |
| `lib/descripcion/requisitos.ts` | requisitos por tipo (terreno) y con cantidad de fotos |
| `lib/descripcion/entradas.ts`, `metodo-diego.ts` | tipología TERRENO; bloque DESCRIPCIÓN ANTERIOR |
| `lib/descripcion/lote/cola.ts` | lógica pura de la cola (qué tomar, qué sigue, cuándo falla, etiquetas) |
| `lib/descripcion/lote/worker.ts` | IO del worker (resucitar, tomar, avanzar, guardar borrador) |
| `lib/descripcion/lote/listado.ts` | IO de la lista, el encolado y la aprobación |
| `app/api/cron/descripciones/route.ts` | worker por pg_cron |
| `app/api/descripciones/route.ts` | GET lista + contadores; POST encolar |
| `app/api/descripciones/[trabajoId]/route.ts` | GET borrador; POST aprobar / descartar / reintentar |
| `app/api/descripciones/aprobar/route.ts` | POST aprobar varios |
| `app/(dashboard)/properties/descripciones/page.tsx` + `components/properties/descripcion/lote/*` | pantalla |
| `lib/nav/sections.ts` | ítem "Descripciones" (admin/dueño) |
| `components/properties/descripcion/BotonGenerarDescripcion.tsx` | aviso de borrador pendiente |

---

### Tarea 1 — Base de datos
- [ ] Migración aditiva:
  - tabla `descripcion_trabajos` (campos del spec; CHECK de `estado` y `etapa`; FK a `properties` con CASCADE y a `profiles` con SET NULL);
  - índice ÚNICO parcial `(property_id) WHERE estado IN ('pendiente','en_curso','listo')`;
  - índice parcial `(proximo_intento_en) WHERE estado IN ('pendiente','en_curso')`;
  - RLS activada sin políticas;
  - `properties.descripcion_generada_en timestamptz`;
  - vista `vw_descripciones_estado` con `security_invoker`: activas + cantidad de fotos + último trabajo por LATERAL + portales publicados.
- [ ] Script que aplica, verifica columnas, índices y vista, cuenta propiedades antes y después, y aborta si algo no cuadra. Aplicar y verificar por REST.

### Tarea 2 — Terrenos (puro)
- [ ] `faltanParaGenerar` por tipo: el terreno pide `total_area` en vez de ambientes y superficie cubierta. Acepta `cantidadFotos` además de `photos`.
- [ ] `tipologiaDiego('terreno') = 'TERRENO'`. Prompt: estructura TERRENO rotulada como adaptación. `armarEntradaEscritura` para terreno: superficie del lote.
- [ ] Tests: terreno completo no falta nada; terreno sin superficie del lote; depto sigue igual; `cantidadFotos` equivale a `photos`; el prompt contiene la estructura TERRENO.

### Tarea 3 — Descripción anterior como fuente (si el dueño la confirma)
- [ ] Bloque `DESCRIPCIÓN ANTERIOR` en `armarEntradaEscritura`: delimitado, recortado a 3.000 caracteres, sin el disclaimer.
- [ ] Reglas nuevas en el prompt: segunda categoría, solo hechos, nunca contra datos o fotos, nunca distancias ni frases.
- [ ] Tests: el bloque aparece solo si hay descripción; se le saca el disclaimer; « » saneadas.
- [ ] Corrida real sin guardar sobre Doblas 248: los hechos de la descripción a mano (palier privado, losa radiante, apto crédito) aparecen y no hay contradicciones.

### Tarea 4 — Guardar con marca y reemplazo
- [ ] `guardarDescripcion` escribe `descripcion_generada_en` y pasa a `reemplazado` el trabajo `listo` de esa propiedad (salvo el que se está aprobando).
- [ ] `estadoDescripcion` devuelve `borradorPendiente` para el aviso de la ficha.

### Tarea 5 — Lógica de la cola (pura, TDD)
- [ ] `elegirParaCorrida(candidatos, { maximo: 3, maximoZona: 1 })`: respeta el orden (más viejos primero) y el tope de zona.
- [ ] `siguienteEtapa(etapa, resultado)`: fotos → zona → escribir → `listo`; si la escritura trae problemas y todavía no se corrigió → escribir con corrección.
- [ ] `alFallar(trabajo)`: reintento con espera creciente; agotado → `fallido`.
- [ ] `etiquetaEstado(fila)` para la tabla; `filtroDePestaña`.
- [ ] Tests de cada regla, incluido "dos de zona en la misma corrida → toma una sola".

### Tarea 6 — Worker + ruta de cron
- [ ] `lib/descripcion/lote/worker.ts`: resucitar colgados (`en_curso` con `tomado_en` de hace más de 5 minutos), cerrar agotados, tomar con UPDATE condicional, avanzar en paralelo (`Promise.allSettled`), guardar el borrador y el uso de tokens, registrar errores.
- [ ] `ejecutarEtapaEscribir` devuelve también el uso de tokens (y lo mismo las otras etapas) para registrarlo.
- [ ] Ruta `app/api/cron/descripciones` con `?ping=1` y autenticación dual (`cron_config.descripciones`).
- [ ] Test de la ruta: 403 sin secreto; acepta el de env o el de `cron_config`.

### Tarea 7 — API de la pantalla
- [ ] `GET /api/descripciones?pestaña&pagina&propiedad`: filas de la vista + requisitos calculados en TS + contadores por pestaña.
- [ ] `POST /api/descripciones` `{ ids } | { todasLasQueCumplen: pestaña }`: encola por lotes de 500 con ON CONFLICT DO NOTHING; devuelve cuántas encoló y cuántas salteó (y por qué).
- [ ] `GET/POST /api/descripciones/[trabajoId]`: borrador + descripción actual; `aprobar` (con texto editado), `descartar`, `reintentar`, `volver_a_generar`.
- [ ] `POST /api/descripciones/aprobar` `{ ids }`: rechaza los que tienen avisos o no están en `listo`.
- [ ] Zod en todo, permiso `settings.manage`, errores en JSON legible.

### Tarea 8 — Pantalla
- [ ] Página con pestañas y contadores, tabla paginada, casillas, "Elegir todas las que cumplen", confirmación con número y tiempo, refresco cada 20 s mientras haya trabajos en proceso.
- [ ] Diálogo de revisión: actual vs. nueva, nueva editable, avisos, portales, aprobar / descartar / volver a generar.
- [ ] Menú: "Descripciones" en Propiedades para quien tiene `settings.manage`; test de `lib/nav/sections`.
- [ ] Aviso de borrador pendiente en la ficha.
- [ ] Pruebas de pantalla: selección, confirmación, que no se pueda aprobar en lote un borrador con avisos.

### Tarea 9 — Programar y probar en producción
- [ ] Revisión adversarial + `/security-review`.
- [ ] PR, vista previa, QA de interfaz (roles, celular, consola y red).
- [ ] Merge, deploy, `?ping=1`, programar el job (script), verificación en 3 capas (`cron.job_run_details` → `net._http_response` → trabajos avanzando).
- [ ] Prueba real del criterio 12 con 3 propiedades; auditar borradores; CLAUDE.md; reporte con la tabla criterio → prueba → resultado.
