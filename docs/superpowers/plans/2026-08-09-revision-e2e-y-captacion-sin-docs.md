# Revisión end-to-end tras el rediseño + captación sin documentación obligatoria

**Fecha:** 2026-08-09 · **Rama:** `feat/propiedades-sin-docs` (sobre `origin/main`)
**Estado:** implementado y verificado. **Falta correr la migración y deployar.**

---

## 1. Resumen ejecutivo

El rediseño visual de la plataforma se deployó el 8/8. La pregunta era si había roto funcionalidad. Se revisaron **las diez áreas funcionales con 71 agentes**, y cada hallazgo pasó por un escéptico cuyo trabajo era refutarlo. Sobrevivieron **56 defectos reales**; cuatro se cayeron al verificarlos.

**El rediseño rompió menos de lo que ya estaba roto: 19 defectos son suyos, 37 son anteriores.** Ninguna área salió limpia.

El más grave no era del rediseño. **El abogado podía leer los datos del cliente y la valuación de las 34 tasaciones, editarlas, crearlas y borrarlas para siempre.** La causa es la forma de la condición: `if (role !== 'asesor') return true` no enumera a nadie — deja pasar a todo el que no sea asesor. El comentario de esa misma línea dice "admin/dueno/coordinador" y no menciona al abogado, así que ni el autor lo quiso así.

El patrón dominante era más engañoso que grave: **una docena de pantallas afirmaban un estado vacío tranquilizador cuando el pedido había fallado.** Pendientes decía "Todo al día" sin haber podido traer las tareas. El rediseño no lo causó, pero lo agravó: al cerrar `/api/*` por defecto, una sesión vencida pasó a devolver un 401 limpio que estas pantallas leían como "no hay nada".

Los tres cambios pedidos están hechos. Los 56 defectos, arreglados. **2389 tests en verde** (base: 2071), un solo error de `tsc` y es el preexistente.

---

## 2. Los tres cambios pedidos

### 2.1 El botón "Subir fotos" no hacía nada

**La documentación nunca tuvo nada que ver.** `PhotoGallery` solo se deshabilita mientras sube.

La causa real: el botón del bloque azul llamaba a `goToTab('multimedia')`, que cambia a la pestaña, reescribe la URL y hace `window.scrollTo({top: 0})`. Estando ya en Multimedia —como en la captura— la pestaña no cambia, la URL no cambia, y el scroll **te aleja** del control de subida real, que está una pantalla más abajo.

Ningún test lo atrapó porque el que existía verificaba que el callback se disparara. Y se disparaba.

**Arreglo:** el `<input type=file>` pasa a vivir en la página, **siempre montado**, y el botón llama `abrirSelector()` sincrónico dentro del `onClick`. Es el único diseño que no depende del orden de montaje ni de la ventana de activación del navegador (Chrome y Safari solo abren el diálogo si el `.click()` corre con activación del usuario; diferirlo lo mata en silencio y el síntoma vuelve a ser "no pasa nada"). Se sumó el test de integración que es el único nivel capaz de atraparlo.

### 2.2 La documentación deja de ser obligatoria

No alcanzaba con aflojar la condición: **el circuito legal vivía en la misma columna `status` que la captación.** Mandar una propiedad captada al abogado la habría sacado de `approved`, y eso **tira abajo la landing pública (404 con tráfico de Meta apuntándole)**, rechaza las consultas con 410 y mata el link de visita. Y subir una foto a una propiedad en revisión habría dejado al abogado sin poder aprobarla.

**Arreglo:** el carril legal sale de `status` a una columna propia (`legal_submitted_at`). Ahora son dos ejes independientes: `status` es captación, el carril legal es la revisión de papeles. Una propiedad puede estar publicada y con los papeles en revisión al mismo tiempo.

- La condición de captada pasa a ser **solo fotos** (más los frenos activos: descartada y rechazo legal).
- Una marca persistida (`captured_at`) reclamada de forma atómica hace que los mails de captación salgan **una sola vez**.
- **Los emails mentían:** decían "Toda la documentación quedó aprobada" cuando no había abogado. Corregido.
- `POST /api/properties` no llamaba al auto-avance: una propiedad creada desde una tasación que hereda fotos quedaba trabada para siempre. Agregado.
- **Agujero de permisos cerrado:** `/api/properties/[id]/review` usaba `requireAuth()` en vez de pedir el permiso — cualquier usuario autenticado podía aprobar o rechazar la revisión legal.

### 2.3 Generar la descripción desde el alta

Ya existía el generador ("GPT Portales") pero exigía una propiedad guardada. Ahora hay una ruta que recibe los campos del formulario, sin `id`. Se descartó "guardar primero y generar después" porque crear la propiedad manda mails al equipo que no se pueden desenviar si el asesor abandona.

La tarjeta Descripción se movió **al final del formulario** —llenar todo y después generar, como se pidió— y se sumó el selector de Operación, que no existía.

