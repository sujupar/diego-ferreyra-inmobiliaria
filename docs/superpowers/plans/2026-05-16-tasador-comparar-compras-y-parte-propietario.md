# Tasador — Comparar Múltiples Propiedades de Compra + Parte del Propietario

**Origen:** Video del 2026-05-15 (`Videodeajustes.mp4`) donde Diego documenta tres ajustes que hoy
lo obligan a llevar el PDF a Canva manualmente.

**Goal:** Que el tasador genere internamente el reporte que hoy Diego termina en Canva:
comparación lado-a-lado de 2+ propiedades de compra, ajustada por la **parte del propietario**
cuando la propiedad está dividida (50/50, 33/33/33, etc.).

---

## Resumen de ajustes pedidos por Diego

### Ajuste 1 — Comparar 2+ propiedades de compra
Hoy en "Propiedades para la Compra" hay un **radio button** (`selectedPurchaseIndex`) que sólo
permite seleccionar UNA propiedad. Diego quiere marcar dos (una "barata" y una "cara") y verlas
en columnas separadas en el PDF, como hizo en Canva con `COMPRA 1` y `COMPRA 2`.

### Ajuste 2 — % parte del propietario
Diego: *"si bien se puede vender en 187 mil, dinero después de venta es 180 mil, pero la parte
que le queda al propietario es 90 mil, porque está dividido en 2"*. A veces es 50%, a veces 33%,
a veces 25%. Falta ese campo. Hoy el código asume 100% siempre.

### Ajuste 3 — Layout PDF estilo Canva
Su Canva muestra:
1. Tabla **Venta** (publicación / venta / escritura + gastos + total)
2. Fila destacada **Dinero luego de venta** (amarillo)
3. Fila destacada **Parte del Propietario** (amarillo, cuando `ownerShare < 100`)
4. Grilla de **COMPRA 1 / COMPRA 2 / …** (publicación / compra / escritura + gastos + Costo de compra + **Diferencia En Mano**)
5. La **Diferencia En Mano** = Parte del Propietario − Costo de compra (verde si sobra, rojo si falta)

La estructura del PDF actual (`SIMULACIÓN GASTOS E IMPUESTOS` en
`components/appraisal/pdf/PDFReport.tsx:1281-1320`) ya hace algo parecido pero usa los 3
"escenarios" (Conservador/Medio/Agresivo) de **una sola** propiedad. Sólo falta:
- Permitir que las columnas vengan de **propiedades distintas** (no de niveles de descuento).
- Insertar la fila "Parte del Propietario".

---

## Decisión de diseño

**Preservamos** la mecánica de escenarios actual (Conservador/Medio/Agresivo) — Diego sigue
queriendo poder mover el % de descuento. El cambio clave es: **ahora los escenarios se generan
por propiedad seleccionada**, no por la primera de la lista.

### Modelo de datos extendido

```typescript
// En lib/valuation/calculator.ts

// ANTES
interface PurchaseScenarioInput {
    id: 'conservative' | 'medium' | 'aggressive'
    label: string
    publicationPrice: number
    ...
}

// DESPUÉS — id ahora es composite "<propertyKey>:<level>"
interface PurchaseScenarioInput {
    id: string                            // 'prop_0:conservative', 'prop_1:medium', ...
    level: PurchaseScenarioLevel          // 'conservative' | 'medium' | 'aggressive'
    propertyKey: string                   // 'prop_0', 'prop_1' (estable por propiedad)
    propertyLabel: string                 // 'PH 3 Amb San Cristóbal'
    label: string                         // 'Conservador'
    publicationPrice: number
    purchaseDiscountPercent: number
    deedDiscountPercent: number
    rates: PurchaseScenarioRates
}

type PurchaseScenarioLevel = 'conservative' | 'medium' | 'aggressive'
type PurchaseScenarioId = string          // composite

// En ValuationResult
interface ValuationResult {
    ...existing fields...
    /** % de la venta que le queda al propietario (default 100). */
    ownerSharePercent?: number
    /** moneyInHand × ownerSharePercent / 100 — usado para diferencia en mano. */
    ownerShareMoney?: number
    purchaseScenarios?: PurchaseScenarioResult[]    // ya existía
    selectedScenarioIds?: string[]                  // ya existía (cambio: ahora ids compuestos)
}
```

