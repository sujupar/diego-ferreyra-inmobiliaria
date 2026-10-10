# Plan — Tasador, Grupos B y C (que nada se pierda ni se invente; lo que se ve es lo que se aplica)

Spec: `docs/superpowers/specs/2026-10-03-tasador-arreglos-auditoria-design.md` (B2–B7, B9, C1–C5).
Rama `fix/tasador-grupo-bc` (desde `origin/main` be97488). Modelo de estilo: plan del Grupo A.

**Fuera de este plan:** B1 (piso vacío) — espera la decisión del dueño. B8 ya está en producción.

**Regla transversal:** ninguna tarea reescribe tasaciones guardadas. Lo que cambia es cómo se
calcula/muestra a partir del próximo cambio que haga el asesor. Única excepción de precio: C3
(tabla Ross-Heidecke), que mueve ≤ 0,5 % el precio de una tasación que se RECALCULE con una
de esas 5 edades/estados (abrirla no recalcula: Grupo A).

Pruebas: `npx vitest run lib/valuation lib/types lib/scraper` (node). Tipos:
`npx tsc --noEmit -p tsconfig.tasador-bc.json` (acotado a lo tocado). Lint: sin errores nuevos
respecto de `origin/main`. JSX: render con `renderToStaticMarkup` en scripts `_qa-*` (no se
commitean). Un commit + push por tarea.

## Tarea 1 — B2 Semicubierta llega al cálculo

Archivos: `lib/scraper/types.ts` (`semiCoveredArea?: number | null`),
`lib/valuation/formulario-sujeto.ts` + test (nuevo), `components/appraisal/PropertyWizard.tsx`,
`components/appraisal/SubjectFeaturesEditor.tsx`, `components/appraisal/ValuationReport.tsx`,
`components/appraisal/ComparableEditor.tsx`.

- `featuresDelFormulario(form)`: arma las features del sujeto desde el formulario del asistente,
  CON `semiCoveredArea` (hoy se pierde en `handleComplete`). Piso 0 y edad 0 siguen siendo reales.
- El "Superficie Total" del asistente y el M² homologados del editor de comparables salen de
  `calculateHomogenizedSurface` (C5).
- Campo "Sup. Semicubierta" en el editor del sujeto (ficha/informe) y en el del comparable.
- La visita (`semi_covered_m2`) ya llega al formulario: con este cambio llega también al cálculo.

Prueba: el test de `featuresDelFormulario` (semi presente, vacía → null, piso/edad 0 reales) y
que `calculateHomogenizedSurface` de esas features cuenta la semi al 50 %.

## Tarea 2 — B3 La ficha no pisa ediciones

Archivos: `lib/valuation/recalculo-ficha.ts` + test (nuevo),
`app/(dashboard)/appraisals/[id]/page.tsx`.

- `recalcularFicha(base, cambio)`: función pura que recibe las filas actuales, el sujeto, las
  tasas y el resultado vigente, aplica UN cambio (sujeto / comparable i / tasas), recalcula con
  `calculateValuation` y completa con `completarValuacion` (parte del propietario + escenarios
  con el nuevo dinero en mano). Devuelve filas nuevas + resultado.
- La ficha guarda las filas y el sujeto actualizados en `appraisal` (estado local) tras cada
  edición: la edición siguiente parte de ahí, no de lo cargado al abrir.

Prueba: editar comp 1 y luego comp 2 conserva ambos; `ownerSharePercent`/`ownerShareMoney` se
conservan y recalculan; los escenarios usan el `moneyFromSale` nuevo.

## Tarea 3 — B4 Precio de compra no inventado

Archivos: `lib/valuation/precio-compra.ts` + test (nuevo), `app/(dashboard)/appraisal/new/page.tsx`.

- `precioDeCompraValido(prop)`: número > 0 o `null`. Se elimina `prop.price || 100000` (dos lugares).
- Marcar una propiedad sin precio abre un editor simple (input "Precio de publicación (USD)");
  hasta cargarlo no se marca.

Prueba: `precioDeCompraValido` con null / 0 / negativo / válido.

## Tarea 4 — B5 Precio cargado a mano coherente

Archivos: `lib/valuation/precio-manual.ts` + test (nuevo), `components/appraisal/pdf/PDFReport.tsx`,
`components/appraisal/ReportEditor.tsx`, `components/appraisal/ValuationReport.tsx`,
`app/(dashboard)/appraisals/[id]/page.tsx`, `app/(dashboard)/appraisal/new/page.tsx`.

