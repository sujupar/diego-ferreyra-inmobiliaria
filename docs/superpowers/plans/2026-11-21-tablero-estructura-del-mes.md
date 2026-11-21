# Plan · Tablero con la estructura del documento del mes

Spec: `docs/superpowers/specs/2026-11-21-tablero-estructura-del-mes-design.md`. Aprobado el 2026-11-21 ("Ok").

Decisión: "el mejor mes" es el mes cerrado del año, con datos de Meta, que tiene el menor costo por solicitud de tasación (USD de Meta ÷ personas que pidieron tasación ese mes).

## Tareas

| # | Qué | Archivos | Prueba |
|---|---|---|---|
| 1 | **Comparación contra cualquier mes y contra el mejor mes** (puro): `tramoEnMes` arma los mismos días en otro mes, o el mes entero si el período es un mes cerrado; `elegirMejorMes`. | `lib/metrics/tablero/comparacion.ts` | `comparacion.test.ts`: mismo tramo, mes cerrado, 31→30, febrero, mes sin datos, empate, mes en curso excluido |
| 2 | **El servidor arma el comparado.** `cargarDatos` acepta un rango comparado ya resuelto. `armarTablero` resuelve los modos `mes` y `mejor_mes` y suma: inversión en USD, embudo con %, landings del período comparado y campañas en USD. La ruta valida `comparar` y `mes`. | `lib/metrics/panel/servidor.ts`, `lib/metrics/tablero/servidor.ts`, `lib/metrics/tablero/embudo-general.ts`, `app/api/metrics/tablero/route.ts` | `tablero.test.ts`: embudo con % y caso sin datos; `totalAnuncios` en USD |
| 3 | **Anuncios activos del período, con vista previa.** Se agrupan las versiones de un mismo anuncio; activo = alguna versión con `effective_status` ACTIVE. Los enlaces se validan por dominio exacto. | `lib/metrics/tablero/anuncios-periodo.ts`, `lib/metrics/tablero/meta-vivo.ts`, `app/api/metrics/tablero/anuncios-vivo/route.ts` | `anuncios-periodo.test.ts`: agrupar versiones, activos/apagados, totales, enlace de otro dominio descartado |
| 4 | **Reels con respuesta automática.** Datos de la base más vistas de Instagram en vivo, con caché. | `lib/metrics/tablero/reels.ts`, `lib/metrics/tablero/reels-vivo.ts`, `app/api/metrics/tablero/reels/route.ts` | `reels.test.ts`: comentarios simulados afuera, personas, registros por enlace del reel |
| 5 | **Pantalla con el orden del documento.** Filtros, encabezado de comparación, 8 números, Campaña de tasación (ajuste, tabla, embudo, landing, anuncios), Campañas del período (campañas, registros en propiedades, reels), Consultas y propiedades, Plata. Las franjas viejas se borran. | `components/metrics/tablero/*` | `scripts/tablero-control.probe.ts` (render con datos de prueba) |
| 6 | **Verificación.** tsc y eslint acotados, vitest; comparación de números contra el documento de la reunión (1–20/11). | — | criterio 1 de la spec |

Sin migraciones. Sin variables de entorno nuevas. Consumidores de `Comparar`: `rango.ts`, la ruta del panel (no cambia: sigue con sus 4 modos) y la del Tablero.
