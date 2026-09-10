# Tasador IA — segunda opinión de precio con el mismo método (diseño)

**Fecha:** 2026-09-10
**Estado:** aprobado por el usuario (diseño en chat), pendiente de plan.

## 1. Problema

El tasador de la plataforma (`lib/valuation/calculator.ts`, método de comparables +
Ross-Heidecke) devuelve UN precio. El usuario quiere una **reconfirmación**: una segunda
tasación hecha por inteligencia artificial, con el MISMO método, para comparar las dos y
elegir con cuál trabajar. Con dos precios que siguen la misma regla, sabe si el número
"se mueve un poco para arriba o para abajo" y gana precisión.

Restricción dura del usuario: el tasador actual **funciona perfecto y no se toca**. Esto
se AGREGA. Y lo que se elija tiene que alimentar todo lo que ya existe (tablas, Mapa de
Valor, PDF, listado, pipeline) sin distinción de origen.

## 2. Decisiones de diseño (aprobadas)

1. **La IA es el tasador, la calculadora es la misma.** La IA recibe lo mismo que ve un
   tasador humano (método completo, propiedad a tasar, comparables con precio,
   superficies, descripción, ubicación, antigüedad, publicación) y devuelve su
   **interpretación** de cada propiedad: calidad constructiva, estado de conservación,
   disposición, piso, antigüedad y coeficiente de ubicación, con una justificación por
   propiedad y un resumen con nivel de confianza. Con esas interpretaciones,
   `calculateValuation` (sin cambios) produce los números.
   - Por qué NO dejar que la IA "invente" los números finales: los modelos se equivocan
     en aritmética y ningún coeficiente del PDF sería explicable por la tabla del método.
   - Consecuencia: el resultado IA tiene EXACTAMENTE la forma `ValuationResult`. Tablas,
     Mapa de Valor, gastos, escenarios de compra y PDF funcionan idénticos sin tocarlos.
2. **Dos snapshots independientes, misma forma.** `valuation_result` (clásico, como hoy) y
   `ai_valuation_result` (IA). Cada uno guarda sus propias características por comparable.
   Editar uno en línea NO toca al otro.
3. **Los tres precios desnormalizados siguen al tasador elegido.** `publication_price`,
   `sale_value` y `money_in_hand` se reescriben con los del tasador seleccionado. Así
   listado, pipeline, contactos, emails, adjunto PDF del email y "captar como propiedad"
   siguen la elección **sin cambiar una línea**.
4. **Nombre en pantalla: "Tasador"** (Tasador clásico / Tasador IA), no "método": las dos
   usan el mismo método de comparables; cambia quién interpreta.
5. **Precios editados a mano del PDF** (`report_edits.priceOverrides`) se borran al
   cambiar de tasador, porque se hicieron contra los números del otro. Se avisa en pantalla.
6. **Sin fotos en esta versión** (texto solo): para caber en el tiempo de una función de
   Netlify y por costo. La IA no descarta comparables en esta versión (posible mejora futura).
7. **Default = clásico.** Las tasaciones existentes quedan en `calculator` y no cambian.
   La tarjeta IA de una tasación vieja ofrece "Generar".

## 3. Modelo de datos

Migración `supabase/migrations/20260910000001_appraisal_ai_valuation.sql` (verificar el
directorio antes: el último prefijo es `20260903000001`). Se aplica con
`scripts/apply-appraisal-ai-valuation-pg.ts` (patrón session pooler + `pg`, ver CLAUDE.md)
que además VERIFICA contra la base que las columnas existen y que ninguna fila quedó con
`valuation_source <> 'calculator'`.

```sql
ALTER TABLE appraisals
  ADD COLUMN ai_valuation_result JSONB,
  ADD COLUMN ai_valuation_status TEXT
      CHECK (ai_valuation_status IN ('pending','ready','failed')),
  ADD COLUMN ai_valuation_error TEXT,
  ADD COLUMN valuation_source TEXT NOT NULL DEFAULT 'calculator'
      CHECK (valuation_source IN ('calculator','ai'));
```

- Sin índices nuevos (se leen por `id`). RLS: columnas sobre una tabla ya protegida por
  `20260505000001_rls_per_role_safe.sql`; las policies existentes aplican.
- `types/database.types.ts`: agregar las 4 columnas a `Row`/`Insert`/`Update` de `appraisals`.

### 3.1 Forma de `ai_valuation_result`

