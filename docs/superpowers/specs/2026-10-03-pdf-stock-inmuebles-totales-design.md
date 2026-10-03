# PDF de tasación — "Stock de inmuebles en venta en CABA" con el total de inmuebles

**Fecha:** 2026-10-03 · **Tamaño:** chico · **Rama:** se hace en una rama propia

## Problema y resultado

**Problema:** la página titulada "Stock de inmuebles en venta en CABA" destaca **74.584 deptos en
venta** (solo departamentos) y su "-0,8 % mensual" también es de departamentos.

**Resultado:** el número destacado es el **total de inmuebles** (ej. **110.214 inmuebles en
venta**) y la variación mensual que lo acompaña es la **del total**. Vale para todas las
tasaciones, también las ya hechas.

## Dónde está

- `components/appraisal/pdf/market/StockDashboardPDF.tsx:39-48` — muestra `stock.stockDeptos`,
  el texto "deptos en venta" y `stock.stockVm`.
- Los datos vienen de dos fuentes: **Bryn** (`stockDeptos`, `stockVm`, `absorcion`: solo
  departamentos) e **Infogram** (`totalInmuebles` y la tabla por tipo). La fuente no publica una
  variación mensual del total: hay que calcularla con nuestro historial (`market_snapshot_caba`).

## Lo que hay en la base (verificado 2026-10-03)

| Período | Total inmuebles | Deptos |
|---|---|---|
| 2026-07 | 112.019 | 76.003 |
| 2026-08 | 110.907 | 75.198 |
| 2026-09 | 110.907 (repite agosto) | 74.584 |
| 2026-10 | 110.214 | 74.584 |

Septiembre repite el total de agosto porque Infogram no se había actualizado: una variación
calculada ahí daría "0 %", que es falso.

## Criterios de aceptación

1. En el PDF de cualquier tasación con datos de mercado, el número grande es el total de
   inmuebles del período congelado de esa tasación, con el texto "inmuebles en venta".
2. Al lado, la variación mensual del total = total del período / total del período anterior − 1,
   en verde si sube y rojo si baja. Octubre 2026 debe decir **-0,6 % mensual** (110.214 vs 110.907).
3. Si no hay período anterior, o el total es idéntico al anterior (la fuente no se actualizó), la
   variación **no se muestra** (nunca "0 %").
4. Si una tasación no tiene el total, se muestra el dato de departamentos con su rótulo correcto
   "deptos en venta" (comportamiento actual), nunca un número sin rótulo.
5. La absorción ("18,2 meses") se calcula sobre departamentos: se rotula "absorción deptos".
6. Las tasaciones ya creadas muestran el cambio al descargar o previsualizar su PDF, sin migrar
   nada (el PDF se arma en el momento).

## Cómo se arma

- Cálculo puro `variacionMensualTotal(actual, anterior)` en `lib/market-data/` con su test.
- El resolver suma el total del período anterior a `MarketDataForReport` (lectura de la fila
  `period − 1 mes` en `market_snapshot_caba`).
- `StockDashboardPDF` usa el total y la variación nueva. Verificación con
  `scripts/render-market-pdf-test.tsx` (render real del PDF, mirado a ojo).

## Afuera

- Cambiar las fuentes de datos o la ingesta.
- Calcular absorción del total (no hay datos de ventas por tipo).

## Supuestos

- "Mensual" = contra el período (mes) anterior de nuestro historial.
- Absorción se mantiene, rotulada como de departamentos (supuesto 5; se puede quitar si se prefiere).
