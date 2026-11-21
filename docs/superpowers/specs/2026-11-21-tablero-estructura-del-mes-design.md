# Tablero de /metrics con la estructura del documento "Métricas del mes"

**Fecha:** 2026-11-21 · **Pedido del dueño:** que el Tablero de /metrics (PR #87) se arme con la estructura del documento de la reunión (https://claude.ai/artifact/Q4a3xbC2oFmVtDtUS31CYe), que "es fácil de entender para tomar decisiones".

**Problema:** el Tablero de hoy esconde los números en cinco franjas desplegables, y la comparación solo puede ser contra el mismo tramo del mes anterior, el período anterior o el año pasado.

**Resultado:** una sola página, en el orden del documento, que se compara contra cualquier mes, con el embudo en porcentajes, solo los anuncios activos y cada anuncio visible con un clic.

## 1. Qué ve el usuario

Ubicación: /metrics, pestaña "Tablero" (sigue siendo la primera). "Detalle completo" no cambia. Lo ven los mismos roles que hoy.

**Filtros (una fila arriba):**
- **Período:** igual que hoy. Por defecto, del 1 del mes a hoy.
- **Comparar con:**
  - mismo tramo del mes anterior (por defecto);
  - un mes elegido (selector de mes);
  - el mejor mes;
  - nada.
- **Regla de comparación:** siempre se comparan **los mismos días**. Por ejemplo, 1–20/11 contra el 1–20 del mes elegido. Si el período es un mes cerrado, se compara contra el mes entero.
- **El encabezado dice siempre contra qué se compara**, con fechas: "1–20 nov 2026 contra 1–20 ene 2026 (mejor mes)".

**Debajo de los filtros, en este orden:**

0. **Ocho números:**
   - inversión en Meta (USD y $);
   - registros de tasación;
   - costo por registro (USD y $);
   - registros en propiedades (y personas);
   - consultas de portales;
   - captadas;
   - reservas;
   - margen neto.

   Cada uno con el valor comparado al lado.

1. **Campaña de tasación:**
   - **Ajuste vigente:** qué se hizo, qué se busca, meta y cuándo se decide (el formulario de ajustes de hoy sigue acá).
   - **Tabla del período contra el comparado, con variación:** gasto total, gasto por día, registros, costo por registro, visitas, costo por visita y CTR. Los montos en USD y $.
   - **Embudo en porcentajes (NUEVO):**

     | Paso | Valor |
     |---|---|
     | Impresiones → clics | CTR |
     | Clics → visitas | % de clics que cargó la página |
     | Visitas → solicitudes | conversión de la landing |
     | Solicitudes → agendadas | % |
     | Agendadas → tasaciones hechas | % |
     | Tasaciones hechas → captadas | % |

     Cada paso muestra la cantidad, el % del paso y el mismo % del período comparado.
   - **Landing actual (NUEVO en esta sección):**
     - la versión publicada hoy, con sus visitas, solicitudes y conversión;
     - en la columna comparada, la landing que estaba publicada **en ese período**, con su nombre ("oct: versión A y B en prueba 50/50"), para que se vea si se compara la misma página o una distinta.
   - **Anuncios ACTIVOS:**
     - solo los anuncios que hoy están activos, con gasto, clics, visitas, registros y costo por registro del período, sumando todos los conjuntos;
     - cada fila muestra la miniatura del anuncio;
     - al tocar un anuncio se abre una ventana con la miniatura y el texto, más dos botones: **"Ver el anuncio"** (la vista previa de Meta, tal como lo ve la gente) y **"Ver en Instagram"**;
     - un anuncio apagado no aparece, pero su gasto sí suma en el total de la campaña;
     - una línea al pie lo aclara: "X anuncios apagados gastaron $ Y en el período".

2. **Campañas del período:**
   - tabla por campaña (tasación, clase y cada propiedad) contra el comparado;
   - registros en páginas de propiedades, con de dónde vinieron: anuncio pago con su nombre, o reel orgánico;
   - reels con respuesta automática: vistas, comentarios, privados, visitas, registros y comentarios por registro.

3. **Consultas y propiedades:**
   - consultas por portal;
   - captadas, reservas y escrituras;
   - cartera de hoy.

4. **Plata:**
   - facturación;
   - comisiones;
   - publicidad para captar y de propiedades;
   - gastos fijos;
   - impuestos;
   - margen neto.

**Estados de la pantalla:**
- **Si Meta en vivo no responde:** la tabla de anuncios y las vistas de los reels dicen "no disponible" y el resto carga igual.
- **Celular:** las tablas se desplazan de costado, y los ocho números van de a dos.

## 2. Qué pasa por detrás

- Todo lo que hoy arma `armarTablero` sigue sirviendo. Lo nuevo:
  - **Comparar contra un mes elegido o el mejor mes:** `rangoComparado` suma los modos `mes` (con `YYYY-MM`) y `mejor_mes`. Es lógica pura, con pruebas.
  - **Mejor mes** (ver la pregunta abierta): se calcula con `meta_ads_daily` + embudo de personas, mes a mes, sobre los meses con dato.
  - **Embudo en %:** impresiones y clics de `meta_ads_daily`, y el resto de `personas.ts`, que es la misma lógica validada.
  - **Landing del período comparado:** las variantes con visitas en ese período (`landing_page_visits.landing_variant`).
- **Anuncios activos y vista previa** (Meta en vivo, solo lectura, caché de 30 min, igual que hoy):
  - se piden los insights del período por anuncio (`level=ad`);
  - además, `effective_status`, `preview_shareable_link` y la miniatura del anuncio;
  - verificado el 2026-11-21: Meta devuelve un enlace `fb.me/…` por anuncio, más la miniatura y el enlace de Instagram.
- **USD:** al dólar blue de cada día (`bluelytics`, ya usado por el panel).
- **Reels:** comentarios y privados de `reel_comentarios`; vistas de Instagram en vivo (con caché y fallo silencioso).
- **No se escribe nada en la base:** sin migraciones, sin mensajes, sin cambios en Meta.

## 3. Qué queda afuera

- Cambiar algo de las campañas desde esta pantalla.
- La pestaña "Detalle completo".
- Que el equipo mueva las solicitudes a "agendada" en el CRM: la pantalla muestra lo que dice la plataforma.

## 4. Criterios de aceptación

1. Con "1–20/11 contra mismo tramo del mes anterior", los números coinciden con el documento de la reunión: inversión USD 213, 9 registros, costo por registro USD 19,1 y las tablas de cada sección.
2. Elegir "Comparar con: enero 2026" compara contra el 1–20/01, y el encabezado lo dice con fechas.
3. "Mejor mes" elige el mes según la regla definida y lo nombra.
4. El embudo muestra cada paso con cantidad y %, y el % del período comparado.
5. La tabla de anuncios muestra solo los activos. Su total más la línea de "apagados" da el gasto total de la campaña.
6. Al tocar un anuncio se abre su vista previa de Meta, en una pestaña nueva, desde la ventana.
7. La landing comparada dice qué versión estaba publicada en ese período.
8. Si Meta en vivo falla, el resto de la pantalla carga.
9. En el celular (390 px) nada se corta.

## 5. Riesgos

- **Límite de tiempo de Netlify:** la carga principal no cambia. Los anuncios y los reels van por rutas aparte, con caché, una consulta a Meta por pedido.
- **Comparar contra un mes viejo cuesta más:** el panel ya baja Meta desde el 1 de enero, y lo anterior a enero no tiene datos de Meta. Se muestra "sin dato", nunca $ 0.
- **Miniaturas de Meta:** son URLs que vencen. Se piden en vivo y no se guardan.
- **Agendadas en noviembre = 0:** es real en la plataforma (nadie movió las solicitudes en el CRM). El embudo lo va a mostrar así.

## 6. Pregunta abierta

- "El mejor mes del año anterior": de 2025 no hay datos de Meta. ¿Cuál es "el mejor mes" y con qué criterio se elige?
