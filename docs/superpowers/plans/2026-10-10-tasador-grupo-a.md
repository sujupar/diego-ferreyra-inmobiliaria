# Plan — Tasador, Grupo A (que nada cambie solo)

Spec: `docs/superpowers/specs/2026-10-03-tasador-arreglos-auditoria-design.md` (A1, A2, A3).
Aprobado por el dueño el 2026-10-10. Rama `fix/tasador-auditoria`.

Entregas del programa completo (cada una con su PR, QA y deploy):
1. **Grupo A** (este plan).
2. PDF stock con inmuebles totales — rama `fix/pdf-stock-inmuebles-totales` (en paralelo).
3. Grupos B y C (datos que se pierden o se inventan; lo que se ve = lo que se aplica).
4. Grupo D — el Tasador IA calcula TODOS los coeficientes con el mismo método (pedido del
   dueño 2026-10-10) + banda de distancia 15 %.
5. Asistente de IA de la tasación (diseño A, panel lateral).

## Tarea 1 — Textos del informe con marcador de precio (A3) y completar sin pisar (A2)

Archivos: `lib/types/report-edits.ts`, `lib/types/report-edits.test.ts` (nuevo).

- `MARCADOR_PRECIO = '{precio}'`.
- `buildDefaultEdits` escribe `{precio}` en `analysisText` y `strategyPriceText` (no el número).
- `conMarcadorDePrecio(texto)`: convierte las DOS frases de fábrica con un precio viejo
  ("se debería publicar en USD 252.000" / "El valor de publicación recomendado es: USD 252.000")
  al marcador. No toca otros precios que el asesor haya escrito a mano.
- `textoConPrecio(texto, precioFormateado)`: `conMarcadorDePrecio` + reemplazo del marcador.
- `completarEdiciones(actual, porDefecto)`: devuelve `actual` con los campos vacíos completados;
  nunca pisa texto, `priceOverrides`, `pdfLayout`, semáforos ni títulos.

Pruebas: vitest node, un `it` por regla.

## Tarea 2 — Abrir no recalcula (A1)

Archivos: `lib/valuation/hidratacion.ts` + test (nuevo), `lib/valuation/huella-insumos.ts`
(exportar el hash).

- `huellaDeEdicion(estado)`: hash de todo lo que el efecto de recálculo mira.
- `cambioPorReglasActuales(guardado, recalculado)`: `{ antes, despues }` si el precio de
  publicación difiere, si no `null`.

## Tarea 3 — Cablear en `/appraisal/new`

Archivo: `app/(dashboard)/appraisal/new/page.tsx`.

- Al cargar: normalizar `report_edits` (marcador) y guardar `huellaCargadaRef`.
- Efecto de recálculo: si la huella actual es la cargada → no recalcula ni guarda; calcula
  aparte el precio con las reglas de hoy y, si difiere, muestra aviso con "Actualizar".
  Agregar `ownerSharePercent` a sus dependencias (B8, sin costo extra).
- "Calcular": `completarEdiciones` en vez de reemplazar; anula la huella cargada.
- Reemplaza el aviso viejo de "coeficiente de calidad" por el aviso general.

## Tarea 4 — Render del precio vigente

Archivos: `components/appraisal/pdf/PDFReport.tsx`, `components/appraisal/ReportEditor.tsx`,
`app/(dashboard)/appraisals/[id]/page.tsx`.

- PDF: `textoConPrecio(texto, formatCurrency(precioRecomendado, moneda))`, donde el precio
  recomendado ya respeta `priceOverrides.publicationPrice`.
- Editor: ayuda "{precio} se reemplaza por el precio de publicación vigente".
- Ficha: normaliza al cargar igual que el wizard.

## Tarea 5 — Datos existentes

Script `scripts/migrar-marcador-precio-pg.ts`: modo `listar` (muestra antes/después de cada
fila) y `aplicar`. Solo reemplaza las frases de fábrica. Aunque no se corra, el PDF ya muestra
el precio vigente (el render normaliza), así que el script es limpieza, no requisito.

## Verificación

- `npx vitest run lib/types lib/valuation` · `tsc` acotado (`tsconfig.tasador-a.json`) · `eslint`.
- QA en la vista previa de Netlify con el navegador de Claude:
  1. Abrir Paraguay 3682 (clon `[TEST`) en editar → precio igual, `updated_at` sin cambio.
  2. Tasación de abril (Agüero 935, clon) → aviso "daría USD 154.000 (antes 131.000)", sin guardar.
  3. Editar un texto, tocar Calcular → el texto sigue.
  4. PDF: los textos dicen el mismo precio que el recuadro, también con precio a mano.