**Back-compat:** `ValuationResult.purchaseScenarios` viejos cargados del JSONB tienen
`id='conservative'` (literal). Al cargar:
- Si encontramos un id literal sin `:`, lo migramos in-memory a `prop_0:conservative` y
  generamos un `propertyKey='prop_0'`, `propertyLabel` derivado del título de la única
  propiedad de compra guardada.
- `ownerSharePercent` ausente → 100.

No requiere migración de DB (todo vive en `valuation_result` JSONB).

### Modelo de selección en la UI

```typescript
// En app/(dashboard)/appraisal/new/page.tsx — REEMPLAZA selectedPurchaseIndex
const [selectedPurchaseIndices, setSelectedPurchaseIndices] = useState<number[]>([])
```

El radio button se vuelve **checkbox**. Cuando el usuario marca/desmarca una propiedad:
1. Si la marca → se generan automáticamente sus 3 escenarios (Conservador/Medio/Agresivo) con
   `propertyKey='prop_<index>'` y `publicationPrice = purchaseProperties[index].price`.
2. Si la desmarca → se eliminan los escenarios con ese `propertyKey` y los
   `selectedScenarioIds` correspondientes.
3. Los escenarios "Conservador" de cada propiedad seleccionada quedan auto-marcados como
   incluidos por defecto (matchea el Canva de Diego).

`PurchaseScenariosEditor` se reagrupa visualmente por propiedad: cada propiedad seleccionada
muestra un sub-bloque con título "PROPIEDAD: <label>" y dentro las 3 columnas
Conservador/Medio/Agresivo.

---

## Mapa de Archivos a Modificar

| Archivo | Cambio |
|---|---|
| `lib/valuation/calculator.ts` | Extender tipos: `propertyKey`/`propertyLabel`/`level` en scenario; `ownerSharePercent`/`ownerShareMoney` en result. Soporte para `id` string. |
| `lib/valuation/purchase-scenarios.ts` | `buildDefaultScenarios()` ahora recibe `propertyKey` + `propertyLabel`. `calculateScenario()` usa `ownerShareMoney` si vino, sino `moneyFromSale`. |
| `app/(dashboard)/appraisal/new/page.tsx` | `selectedPurchaseIndex` → `selectedPurchaseIndices`. Radio → checkbox. `ownerSharePercent` state + UI. Recalcular escenarios cuando cambia selección. Auto-migrar datos legacy al cargar (`scenario.id` sin `:`). |
| `components/appraisal/PurchaseScenariosEditor.tsx` | Agrupar escenarios por `propertyKey`. Mostrar título de propiedad arriba de cada bloque de 3 columnas. |
| `components/appraisal/pdf/PDFReport.tsx` | `SaleSimTable` agrega fila "Parte del Propietario" cuando `ownerSharePercent < 100`. `PurchaseSimTable` muestra `propertyLabel` en el header (no sólo el nivel). Recalcular `remainingMoney` usando `ownerShareMoney` cuando exista. |
| `components/appraisal/ValuationReport.tsx` | Sólo si hay UI inline que muestre el resumen — agregar línea de Parte del Propietario. (revisar). |

**No cambian:** schema de Supabase, `lib/scraper/`, `appraisals.ts` (todo persiste vía
`valuation_result` JSONB), `lib/valuation/rules.ts`.

---

## Tareas

### Bloque A — Tipos + cálculo (núcleo)

- [ ] **A.1** En `lib/valuation/calculator.ts`:
  - Renombrar `PurchaseScenarioId` literal → `PurchaseScenarioLevel`. Crear nuevo
    `PurchaseScenarioId = string`. Agregar `level`, `propertyKey`, `propertyLabel` a
    `PurchaseScenarioInput` y `PurchaseScenarioResult`.
  - Agregar `ownerSharePercent?: number` y `ownerShareMoney?: number` a `ValuationResult`.
  - Actualizar `selectedScenarioIds?: string[]` (era `PurchaseScenarioId[]` literal).

