# Plan — Tasador: editor de páginas en preview + precios editables

> Fecha: 2026-06-19 · Estado: PROPUESTO (esperando OK para implementar)

## Contexto (por qué)

El tasador genera el PDF de tasación **100% en el cliente** con `@react-pdf/renderer`
(`pdf(doc).toBlob()` en [PDFPreviewModal.tsx:194](components/appraisal/PDFPreviewModal.tsx#L194)
y [PDFDownloadButton.tsx:39](components/appraisal/PDFDownloadButton.tsx#L39)). El usuario
necesita, **sobre el PDF ya calculado y sin tocar nada de la lógica de tasación**:

1. **Editar manualmente 3 precios** (Publicación, Venta, No-venta) y que aparezcan
   tal cual los cargó. Hoy esos precios son 100% calculados y **no hay override**
   de venta en ningún lado (solo existe override de `publicationPrice` en escenarios
   de *compra*, [PurchaseScenariosEditor.tsx:102](components/appraisal/PurchaseScenariosEditor.tsx#L102)).
2. **En la vista previa**, borrar páginas (X arriba a la derecha) y reordenarlas
   (arrastrar), con opción de **guardar el orden en la propiedad** o **aplicarlo solo
   a esta descarga**.

Decisión transversal del usuario: **no romper absolutamente nada** del flujo de
tasación existente. Por eso ambas features se montan como una **capa de presentación**
encima del resultado ya calculado — no tocan `calculateValuation()` ni los datos guardados.

### Decisiones confirmadas (3 preguntas)

| Tema | Decisión |
|---|---|
| **Numeración de páginas** | **Sin números.** El PDF hoy no tiene numeración ([no existe `render={({pageNumber})}` en ningún lado]). No se agrega. Borrar/reordenar no necesita renumerar. |
| **Precios editables** | **Solo los 3 números** (Publicación, Venta, No-venta). NO se recalcula la cadena derivada (gastos, dinero-en-mano, escritura) ni se tocan los textos. Override de display puro. |
| **Editor de páginas** | **Miniaturas visuales** (imagen real de cada página + X + arrastrar). Se agregan 2 libs cliente: `pdf-lib` (borrar/reordenar bytes) + `pdfjs-dist` (rasterizar miniaturas). |

---

## Patrón base que se reutiliza (clave para "no romper nada")

Los datos editables del informe ya viven en un mecanismo probado: **`reportEdits`**
(JSONB `appraisals.report_edits`). Ambas features se cuelgan de ahí, sin esquema nuevo:

- **Type:** [lib/types/report-edits.ts](lib/types/report-edits.ts) — interface `ReportEdits`.
- **Persistencia (automática):** `PUT /api/appraisals/[id]` → [appraisals-write.ts:181-187](lib/supabase/appraisals-write.ts#L181)
  ya hace *"solo toca `report_edits` si el caller lo provee"* (patrón defensivo: no pisa
  nada si no viene). El `POST` (insert) ya captura `input.reportEdits` ([appraisals-write.ts:121](lib/supabase/appraisals-write.ts#L121)).
- **Carga (automática):** `getAppraisal()` devuelve `report_edits` crudo ([appraisals.ts](lib/supabase/appraisals.ts)).
- **Llega al PDF:** `PDFPreviewModal` → `PDFReportDocument` ya recibe `reportEdits` como prop.

**Agregar un campo a `ReportEdits` = tocar solo 3 lugares** (type + editor UI + render
del PDF); persistencia, carga y flujo al modal son automáticos.

---

## Feature A — Precios editables (Publicación / Venta / No-venta)

### A.1 Modelo de datos
Agregar a `ReportEdits` ([report-edits.ts](lib/types/report-edits.ts)):
```ts
priceOverrides?: {
    publicationPrice?: number   // reemplaza el "PRECIO DE PUBLICACIÓN"
    saleValue?: number          // reemplaza el "VALOR VENTA"
    noSaleZonePrice?: number    // reemplaza la "ZONA DE NO VENTA" (el más pedido)
}
```
Opcional/independiente cada uno: si está `undefined`, se usa el valor calculado.

### A.2 Aplicación en el PDF (mínima y quirúrgica)
En [PDFReport.tsx](components/appraisal/pdf/PDFReport.tsx) ya existen los alias
`recommendedPrice = valuationResult.publicationPrice` (L295) y
`noSaleZone = valuationResult.noSaleZonePrice` (L296), usados en TODAS las apariciones.
Se redefinen para leer el override y se agrega uno para venta:
```ts
const recommendedPrice = reportEdits?.priceOverrides?.publicationPrice ?? valuationResult.publicationPrice
const noSaleZone       = reportEdits?.priceOverrides?.noSaleZonePrice  ?? valuationResult.noSaleZonePrice
const saleValueDisplay = reportEdits?.priceOverrides?.saleValue        ?? valuationResult.saleValue
```
Como `recommendedPrice`/`noSaleZone` ya son los alias usados en la caja verde, la caja
roja y la fila "sujeto" de la tabla, el override **fluye solo**. Solo hay que apuntar a
los alias en los 3 recuadros de "Costos de Venta" (que hoy leen `valuationResult.*` directo):
- "VALOR PUBLICACIÓN" → `recommendedPrice`
- "VALOR VENTA (-5%)" → `saleValueDisplay`
- ("VALOR ESCRITURA" y los gastos quedan IGUAL — sin recálculo, decisión del usuario.)

**No se tocan** `analysisText` ni `strategyPriceText` (tienen el precio incrustado como
texto; el usuario los puede editar aparte en el editor — decisión "no tocar los textos").
Se documenta como nota visible en la UI: *"Editar el precio no actualiza las menciones
dentro de los textos de Análisis/Estrategia; editá esos textos si querés reflejarlo."*

### A.3 UI de edición
En [ReportEditor.tsx](components/appraisal/ReportEditor.tsx) (tab "Editar" del modal),
nueva sección **"Precios (manual)"** con 3 inputs numéricos pre-cargados con el valor
calculado (`valuationResult.publicationPrice / saleValue / noSaleZonePrice`), cada uno
con botón **"Restablecer"** (borra el override → vuelve al calculado). Usa el helper
`updateField` existente → `onReportEditsChange({ ...reportEdits, priceOverrides: {...} })`.
La Vista Previa (mismo `reportEdits`) re-renderiza en vivo.

### A.4 Persistencia
Automática vía `reportEdits` (ver patrón base). Se verifica/cablea que el **botón
"Guardar"** del modal/página de detalle haga `updateAppraisal(id, { reportEdits })`
(create page ya auto-guarda; en detalle hay que confirmar que el guardado de `reportEdits`
esté cableado y, si no, agregarlo — es un `PUT` que ya soporta `report_edits`).

### A.5 Archivos tocados (Feature A)
- [lib/types/report-edits.ts](lib/types/report-edits.ts) — campo `priceOverrides`.
- [components/appraisal/ReportEditor.tsx](components/appraisal/ReportEditor.tsx) — sección "Precios".
- [components/appraisal/pdf/PDFReport.tsx](components/appraisal/pdf/PDFReport.tsx) — 3 alias + apuntar los recuadros de Costos.
- (Verificar) guardado de `reportEdits` en la página de detalle.

---

## Feature B — Editor de páginas en la vista previa

### B.1 Enfoque: post-procesar el PDF renderizado (NO reestructurar el JSX)
El documento tiene ~11 páginas fijas + dinámicas (comparables/overpriced/compra, 2 por
página) + 6 condicionales con lógica XOR (venta-simple vs compra). Reordenar/ocultar
**en el JSX** es ALTO riesgo: rompe las condicionales XOR, los `globalIndex` de
`paginateBalanced` y las keys `semaphoreOverrides["comparable-N"]`. 

➡️ Se opera sobre el **PDF ya renderizado** (bytes), a nivel de página visual. **Cero
cambios a la lógica de tasación ni a la estructura de `PDFReport`.** Es exactamente
"borrar/mover páginas" que pidió el usuario.

### B.2 Librerías nuevas (cliente)
- **`pdf-lib`** (~150KB): cargar bytes, `copyPages`, reordenar/excluir, re-serializar.
- **`pdfjs-dist`**: rasterizar cada página a `<canvas>` para las miniaturas.
  - Gotcha Next 16: configurar `pdfjs.GlobalWorkerOptions.workerSrc` (worker `.mjs`).
    Todo corre client-only (el modal ya es `dynamic(..., { ssr:false })`), así que no
    afecta SSR ni el build de Netlify Functions.
- `@dnd-kit/sortable` (ya instalado, se usa en el wizard de fotos) para arrastrar.

### B.3 UI: nuevo tab "Organizar" en el modal
[PDFPreviewModal.tsx](components/appraisal/PDFPreviewModal.tsx) hoy tiene 2 tabs
(Editar / Vista Previa). Se agrega un 3º: **"Organizar páginas"**.
1. Al abrir el tab, construir el blob actual **una sola vez** (extraer `buildDoc()` del
   `handleDownload` actual para no duplicar el armado del `<PDFReportDocument>`).
2. `pdfjs` rasteriza cada página → grilla de **miniaturas** (`@dnd-kit/sortable`).
3. Cada miniatura: botón **X** (arriba-derecha) para marcar borrada + **arrastrar** para
   reordenar. Botón global **"Restablecer"**.
4. Estado local: `order: string[]` (keys de página, ver B.5) y `hidden: Set<string>`.

### B.4 Aplicar al descargar
Al "Descargar PDF" (con cambios de orden/borrado): `pdf-lib` carga los bytes originales,
crea un `PDFDocument` nuevo, `copyPages` en el `order` resultante excluyendo `hidden`,
`save()` → blob → descarga (reusa el mecanismo de descarga actual, L195-203).

### B.5 Identidad estable de página (para "guardar permanente" sin romperse)
El usuario quiere **guardar el orden en la propiedad** y que **no se rompa** si más
adelante cambia el contenido. Guardar por índice numérico es frágil (si cambia la
cantidad de páginas, se desalinea). Solución robusta:

- **`buildPageManifest(props)`**: función pura nueva (junto a `PDFReport`) que devuelve
  la **lista ordenada de keys de página** replicando exactamente los condicionales del
  documento: `cover`, `subject`, `datos-1`, `datos-2`, `divisor-competen`, `semaforo`,
  `comparables-0..N`, `overpriced-0..M`, `mapa-valor`, luego `costos-venta` **XOR**
  (`divisor-compra`, `compra-0..P`, `divisor-simulacion`, `simulacion`), `divisor-estrategia`,
  `estrategia`, `terminos`, `backcover`. La página renderizada `i` ↔ `manifest[i]`.
- **Test guard** (vitest): renderizar el PDF de un fixture, contar páginas con `pdf-lib`,
  y assert `buildPageManifest(props).length === pageCount`. Evita el drift si alguien
  agrega una `<Page>` y olvida el manifest (mismo riesgo documentado de las `.mts`).
- **Persistencia:** `reportEdits.pdfLayout = { orderKeys: string[], hiddenKeys: string[] }`.
- **Reconciliación al cargar:** `current = buildPageManifest(props)`;
  `order = orderKeys.filter(k => current.includes(k))` + las keys nuevas de `current` no
  presentes (anexadas en su posición natural); `hidden = hiddenKeys ∩ current`. Así, si
  se agregó/quitó un comparable, el orden guardado **se adapta** en vez de romperse.

### B.6 Guardar permanente vs solo esta descarga
En el tab "Organizar", toggle **"Guardar este orden en la propiedad"**:
- **ON** → `onReportEditsChange({ ...reportEdits, pdfLayout })` + guardar (PUT). Aplica
  a todas las futuras previews/descargas de esa tasación (vía reconciliación B.5).
- **OFF** → el `order/hidden` vive solo en el estado del modal; se aplica a **esta**
  descarga y se descarta al cerrar.
- Al abrir el modal, si existe `reportEdits.pdfLayout`, se pre-aplica (reconciliado) tanto
  a las miniaturas como a la descarga, y la Vista Previa puede mostrar una nota
  *"orden personalizado activo"* (el `<PDFViewer>` muestra el doc completo; el orden
  final se materializa en la descarga — ver Riesgos).

### B.7 Archivos tocados (Feature B)
- `package.json` — `pdf-lib`, `pdfjs-dist`.
- [components/appraisal/PDFPreviewModal.tsx](components/appraisal/PDFPreviewModal.tsx) —
  tab "Organizar", `buildDoc()` extraído, descarga con pdf-lib, toggle guardar.
- **Nuevo** `components/appraisal/pdf/PageOrganizer.tsx` — grilla de miniaturas (pdfjs +
  dnd-kit + X).
- **Nuevo** `lib/pdf/pageManifest.ts` — `buildPageManifest(props)`.
- **Nuevo** `lib/pdf/applyPageLayout.ts` — `reorderPdf(bytes, orderIndices)` con pdf-lib +
  reconciliación keys↔índices.
- [lib/types/report-edits.ts](lib/types/report-edits.ts) — campo `pdfLayout`.
- (Test) `lib/pdf/pageManifest.test.ts` — guard manifest↔pageCount.

---

## Riesgos y mitigaciones ("no romper nada")

| Riesgo | Mitigación |
|---|---|
| Reordenar JSX rompe condicionales/índices/semáforos | **Se evita**: post-proceso sobre bytes, no se toca `PDFReport` salvo los 3 alias de precio. |
| `reportEdits` existente se pisa al guardar nuevos campos | Patrón defensivo ya existente (PUT solo toca `report_edits` si viene) + se mergea siempre `{ ...reportEdits, nuevoCampo }`. |
| Vista Previa (`<PDFViewer>`) no puede overlayear X por página | El borrado/reorden vive en el tab "Organizar" (miniaturas propias), no en el `<PDFViewer>` (iframe opaco). |
| Drift entre `buildPageManifest` y el render real | Test guard que compara longitud del manifest vs páginas renderizadas. |
| Orden guardado se desalinea si cambia el contenido | Reconciliación por **keys** (B.5): adapta en vez de romper. |
| `pdfjs` worker en Next 16 | Setup client-only documentado; modal ya es `ssr:false`. |
| Precio override deja textos con el precio viejo | Decisión del usuario ("solo los 3 números"); se avisa en la UI y los textos siguen siendo editables. |
| Costos incoherentes (no recalcula gastos) | Decisión explícita del usuario; documentado. (Si más adelante se quiere coherencia total, se agrega un helper `applyValuationOverrides` que recalcula la cadena — fuera de scope ahora.) |

---

## Verificación (end-to-end)

1. **Precios:** abrir una tasación → tab Editar → sección Precios → cambiar No-venta a un
   valor manual → Vista Previa: la caja roja muestra el valor cargado; "Restablecer"
   vuelve al calculado. Descargar y confirmar en el PDF. Recargar la tasación y confirmar
   que persistió (si se guardó).
2. **Borrar página:** tab Organizar → X en "Datos referenciales" → Descargar → el PDF sale
   sin esa página, el resto intacto.
3. **Reordenar:** arrastrar "Estrategia" antes de "Mapa de Valor" → Descargar → orden nuevo.
4. **Guardar permanente:** activar el toggle, guardar, cerrar, reabrir → el orden/borrado
   persiste. Editar un comparable (cambia page count) y reabrir → el orden se reconcilia
   (no se rompe).
5. **Solo esta descarga:** sin el toggle, descargar con cambios, reabrir → vuelve al orden
   completo por defecto.
6. **Regresión:** `npx tsc --noEmit` limpio; una tasación SIN cambios descarga idéntica a
   hoy (mismos bytes de contenido); test guard del manifest verde.

---

## Orden de implementación sugerido

1. **Feature A (precios)** — autocontenida y de bajo riesgo (type + editor + 3 alias).
   Entrega valor rápido y valida el patrón `reportEdits`.
2. **Feature B base** — instalar libs, `buildPageManifest` + test guard, `reorderPdf`.
3. **Feature B UI** — `PageOrganizer` (miniaturas + X + dnd) y tab en el modal.
4. **Feature B persistencia** — `pdfLayout` en `reportEdits` + toggle + reconciliación.
5. **Verificación** end-to-end + `tsc` + commit/push (Netlify auto-deploy).
