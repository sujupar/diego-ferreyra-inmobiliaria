# Métricas · Pantalla A ("una página, cinco franjas")

**Fecha:** 2026-11-20 · **Pedido:** el dueño eligió la propuesta A del deck "Métricas · 3 propuestas" (https://claude.ai/artifact/QZCeSCyofDRNZtB5qSdyVf). Le gusta "su simpleza", que se mueve "por las pestañitas", y pide **precisión en las métricas comerciales**. Su feedback sobre el documento de la reunión del mismo día define el contenido:

- anuncios ordenados por campaña: gasto, visitas, registros y costo por registro;
- seguimiento del último **ajuste de campañas** (estructura, resultado buscado, cómo se movió, costo por registro desde el ajuste, qué se espera);
- **registros de las páginas de propiedades**;
- consultas de portales, propiedades captadas y plata;
- **nada de datos que no son exactos**.

## 1. Qué es

Una pantalla nueva, **"Tablero"**, que pasa a ser la primera pestaña de /metrics. El "Panel de negocio" de hoy no se borra: queda como pestaña "Detalle completo". Así no se pierde nada y la pantalla nueva crece sola.

Estructura de arriba hacia abajo:

1. **Filtros en una fila:** período (por defecto: este mes, del 1 a hoy) y comparación (por defecto: el mismo tramo del mes anterior).
2. **Cabecera de plata:**
   - margen neto del período contra la meta del mes;
   - margen neto del año;
   - facturado en el año.
3. **Cinco franjas.** Cada una muestra un título, una etiqueta de estado (Mejoró / Igual / Empeoró / Sin datos), 3 o 4 números con su comparación y un botón "Ver detalle" que despliega su detalle debajo. Las franjas:

| Franja | Números de la franja | Detalle desplegable |
|---|---|---|
| **Anuncios** | Inversión · registros de tasación · costo por registro · costo por registro desde el último ajuste | Tabla por campaña (tasación, clase y cada propiedad): gasto, visitas, registros, costo por registro. Luego "Ajustes de campaña": cada ajuste cargado (fecha, qué se hizo, qué se busca, meta, fecha de decisión) con el costo por registro antes y después. Por último, cada anuncio de la estructura actual con su estado |
| **Comercial** | Solicitudes de tasación · agendadas · tasaciones hechas · captadas | Embudo con el % de cada paso. Tiempo de solicitud a agendada (mediana). Solicitudes sin agendar hace más de 48 h, con enlace al CRM. Referidos del período. Registros por propiedad. Consultas de portales por portal |
| **Página y video** | Visitas · conversión · % que toca play · % visto (registrados vs no) | Solo la versión y el video publicados hoy. "Ver versiones anteriores" muestra el resto. El video se mide desde el 21/11 |
| **Propiedades** | Captadas · reservas · escrituras · cartera disponible | Cartera por estado comercial |
| **Plata** | Facturación · comisiones · publicidad · margen neto | Tabla completa: gastos fijos, impuestos, publicidad de propiedades, costo por captación |

## 2. De dónde sale cada número

| Número | Fuente |
|---|---|
| Gasto, visitas y registros por campaña | `meta_ads_daily`. Los registros salen de `raw_data->actions`, `offsite_conversion.fb_pixel_complete_registration`, que ya se baja y no se usaba |
| Cada anuncio de la estructura actual | API de Meta en vivo, cacheada 30 min, con fallo silencioso: el resto de la pantalla no depende de esto |
| Ajustes de campaña | `hitos_metricas`, que ya existe (fecha, embudo, título, detalle) + 3 columnas nuevas: `resultado_buscado`, `meta_costo_registro_ars`, `fecha_decision`. El "antes y después" se calcula con `meta_ads_daily` |
| Embudo comercial | `personas.ts`, la misma lógica del panel de hoy, que coincide con el documento validado |
| Sin agendar > 48 h y tiempos | `deals` + `deal_stage_history` |
| Registros de propiedades | `property_leads` (sin robots ni borrados), origen por UTM o fbclid |
| Consultas de portales | `portal_inquiries` |
| Propiedades, reservas y escrituras | `properties.captured_at`, `commercial_status`, `ventas` |
| Plata | `calcularPlata` de hoy |
| Página y video | `get_panel_visitas` + `video-cohortes` (PR #86) |

## 3. Criterios de aceptación

1. /metrics abre en "Tablero"; "Detalle completo" muestra el panel de hoy sin cambios.
2. Por defecto: del 1 del mes a hoy, contra el mismo tramo del mes anterior.
3. Los números de "Anuncios" coinciden con Meta del 1 al 20/11 (tasación: $ 264.359, 9 registros) y el costo por registro desde el ajuste del 19/11 coincide con el documento de la reunión.
4. Cargar un ajuste nuevo (formulario en el detalle de Anuncios) lo muestra con su antes y después, sin tocar código.
5. Los registros por propiedad coinciden con `property_leads` (1 al 20/11: 9).
6. El embudo comercial coincide con el panel de hoy para el mismo período.
7. Página y video muestran solo la versión publicada; lo anterior, solo al pedirlo.
8. Cada franja se entiende sin abrir el detalle. La pantalla cerrada entra en una vista de computadora y en el celular se apila sin cortar texto.
9. Si Meta en vivo falla, la pantalla igual carga (esa tabla dice "no disponible").

## 4. Riesgos

- **Agendadas que no se registran:** la franja Comercial muestra lo que dice la plataforma. Si el equipo agenda por fuera, el número sale bajo. La franja no lo disimula: muestra "sin agendar > 48 h" para que se vea.
- **Migración:** solo agrega 3 columnas opcionales a `hitos_metricas`; el código viejo no las usa. Se aplica antes del deploy.
- **Rendimiento:** el panel de hoy ya baja todo en una pasada; el tablero reusa esa carga y suma consultas chicas (`property_leads`, `portal_inquiries`).
- **Gastos fijos e impuestos "a confirmar":** se muestran igual que hoy, marcados.

## 5. Fuera de este trabajo

Sistema de llamadas (primer llamado, intentos, motivos de caída): queda el lugar en Comercial, sin números.
