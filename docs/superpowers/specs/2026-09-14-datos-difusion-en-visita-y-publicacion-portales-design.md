# Datos de difusión en la visita + arreglos de publicación en portales — Spec

**Fecha:** 2026-09-14 · **Tamaño:** grande (toca tasaciones, portales, landing y la ficha) ·
**Pedido del dueño:** grabado en vivo el 2026-09-14 mientras se capacitaba a la asistente.

## Problema (una frase)

Al publicar una propiedad captada, la asistente tiene que volver a cargar decenas de datos
que el asesor ya conocía en la visita, y cuando un portal rechaza el aviso el error que ve
es ilegible ("error 413", un JSON de 4 MB) en vez de decir qué corregir.

## Resultado esperado (una frase)

El asesor deja cargado en la visita todo lo que piden MercadoLibre, Argenprop y la landing;
la asistente publica con los pasos ya prellenados, la landing se crea y publica sola, y si
algo falla el mensaje dice qué foto o qué campo hay que arreglar.

---

## Parte 1 — "Datos para portales" y "Datos para la landing" en la visita

### Qué ve el usuario

**Dónde:** Pipeline → deal en etapa *Coordinada* → botón **Marcar Visita Realizada** →
modal "Datos de la Visita" → pestaña **Venta (Propiedad)**. Debajo de la Sección 07
(Notas adicionales) aparecen dos secciones nuevas, con el mismo estilo de tarjeta:

**Sección 08 — Datos para portales.**
- Subtítulo: "Lo que piden MercadoLibre y Argenprop además de lo de arriba. Lo que ya
  cargaste (ambientes, metros, antigüedad, orientación…) no se vuelve a pedir."
- Campo **Expensas (ARS por mes)**, numérico.
- Bloque **MercadoLibre**: los atributos de la categoría que corresponde al tipo de
  propiedad de la visita (departamento/casa/PH) en operación venta, sacados del schema
  real de ML (`ml_category_attributes`, cache 24h), **menos** los que ya se derivan de
  la visita. Se dividen en:
  - **Checklist** de características Sí/No (balcón, terraza, ascensor, parrilla, pileta,
    gimnasio, calefacción, aire acondicionado, placards, lavadero, seguridad, etc.):
    casillas en grilla de 2–3 columnas. Marcada = "Sí"; sin marcar = no se envía
    (ML lo trata como "sin dato", igual que hoy en el wizard).
  - **Otros campos** (tipo de departamento, tipo de seguridad, bauleras, número de
    piso de la unidad, departamentos por piso, superficie de balcón, apto mascotas
    como lista…): el mismo control que usa el paso Campos del wizard (lista → select,
    número → input, número con unidad → input con la unidad sugerida).
- Bloque **Argenprop**: solo lo que no se deriva de la visita: **Subtipo** (piso,
  semipiso, dúplex, loft, PH…) y **Estado** (excelente, muy bueno, bueno, regular, a
  refaccionar).
- Si el schema de ML no se pudo traer (ML caído), el bloque de ML muestra "No se
  pudieron traer los campos de MercadoLibre. Podés seguir: se van a pedir al publicar." y
  un botón Reintentar. La visita NUNCA se bloquea por esto.
- Todo se autoguarda como el resto del formulario (indicador "Guardando… / Guardado").

**Sección 09 — Datos para la landing.**
- Subtítulo: "Con esto la landing se crea y se publica sola cuando la propiedad esté
  captada."
- Las cuatro preguntas fijas de la landing, cada una con su ayuda, como textarea:
  1. ¿Quién imaginás que es el comprador ideal de esta propiedad en {barrio}?
  2. ¿Cuál es el mayor atractivo o diferencial de esta propiedad?
  3. ¿Qué duda u objeción suele frenar a los interesados en propiedades como esta?
  4. ¿Hay algo del barrio o del entorno que valga la pena destacar?
- Opcionales para finalizar la visita (no bloquean). Si quedan vacías, la landing se
  crea como hoy y pide las respuestas en la ficha.

**Roles:** los mismos que hoy ven el formulario de visita (asesor, coordinador, admin,
dueño). El abogado no entra al pipeline.

### Qué pasa por detrás