```ts
// lib/valuation/ai-types.ts
export type AiConfidence = 'alta' | 'media' | 'baja'

export interface AiComparableInterpretation {
  /** Snapshot COMPLETO de features con las que la IA tasó (objetivas + subjetivas).
   *  Es la fuente para recalcular y para la edición en línea del snapshot IA. */
  features: ValuationFeatures
  /** Justificación corta (≤ 240 chars) de calidad/estado/disposición/ubicación. */
  reasoning: string
}

export interface AiValuationMeta {
  provider: string            // 'openai' | 'deepseek'
  model: string
  generatedAt: string         // ISO
  confidence: AiConfidence
  summary: string             // ≤ 600 chars, para la tarjeta
  inputFingerprint: string    // ver 3.2
  subject: AiComparableInterpretation
  comparables: AiComparableInterpretation[]  // mismo orden que las filas normales (sort_order 0..n)
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export type AiValuationResult = ValuationResult & { ai: AiValuationMeta }
```

Se guarda sanitizado con `sanitizeValuationResultForStorage` (quita
`comparableAnalysis[].property`, igual que el clásico). Al leer, se rehidrata `property`
desde las filas de `appraisal_comparables` (título, url, imágenes, precio) pero con
`features = ai.comparables[i].features`.

### 3.2 Huella de insumos (`inputFingerprint`)

Hash estable (sha-256 de un JSON canónico) de los insumos **objetivos**: precio y moneda
de cada comparable, superficies (cubierta, semicubierta, descubierta, total), descripción,
ubicación, piso, antigüedad, fecha de publicación; lo mismo del subject; `expenseRates` y
`ownerSharePercent`. NO incluye los juicios subjetivos (calidad, estado, disposición, J),
que son justamente lo que cada tasador decide.

Uso: si la huella actual de la tasación ≠ `ai.inputFingerprint`, la tarjeta IA muestra
"Desactualizada: cambiaron los datos" con botón "Regenerar". No se regenera sola en cada
autosave (sería una llamada paga por tecla); se regenera sola SOLO al tocar "Calcular
Valor de Mercado" en el wizard.

## 4. Módulos

### 4.1 `lib/valuation/ai-appraiser.ts` (puro, testeado)

- `buildAiAppraisalPrompt(input)`: system + user. El system incluye el método
  **generado desde `VALUATION_RULES`** (tablas de calidad, disposición, piso, estados de
  conservación, cómo funciona Ross-Heidecke con vida útil 70) para que nunca se
  desincronice del código. El user incluye subject y comparables (índice, precio,
  superficies, descripción recortada a ~600 chars, ubicación, piso, antigüedad,
  publicación, vistas) y las instrucciones de salida.
- Contrato de salida (JSON, validado con zod, `jsonMode: true`):
  ```json
  {
    "subject": { "quality": "GOOD", "conservationState": "STATE_2", "disposition": "FRONT",
                 "floor": 3, "age": 40, "locationCoefficient": 1.02, "reasoning": "..." },
    "comparables": [ { "index": 0, ...mismos campos... } ],
    "summary": "...", "confidence": "media"
  }
  ```
  Reglas de validación: enums exactos; `locationCoefficient` en `[0.70, 1.30]`; `floor`
  en `[0, 60]`; `age` en `[0, 150]`; `comparables` debe cubrir TODOS los índices sin
  repetir. Cualquier violación → error (status `failed`), nunca "datos a medias".
- `mergeInterpretation(base: ValuationFeatures, ai)`: superficies y precio se conservan
  del dato objetivo; `floor` y `age` se toman de la IA SOLO si el dato objetivo es null;
  `quality`, `conservationState`, `disposition`, `locationCoefficient` siempre de la IA.
- `runAiAppraisal(input, deps)`: arma prompt → `chatCompletion({ jsonMode, temperature: 0.2,
  maxTokens: 2000, timeoutMs: 20_000 })` → valida → `mergeInterpretation` por propiedad →
  `calculateValuation` → `completeValuation` (4.2) → devuelve `AiValuationResult`.
  `deps.chat` inyectable para tests. **Una sola llamada al modelo por request** (regla
  dura de CLAUDE.md).
- `inputFingerprint(...)` (3.2).

### 4.2 `lib/valuation/complete.ts` (puro, extraído del wizard)