- `valuacionConPreciosManuales(resultado, overrides)`: si hay precio de publicación (y/o de venta)
  a mano, recalcula venta, escritura, sellos, gastos, honorarios, total, dinero en mano, Zona de
  No Venta calculada, parte del propietario y escenarios de compra, con las tasas de
  `resultado.expenseRates`. Sin overrides devuelve el mismo objeto.
- `validarZonaDeNoVenta(znv, publicacion)`: mensaje si queda por debajo de la publicación.
- PDF y pantalla (ficha y asistente) usan el resultado ajustado. El editor de la ZNV no acepta un
  valor menor a la publicación (se valida al confirmar, no por tecla).

Prueba: cadena completa con override; venta a mano respetada; sin override = identidad; ZNV.

## Tarea 5 — B6 Moneda

Archivos: `lib/valuation/moneda.ts` + test (nuevo), `components/appraisal/ComparableEditor.tsx`,
`app/(dashboard)/appraisal/new/page.tsx`.

- `requiereConversion(currency)`: true si la moneda es conocida y no es USD.
- El editor del comparable lo marca, muestra el precio original y pide el precio en USD (o
  "Descartar"); hasta convertirlo cuenta como dato faltante → "Calcular" queda bloqueado.
- La lista de comparables/compra/fuera de precio muestra la moneda real.

## Tarea 6 — B7 Borrador viejo

Archivos: `components/appraisal/PropertyWizard.tsx`, `app/(dashboard)/appraisal/new/page.tsx`.

- Prop explícita `restaurarBorrador` (default false). Solo se restaura cuando el padre lo pide;
  una "Nueva tasación" nunca lee el borrador de otra. El efecto del padre que lo borraba queda
  como limpieza, ya no como condición de correctitud.

Prueba: render con `renderToStaticMarkup` + localStorage simulado (script `_qa`).

## Tarea 7 — B9 Superficie deducida

Archivos: `lib/scraper/superficie-deducida.ts` + test (nuevo), los 3 extractores,
`components/appraisal/ComparableEditor.tsx`, `lib/scraper/types.ts`.

- `completarDescubiertaDeducida(features)`: deduce total − cubierta y marca
  `uncoveredAreaDeducida: true`. Editar o confirmar la descubierta quita la marca.
- El editor muestra "deducida: revisar".

## Tarea 8 — C1 Coeficiente de conservación real

Archivos: `lib/valuation/rules.ts` (+ test), `PropertyWizard.tsx`, `ComparableEditor.tsx`,
`ValuationReport.tsx`.

- `etiquetaCoeficienteEstado(estado, edad?)`: "×0,91" (W = 1 − K/200 con la edad cargada; sin
  edad, la de 0 años y lo aclara). Se reemplaza el "18,1 %" de los selectores.

## Tarea 9 — C2 Guardando vs Calculando

Archivo: `app/(dashboard)/appraisal/new/page.tsx`.

- Estado de cálculo separado del de guardado. Botón: "Guardando…" si se guarda,
  "Calcular" si no. Un `calculateValuation` nulo muestra "No se pudo calcular" (no "Error al
  guardar") y no deja el informe viejo como si fuera vigente.

## Tarea 10 — C3 Tabla Ross-Heidecke

Archivos: `lib/valuation/rules.ts`, `lib/valuation/rules.test.ts` (nuevo).

- Test: tabla entera vs K(p,s)=D+Ds−D·Ds/100, D=50(p/100+(p/100)²), Ds = fila 0 (tolerancia 0,1;
  0,02 para Estado 1); cada columna monótona. Se corrigen los 5 valores.

## Tarea 11 — C4 Fechas y formato

Archivos: `app/(dashboard)/appraisal/new/page.tsx`, `components/appraisal/pdf/PDFReport.tsx`,
`components/appraisal/ValuationReport.tsx`, `lib/valuation/utils.ts` (+ test).

- Vista previa con la fecha de la tasación (`created_at`), no hoy. "Fecha de emisión" idem.
- `toLocaleString()` sin locale → `'es-AR'`. Mapa de Valor: precio vacío → "—" (nunca "0k").

## Tarea 12 — C5 Fórmulas únicas

- Superficie homologada: todos los lugares usan `calculateHomogenizedSurface`.
- `calculatePurchaseCosts` no tiene consumidores (grep): se elimina; queda `calculateScenario`.
