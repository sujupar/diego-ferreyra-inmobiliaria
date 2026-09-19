# Descripciones con el método de Diego: mirar las fotos, investigar la zona, escribir

- **Fecha:** 2026-09-19
- **Tamaño:** grande (IA + fotos + cambio de flujo del alta). Requiere OK del dueño antes de codear.
- **Rama:** `feat/descripciones-metodo-diego`

## Problema

Las descripciones que genera el sistema son genéricas y a veces inventan. Ejemplo real:
Díaz Colodrero 2327 recibió solo 8 datos numéricos y escribió "primer piso" (la ficha
dice piso 0) y "un café en tu balcón" (no hay balcón en ningún dato).

Las reglas del GPT de Diego ("GPT Portales", 5 documentos en `GPT Portales/`) se
copiaron casi textuales al prompt actual, pero se perdió la otra mitad del método:

1. **El proceso:** el GPT preguntaba primero el comprador ideal y después el Checklist
   por tipología (orientación, estado, medidas, edificio, expensas). La plataforma no
   pregunta nada, pero el prompt sigue exigiendo esos datos → escribe genérico o inventa.
2. **La búsqueda autónoma de la zona:** el GPT buscaba en la web. La plataforma solo
   tiene 4 búsquedas de Google que guardan títulos de páginas ("¿Cómo llegar en
   Colectivo, Subte o tren a Monserrat…") y que ni siquiera corren al generar: solo
   existen si antes se creó la landing (9 de 31 propiedades).
3. **Los ejemplos reales de Diego** (casa de Calfucura, torre de Flores, PH de Nazca)
   no están en el prompt.
4. **Ver la propiedad:** el modelo actual es de texto y no ve las fotos. Lo que hace
   buena una descripción (luz, pisos, estado, balcón, vistas) está en las fotos.
5. **El momento:** el botón principal está en el alta, cuando la propiedad no existe
   todavía y no tiene fotos.

## Resultado esperado

Con la propiedad ya cargada (fotos + datos), un botón en la ficha ejecuta el método
completo de Diego —mirar todas las fotos, investigar la zona, escribir con sus reglas y
sus ejemplos— y deja una vista previa que el asesor acepta o corrige. Cualquier
propiedad cargada se puede regenerar con el sistema nuevo.

## Qué ve el usuario

### Alta de propiedad (`/properties/new`)

- Desaparece el botón "Generar descripción" (y su vista previa).
- El campo de texto "Descripción" sigue, para quien quiera escribir a mano, con una
  aclaración debajo: "La descripción automática se genera desde la ficha, una vez
  cargadas las fotos: así el sistema puede ver la propiedad."

### Ficha de la propiedad → sección "Descripción"

- **Botón siempre visible** para los roles habilitados:
  - "Generar descripción" si no tiene texto.
  - "Regenerar descripción" si ya tiene (hoy el botón desaparece cuando hay texto).
- **Requisitos para habilitarlo:** al menos 5 fotos, tipo de propiedad, dirección,
  barrio, ambientes, superficie cubierta y precio. Si falta algo, el botón aparece
  deshabilitado y debajo dice qué falta ("Falta: fotos (tiene 2, mínimo 5), precio").
- **Al tocarlo** se abre un panel con los tres pasos y su estado (en curso / listo /
  error):
  1. "Mirando las 22 fotos…"
  2. "Investigando la zona…"
  3. "Escribiendo con el método de Diego…"
- **Vista previa:** titular, subtitular y cuerpo, y un desplegable "Qué tuvo en cuenta"
  con el comprador ideal usado, lo que vio en las fotos y los datos de la zona (con
  distancias). **No se guarda nada** hasta tocar "Guardar".
- **Ajustar y volver a escribir:** en la vista previa hay un campo "Comprador ideal"
  (precargado) y un recuadro opcional "Lo que no se ve en las fotos" (orientación,
  expensas, estado de las instalaciones, apto crédito, medidas de ambientes…). "Volver
  a escribir" repite **solo el paso 3**: no se vuelven a pagar fotos ni zona.
- **Guardar:** escribe el titular y la descripción de la propiedad y cierra el panel.
  Si la propiedad está publicada en portales, aparece antes un aviso: "Esta propiedad
  está publicada en MercadoLibre/Argenprop: al guardar se actualiza también ahí."
- **Regenerar de nuevo más tarde:** reusa el análisis de fotos y de zona si las fotos y
  la dirección no cambiaron. Un enlace "Analizar todo de nuevo" lo fuerza.
- **Errores:** cada paso muestra su error en castellano ("El análisis de fotos tardó
  demasiado") con un botón "Reintentar" que repite solo ese paso. Si falla la zona, se
  puede seguir: el texto sale sin datos de zona (modo prudente, sin nombres ni
  distancias) y la vista previa lo avisa.

### Asistentes de MercadoLibre y Argenprop → paso "Descripción"

- Su botón "Generar / Regenerar descripción" ejecuta el **mismo proceso** de tres pasos
  (no el generador viejo) y carga el resultado en el borrador del aviso, como hoy.

### Roles

- Admin, dueño, coordinador y asesor (el asesor, solo en las propiedades que puede
  difundir — mismo control que hoy, `puedeDifundir`). El abogado no ve el botón y la
  ruta le responde 403.

## Qué pasa por detrás

Tres pasos, **un pedido al servidor por paso** y **una sola llamada de IA por pedido**
(regla dura del repo: juntos no entran en el tiempo de Netlify). El navegador encadena
los pasos y muestra el progreso. Mismo patrón que la landing (`lib/landing/enrich.ts`).

### Paso 1 — Mirar las fotos (1 llamada de IA)

- Modelo con visión de OpenAI (`gpt-4.1`, configurable), fotos por URL pública de
  Storage, detalle bajo. **Medido el 2026-09-19:** 22 fotos de Perón 4227 en 10,1 s.
- Sale un **inventario estructurado**: ambiente por ambiente (qué hay, pisos,
  aberturas, luz, estado, número de foto), exteriores (balcón, terraza, patio), vistas,
  lo visible del edificio (ascensores, hall, amenities), estilo general, los 5 puntos
  fuertes, lo que NO se puede saber por fotos, y un **comprador ideal sugerido** con el
  porqué.
- Reglas: no inventar lo que no se ve; marcar las fotos con ambientación virtual o
  renders para no describir esos muebles como incluidos; no afirmar cómo se conectan
  los ambientes si ninguna foto lo muestra.
- Si hay muchas fotos y una lectura no entra en el tiempo, se lee en tandas (se mide
  con Doblas 248, que tiene 48).
- Queda guardado con una firma de las fotos usadas; si las fotos no cambian, no se
  repite.

### Paso 2 — Investigar la zona (1 llamada de IA + mapa)

Dos fuentes en paralelo, dentro del mismo pedido:

- **Mapa (sin IA, exacto):** si la propiedad no tiene coordenadas, se geocodifica con el
  geocodificador que ya existe (`lib/properties/geocoder.ts`) y se guardan. Con las
  coordenadas se consulta OpenStreetMap: estaciones de subte y tren (sin las
  "proyectadas"), plazas y parques, colegios, hospitales. Distancias calculadas, en
  metros y cuadras. **Medido:** Perón 4227 → Hospital Italiano 91 m, Ángel Gallardo y
  Medrano (línea B) ~600 m, Plaza Almagro 680 m, Parque Centenario 830 m, en 3 s.
- **Web (1 llamada con búsqueda de OpenAI):** carácter del barrio, líneas de colectivo,
  zonas comerciales y gastronómicas, hitos. **Sin distancias:** las distancias solo
  salen del mapa (en la prueba, dos búsquedas dieron 300 m y 800 m para el mismo
  subte). **Medido:** 7,6 s.
- El texto de la web es contenido de terceros: se guarda como DATO, delimitado, nunca
  como instrucciones (misma convención anti-inyección que hoy).
- Si el mapa falla, sigue con la web sin distancias. Si fallan los dos, el paso 3
  escribe en modo prudente.
- Queda guardado con una firma de la dirección; si la dirección no cambia, no se repite.

### Paso 3 — Escribir (1 llamada de IA)

- **Prompt nuevo armado desde los 5 documentos de Diego, fiel a ellos:** Prompt, Tono,
  Adjetivos permitidos, Checklist y Estructuras por tipología, **con sus tres ejemplos
  reales completos** como referencia de estilo (no para copiar datos).
- Única diferencia con los documentos: **voseo** en vez de "tú", por decisión del dueño
  del 2026-07-28 (`lib/copy/rioplatense.ts`).
- **Entradas**, en el orden del Checklist:
  - Datos cargados de la propiedad (tipo, ambientes, dormitorios, baños, m², piso,
    antigüedad, precio, expensas, cochera, amenities).
  - Datos de la visita que hoy no se usan: `portal_data` (disposición, orientación,
    estado, el checklist Sí/No de MercadoLibre: balcón, terraza, ascensor…) y
    `landing_answers` (comprador ideal, diferencial, objeción, el barrio).
  - El inventario de fotos (paso 1) y la zona (paso 2).
  - Comprador ideal, en este orden: lo que escriba el asesor en el panel → la
    respuesta de la visita → el sugerido por el análisis de fotos.
  - Las notas "lo que no se ve en las fotos".
- **Reglas anti-invención:** solo afirma lo que está en esas entradas; las distancias,
  solo del mapa; un bloque sin datos se omite entero (por ejemplo, el resumen de medidas
  por ambiente si nadie las cargó); datos que se contradicen → gana el cargado por el
  asesor.
- **Controles en código después de la IA:** el disclaimer se verifica y, si no está
  literal, se repone literal; se detectan los adjetivos prohibidos y los nombres de las
  partes de la estructura ("Primera parte", "Recorrido:"), y si aparecen se descarta y
  se pide una vez más; se valida el largo del titular (≤10 palabras) y del subtitular
  (≤50).
- Salida: `title`, `subtitle`, `body` (igual que hoy, así los asistentes de portales
  siguen funcionando igual).

### Guardar

- Nueva ruta de guardado: escribe `properties.title` y `properties.description`
  (subtitular + cuerpo, como hoy) y guarda la descripción ANTERIOR como respaldo.
- Si la propiedad está publicada, el trigger que ya existe
  (`trg_requeue_listings_on_update`) marca los avisos para actualizar y el worker los
  actualiza solo. Es lo buscado: la descripción buena llega a los portales.

### Datos

- Migración aditiva: `properties.descripcion_ia jsonb` (nullable) con el inventario de
  fotos, la zona, sus firmas y fechas, y el respaldo de la descripción anterior. Hereda
  la RLS de `properties`. Se aplica con un script `pg` y se verifica con un `select`
  **antes** del deploy.
- No se toca `location_insights` (la usa la landing) ni se reescriben descripciones
  existentes: cada una se regenera a mano desde su ficha.

### Servicios y variables

- `OPENAI_API_KEY` (ya está en Netlify: la usan los carruseles). Opcionales:
  `DESCRIPCION_MODELO_FOTOS` y `DESCRIPCION_MODELO_TEXTO` (por defecto `gpt-4.1`).
- OpenStreetMap: Nominatim (el que ya usa el geocodificador) y Overpass, gratis, sin
  clave. Límites de uso bajos, suficientes para una propiedad a la vez.
- No se mandan emails, WhatsApp ni se tocan campañas.

### Lo que se retira

- El botón del alta: `components/properties/alta/GenerarDescripcion.tsx`, su ruta
  `POST /api/properties/generate-description` y `lib/properties/descripcion-desde-alta.ts`
  (con sus tests).
- `GenerarDescripcionButton.tsx` (reemplazado por el panel nuevo) y
  `GenerateDescriptionCard.tsx` (no lo usa ninguna pantalla).
- `POST /api/properties/[id]/generate-description` deja de tener pantallas que lo
  usen cuando los asistentes pasen al proceso nuevo → se retira.
- `generatePortalDescription` **se mantiene** solo para el puente de landing/Meta
  (`portal-description-bridge.ts`), que genera al vuelo cuando una propiedad no tiene
  descripción. Ver "Qué queda afuera".

## Qué queda afuera

- Regenerar todas las propiedades en lote: se hace una por una desde cada ficha, con la
  vista previa (el dueño pidió poder regenerar, no reemplazar todo a ciegas).
- El puente de landing/Meta sigue como hoy: usa la descripción guardada (que ahora
  va a ser la buena) y solo cae al generador viejo si la propiedad no tiene ninguna.
- Leer los planos, sumar la investigación nueva a la landing, y cualquier cambio a
  `location_insights`.

## Criterios de aceptación

1. En el alta ya no está "Generar descripción"; el campo de texto sigue y muestra la
   aclaración.
2. En la ficha, la sección Descripción muestra "Generar descripción" (sin texto) o
   "Regenerar descripción" (con texto) para admin, dueño, coordinador y el asesor que
   puede difundir; el abogado no lo ve y la ruta le responde 403.
3. Con menos de 5 fotos, o sin tipo, dirección, barrio, ambientes, superficie cubierta o
   precio, el botón está deshabilitado y dice exactamente qué falta.
4. Al tocarlo se ven los tres pasos avanzar con su texto, y al terminar aparece la vista
   previa con titular, subtitular, cuerpo y "Qué tuvo en cuenta". En la base no cambió
   `title` ni `description`.
5. El texto sigue la estructura de Diego para su tipología, usa solo adjetivos
   permitidos, no nombra las partes, tiene la escena emocional de hasta 40 palabras, la
   invitación a visitar y el disclaimer literal. El titular tiene ≤10 palabras y el
   subtitular ≤50.
6. Nada del texto contradice los datos cargados ni afirma algo que no esté en los datos,
   las fotos o la zona (auditado frase por frase en la prueba). Toda distancia que
   aparece coincide con la del mapa.
7. "Volver a escribir" con otro comprador ideal cambia el texto y repite solo el paso 3
   (los pasos 1 y 2 no se vuelven a llamar).
8. "Guardar" deja en la base el titular y la descripción de la vista previa, y la
   descripción anterior queda respaldada en `descripcion_ia`.
9. Regenerar una propiedad cuyas fotos y dirección no cambiaron reusa el análisis de
   fotos y zona; "Analizar todo de nuevo" los rehace.
10. Si un paso falla, se ve el error en castellano y "Reintentar" repite solo ese paso;
    si falla la zona, se puede terminar igual y la vista previa lo avisa.
11. En una propiedad publicada, antes de guardar aparece el aviso de que se actualizan
    los portales.
12. En los asistentes de MercadoLibre y Argenprop, "Generar / Regenerar descripción"
    usa los tres pasos y carga el resultado en el borrador.
13. **Prueba real (Perón 4227, 13° "B", Almagro — sin portales, sin landing, sin
    campaña y ya sin descripción):** en la vista previa del deploy, el proceso corre de
    punta a punta; se audita la salida de cada paso (lo que vio en las fotos contra las
    fotos, la zona contra el mapa, el texto contra todo) y **el dueño aprueba la calidad
    del texto** antes de dar por estandarizado el sistema para las demás.

## Riesgos (pre-flight)

- 🔴 **Tiempo de Netlify:** una llamada de IA por pedido, techo propio por paso
  (22 s) con error legible. Medido hoy: fotos 10 s, zona 8 s. El paso de escribir se
  mide en la implementación. Un modelo "con razonamiento" (gpt-5-mini) tardó 36 s en la
  zona → descartado para estos pasos.
- 🔴 **Migración antes del deploy:** el código lee y escribe `descripcion_ia`. Sin la
  columna, el paso 1 falla. Se aplica y verifica antes de mergear.
- 🟡 **Guardar en una propiedad publicada actualiza los portales** (trigger existente).
  Es lo deseado, pero se avisa en pantalla antes de guardar. La prueba se hace en una
  propiedad sin portales.
- 🟡 **OpenStreetMap puede limitar o caerse:** tiempo de espera corto, y si falla se
  sigue sin distancias. Nunca bloquea.
- 🟡 **Productor/consumidores:** la salida sigue siendo `{title, subtitle, body}`; los
  consumidores (ficha, asistente ML, asistente AP) están listados. El puente
  landing/Meta no cambia.
- 🟡 **Contenido de la web y de terceros en el prompt:** delimitado como dato, saneado.
- 🟢 **Costo:** en la prueba de hoy, el paso de fotos usó ~2.400 tokens y la búsqueda
  de zona ~18.000. El costo real por propiedad se mide en la prueba con Perón 4227 y se
  informa; no se estima antes.
- 🟢 **RLS/roles:** columna nueva hereda la RLS de `properties`; las rutas usan
  `requireAuth` + `puedeDifundir`, igual que hoy.
- Sin cron, sin emails, sin WhatsApp, sin campañas Meta.

## Supuestos (se pueden corregir)

- Mínimo de 5 fotos para habilitar el botón.
- Guardar reemplaza también el titular de la propiedad (como hace hoy el botón de la
  ficha), mostrado en la vista previa antes de aceptar.
- Voseo, no "tú" (decisión del 2026-07-28 que manda sobre el documento de Tono).
- `gpt-4.1` para fotos y escritura; si en la prueba otro modelo escribe claramente mejor
  dentro del tiempo, se cambia por variable sin tocar código.