Hoy el wizard enriquece el resultado en dos lugares (`handleCalculate` y el efecto de
recálculo) con `ownerShareMoney`, `purchaseScenarios`, `selectedScenarioIds`,
`ownerSharePercent`, `purchaseResult`. Se extrae a
`completeValuation(result, { ownerSharePercent, purchaseScenarios, selectedScenarioIds, previousPurchaseResult })`
y el wizard la usa en ambos lugares (mejora puntual, sin cambiar comportamiento). La ruta
IA la usa con los mismos parámetros leídos del `valuation_result` clásico guardado, así los
escenarios de compra de la versión IA salen de SU `moneyInHand`.

### 4.3 `lib/valuation/active.ts` (puro, testeado)

- `activeValuation(row) → { source: 'calculator'|'ai', result: ValuationResult }`. Si
  `valuation_source='ai'` pero no hay resultado IA `ready`, cae a `calculator` (defensa).
- `denormalizedPrices(result) → { publication_price, sale_value, money_in_hand, currency }`.
- `buildAiComparables(rows, ai)`: rehidratación descrita en 3.1.
- `isAiStale(row, currentFingerprint)`.

### 4.4 Persistencia (`lib/supabase/appraisals-write.ts`, `appraisals.ts`)

- `replaceAppraisalComparables` (PUT, camino clásico): escribe `valuation_result` como hoy,
  pero los tres precios desnormalizados SOLO si `valuation_source='calculator'` (lee la
  fila primero). Si la fuente es IA, los deja como están.
- Nuevo `updateAiValuation(supabase, id, patch)`: escribe `ai_valuation_result`,
  `ai_valuation_status`, `ai_valuation_error`; si la fuente es IA y el status es `ready`,
  reescribe los precios desnormalizados.
- Nuevo `selectValuationSource(supabase, id, source)`: valida que el destino exista
  (`ai` exige `ai_valuation_status='ready'`), escribe `valuation_source`, reescribe los
  precios desnormalizados desde el resultado elegido y **borra
  `report_edits.priceOverrides`** (preservando el resto de `report_edits`).
- Cliente: `getAppraisal` devuelve las 4 columnas nuevas en `AppraisalDetail`;
  `selectValuationSource(id, source)` y `saveAiValuation(id, result)` (PATCH).

### 4.5 Endpoints

Todas las escrituras llevan los DOS candados que ya usa el PUT: `puedeEditarTasacion(role)`
(`lib/auth/appraisal-access.ts`) + `canAccessAppraisal(user, id)`. El abogado (alcance
`vinculadas`) sigue recibiendo la ficha resumida (`COLUMNAS_TASACION_RESUMIDA`), que NO
incluye `ai_valuation_result` (es know-how, como `valuation_result`); sus dos importes
siguen al tasador elegido porque son las columnas desnormalizadas.

- `POST /api/appraisals/[id]/ai-valuation` — candados de escritura. Carga
  la tasación y sus comparables normales (`sort_order < 1000`), marca `pending`, corre
  `runAiAppraisal`, guarda `ready` + resultado (o `failed` + mensaje) y responde con la fila
  actualizada. Idempotente: una segunda llamada regenera (es lo que hace "Regenerar").
  Sin `maxDuration` (Netlify lo ignora); el techo real es el `timeoutMs` de la llamada.
- `PATCH /api/appraisals/[id]` — se extiende el body: `{ reportEdits }` (como hoy) **o**
  `{ valuationSource: 'calculator'|'ai' }` **o** `{ aiValuationResult }` (edición en línea
  del snapshot IA). Un solo campo por llamada; el resto sigue igual.
- `GET /api/appraisals/[id]` — sin cambios (`select('*')` ya trae las columnas nuevas).

### 4.6 UI

**`components/appraisal/AppraiserPicker.tsx`** (compartido por wizard y detalle). Dos
tarjetas lado a lado (una columna en móvil):

- Izquierda **"Tasador clásico"**: precio de publicación, valor de venta, dinero en mano,
  precio por m² del subject.
- Derecha **"Tasador IA"**: mismos cuatro números + confianza + resumen (plegable) +
  diferencia porcentual contra el clásico en el precio de publicación. Estados: `loading`
  ("Analizando comparables…", spinner), `ready`, `failed` (mensaje + "Reintentar"),
  `missing` ("Generar"), `stale` (aviso + "Regenerar"; los números siguen visibles).
- La tarjeta elegida lleva borde de marca y etiqueta "En uso". Click → `onSelect(source)`.
  La IA solo es seleccionable en `ready`.
