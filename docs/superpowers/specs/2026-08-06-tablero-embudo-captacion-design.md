# Tablero del embudo de captación — diseño

**Fecha:** 2026-08-06
**Estado:** diseño aprobado por el usuario (pendiente de plan de implementación)
**Alcance:** recuperar la medición de la inversión publicitaria, y construir el primer tablero de decisión sobre el embudo de captación.

---

## 1. Para qué existe

No es un tablero de números: es una herramienta para **encontrar dónde se traba la operación y decidir qué destrabar**. El usuario lo planteó así, y eso define todo el diseño.

Las decisiones que tiene que habilitar:

1. **¿Dónde se traba el embudo?** Qué paso tarda más y cuál pierde más gente. Si captar tarda demasiado, la acción es publicar y lanzar campañas antes.
2. **¿Cuánto cuesta cada cosa?** Cuánto sale una solicitud de tasación, una tasación entregada y una captación, contra la inversión publicitaria real.
3. **¿De dónde conviene traer?** Comparar lo pago contra el referido, que no cuesta publicidad.
4. **¿Mejora o empeora?** Lo mismo mes a mes.
5. **¿Quién?** Lo mismo por asesor — **hoy imposible**, ver §3.2.

Una regla organizativa que pidió el usuario explícitamente: **no todo aglomerado en una pantalla**. Cada decisión tiene su sección, y se entra a la sección que corresponde a la pregunta.

## 2. Lo que ya existe

`/metrics` ya tiene: estado actual del pipeline, eventos del embudo del período, comparativa contra el período anterior, evolución diaria, rendimiento de Meta por campaña y consultas por propiedad. Las RPC `get_funnel_metrics`, `get_funnel_metrics_by_day`, `get_deals_current_state` y `get_meta_funnel_by_campaign` funcionan.

**Lo que NO existe y es el corazón de este pedido:** los **tiempos** entre etapas y el **costo por etapa**. Hoy se puede ver cuántos pasaron; no cuánto tardaron ni cuánto costaron.

## 3. Diagnóstico de los datos (medido el 2026-08-06)

Este diseño se apoya en lo que hay, no en lo que uno querría que hubiera.

### 3.1 Lo sólido

- **815 deals** con un año de historia: 464 `historico`, 225 `embudo`, 123 `clase_gratuita`, 3 `referido`.
- **`deal_stage_history` con 886 filas** desde 2025-08-25, con `from_stage`, `to_stage`, `changed_at` y `changed_by`. Alcanza para calcular tiempos.
- Volumen mensual estable: 54 deals en marzo, 55 en abril, 73 en mayo, 66 en junio, 50 en julio.

### 3.2 Roto: no se puede medir por asesor

**28 de 815 deals tienen `assigned_to`** (3,4%). Marzo y abril: cero. Junio: 11 de 66. Julio: 5 de 50.

No es un problema de programación — es que en la operación no se asigna. **Queda fuera de alcance** y se propone como trabajo siguiente (§8): mientras no se asigne al crear el deal, cualquier métrica por persona sería una mentira estadística.

### 3.3 Roto: la inversión publicitaria no es una serie

`meta_ads_daily` tiene **24 días con dato sobre los 88** que van del 2026-03-01 al 2026-05-27: marzo 12 días, abril 9, mayo 3. Después del 27 de mayo, nada.

La causa: **nadie ejecuta la sincronización**. Los diez trabajos programados en la base (`cron.job`) no incluyen ninguno de Meta, y lo único que escribía esa tabla era una función de Netlify de las que no se disparan (bug documentado en CLAUDE.md).

Consecuencia: **hoy el costo por tasación no se puede calcular para ningún mes**. Abril daría la suma de 9 días sueltos presentada como el mes entero.

Es recuperable: Meta conserva el histórico y se puede pedir hacia atrás.

### 3.4 Muestra chica en los tiempos

Las transiciones registradas son pocas: el paso más transitado (`scheduled → visited`) tiene 14 casos; `visited → appraisal_sent`, 7. Se pueden calcular medianas, pero **con 14 casos una mediana no sostiene una decisión de negocio**. Crece con el uso; hoy hay que mostrarlo con su tamaño de muestra a la vista.

## 4. Principio que atraviesa todo: el tablero no miente sobre su base

Cada número que se muestre viene acompañado de **de cuántos casos sale**. Cuando no hay dato suficiente, el tablero lo dice en vez de mostrar un cero que se lee como "no pasó nada".

Concretamente:
- Toda métrica agregada expone su `n`. Con `n < 20` se muestra un aviso de muestra chica junto al número.
- La sección de costos expone la **cobertura**: "inversión cargada para 24 de 88 días del período". Con cobertura < 95% el costo se muestra tachado o con advertencia explícita, no como un número limpio.
- Un período sin ninguna inversión cargada dice "sin datos de inversión", nunca "$0".

