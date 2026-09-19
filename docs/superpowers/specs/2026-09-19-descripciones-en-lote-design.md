# Descripciones con el método de Diego: todas las propiedades y regeneración en lote

- **Fecha:** 2026-09-19
- **Tamaño:** grande (cola en segundo plano + pg_cron + costo de IA por volumen + cambios que llegan a los portales). Requiere OK del dueño antes de codear.
- **Rama:** `feat/descripciones-en-lote`
- **Base:** el generador por propiedad ya desplegado (PR #17, spec `2026-09-19-descripciones-metodo-diego-design.md`). El dueño lo probó en Perón 4227 y le gustó.

## Problema

1. **No todas las propiedades pueden generar.** Los terrenos quedan bloqueados: el requisito pide ambientes y superficie cubierta, que un terreno no tiene (hoy 2 de 39).
2. **Regenerar es de a una.** Muchas propiedades tienen descripciones del sistema viejo o escritas a mano con errores. Hoy hay que entrar ficha por ficha, esperar los tres pasos y guardar. Con cientos o miles de propiedades eso no escala.
3. **Escala.** El proceso tiene que funcionar con miles de propiedades sin pasarse del tiempo de Netlify, sin saturar los servicios de mapas (Nominatim pide 1 consulta por segundo; Overpass limita por IP) y sin publicar nada en los portales sin que una persona lo apruebe.

## Resultado esperado

- Cualquier propiedad activa con fotos y datos básicos —incluidos los terrenos— puede generar su descripción.
- Desde una pantalla nueva, **Propiedades → Descripciones**, el dueño o un admin elige muchas propiedades (o "todas las que cumplen") y el sistema genera **borradores** en segundo plano, a su ritmo.
- Los borradores se **revisan y aprueban** (uno por uno, o varios juntos). Nada se guarda ni llega a los portales sin aprobación.

## Qué ve el usuario

### Pantalla "Descripciones" (`/properties/descripciones`)

- **Quién la ve:** admin y dueño (`settings.manage`: controlan el gasto). Coordinador y asesor siguen generando de a una desde la ficha, como hoy. El menú la muestra dentro de "Propiedades".
- **Pestañas con contador:**
  - **Todas:** propiedades activas (se excluyen descartadas, dadas de baja y vendidas).
  - **Sin descripción.**
  - **Anteriores al método:** tienen descripción pero no fue generada ni guardada con el método de Diego.
  - **Para revisar:** borradores listos.
  - **En proceso:** en cola o generándose.
  - **Con errores.**
- **Tabla paginada** (50 por página, del lado del servidor): dirección, tipo, estado de la descripción ("Sin descripción" / "Anterior al método" / "Método de Diego · 19/9" / "Borrador listo" / "En cola" / "Generando: fotos/zona/escritura" / "Error: …"), portales donde está publicada, y "Falta: …" si no cumple requisitos (esa fila no se puede elegir).
- **Generar en lote:**
  - Casillas por fila y "Elegir todas las de esta página".
  - Botón "Elegir todas las que cumplen (N)": abarca todas las páginas del filtro actual, sin cargarlas en el navegador.
  - Botón "Generar borradores (N)": abre una confirmación que dice cuántas, cuánto tarda aproximadamente (a ~1 por minuto) y que **nada se publica hasta aprobar**.
  - Las que ya están en cola o generándose se saltean solas.
- **Revisar:** en "Para revisar", cada fila tiene "Revisar". Abre un diálogo con la descripción actual y la nueva lado a lado (una arriba de la otra en el celular), la nueva editable. Muestra los avisos (fotos que no coinciden con la ficha, controles no resueltos) y el aviso de portales publicados. Botones: "Aprobar y guardar", "Descartar", "Volver a generar".
- **Aprobar varios:** en "Para revisar", casillas y "Aprobar seleccionados (N)". Solo se pueden elegir borradores **sin avisos**; los que tienen avisos se revisan de a uno. La confirmación dice cuántos están publicados en portales ("se actualizan también ahí").
- **Errores:** "Reintentar" por fila o para los seleccionados.
- **Progreso:** la pantalla se actualiza sola cada 20 segundos mientras haya trabajos en proceso.

### Ficha de la propiedad

- Igual que hoy (botón "Generar/Regenerar descripción").
- Si hay un borrador listo del lote, arriba del botón aparece: "Hay un borrador del método de Diego para revisar" con un enlace a la pantalla Descripciones filtrada por esa propiedad.
- Si alguien guarda desde la ficha, el borrador pendiente de esa propiedad queda "Reemplazado" y ya no se puede aprobar (no se pisa lo más nuevo con lo más viejo).

### Terrenos

- **Requisitos para terreno:** fotos (5), dirección, barrio, **superficie del lote** (`total_area`) y precio. No se piden ambientes ni superficie cubierta.
- **Estructura TERRENO en el prompt.** Diego no la escribió: se arma con sus mismas reglas y su estructura de casa, sin el recorrido, y queda rotulada como adaptación:
  - descripción del lote (medidas si están, superficie, lo que se ve: forma, arbolado, construcciones existentes);
  - posibilidades de uso, **solo si están en los datos o las notas**;
  - ubicación;
  - emoción;
  - invitación;
  - disclaimer.

## Qué pasa por detrás

### Cola de trabajo: `descripcion_trabajos`

Calcada de `funnel_lead_jobs`, que ya corre en producción. Campos:
- `id`, `property_id` (FK a `properties`, `ON DELETE CASCADE`);
- `estado`: `pendiente` | `en_curso` | `listo` | `aprobado` | `descartado` | `reemplazado` | `fallido`;
- `etapa`: `fotos` | `zona` | `escribir`;
- `intentos`, `max_intentos` (3 por etapa), `proximo_intento_en`, `tomado_en`, `ultimo_error`;
- `borrador` (jsonb: `title`, `subtitle`, `body`, `problemas`, `avisos`, `comprador`);
- `uso` (jsonb: tokens por etapa, para ver el gasto real);
- `solicitado_por` (FK a `profiles`, `ON DELETE SET NULL`), `resuelto_por`, `resuelto_en`;
- `creado_en`, `actualizado_en`.

Reglas de la cola:
- **Un solo trabajo vivo por propiedad:** índice ÚNICO parcial sobre `property_id` para los estados `pendiente`, `en_curso` y `listo`. Encolar con `ON CONFLICT DO NOTHING` es idempotente: apretar dos veces no duplica trabajo ni gasto.
- **Índice parcial** para que el worker encuentre lo pendiente sin recorrer los miles de trabajos terminados.
- **RLS sin políticas:** solo entra el servidor (service role), como `funnel_lead_jobs`.

### Worker: `POST /api/cron/descripciones`

- Lo dispara **pg_cron cada minuto**. Las scheduled functions de Netlify no corren en este sitio: ver CLAUDE.md.
- Autenticación dual: `CRON_SECRET` o `cron_config` (clave `descripciones`), como las demás rutas de cron. Tiene `?ping=1` para verificar el deploy antes de programar el job.
- En cada corrida:
  1. **Resucita** los `en_curso` colgados (tomados hace más de 5 minutos).
  2. **Toma hasta 3 trabajos** con un UPDATE condicional (no hay doble proceso aunque dos corridas se solapen). El intento se gasta al tomar, y el trabajo agotado se cierra como `fallido` antes de ejecutar nada.
  3. **Avanza UNA etapa de cada trabajo, en paralelo.** Es una llamada de IA por trabajo, nunca dos encadenadas (regla dura del repo).
  4. Como mucho **UN trabajo en la etapa de zona por corrida**, por Nominatim y Overpass.
- Las etapas llaman **exactamente las mismas funciones** que la ficha (`ejecutarEtapaFotos`, `ejecutarEtapaZona`, `ejecutarEtapaEscribir`): una sola lógica, la misma caché. Si alguien ya generó desde la ficha, el lote reusa fotos y zona sin volver a pagarlas.
- En la escritura del lote no hay persona que conteste: usa las respuestas conocidas (visita, landing, ficha) y la sugerencia de comprador de las fotos, sin guardarla como respuesta. Si el control encuentra problemas, la corrección es **otra etapa en la corrida siguiente**, nunca dos llamadas en el mismo pedido. Si persisten, el borrador queda con el aviso.
- **Presupuesto de tiempo despejado, no elegido:** la etapa más larga tiene techo de 22 s, y el techo de Netlify es de ~26 s. Como las etapas corren en paralelo, la corrida dura lo que la más lenta.
- **Ritmo:** 3 etapas por minuto son ~1 propiedad por minuto, unas 60 por hora; 1.000 propiedades en una noche. El número de trabajos por corrida es una constante documentada: subirlo es cambiar un número, pero choca con los límites de OpenAI (según el plan de la cuenta) y de los mapas públicos.

### Aprobar

- Usa `guardarDescripcion` (la misma de la ficha): titular + descripción, respaldo de la anterior y trabajo en `aprobado`.
- **Columna nueva `properties.descripcion_generada_en`** (timestamptz): se escribe al guardar con el método, desde la ficha o el lote. Es lo que permite filtrar "Anteriores al método" en la base, sin leer miles de descripciones.
- Si la propiedad está publicada, el trigger existente marca los avisos y el worker de portales los actualiza. Aprobar 200 publicadas = 200 actualizaciones en portales: la confirmación lo dice con el número.

### Lista escalable

- **Vista `vw_descripciones_estado`:** propiedad activa + cantidad de fotos + último trabajo + portales publicados, en una sola consulta.
- La ruta pagina y filtra en la base (`count=exact`).
- "Elegir todas las que cumplen": el servidor recorre los candidatos en lotes de 500, calcula los requisitos con la MISMA función de TypeScript (`faltanParaGenerar`, adaptada para recibir la cantidad de fotos) y encola por lotes. No se duplica la regla en SQL.

### La descripción actual como fuente (decisión a confirmar)

Muchas descripciones escritas a mano tienen datos que no se ven en las fotos. Doblas 248 tiene palier privado, orientación oeste, losa radiante, apto crédito y baulera. Regenerar en lote sin mirarlas los perdería.

- **Propuesta:** pasarla como bloque **DESCRIPCIÓN ANTERIOR**, marcada como fuente de segunda categoría:
  - solo hechos concretos (orientación, instalaciones, amenities, apto crédito, estado);
  - nunca frases ni adjetivos;
  - nunca si contradice los datos cargados o las fotos;
  - nunca distancias (esas salen del mapa).
- **Riesgo:** las descripciones viejas generadas por la IA traen inventos (Díaz Colodrero: "un café en tu balcón").
- **Por qué igual conviene:**
  - la regla de "no contradecir datos ni fotos" y la objeción del asesor frenan esos inventos;
  - la revisión muestra la vieja y la nueva lado a lado;
  - vale igual para la ficha.

## Qué queda afuera

- Aprobar automáticamente, sin persona.
- Datos de mercado (precio del m², renta) para el comprador inversor: siguiente iteración.
- Corregir las fotos cruzadas de Díaz Colodrero: queda pendiente del OK del dueño.
- Programar el lote para que corra solo (por ejemplo, cada noche con las propiedades nuevas).

## Criterios de aceptación

1. Un terreno con fotos, dirección, barrio, superficie del lote y precio genera su descripción, con la estructura de terreno (sin recorrido de ambientes).
2. La pantalla Descripciones solo la ven admin y dueño; al resto la ruta le responde 403.
3. Filtros y contadores coinciden con la base; la tabla pagina del lado del servidor.
4. "Generar borradores" sobre N propiedades crea N trabajos; volver a apretar no crea duplicados; las que no cumplen no se encolan.
5. El worker avanza como máximo 3 etapas por corrida, una de zona como máximo, y cada corrida termina en menos de 26 s. Un trabajo colgado se retoma; uno que falla 3 veces queda "Con errores" con el motivo.
6. En ninguna corrida se llama a la IA dos veces seguidas dentro del mismo pedido.
7. Un borrador listo NO cambia la ficha. "Aprobar y guardar" escribe titular y descripción, deja el respaldo y marca `descripcion_generada_en`.
8. "Aprobar seleccionados" solo permite borradores sin avisos y dice cuántos van a actualizar portales.
9. Guardar desde la ficha marca como "Reemplazado" el borrador pendiente de esa propiedad.
10. La ficha avisa cuando hay un borrador para revisar.
11. El uso de tokens de cada trabajo queda registrado.
12. **Prueba real:** un lote de 3 propiedades reales (una casa, un PH, un terreno) corre de punta a punta con pg_cron en producción, los borradores se auditan, se aprueba uno y se descartan los otros dos (o se aprueban si el dueño quiere).

## Riesgos (pre-flight)

- 🔴 **Tiempo de Netlify:** una etapa por trabajo y como mucho 3 en paralelo; techo por etapa de 22 s. Probado con la prueba real del criterio 12.
- 🔴 **Migraciones antes del deploy:** tabla, columna y vista. El job de pg_cron se programa DESPUÉS del deploy (patrón `funnel-side-effects`: si no, el job le pega a un 404 cada minuto).
- 🟡 **Portales:** aprobar en lote actualiza avisos reales. Se mitiga con aprobación explícita, el conteo en la confirmación y bloqueando la aprobación masiva de borradores con avisos.
- 🟡 **Límites de servicios públicos:** una zona por corrida; Overpass con dos servidores; tope de geocodificación de 5 s.
- 🟡 **Costo:** se registra el uso real por trabajo. El precio por token no está en el código: se informa lo medido.
- 🟡 **Productor/consumidor:** `faltanParaGenerar` pasa a aceptar la cantidad de fotos sin el array. Sus consumidores (servicio, ruta de estado, script) se actualizan juntos.
- 🟢 **RLS:** la cola sin políticas (solo el servidor); la vista se lee desde el servidor después de validar el rol.

## Supuestos (se pueden corregir)

- Pantalla solo para admin y dueño.
- 3 trabajos por corrida (~60 propiedades por hora).
- Se excluyen del lote las descartadas, dadas de baja y vendidas.
- La descripción actual entra como fuente de segunda categoría (ver arriba).