- `pending` guardado en la base con más de 2 minutos se trata como `failed` (la función
  pudo morir a mitad).

**Wizard (`app/(dashboard)/appraisal/new/page.tsx`).** "Calcular Valor de Mercado" hace
lo de siempre (calcula, guarda, crea deal). Con el id en mano dispara el POST de IA
(también en modo edición). El picker va arriba de "Resultados del Informe". El
`ValuationReport` y el `PDFPreviewModal` de abajo reciben `activeValuation`. Seleccionar
→ PATCH `valuationSource`. En modo edición se hidrata desde la fila (`ai_valuation_result`,
`valuation_source`).

**Detalle (`app/(dashboard)/appraisals/[id]/page.tsx`).** Picker arriba del informe.
`result` pasa a ser `valuationOverride ?? activeValuation(appraisal).result`. Cambiar
tasador → PATCH → recarga → toast "Precios editados a mano del PDF descartados" si había
`priceOverrides`.

**Edición en línea.** En el **detalle**, los tres handlers existentes se ramifican por
tasador en uso. Con `calculator` hacen lo de siempre (PUT). Con `ai` recalculan sobre
`ai.comparables[i].features` / `ai.subject.features` con `calculateValuation` +
`completarValuacion`, actualizan el snapshot (`inputFingerprint` sin cambios, porque los
insumos objetivos no se tocan por esa vía) y hacen PATCH `aiValuationResult`. El cálculo
vive en `lib/valuation/editar-snapshot-ia.ts` (puro, testeado). En el **wizard**, con la
IA elegida las tablas se muestran en solo lectura con el aviso "Para ajustar coeficientes
de la versión IA, hacelo desde el detalle de la tasación": el wizard edita las FILAS y su
efecto de recálculo reescribe el clásico; mezclar los dos caminos ahí duplicaría riesgo en
un archivo de 1.700 líneas. (Decisión tomada al planificar, 2026-09-10.)

**PDF.** Cero cambios en `PDFReport.tsx`/`PDFPreviewModal.tsx`: reciben el
`ValuationResult` activo.

## 5. Flujo de datos

```
Wizard "Calcular" ─► calculateValuation ─► save (POST/PUT) ─► id
                                                  │
                                                  └─► POST /ai-valuation ─► runAiAppraisal
                                                          (1 llamada al modelo, ≤20s)
                                                          ─► ai_valuation_result + status
Picker ─► PATCH {valuationSource} ─► valuation_source + precios desnormalizados
                                      + borra priceOverrides
Detalle/PDF/Tablas ◄── activeValuation(row)
Listado/Pipeline/Emails/Contactos/Captación ◄── publication_price / sale_value / money_in_hand
```

## 6. Errores y límites

- Sin API key configurada (`hasAiConfigured()` falso): la tarjeta IA dice "Tasador IA no
  configurado" y nada más falla.
- Timeout o respuesta inválida del modelo: `failed` + mensaje legible en la tarjeta +
  "Reintentar". La tasación clásica ya está guardada; la IA nunca bloquea.