- **Guardado:** las respuestas viajan en el mismo `PATCH /api/deals/[id]/visit-data` que
  el resto (snapshot parcial, mezcla atómica con `merge_deal_visit_data`) bajo dos claves
  nuevas de `deals.visit_data`:
  - `portales: { expensas: number|null, ml: Record<atributo, {value_id?|value_name?}>, ap: Record<atributo, {…}> }`
  - `landing: { q1, q2, q3, q4 }` (strings, recortadas a 1500 caracteres en el servidor).
- **Schema:** ruta nueva `GET /api/deals/[id]/campos-portales?tipo=departamento` (auth
  requerida, abogado 403). Resuelve la categoría ML como lo hace el wizard
  (`resolveCategory` con operación venta), trae `fetchCategoryAttributes`, arma el
  schema de Argenprop (`getApSchema`) y devuelve **solo los pendientes** según la
  función pura `camposPendientesDeVisita` (`lib/portals/datos-visita.ts`).
- **Captación** (`/properties/new?dealId=…` → `POST /api/properties`): el alta manda
  además `expensas`, `portal_data` y `landing_answers`, calculados por la función pura
  `armarDatosDifusionDesdeVisita(visit_data)`:
  - `portal_data.ml` = derivados de la visita (DISPOSITION, FACING, UNIT_FLOOR, FLOORS,
    PROPERTY_AGE, WAREHOUSES…) **más** lo que contestó el asesor.
  - `portal_data.ap` = derivados (ORIENTACION, DISPOSICION, ESTADO_PROPIEDAD desde el
    estado de conservación) más Subtipo/Estado contestados.
  - `landing_answers` = las respuestas q1–q4 no vacías.
- **Columnas nuevas** en `properties` (migración `20260914000001_property_difusion_data.sql`,
  aditiva, con default): `portal_data jsonb NOT NULL DEFAULT '{}'`,
  `landing_answers jsonb NOT NULL DEFAULT '{}'`. Heredan la RLS de la tabla.
- **Prefill de los wizards:** `GET ml-attributes` y `GET ap-attributes` mezclan
  `{ ...derivadoDeLaPropiedad, ...portal_data.<portal>, ...borradorGuardado }`. El
  borrador del wizard sigue mandando sobre todo (si la asistente corrigió algo, queda).
- **Landing automática:** si `landing_answers` tiene las cuatro respuestas,
  `startCoCreation` nace con las preguntas fijas y esas respuestas y marca
  `wizard_state.autopilot = true`. El enriquecimiento corre igual (fotos → zona →
  descripción → avatares), pero en autopilot la etapa de avatares ya usa las
  respuestas y encadena la etapa de textos (`copy`) en vez de frenar. Al terminar, el
  cliente publica solo (`POST /landing/publish`) y muestra el enlace público. Si publicar
  falla (por ejemplo, falta el video: `RECORRIDO_REQUERIDO_MSG`), la landing queda en
  borrador con todo listo y el mensaje dice exactamente qué falta.
- Sigue siendo **una llamada de IA por request** (regla dura): avatares y textos van en
  llamadas separadas, como hoy.

### Qué queda afuera

- No se cambia el asistente de tasación (sigue guardando las fotos como hasta ahora).
- No se piden en la visita datos que el wizard de ML marca como ocultos/solo lectura.
- No se agrega edición de `portal_data` en la ficha (se corrige desde el paso Campos del
  wizard, que ya persiste su borrador).
- Argenprop y ML no se publican solos al captar: la asistente sigue apretando Publicar.

---

## Parte 2 — Publicación en portales: la foto incrustada, los errores y el wizard

### 2a. La causa del error 413 (ML) y del "Multimedia.Url" (Argenprop)

**Hallazgo (evidencia en la base, 2026-09-14):** la foto 10 de *Av. Hipólito Yrigoyen
1550* es un `data:image/png;base64,…` de **4,4 MB** (captura de Street View + mapa).
Viene del asistente de tasación, que guarda las fotos así en `appraisals.property_images`;
al captar desde la tasación, `/properties/new` las hereda tal cual en `properties.photos`.
MercadoLibre recibe un body de 4,4 MB → **413**; Argenprop valida la URL → **Valor inválido**.