Sin esto, un tablero de este tipo produce decisiones confiadas y equivocadas, que es peor que no tenerlo.

---

## 5. Parte 1 — Recuperar la medición de la inversión

Prerequisito de la sección de costos. Tres piezas.

### 5.1 Traer la serie diaria de Meta

Las funciones `fetchDailyInsights(date)` y `fetchInsightsRange(since, until)` de `lib/marketing/meta-ads.ts` **no las usa nadie** (verificado por búsqueda en todo el repo): son código muerto, así que se pueden corregir sin romper nada.

`fetchInsightsRange` tiene un defecto que importa: pide el rango **sin `time_increment`**, así que Meta devuelve **una fila agregada por campaña para todo el rango**, no una por día. Sirve para un total, no para una serie.

Se agrega `fetchDailyInsightsRange(since, until)` con `time_increment=1`, que devuelve una fila por campaña **y por día**, y se toma la fecha de `date_start` de cada fila en vez de asumirla. Una sola llamada trae meses enteros.

### 5.2 Ruta de cron y programación

Ruta nueva `app/api/cron/meta-sync` siguiendo el patrón ya probado de `app/api/cron/send-report`: valida `x-cron-secret` contra la env var `CRON_SECRET` o, si no existe, contra `cron_config`. Sincroniza los últimos N días (default 7, parámetro `?days=`) para cubrir reprocesos de Meta, que ajusta cifras hasta 72 horas después.

Se programa con `pg_cron` a diario, como los reportes. El upsert usa la constraint UNIQUE `(date, campaign_id)` que ya existe en `meta_ads_daily`.

### 5.3 Recuperación del histórico

Script `scripts/backfill-meta-spend.ts` que trae desde el primer día con campañas hasta hoy y hace upsert. Al terminar **verifica e informa**: cuántos días del rango quedaron con dato y cuáles siguen sin él. Si un día no tiene inversión porque genuinamente no hubo campañas activas, eso es distinto de un día sin sincronizar — y la verificación tiene que poder distinguirlo, mirando si hubo alguna campaña activa esa fecha.

### 5.4 Separar inversión de embudo e inversión de propiedades

La pregunta "cuánto cuesta una tasación" solo tiene sentido con la inversión del **embudo de captación**, no con la de promocionar una propiedad ya captada.

La separación **no se hace por el nombre de la campaña** (hoy alcanzaría, porque se llaman "Tasación Gratuita", "Clase Gratuita" y "Tasación Directa", pero se rompe el día que alguien renombra una). Se hace por dato: una campaña es "de propiedad" si su `campaign_id` figura en `property_meta_campaigns`; si no figura, es del embudo.

---

## 6. Parte 2 — El tablero

**Dónde vive: dentro de `/embudos`, que ya existe.** No se crea una ruta nueva.

Ya hay dos pantallas de análisis —`/metrics` y `/embudos`, ambas restringidas a admin y dueño— y agregar una tercera empeoraría justo lo que el usuario quiere resolver: saber a dónde ir según la pregunta. `/embudos` ya es la pantalla del embudo (tarjetas por embudo, curvas, mapa de calor) y tiene su propio selector de período, así que las secciones nuevas se suman ahí y reusan ese selector.

Unificar `/metrics` y `/embudos` en una sola portada es el tablero E y queda fuera de acá.

Las secciones nuevas son **cuatro, separadas y con título propio**, para entrar a la que corresponde a la pregunta.

### 6.1 ¿Dónde se traba?

El embudo con tres números por paso, juntos: **cuántos pasaron**, **qué porcentaje se perdió** y **cuánto tardó (mediana)**.

Los pasos: solicitud → coordinada → visita realizada → tasación entregada → en seguimiento → captada, más las salidas a perdido en cada etapa.

Se resaltan **el paso más lento** y **el de peor conversión**, con una línea que nombra el cuello de botella en castellano ("el paso más lento es de visita realizada a tasación entregada: 6 días de mediana, sobre 7 casos").

Se usa **mediana y no promedio**: con estos volúmenes, un caso que tardó 90 días desplaza el promedio y esconde la realidad.

### 6.2 ¿Cuánto cuesta?

Inversión del embudo en el período, dividida por:
- **solicitudes** — deals de origen `embudo` creados en el período
- **tasaciones entregadas** — transiciones a `appraisal_sent` ocurridas en el período
- **captaciones** — transiciones a `captured` ocurridas en el período

Cada costo con su cobertura de inversión al lado (§4). Y una comparación por origen: lo pago (`embudo` + `clase_gratuita`) contra `referido`, que cuesta cero en publicidad — que es exactamente la comparación que permite decidir dónde poner el esfuerzo.

### 6.3 ¿Cómo evoluciona?

Las mismas métricas mes a mes, para ver tendencia y no una foto. Volumen por etapa, costo por captación y tiempo del paso más lento.

### 6.4 Por asesor

