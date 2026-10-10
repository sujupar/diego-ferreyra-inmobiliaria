# Plan — Asistente de IA de la tasación

Spec: `docs/superpowers/specs/2026-10-03-asistente-ia-tasacion-design.md` (aprobado 2026-10-10).
Diseño elegido: **A — panel lateral** sobre la tasación
(https://claude.ai/artifact/Ar6oiF7VTBn4U4HWqgJ5ng). Rama `feat/asistente-tasacion`.

Decisiones tomadas con la aprobación del spec (2026-10-10):
- El asistente **propone** ajustes con un botón "Aplicar a la tasación" (tarjeta naranja del
  diseño A); nada se aplica solo. Aplicar pasa por el mismo recálculo y queda registrado.
- Las conversaciones son **compartidas**: las ve todo el que puede editar esa tasación.
- El abogado no ve el asistente.

## Forma de la respuesta: bloques, no texto libre

No hay renderizador de markdown en el repo y, sobre todo, el principio rector del spec
("explicar simple, ordenado") se garantiza mejor con estructura que con instrucciones. El
modelo devuelve JSON con `bloques`:

- `resumen` — la respuesta en una frase (siempre primero).
- `pasos` — lista numerada `{titulo, texto}`.
- `tabla` — `{columnas, filas}` (para el cálculo paso a paso).
- `texto` — párrafo libre corto.
- `borrador` — texto para mandarle a alguien (propietario), con botón Copiar.

y opcionalmente `propuesta` `{objetivo: 'sujeto'|'comparable', indice?, campo, valor, motivo}`
con `campo` ∈ {locationCoefficient, quality, conservationState, disposition, floor, age}.
El precio antes/después de una propuesta lo calcula el código (`calculateValuation`), nunca
el modelo.

## Tareas

1. **Migración** `supabase/migrations/20261010000001_appraisal_chat.sql` + `scripts/apply-appraisal-chat-pg.ts`
   (aplica y verifica con select; aborta si algo no cuadra).
   - `appraisal_chat_threads` (appraisal_id FK CASCADE, title, created_by FK profiles SET NULL,
     created_at, updated_at, archived_at) + índice por appraisal_id.
   - `appraisal_chat_messages` (thread_id FK CASCADE, role CHECK user|assistant, bloques jsonb,
     texto, adjuntos jsonb, propuesta jsonb, propuesta_aplicada_at, status CHECK ok|failed,
     error, model, usage jsonb, created_by FK profiles SET NULL, created_at) + índice
     (thread_id, created_at).
   - RLS habilitada; SELECT para `authenticated` si la tasación es visible para el usuario
     (subconsulta a `appraisals`, que ya tiene RLS por rol). Escritura solo por las rutas
     (service role) que validan `canAccessAppraisal` + `puedeEditarTasacion`.
   - Bucket privado `appraisal-chat`.
   Prueba: el script verifica columnas, CHECKs, RLS y bucket contra la base.

2. **Módulos puros** en `lib/asistente-tasacion/` con TDD:
   - `explicar-calculo.ts` — `explicarCalculo(resultado, comparables)`: los pasos del cálculo
     con los números exactos (superficie, $/m² de cada comparable y sus coeficientes,
     promedio, coeficiente del sujeto, valor, redondeo, Zona de No Venta, gastos, en mano).
   - `contexto.ts` — arma el paquete de contexto con topes de tamaño (tasación, explicación,
     IA y sus correcciones, textos/precios del informe, mercado congelado, otras tasaciones del
     barrio últimos 12 meses resumidas). Nunca incluye `property_images`.
   - `historial.ts` — recorta el historial a los últimos mensajes dentro de un presupuesto de
     caracteres (sin segunda llamada de IA).
   - `respuesta.ts` — esquema zod de los bloques y la propuesta (con rangos del método: ubicación
     0,85–1,15, enums de calidad/estado/disposición). Respuesta inválida → error legible.
   - `propuesta.ts` — `aplicarPropuesta(features…)` y `precioConPropuesta(...)` vía calculadora.
   - `prompt.ts` — prompt del sistema: el principio de explicar simple, "solo citá números que
     estén en el contexto", cuándo proponer, formato de bloques.
   - `titulo.ts` — título del hilo desde la primera pregunta (sin IA).

3. **Cliente de IA con imágenes y PDF** `lib/ai/chat-multimodal.ts` (OpenAI Chat Completions,
   partes `image_url` y `file`), con `timeoutMs` y modo prueba inyectable. Verificación empírica
   con una llamada real de imagen y una de PDF antes de cablearlo.

4. **Rutas** (finas: auth, Zod, módulo, persistencia):
   - `GET/POST /api/appraisals/[id]/asistente` — listar / crear hilo.
   - `GET/PATCH /api/appraisals/[id]/asistente/[hiloId]` — mensajes (con URLs firmadas de los
     adjuntos) / renombrar o archivar.
   - `POST …/[hiloId]/adjuntos` — URL firmada de subida directa (patrón de legal-docs).
   - `POST …/[hiloId]/mensajes` — guarda el mensaje del asesor, UNA llamada de IA (tope 25 s),
     guarda la respuesta (o el fallo con motivo). `{reintentar: mensajeId}` reintenta.
   - `POST …/[hiloId]/mensajes/[mensajeId]/aplicar` — aplica la propuesta con el mismo camino
     de escritura de la ficha, recalcula, marca `propuesta_aplicada_at`.
   Pruebas: route tests con dobles (patrón de `app/api/appraisals/[id]/route.test.ts`).

5. **UI diseño A** en `components/appraisal/asistente/`: `PanelAsistente` (Sheet a la derecha),
   selector de conversación + "Nuevo chat", `Mensaje` (bloques), `TarjetaPropuesta`,
   `Compositor` (adjuntar imagen/PDF, atajos, Enviar). Lectura de respuestas con helper tolerante
   al 504 HTML. Botón "Asistente de tasación" en `/appraisal/new` (con tasación guardada) y en
   `/appraisals/[id]`. Render verificado con `renderToStaticMarkup`.

6. **Pruebas de calidad del asistente**: 5 preguntas fijas sobre 3 tasaciones reales (copias
   `[TEST`); cada número citado tiene que existir en el contexto; claridad revisada a ojo.

7. **QA en la vista previa** con el navegador de Claude: crear hilo, preguntar "¿Cómo llegó a
   este precio?", adjuntar una captura y un PDF, recargar (persiste), abrir un segundo hilo,
   aplicar una propuesta y ver el precio nuevo, entrar como asesor ajeno (no ve) y como abogado
   (no ve).

## Orden de deploy
Migración aplicada y verificada ANTES de mergear (las rutas fallan sin las tablas).

## Riesgos
- Tiempo de Netlify con PDF + imagen: tope 25 s, adjuntos ≤ 10 MB, máx. 3 por mensaje.
- Costo: cada respuesta guarda tokens; se mide en el piloto.
- Datos sensibles (capturas de chats): bucket privado, URLs firmadas de 10 min, RLS.