**Qué cambia:**
- **Al captar**, cualquier foto incrustada (`data:`) se sube a Storage
  (`property-files/properties/{id}/photos/{uuid}.{ext}`) y en `photos` queda la URL
  pública, en el mismo orden. Módulo puro `lib/properties/fotos-incrustadas.ts`
  (detectar/parsear) + `lib/properties/materializar-fotos.ts` (subir). Corre entre
  el INSERT y `checkAndAdvanceProperty`, así la propiedad nace captada con fotos reales.
  Si una foto no se puede subir, se descarta con log y la captación sigue (nunca se
  guarda un `data:` en `photos`).
- **Defensa en los portales:** `fotosPublicables(photos)` (`lib/portals/fotos-publicables.ts`)
  deja pasar solo `https://` y devuelve las descartadas con su motivo. La usan los dos
  mappers (ML `pictures`, AP `Multimedia`). Si no queda ninguna foto válida, la
  validación previa lo dice en castellano.
- **Reparación del dato real:** `scripts/reparar-fotos-incrustadas.ts` (modo `--commit`)
  sube las fotos incrustadas de las propiedades no descartadas y reemplaza el elemento.
  Hoy afecta a **1 de 28** propiedades activas (verificado).

### 2b. Errores legibles

Módulo puro `lib/portals/errores-legibles.ts`, con tests:
- `explicarErrorHttp(portal, status)`: 413 → "El aviso es demasiado pesado para
  {portal}. Suele pasar cuando una foto quedó guardada como imagen incrustada en vez de
  archivo: volvé a subir las fotos desde Multimedia."; 5xx/429/401 como hoy.
- `explicarErrorArgenprop(status, cuerpo)`: traduce `Errors` por campo
  (`Multimedia.Url` → "Una de las fotos o videos no tiene un enlace válido", `Titulo`,
  `Descripcion`, `Precio`, `Ubicacion.*`, `Caracteristicas.*`, `Categoria.*`), recorta el
  valor a 80 caracteres y reemplaza un `data:image…` por "(imagen incrustada)". Sin
  campos reconocidos, usa el `Detail` del portal.
- `recortarDetalle(crudo)`: lo que se guarda como detalle técnico se corta a 1500
  caracteres. Nunca más 4 MB en `last_error`.
- Argenprop pasa a lanzar `PortalAdapterError(mensajeLegible, …, original=crudo)` y su
  ruta de publish usa `mensajeYDetalle`, igual que ML. Así `soloElMensaje` funciona para
  los dos portales.
- **Pantallas:** las tarjetas de Difusión, la tarjeta de portales y los paneles de
  gestión de ML/AP muestran solo el mensaje legible, con `break-words` y máximo 4 líneas.
  El detalle técnico queda en la base.

### 2c. Título prellenado en el paso Descripción

El paso Descripción de ML y AP arranca con `property.title` y, si está vacío, con el mismo
título que el mapper iba a publicar (`buildTitle`/`buildTitulo`), así lo que se ve es lo
que se publica. Las rutas `ml-preview`/`ap-preview` dejan de pisar `properties.title` con
vacío.

### 2d. Stepper clickeable

En los dos wizards las pastillas (Imágenes → Video → Campos → Descripción → Resumen →
Publicar) pasan a ser botones. Regla (función pura `puedeSaltarA` en
`lib/portals/wizard-etapas.ts`): se puede ir a cualquier etapa **ya alcanzada** (hasta la
más lejana visitada en esta sesión); hacia adelante solo si la etapa actual es válida;
hacia atrás siempre. Al saltar se guarda el borrador igual que con "Siguiente". Etapas no
alcanzadas se ven deshabilitadas. Componente compartido `StepperPills`.

### 2e. Botón "Crear landing" de la tarjeta

La tarjeta Landing de Difusión hoy linkea al editor, que sin landing redirige a la ficha
(pestaña Propiedad) — por eso "no hace nada". Pasa a disparar la MISMA creación que la
sección de abajo (`onCrearLanding` → `LandingSection` arranca y hace scroll hasta el
progreso). Con landing existente sigue diciendo "Ver / Editar".

---

## Criterios de aceptación

**Visita**
1. En el modal de visita, pestaña Venta, existen "Sección 08 — Datos para portales" y
   "Sección 09 — Datos para la landing" debajo de Notas adicionales.
2. La Sección 08 NO muestra ambientes, dormitorios, baños, cocheras, superficies,
   antigüedad, orientación ni disposición (ya cargados arriba); sí muestra expensas, el
   checklist de ML y Subtipo/Estado de Argenprop.
