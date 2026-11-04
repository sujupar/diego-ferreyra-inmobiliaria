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

### Cada venta nueva se registra sola (decisión del dueño, 2026-11-04)

Las 17 ventas del documento de Diego se cargan ya (16 + Agüero, reservada en octubre). Y para que no haya que
volver a reconstruir nada, **la plataforma pide los datos de la operación en el momento en que pasa**:

- **Al marcar "Reservada"** en la ficha: fecha de reserva, precio, moneda, % al vendedor, % al comprador, y si
  se comparte con otra inmobiliaria (cuánto se lleva). La venta cuenta en el **mes de la reserva** (así lo cuenta
  Diego).
- **Al marcar "Vendida"**: se confirma lo anterior y se agrega fecha de escritura y **honorario cobrado real**.
- **Reparto**, con valores sugeridos que se pueden corregir, una línea cada uno: otra inmobiliaria, asesor que
  vendió (Lucas 20% si muestra, 50% si capta), referidor (ej. la abogada, 20%), Julián (20%, solo si el dueño
  llegó por embudo). **Limpio de Diego = cobrado − reparto**, calculado, no tipeado.
- **Origen del dueño** y quién captó vienen precargados de la propiedad; si faltan, son obligatorios.
- **Gastos de esa propiedad** (fotos, video, recorrido, destaques, cartel, anuncios de la propiedad): opcionales,
  se restan como costo de vender.
- Una venta con datos incompletos aparece en el panel como **"faltan datos"** con el link para completarla, y
  genera una tarea al que la marcó. Nunca cuenta como $0.
- Las ventas viejas sin ficha en la plataforma (ej. Piedras) se cargan en la pantalla "Ventas" del panel, con el
  mismo formulario.
- Gastos fijos e impuestos: pantalla "Gastos" con el gasto mensual vigente de cada concepto; se carga una vez y
  se edita solo cuando cambia.

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
4. Las 16 ventas de dic-2025 a ago-2026 dan USD 136.851 cobrados y USD 124.177 limpios (salvo las 3 cuentas
   marcadas para revisar: Baigorria, Maure, Santo Tomé).
8. Marcar una propiedad como reservada o vendida pide los datos de la operación, y el panel la suma sola sin
   ninguna carga adicional.
5. El planificador con N=8 y las tasas del período muestra inversión semanal y mensual con su cuenta visible.
6. Cambiar fechas, embudo o comparación actualiza todo en menos de 3 segundos.
7. Abogado y asesor no ven el panel (solo admin, dueño, coordinador).