**Dos decisiones para saber:** el **título** generado no se guarda solo (se lee en ocho lugares, entre ellos el nombre de la campaña en Ads Manager y el titular de la landing, y no hay pantalla para editarlo después): se muestra con botón de copiar. Y "regenerar" parte de los campos del formulario, nunca del texto ya generado.

---

## 3. Plan de puesta en producción

| # | Paso | Verificación | Vuelta atrás |
|---|---|---|---|
| 1 | Correr `20260809000001_captacion_sin_documentacion.sql` en Supabase | `select legal_submitted_at, captured_at from properties limit 1` no da error | Es aditiva; el código viejo la ignora |
| 2 | Merge de la rama a `main` y push | Netlify deploya solo | `git revert` del merge |
| 3 | Humo: abrir la ficha de una propiedad, subir una foto | La foto sube y la propiedad pasa a captada | — |
| 4 | Humo del circuito legal, con dos usuarios reales | El asesor envía sin fotos; al abogado le llega **un** mail; aprueba | — |

**La migración va ANTES del deploy, sin excepción.** Sin las columnas, confirmar una subida de fotos devuelve 500 y la bandeja del abogado no arranca. Confirmar que el proyecto de Supabase es `mncsnastmcjdjxrehdep` — hay más de uno en el Dashboard.

**Una consecuencia esperada:** Roque Pérez 3059 (de mayo, con una foto, trabada en `pending_docs`) califica como captada con la regla nueva. La migración la marca retroactivamente para que **no** se anuncie al equipo como captación nueva algo de hace dos meses y medio; igual pasa a aprobada.

---

## 4. Revisión funcional: qué se cubrió y qué falta

Cubierto por código y tests (2389 en verde, con mutación por cada arreglo de peso — romper la línea a propósito y confirmar que los tests se ponen rojos):

- Ficha de propiedad, listado, alta, multimedia, planos, documentación legal
- Tasaciones: asistente, listado, PDF, permisos, borrado
- CRM, Contactos, Visitas, Pendientes, Inicio, Métricas, Embudos
- Inbox de WhatsApp, Avisos por identificar
- Marketing: Meta Ads, MercadoLibre, Argenprop, landing por propiedad, carruseles
- Menú y permisos para los cinco roles, con el menú expandido y colapsado
- Lo público: las dos landings del embudo y el camino de conversión

**Solo verificable en un navegador** (ninguna revisión de código lo cierra):

- El panel del menú en **celular** y el logo en modo ícono
- El **editor de landing**: arrastrar, autoguardado, secciones ocultas
- El **diálogo de archivos abriéndose de verdad** al tocar "Subir fotos"
- El **OAuth de MercadoLibre**: la única ruta de API a la que llega un tercero por el navegador
- La **prueba punta a punta del circuito legal** con dos usuarios reales, después de la migración

---

## 5. Decisiones que quedan para el dueño

1. **El abogado ya no ve las tasaciones.** Se le cerró el acceso porque no tiene ningún permiso del área, y el ítem del menú se sacó: una puerta que solo lleva a "no tenés permiso" es peor que no tenerla. Si en la práctica necesita ver la tasación de la propiedad que revisa, la respuesta correcta no es devolver el ítem —que lo manda al listado completo— sino darle lectura acotada a esa tasación desde la ficha.
2. **El coordinador conserva acceso total a tasaciones**, aunque tampoco tenga permisos `appraisal.*`. Es deliberado: tiene el desplegable en su menú y los permisos de pipeline. Se cambia en una línea y vale para el servidor y la pantalla a la vez.
3. **Un rechazo del abogado ya no baja nada.** Antes apagaba la landing y las consultas. Ahora solo marca el carril legal: **la landing sigue viva, el aviso sigue en MercadoLibre y la campaña de Meta sigue gastando.** Se decidió así para no matar tráfico pago en silencio, pero hoy "documentación rechazada" no tiene ninguna consecuencia operativa. Si hace falta una, lo natural sería pausar la campaña y avisar al coordinador.
4. **`/metrics` mide en día UTC y el CRM en día argentino.** El 10% de los deals cae en días distintos. Antes coincidían porque los dos estaban mal igual. Unificar mueve cifras históricas.

---

## 6. Deuda reportada y no tocada

- **Tres fichas de detalle** (propiedad, proceso, contacto) siguen diciendo "no encontrado" ante un 500 o un 401. Es la misma familia que se arregló en el resto.
- **`properties.documents` es una columna huérfana**: nadie le escribe. El conteo ya sale de `legal_docs`, pero la columna sigue ahí.
- **`crm/page.tsx` pagina 50 filas y ordena solo la página visible**, con la flecha puesta como si fuera un orden global — el mismo defecto que se corrigió en Tasaciones.
- **`app/api/appraisals/[id]/contact` usa `.single()`**: una tasación inexistente devuelve 500, no 404.