3. Marcar "Balcón" y "Ascensor", elegir Subtipo "Piso", escribir expensas 85000 y
   contestar las 4 preguntas deja en `deals.visit_data.portales` y `.landing` exactamente
   eso (verificable con `select visit_data from deals where id=…`).
4. Con ML caído (schema vacío), la Sección 08 avisa y "Finalizar Visita" sigue funcionando.

**Captación**
5. Al captar desde ese deal, la propiedad nace con `expensas=85000`, `portal_data.ml`
   con HAS_BALCONY/HAS_LIFT = Sí (+ derivados), `portal_data.ap` con SUBTIPO=PISO, y
   `landing_answers` con las 4 respuestas.
6. Si la tasación tenía fotos incrustadas, la propiedad nace con URLs `https://…/property-files/…`
   en `photos`, en el mismo orden, y ningún `data:`.

**Wizards**
7. En el paso Campos de ML, Balcón y Ascensor aparecen en "Sí" y Expensas en "85000 ARS"
   sin tocar nada; en Argenprop, Subtipo aparece en "Piso".
8. En el paso Descripción de ML y AP el título viene lleno (el de la ficha o el sugerido).
9. Las pastillas del stepper se pueden clickear para volver a una etapa ya vista; una
   etapa no alcanzada está deshabilitada; saltar adelante con la etapa actual inválida no
   hace nada.
10. Publicar en ML y en AP una propiedad de prueba `[TEST` con fotos reales termina en
    `published` en los dos portales (verificado con los scripts `verify`), y después se
    da de baja/elimina y se borra la propiedad de prueba.

**Errores**
11. Con una foto incrustada forzada, el mensaje que se ve en la tarjeta de Difusión y en
    el wizard es la frase legible ("…imagen incrustada…"), no HTML ni base64; el
    `last_error` en la base mide menos de 2000 caracteres.
12. La tarjeta de Difusión no crece más de 4 líneas por más largo que sea el error.

**Landing**
13. El botón "Crear landing" de la tarjeta arranca la creación (progreso visible abajo).
14. Con `landing_answers` completas y video cargado, "Crear landing" termina con la
    landing **publicada** y el enlace `/p/…` visible, sin preguntas intermedias.
15. Sin video, termina en borrador con el mensaje de que falta el recorrido/video, y las
    respuestas ya cargadas.
16. Sin `landing_answers`, el flujo es el de hoy (preguntas en la ficha).

**Reparación**
17. Después de correr el script en producción, `select count(*) from properties where
    status<>'descartada' and exists (select 1 from unnest(photos) p where p like 'data:%')`
    da 0, y Hipólito Yrigoyen 1550 conserva 10 fotos.

## Riesgos (pre-flight)

- 🔴 Migración ANTES del deploy: el alta manda `portal_data`/`landing_answers` y el
  INSERT falla sin las columnas. Orden: migración → verificar `select` → merge.
- 🟡 El QA en la vista previa usa el Supabase de producción y manda emails reales
  (N4 al captar). Todo lo creado lleva `[TEST` y se borra; los emails se marcan de
  prueba (modo prueba de email de `applyTestMode`) o se avisa al dueño que llegarán
  con `[TEST` en el asunto.
- 🟡 Publicar en ML consume un cupo `silver` mientras el aviso esté activo; se cierra al
  terminar el QA (igual que en los QA anteriores).
- 🟡 El script de reparación modifica `properties.photos` de una propiedad real: imprime
  el array original antes de escribir y no borra nada (la imagen queda como archivo).
- 🟢 `WizardState.autopilot` solo lo escribe el servidor; el PATCH del cliente ya
  descarta claves del gate.
- 🟢 Ninguna IA encadenada: avatares y copy siguen en llamadas separadas.

## Supuestos (por no poder preguntar en vivo)

- Las cuatro preguntas de la landing pasan a ser **fijas** (las del fallback) para poder
  preguntarlas antes de que exista la landing. Cuando hay respuestas de la visita, la IA
  ya no inventa preguntas; cuando no las hay, todo sigue como hoy.
- En la visita, las casillas de ML sin marcar no se envían como "No": es lo mismo que
  dejar el campo vacío en el wizard. Evita afirmar "no tiene balcón" por olvido.
- El botón de la tarjeta se conserva (además del de la sección), pero ahora hace lo mismo.
