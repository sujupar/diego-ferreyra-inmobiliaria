# Panel de métricas de negocio — spec (etapa 1)

**Fecha:** 2026-11-04 · **Tamaño:** grande (toca plata, datos nuevos y una pantalla principal) → requiere
aprobación explícita del dueño antes de codear. **Uso:** reunión de métricas de los viernes (Diego + Julián).

## Problema y resultado

- **Problema:** las métricas del negocio están repartidas entre Meta, la plataforma, dos planillas de Google y
  documentos; para decidir hay que reconstruirlas a mano cada vez, y la plataforma tiene datos sucios.
- **Resultado:** una pantalla en la plataforma que muestra el embudo completo de cada canal (tasación y clase),
  sus costos, la conversión de las landings y los números de plata (margen bruto, margen neto, costo de
  adquisición y costo máximo admisible), filtrable por fechas y comparable contra otro período, con todo 2026.

## Qué ve el usuario

Ruta `/metrics`, nueva pestaña **"Panel de negocio"** (primera, por defecto). Lo que hoy existe en `/metrics`
pasa a la pestaña "Detalle operativo" sin cambios.

Barra fija arriba: rango de fechas (atajos: esta semana, semana pasada, este mes, mes pasado, trimestre, año,
personalizado) · comparar con (período anterior / mismo período del año pasado / ninguno) · embudo (Todos /
Tasación / Clase) · agrupar por (día, semana, mes).

Bloques, en este orden:

1. **Cinco números de plata** (tarjetas con variación contra el período comparado): facturación limpia,
   margen bruto, margen neto, costo de adquisición por captación, inversión en Meta.
2. **Embudo por canal** (una tabla por embudo, igual al formato aprobado en "Meta y embudos mes a mes"):
   alcance → clics → visitas a la landing → solicitudes/registros → agendadas → realizadas → entregadas →
   captaciones. Cada paso con cantidad, % sobre el paso anterior, % sobre las solicitudes y costo por unidad
   (por solicitud, por agendada, por realizada, por entregada, por captación).
3. **Serie en el tiempo** (según "agrupar por"): solicitudes y % de conversión de la landing, con marcas
   verticales en los **cambios** (nueva landing, A/B, anuncio nuevo, cambio de presupuesto) para ver cuándo
   y cuánto cambió la conversión.
4. **Landings:** conversión por landing y por versión A/B (visitas → solicitudes), y **video** de cada landing:
   reproducciones iniciadas, % que llega a 25/50/75/100 y tiempo medio visto.
5. **Plata del negocio:** ventas del período, honorarios cobrados, reparto (Diego, asesor, referidor, Julián),
   gastos fijos, impuestos, publicidad → margen bruto y neto. Costo de adquisición exacto y **costo de
   adquisición máximo** (beneficio bruto por captación ÷ 3, el piso 3:1 del manual).
6. **Planificador:** "¿cuánto hay que invertir para lograr N tasaciones por semana?" con N editable (8 por
   defecto) y las tasas del período elegido (editables): solicitudes necesarias, inversión semanal y mensual,
   captaciones y facturación esperadas.

Cada número tiene un ícono "¿de dónde sale?" con su fórmula y su fuente. Ningún período sin dato se muestra
como 0: dice "sin dato".

## Definiciones (una sola para toda la plataforma)

- **Persona única por etapa.** Una persona cuenta una vez por paso: si pidió dos veces cuenta 1 solicitud;
  si se agendó, cuenta 1 solicitud y 1 agendada (nunca dos procesos por "Coordinar tasación").
  Identidad = contacto, o teléfono (10 últimos dígitos), o email.
- **Tiempo:** cada etapa se cuenta en la fecha en que OCURRIÓ (vista de eventos) y además se muestra la vista
  por **cohorte** (de las solicitudes del período, cuántas llegaron a cada paso) — conmutador en el bloque 2.
- **Realizada** = visita hecha (`visited_at` o informe). **Entregada** = informe entregado (`delivered_at` o
  informe de tasación). **Captación** = autorización firmada (propiedad captada).
- **Excluido siempre:** contacto Julian Parra (email `julianparra`, tel. 3107822955), `[TEST`, `@prueba.local`,
  `*.test`, `+541100000000`, colegas, robots (`is_bot`), y el formulario "embudo impuestos".
- **Moneda:** USD al dólar blue de cada día (inversión de Meta en ARS se convierte día por día).

## Datos: de dónde sale cada cosa

| Dato | Fuente | Estado hoy |
| --- | --- | --- |
| Inversión, impresiones, clics, visitas Meta | `meta_ads_daily` (sync diario) | OK desde 01/2026 |
| Alcance | API de Meta por rango (no es sumable por día) con caché | falta |
| Visitas a la landing, A/B | `landing_page_visits` | OK desde 06/2026 |
| Video | `video_view_state` | OK desde 06/2026 |
| Solicitudes / registros | `funnel_lead_submissions` + `deals` | OK desde 20/07/2026 |
| Agendadas, realizadas, entregadas, captadas | `deals`, `deal_stage_history`, `appraisals`, `properties` | incompleto (captaciones cargadas sin la persona) |
| Ventas y honorarios | **tabla nueva `ventas`** | falta (las 16 del doc de Diego) |
| Gastos fijos e impuestos | **tabla nueva `gastos_mensuales`** | falta (doc de Diego, impuestos pendientes) |
| Cambios (hitos) | **tabla nueva `hitos_metricas`** | falta (se siembran los conocidos) |
| Ene–jul 2026 (sistema viejo) | **carga histórica conciliada** en `metricas_historicas_mes` | reconstruida en el Mapa de métricas |

Las ventas se cargan desde la ficha de la propiedad ("Vendida" ya existe) sumando honorario cobrado, puntas,
asesor, referidor y reparto; las ventas viejas sin ficha se cargan en una pantalla "Ventas" del panel.

## Fuera de alcance (v1)

Consultas de compradores y visitas a propiedades (ya tienen su sección), tráfico orgánico, export a Excel.

## Riesgos

- Datos sucios: los porcentajes de antes del 20/07 vienen de la conciliación manual; se marcan "histórico".
- Alcance por API: Meta puede limitar; se cachea por rango y embudo.
- Panel lento: las consultas van a funciones SQL agregadas, nunca `select *` (ya tumbó la base una vez).

## Criterios de aceptación

1. Con el rango "año 2026", el embudo de tasación coincide (±1) con "Meta y embudos mes a mes".
2. Ninguna persona aparece dos veces en el mismo paso; una agendada cuenta también como solicitud.
3. Ningún registro de prueba (Julián, [TEST]) aparece en ningún número.
4. Las 16 ventas cargadas dan USD 136.851 cobrados y USD 124.177 limpios.
5. El planificador con N=8 y las tasas del período muestra inversión semanal y mensual con su cuenta visible.
6. Cambiar fechas, embudo o comparación actualiza todo en menos de 3 segundos.
7. Abogado y asesor no ven el panel (solo admin, dueño, coordinador).
