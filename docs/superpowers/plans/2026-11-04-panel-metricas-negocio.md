# Plan — Panel de métricas de negocio (etapa 2)

Spec: `docs/superpowers/specs/2026-11-04-panel-metricas-negocio-design.md` (aprobada por el dueño el 2026-11-04).
Meta: usable en la reunión del viernes 2026-11-06.

## Decisiones de estructura

1. **El conteo de personas se calcula en TypeScript, no en SQL.** Es la lógica validada a mano en
   `scripts/metricas/tablas-mensuales.py` (notas del sistema viejo, pruebas, colegas, unión por
   contacto/teléfono/email, evidencia por persona). Volumen chico (961 procesos, 1.109 cambios de etapa,
   72 informes): se baja con columnas mínimas y se calcula en la request (<1 s). Funciones puras y probadas.
   OJO: `appraisals` pesa 288 MB → solo `id, contact_id, created_at`. Nunca `select('*')`.
2. **Embudo de cada campaña por nombre** (`tasaci` → tasación, `clase` → clase, resto → propiedad), igual que
   el Mapa de métricas.
3. **USD al blue de cada día** (bluelytics `/v2/evolution.json`, cacheado 12 h con `fetch` de Next).
4. **Alcance** no es sumable por día: endpoint aparte que consulta Meta por rango y embudo, cacheado en la tabla
   `meta_reach_cache` (rango cerrado = para siempre; rango que incluye hoy = 6 h). La pantalla lo carga aparte
   para que Meta lento no frene el resto.
5. **Visitas a la landing**: las propias (`landing_page_visits`, sin robots) desde 16/06/2026; antes, las de Meta
   (`landing_page_views`). Tasación nov-25 a mar-26 = "sin dato" (Meta no las medía bien).
6. **Plata en tablas nuevas**: `ventas`, `gastos_fijos`, `hitos_metricas`. Escritura por API con permiso, lectura
   de plata con `metrics.view`. RLS con `is_operations_user()`.

## Migración `20261104000003_panel_metricas.sql`

- `ventas`: property_id (FK SET NULL), direccion, captada_en (date), reservada_en (date), escriturada_en (date),
  precio, moneda, pct_vendedor, pct_comprador, otra_inmobiliaria_usd, honorario_cobrado_usd (real; si null se
  usa el calculado), capto (text), vendio (text), asesor_pct, julian_pct, referidor_nombre, referidor_pct,
  gastos_propiedad_usd, origen_dueno (referido/embudo/clase/portal/redes/otro), a_confirmar (bool), notas,
  estado (reservada/vendida/caida), created_by/updated_by (FK profiles SET NULL), timestamps.
- `gastos_fijos`: concepto, monto_usd, desde (date), hasta (date null), notas.
- `hitos_metricas`: fecha, embudo (null = todos), titulo, detalle.
- `meta_reach_cache`: embudo, desde, hasta, alcance, consultado_en; PK (embudo, desde, hasta).

## Lib pura `lib/metrics/panel/` (con pruebas)

- `personas.ts` — port de `tablas-mensuales.py`: `clasificarSolicitud`, `esPrueba`, `deduplicar`,
  `evidencia` → por persona: tipo, fecha de solicitud y fecha (o null) de agendada/realizada/entregada/captada.
- `embudo.ts` — `armarEmbudo(personas, metaDiario, visitas, rango, embudo, vista: 'cohorte'|'eventos')` y
  `serie(…, agrupar)`.
- `reparto.ts` — `calcularVenta(v)` → honorario bruto, cobrado, partes, limpio Diego, `faltan[]`.
- `economia.ts` — margen bruto/neto, CAC, CAC máximo (beneficio bruto por captación ÷ 3), `planificar(N, tasas)`.
- `rango.ts` — atajos de fechas y período de comparación.

## API

- `GET /api/metrics/panel?desde&hasta&embudo&vista&agrupar&comparar` → todos los bloques menos alcance.
- `GET /api/metrics/panel/alcance?desde&hasta` → alcance por embudo.
- `GET|POST /api/metrics/ventas`, `PATCH|DELETE /api/metrics/ventas/[id]` (plata: `metrics.view`).
- `GET|POST /api/metrics/gastos`, `PATCH|DELETE /api/metrics/gastos/[id]`.
- `GET|POST /api/metrics/hitos`, `DELETE /api/metrics/hitos/[id]`.
- `POST /api/properties/[id]/commercial-status`: al pasar a reservada/vendida, acepta `venta` y hace upsert en
  `ventas` (una por propiedad, la abierta).

## UI

- `/metrics`: pestañas "Panel de negocio" (nuevo, default) y "Detalle operativo" (lo de hoy, intacto).
- `components/metrics/panel/`: `BarraFiltros`, `NumerosPlata`, `EmbudoCanal`, `SerieConversion` (con hitos),
  `LandingsVideo`, `PlataNegocio`, `Planificador`, `VentasEditor`, `GastosEditor`, `HitosEditor`, `DeDondeSale`.
- Ficha de propiedad: la tarjeta de estado comercial abre "Datos de la operación" al elegir reservada/vendida.

## Datos iniciales (producción, OK del dueño 2026-11-04)

Script `scripts/metricas/cargar-ventas-gastos-hitos.ts`: las 17 ventas del doc de Diego (Agüero "a confirmar";
Baigorria, Maure, Santo Tomé con nota "cuenta a revisar"), los gastos fijos (moneda a confirmar) y los hitos
conocidos (landing propia 20/07, A/B 03/09, etc.). Idempotente.

## Verificación

- Pruebas de la lib (vitest con config acotada).
- Comparar el embudo 2026 de la API contra "Meta y embudos mes a mes" (±1).
- Reparto: suma de las 16 = 136.851 / 124.177 (con las 3 cuentas a revisar señaladas).
- QA en la vista previa de Netlify con el navegador de pruebas.