- El cliente lee la respuesta con un helper tolerante (si el body no es JSON, muestra "el
  servidor tardó demasiado", no `Unexpected token '<'`).
- Menos de 3 comparables normales o `calculateValuation` devuelve null con las
  interpretaciones IA → `failed` con motivo.
- Costo: una llamada de texto (~3-6k tokens de entrada, ≤2k de salida) por generación;
  centavos. No hay cron ni disparo automático fuera del botón "Calcular" y los botones
  Generar/Regenerar/Reintentar.

## 7. Pruebas y verificación

- Unit (vitest, config acotada `vitest.valuation.config.ts` con `include` de
  `lib/valuation/**`, `lib/supabase/appraisals*`): prompt incluye las tablas de
  `VALUATION_RULES`; validación zod rechaza enums inválidos, J fuera de rango, índices
  faltantes/repetidos; `mergeInterpretation` respeta lo objetivo; `runAiAppraisal` con
  `chat` falso produce un `AiValuationResult` cuyos coeficientes coinciden con
  `calculateValuation`; `activeValuation` cae a `calculator` cuando la IA no está lista;
  `selectValuationSource` reescribe precios y borra `priceOverrides` (con cliente
  Supabase falso); `completeValuation` reproduce byte a byte lo que hacía el wizard;
  `edit-snapshot` recalcula solo el target.
- Prueba real antes de deployar: `scripts/probar-tasador-ia.ts <appraisalId>` corre
  `runAiAppraisal` contra una tasación existente y OpenAI, imprime ambos precios, latencia
  y tokens. **No escribe.** Si la latencia supera ~15s, bajar `maxTokens`/descripciones
  antes de deployar.
- UI: `renderToStaticMarkup` del picker en cada estado (probe script, patrón del repo) +
  verificación en navegador con la vista previa de Netlify del PR (sin `next dev` local por
  el bug de Turbopack con la tilde de la carpeta).
- Migración: script `apply-*-pg.ts` con verificación `select` de las columnas contra el
  proyecto `mncsnastmcjdjxrehdep`. **Correr ANTES de deployar** el código (el PATCH y el
  POST escriben columnas nuevas).

## 8. Roles

- admin / dueño / coordinador / asesor (dentro de su alcance): ven el picker, generan,
  eligen y editan. Mismo alcance que editar la tasación.
- abogado: NO ve el picker ni el resultado IA (recibe la ficha resumida). Ve los importes
  del tasador elegido en la tarjeta de la propiedad que revisa.

## 9. Criterios de aceptación

1. En el wizard, al tocar "Calcular Valor de Mercado", aparecen dos tarjetas: "Tasador
   clásico" con sus números al instante y "Tasador IA" en estado "Analizando…"; en pocos
   segundos la IA muestra precio de publicación, valor de venta, dinero en mano, precio
   por m², confianza y diferencia porcentual. En la base: `ai_valuation_status='ready'`,
   `ai_valuation_result` con `ai.comparables.length` = comparables normales.
2. La tarjeta clásica está marcada "En uso" por defecto y `valuation_source='calculator'`.
3. Al tocar la tarjeta IA queda "En uso": `valuation_source='ai'`, `publication_price`,
   `sale_value`, `money_in_hand` pasan a los de la IA, y el listado de tasaciones muestra
   el precio de la IA. Las tablas y el Mapa de Valor de abajo muestran los coeficientes IA.
4. Al volver a tocar la clásica, todo vuelve a los números clásicos (misma verificación).
5. La vista previa y la descarga del PDF muestran los números del tasador elegido, con la
   misma estructura de siempre.
6. Si había precios editados a mano en el PDF, al cambiar de tasador desaparecen
   (`report_edits.priceOverrides` = null) y aparece el aviso en pantalla.
7. Al cerrar y volver a entrar al detalle, se ven las dos tarjetas con los mismos números
   y la misma elección.
8. En una tasación creada antes de este cambio, la tarjeta IA muestra "Generar"; al
   tocarlo se genera y se puede elegir.
9. Editar en línea un coeficiente con la IA elegida cambia SOLO la versión IA; la clásica
   sigue igual (comparar `valuation_result` antes/después en la base).
10. Cambiar un comparable en el wizard (precio o superficie) y volver a "Calcular" regenera
    la IA; hasta que se recalcula, la tarjeta IA avisa "Desactualizada".
11. Si el modelo falla o tarda demasiado, la tarjeta IA muestra el error y "Reintentar"; la
    tasación clásica quedó guardada igual.
12. El abogado, entrando a la propiedad que revisa, ve los importes del tasador elegido y
    no ve el resultado IA.

## 10. Riesgos (pre-flight)

- Función de Netlify: una sola llamada al modelo por request, `timeoutMs` 20 s, sin
  `maxDuration`. `pending` huérfano → el cliente lo trata como `failed` a los 2 min.
- Proveedor: `chatCompletion` elige DeepSeek si `DEEPSEEK_API_KEY` existe en Netlify;
  local solo hay OpenAI. La tarjeta muestra provider/modelo y el script real lo confirma.
- Migración aditiva, sin triggers ni vistas afectadas. Aplicar ANTES del deploy.
- Consumidores de `publication_price` (12 archivos, `grep -rn publication_price`): todos
  leen la columna desnormalizada → siguen la elección sin cambios.
- Variable de entorno nueva OPCIONAL: `TASADOR_IA_MODEL` (override del modelo). Sin ella,
  el default de `chatCompletion`.

## 11. Fuera de alcance (esta versión)

- Fotos al modelo. Descartar comparables por la IA. Elegir modelo desde la UI. Un
  "tercer tasador". Historial de generaciones IA (se guarda solo la última).