- [ ] **A.2** En `lib/valuation/purchase-scenarios.ts`:
  - `buildDefaultScenarios(publicationPrice, propertyKey, propertyLabel)` genera los 3
    escenarios con `id = "${propertyKey}:conservative"` etc. y `level` correspondiente.
  - `calculateScenario(input, moneyFromSale)` no cambia (el `moneyFromSale` que recibe ya
    debería ser `ownerShareMoney` si se aplica el porcentaje).
  - Helper nuevo: `parseScenarioId(id) → { propertyKey, level }` para usar en la UI.

- [ ] **A.3** Tipos compilan: `npx tsc --noEmit`.

### Bloque B — Lógica del wizard

- [ ] **B.1** En `app/(dashboard)/appraisal/new/page.tsx`:
  - Reemplazar `selectedPurchaseIndex: number | null` por `selectedPurchaseIndices: number[]`.
  - Agregar `ownerSharePercent: number` state (default 100).
  - Eliminar (o simplificar) el `purchaseExpenseRates` viejo si quedó huérfano — los escenarios
    ya tienen su `rates` propio. (Decidir: probablemente lo dejamos como "rates default" para
    autogenerar escenarios nuevos.)

- [ ] **B.2** Efecto que mantiene `purchaseScenarios` sincronizado con `selectedPurchaseIndices`:
  - Cuando el usuario marca una propiedad: agregar sus 3 escenarios (si no están).
  - Cuando desmarca: filtrar los escenarios cuyo `propertyKey` ya no está seleccionado.
  - Auto-incluir el "conservative" de cada propiedad seleccionada en `selectedScenarioIds`.
  - Limpiar `selectedScenarioIds` que apuntan a propiedades ya no seleccionadas.

- [ ] **B.3** En el cálculo (`handleCalculate` + el efecto de recálculo):
  - Calcular `ownerShareMoney = moneyInHand * ownerSharePercent / 100`.
  - Pasar `ownerShareMoney` (no `moneyInHand`) a `calculateAllScenarios()`.
  - Setear `result.ownerSharePercent` y `result.ownerShareMoney`.

- [ ] **B.4** Migración legacy al cargar tasación con `editId`:
  - Si `valuation_result.purchaseScenarios[i].id` no contiene `:`, asumirlo legacy de propiedad
    única. Setear `propertyKey='prop_0'`, `propertyLabel` desde la primera purchase property,
    `level=id`, `id=\`prop_0:${level}\``.
  - Sincronizar `selectedScenarioIds` con la misma transformación.
  - Si `ownerSharePercent` ausente → no setear (PDF lo trata como 100).

### Bloque C — UI del wizard

- [ ] **C.1** En el listado de "Propiedades para la Compra":
  - Cambiar `<input type="radio" />` por `<input type="checkbox" />`.
  - `checked={selectedPurchaseIndices.includes(index)}`.
  - Toggle handler que agrega/quita el index. Al quitar, también limpia escenarios.
  - Highlight del card cuando está checked (igual estilo actual).
  - Cambiar mensaje "Selecciona una propiedad..." → "Marcá una o más propiedades para
    incluirlas en el informe" (sólo cuando `selectedPurchaseIndices.length === 0`).

- [ ] **C.2** Nuevo campo "% Parte del propietario":
  - Ubicar en el `<details>` "Porcentajes de Gastos de Venta" o como una fila propia destacada
    arriba del cálculo (preferentemente cerca de Dinero en Mano). Texto guía:
    *"Si la propiedad está dividida entre herederos, ingresá el porcentaje que le toca al
    propietario (ej: 50 si son dos partes iguales)."*
  - Input number con `min=1 max=100 step=1` default 100.
  - Cambio del valor → setea `ownerSharePercent` → recalcula automáticamente (ya hay efecto).

- [ ] **C.3** Actualizar `PurchaseScenariosEditor.tsx`:
  - Recibe los escenarios igual, pero internamente agrupa por `propertyKey`.
  - Renderiza una sección por propiedad: título `propertyLabel`, abajo 3 columnas
    Conservador/Medio/Agresivo (mismo layout actual).
  - Si sólo hay una propiedad seleccionada, el comportamiento visual es el de hoy.

### Bloque D — PDF