La sección se construye, pero **arranca mostrando el problema**: "solo 28 de 815 deals tienen asesor asignado; hasta que se asigne al crear el deal, esta sección no puede medir nada". Con el detalle de la cobertura por mes.

Se construye igual, y no se oculta, porque esa pantalla es el argumento para arreglar el proceso.

### 6.5 Cómo se conecta con ventas (a futuro)

El usuario pidió que quede documentado el encastre, para no improvisarlo cuando lleguen los datos de Diego.

El embudo termina en `captured`. El ciclo comercial arranca ahí y termina en `commercial_status = 'vendida'` con `sold_at` (implementado el 2026-08-06). **La unión es la propiedad**: un deal captado deriva en una propiedad, y esa propiedad tiene fecha de venta.

Entonces "cuánto tardamos de captar a vender" = `properties.sold_at` − fecha de la transición a `captured` del deal asociado.

**El eslabón que falta hoy** es la relación explícita entre el deal captado y la propiedad resultante. Hay 11 deals en `captured` y 21 propiedades aprobadas: los números no coinciden, así que la relación no es uno a uno ni está garantizada. Antes de construir la sección de ventas hay que resolver ese vínculo, y esa es la primera tarea del tablero A. Queda anotado acá para que no aparezca como sorpresa.

---

## 7. Cómo se calcula (para que sea auditable)

Todo en RPCs de Postgres, siguiendo el patrón de las que ya existen. Nada de agregación en el cliente: los cálculos tienen que poder verificarse corriendo la consulta.

**Tiempos** — `get_funnel_stage_timings(desde, hasta, origenes[])`. El tiempo en una etapa es la diferencia entre el evento que entró a esa etapa y el siguiente evento del mismo deal, con `LAG` sobre `deal_stage_history` particionado por `deal_id`. Devuelve por transición: `desde`, `hasta`, `n`, `mediana_dias`, `p75_dias`.

**Costos** — `get_funnel_costs(desde, hasta)`. Devuelve inversión del embudo, las tres cantidades (solicitudes, tasaciones, captaciones), los tres costos, y **`dias_con_dato` y `dias_del_periodo`** para la cobertura.

**Por origen** — parámetro `origenes[]` en ambas. Por defecto excluye `historico`: son 464 deals heredados del sistema anterior, sin historial de etapas real, y meterlos ensucia toda medición de tiempo. La UI permite incluirlos explícitamente.

Los helpers de presentación (formato, detección del cuello de botella, umbral de muestra chica) van en `lib/metrics/funnel-insights.ts`, puro y testeado — Turbopack no arranca en esta carpeta y las funciones puras son la única verificación barata.

## 8. Fuera de alcance

- **Métricas por asesor con datos reales**: requiere resolver la asignación en la operación. Propuesta para después: asignar automáticamente al crear el deal, o exigirlo antes de coordinar.
- **La sección de ventas** (tablero A): depende de los datos de Diego y del vínculo deal↔propiedad (§6.5).
- **Difusión y demanda** (tablero C), **productividad del equipo** (D) y **la portada unificada** (E).
- Rediseñar `/metrics`, que sigue funcionando como está.
- Apagar el trabajo zombi `ghl-poll`, que corre cada 10 minutos sobre un sistema dado de baja. Es un hallazgo de esta exploración; se anota para resolver aparte porque no afecta a este tablero.

## 9. Verificación

1. **Tests unitarios** de `lib/metrics/funnel-insights.ts`: detección del cuello de botella, umbral de muestra chica, cálculo de cobertura, formato de duraciones.
2. **Las RPCs se verifican contra la base real** con un script que corre cada una y compara contra consultas equivalentes escritas de otra forma. Una métrica que solo se prueba contra sí misma no está probada.
3. **La recuperación del histórico se verifica por cobertura**: al terminar, ningún día del rango con campañas activas puede quedar sin dato.
4. **Probe de render** de las cuatro secciones, incluida la de asesores con su aviso.
5. **Revisión visual del usuario** antes de publicar.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El token de Meta está vencido y la recuperación falla | `checkTokenExpiry()` ya existe; el script lo chequea primero y aborta con un mensaje claro en vez de traer datos a medias |
| La recuperación trae meses y satura la función | La sincronización diaria trae 7 días; la recuperación histórica corre como script local, no por HTTP, así que no tiene techo de tiempo |
| Alguien lee un costo calculado sobre cobertura parcial | La cobertura viaja con el número, no en una nota al pie (§4) |
| Las medianas con 7 casos se toman como verdad | El `n` se muestra siempre, y con `n < 20` va un aviso explícito |
| Los 464 deals históricos distorsionan los tiempos | Excluidos por defecto, con la opción de incluirlos a la vista |
| Otra sesión trabajando en paralelo pisa el trabajo | Worktree aislado; antes de mergear se verifica el diff contra la base común (no contra `origin/main`, que se mueve) |