- [ ] **D.1** En `SaleSimTable` (`components/appraisal/pdf/PDFReport.tsx:137`):
  - Agregar prop opcional `ownerSharePercent?: number` y `ownerShareMoney?: number`.
  - Renderizar fila amarilla "Parte del Propietario" debajo de "Dinero luego de venta"
    sólo cuando `ownerSharePercent && ownerSharePercent < 100`.
  - Fila amarilla = mismo estilo que "Dinero luego de venta" pero con `backgroundColor: '#fef3c7'`
    y leyenda `Parte del Propietario (${ownerSharePercent}%)`.

- [ ] **D.2** En `PurchaseSimTable` (`PDFReport.tsx:185`):
  - Cambiar header: `COMPRA — {scenario.propertyLabel} · {scenario.label}` (en uppercase
    truncated si es muy largo). Si `propertyLabel` está vacío (legacy single-property),
    caer al comportamiento actual (`COMPRA — ${level.toUpperCase()}`).
  - El cálculo de `remainingMoney` ya viene listo de `calculateScenario`. Si el wizard pasó
    `ownerShareMoney`, ya está reflejado. Renombrar la etiqueta inferior:
    `En mano final` → `Diferencia En Mano` para alinear con el lenguaje de Diego/Canva.
  - Color verde si `>= 0`, rojo si `< 0` (ya está hecho).

- [ ] **D.3** En la página `SIMULACIÓN GASTOS E IMPUESTOS` (`PDFReport.tsx:1281`):
  - Pasar `ownerSharePercent` y `ownerShareMoney` a `SaleSimTable`.
  - El layout actual (gap, flex 1) sigue funcionando para N escenarios; sólo verificar que con
    4 escenarios siga cabiendo (2 propiedades × 2 niveles seleccionados, p.ej.). Si no cabe,
    agregar `flexWrap: 'wrap'` y forzar `minWidth` razonable.

### Bloque E — Verificación

- [ ] **E.1** `npx tsc --noEmit` sin errores.
- [ ] **E.2** `npm run build` sin errores.
- [ ] **E.3** Manual: crear tasación nueva con 2 propiedades de compra, marcar ambas como
  checkbox, setear `ownerSharePercent=50`, calcular, verificar:
  - El editor muestra 2 sub-bloques (uno por propiedad), cada uno con 3 escenarios.
  - El PDF preview muestra "Parte del Propietario" en amarillo y dos cards de compra
    (COMPRA — <prop1 label> · CONSERVADOR y COMPRA — <prop2 label> · CONSERVADOR).
  - La "Diferencia En Mano" usa la parte del propietario (no el total).
- [ ] **E.4** Cargar una tasación legacy del historial (anterior a este cambio) y verificar:
  - No rompe.
  - Si tenía `purchaseScenarios` con id literal `conservative`, ahora muestran con
    `propertyKey='prop_0'` migrado on-the-fly.
  - `ownerSharePercent` se asume 100 → la fila "Parte del Propietario" no aparece y el PDF
    se ve exactamente igual que antes.

### Bloque F — Commit

- [ ] **F.1** `git add` archivos modificados + el plan.
- [ ] **F.2** Commit message:
  ```
  feat(tasador): comparar múltiples propiedades de compra + parte del propietario

  - Multi-select de propiedades de compra (checkbox en lugar de radio)
  - % parte del propietario configurable (cuando propiedad dividida)
  - Escenarios agrupados por propiedad en el editor + PDF
  - Migración in-memory de tasaciones legacy
  ```
- [ ] **F.3** `git push`.

---

## Notas de implementación

- **No tocar la fórmula de Ross-Heidecke ni el cálculo del precio de publicación** — Diego no
  pidió cambios ahí, sólo en la simulación posterior.
- **No agregar columnas nuevas a DB** — todo cabe en `valuation_result` JSONB existente.
- **`purchaseResult` (legacy single-property) se sigue manteniendo** por compat con tasaciones
  viejas que no migraron a escenarios, pero ya no se genera código nuevo que lo use. El nuevo
  flujo siempre va por `purchaseScenarios`.
- **No agregar comentarios "fix: …"** ni hacer refactors de cosas no relacionadas.
