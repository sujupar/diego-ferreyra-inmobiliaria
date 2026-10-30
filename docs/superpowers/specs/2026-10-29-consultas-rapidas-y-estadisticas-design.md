# Consultas — Entrega 2: carga instantánea, conectar avisos de un toque y Estadísticas

**Fecha:** 2026-10-29 · **Tamaño:** mediano · **Base:** `2026-10-29-seccion-consultas-design.md` (Entrega 1, en producción, PR #62).

## 1. Qué se pide y para qué

El dueño pidió tres cosas:
1. **Velocidad.** "Tiene que cargar muchísimo más rápido toda la información", con paginación.
2. **Conectar avisos.** Asignar la propiedad a las consultas sin propiedad tiene que ser intuitivo y de una sola conexión, para que se conecten todas las consultas de ese aviso.
3. **La pestaña Estadísticas** (spec anterior §3.4).

**Para qué sirve al negocio:**
- La bandeja existe para que cada consulta se convierta rápido en visita. Si tarda 6 segundos en abrir, no se usa.
- Una consulta sin propiedad no tiene asesor que la atienda, y hoy son el 36 % (229 de 643).
- Las estadísticas dicen cuántas consultas terminan en visita, por portal y por propiedad.

## 2. Datos medidos (2026-10-29, producción)

**Tiempos de la pantalla:**

| Medición | Valor |
|---|---|
| Abrir `/consultas` hasta ver datos | **~6 s** |
| Cambiar un filtro o "Ver más" | 1,0–2,0 s |
| Piso de CUALQUIER pedido a la plataforma (incluso `/api/auth/me`, que no lee nada) | **~1 s** |
| Leer las consultas en la base | 0,4–1 s por lectura (la bandeja hace hoy entre 2 y 4, en dos tandas) |

Abrir `/consultas` encadena tres esperas: 2,8 s hasta que el servidor arma la página, después ~1 s de "quién soy", y recién ahí 2 s de consultas.

El piso de ~1 s por pedido sale de la sesión: el middleware valida la sesión contra Supabase Auth, y la ruta la valida otra vez y lee el perfil.

**Volumen:**

| Período | Consultas | Tamaño |
|---|---|---|
| Últimos 30 días | 145 | 87 KB |
| Último año | 668 | 410 KB (≈ 80 KB comprimido) |

Entran ≈ 160 consultas por mes.

**Consultas sin propiedad:**
- Son 229, todas de portales, y caen en **42 avisos**. Los 10 primeros juntan ~170 consultas: el mayor tiene 26 y el siguiente 24.
- **La "REF" de ZonaProp NO identifica el aviso:** cambia en cada mail. 12 consultas traen solo la REF (9 dígitos, sin CÓD) y no se pueden agrupar con ninguna otra.
- **5 consultas tienen el código `https`:** el lector del mail tomó un enlace como código. Recordar ese código lo convertiría en un aviso falso.
- **3 consultas de Argenprop no traen ningún código.**
- **Qué ayuda a identificar el aviso:**
  - Argenprop trae la dirección en el asunto ("contactó por Alvarez Jonte 3500 en Villa del Parque").
  - ZonaProp trae el título del aviso ("Departamento 2 Ambientes en Excelente Estado").

## 3. Qué ve el usuario

### 3.1 Velocidad (la misma pantalla, sin cambios visuales)
- **Al abrir `/consultas`:** el título y los filtros aparecen enseguida. Las consultas llegan en el MISMO pedido de la página: nada de "quién soy" ni de asesores en viajes aparte.
- **Filtros, "Ver más", Bandeja ↔ Estadísticas:** son instantáneos (menos de 100 ms), sin rueda de carga. La lista sigue mostrando de a 25 y "Ver más" agrega 25 más.
- **Cambiar el período:** es el único caso que vuelve a pedir datos.
  - Mientras carga, se sigue viendo la lista anterior atenuada con una barra fina arriba, nunca la pantalla vacía.
  - Un período ya visto vuelve al instante.
- **Después de agendar o conectar:** la lista se actualiza sin recargar la pantalla.

### 3.2 Conectar avisos sin propiedad — "una conexión, todas las consultas"
- **Aviso arriba de la lista** cuando hay consultas sin propiedad, solo para operaciones: «⚠ 13 consultas de 5 avisos no tienen propiedad · **Conectar avisos**».
- **La hoja "Avisos sin propiedad"** (panel en compu, pantalla completa en celular):
  - Una tarjeta por aviso, ordenadas por cantidad de consultas: portal, título o dirección del aviso, código, "26 consultas · la última hace 2 días", enlace "Ver aviso" si hay URL, y el botón **Conectar**.
  - Cuenta TODAS las consultas sin propiedad de ese aviso, no solo las del período. Así el número coincide con lo que se va a conectar.
- **Al tocar "Conectar":**
  - Se elige la propiedad. Arriba van hasta **3 sugeridas**, armadas por la dirección (Argenprop) o por el barrio y los ambientes del título (ZonaProp). Debajo, el buscador de siempre.
  - Antes de confirmar, la hoja dice: «Se van a conectar las **26 consultas** de este aviso a **Diaz Velez 3841**, y las que lleguen por este aviso van a ir a **<asesor>**».
  - Un toque en **Conectar** y listo. El aviso sale de la lista y las 26 consultas muestran la propiedad.
- **Desde una consulta suelta** (al agendar y elegir la propiedad, como hoy): ya **no hay casilla "Recordar"**.
  - Si la consulta tiene un código de aviso válido, se conectan siempre todas las de ese aviso, y la hoja dice cuántas.
  - Si no se puede agrupar (sin código, código `https`, o solo la REF de ZonaProp), se conecta solo esa consulta y la hoja lo dice: «Esta consulta no trae el código del aviso: se conecta solo esta».
- **Si la propiedad no tiene asesor:** se conectan igual todas las consultas que ya llegaron, pero el aviso NO se recuerda, porque las futuras irían a nadie. La hoja lo dice: «La propiedad no tiene asesor: las próximas consultas de este aviso no se van a conectar solas. Asigná un asesor a la propiedad».
- **Quién puede:** admin, dueño y coordinador. El asesor no ve el aviso ni la hoja, porque conectar decide a quién le llegan las consultas futuras.

### 3.3 Pestaña Estadísticas
Usa el mismo período y los mismos filtros que la Bandeja, y se calcula en el teléfono con los datos ya cargados, sin pedidos extra. Toda cifra viaja con su base: sin base dice "Sin datos"; con base menor a 20 dice "orientativo" (el patrón de `lib/visitas/metricas.ts`).

- **Tarjetas:**
  - Consultas (y promedio por día).
  - Personas distintas.
  - % con propiedad identificada.
  - Visitas agendadas desde consultas.
  - **Consulta → visita** = personas con visita / personas con WhatsApp válido.
- **"De la consulta a la visita":** cuatro pasos, cada uno con su %, y se resalta el paso más angosto:
  1. Consultas.
  2. Con WhatsApp válido.
  3. Con visita agendada.
  4. Visitó.
- **Por portal:** consultas, % del total, visitas agendadas y conversión.
- **Por propiedad (tabla):** consultas, reparto por portal, visitas, conversión y última consulta.
  - Tocar una fila lleva a la Bandeja filtrada por esa propiedad.
  - La fila "⚠ Sin propiedad identificada" lleva a "Conectar avisos".
- **Consultas por mes, por canal y por asesor.** El asesor no ve la de asesor: solo ve lo suyo.
- **En el celular:** las tablas pasan a tarjetas apiladas, sin scroll horizontal.

## 4. Qué pasa por detrás

- **Una sola lectura por período**, con una función nueva en la base: `consultas_del_periodo(desde, hasta, usuario)`. Devuelve en un solo viaje:
  - las consultas del período, con el alcance del asesor aplicado EN LA BASE;
  - las visitas candidatas;
  - la dirección y el barrio de cada propiedad;
  - el nombre de cada asesor.

  Las reglas siguen en TypeScript (`lib/consultas/bandeja.ts`, el teléfono del 549): no se duplican en SQL. Se quitan las 2 a 4 lecturas encadenadas de hoy.
- **El primer período se arma en el servidor**, dentro de `page.tsx`, con el usuario que la página ya validó, y viaja con la página.
- **Filtros, búsqueda, paginado y estadísticas pasan a ser módulos puros.** La búsqueda ignora tildes y mayúsculas (NFC + sin diacríticos) y busca en nombre, teléfono, email, dirección y mensaje.
- **`GET /api/consultas?desde&hasta`** queda solo para cambiar de período. Devuelve el período completo con el mismo formato.
- **Tope de seguridad:** más de **3.000 consultas** en un período devuelve las 3.000 más nuevas y avisa «Mostrando las 3.000 más recientes: elegí un período más corto». Hoy un año entero son 668.
- **Avisos sin propiedad:**
  - `GET /api/consultas/avisos-sin-propiedad` (solo operaciones) agrupa las consultas sin propiedad por portal + código válido, con conteo, última fecha, título o dirección, y hasta 3 sugeridas.
  - `POST /api/consultas/avisos/conectar` con `{ portal, codigo, propertyId }` reusa `identificarAviso`.
  - La regla "¿este código agrupa?" vive en un módulo puro. NO agrupa: vacío, `https…` o cualquier cosa con `/` o `:`, y en ZonaProp un número de 9 dígitos (es la REF).
- **El lector de mails deja de guardar `https` como código** (`lib/integrations/portal-inquiries`). Las 5 consultas que ya lo tienen se tratan como sin código.
- **Sin migraciones de tablas.** Solo la función de lectura, con `SECURITY INVOKER` y ejecutable solo por `service_role`.
- No hay variables de entorno nuevas, y nada manda mensajes ni gasta plata.

## 5. Qué queda afuera
- **El piso de ~1 s por pedido en toda la plataforma.** Bajarlo exige cambiar cómo se valida la sesión en el middleware y en `getUser`: toca permisos de TODAS las pantallas. Merece su propio pedido; acá se esquiva haciendo un solo pedido.
- Descartar o marcar consultas como "contactadas".
- Desconectar un aviso mal conectado: hoy se corrige volviendo a conectarlo a la propiedad correcta.
- Agrupar las 12 consultas que solo traen la REF de ZonaProp: no hay dato que lo permita.

## 6. Criterios de aceptación
1. En producción, abrir `/consultas` (7 días) muestra las consultas en **≤ 2,5 s** (hoy ~6 s), medido con el navegador, sin pedidos a `/api/auth/me`, `/api/users/advisors` ni `/api/consultas` en la primera carga.
2. Cambiar portal, propiedad, estado, asesor o búsqueda, tocar "Ver más" o pasar a Estadísticas no hace ningún pedido de red y responde en < 100 ms. Los números coinciden con los de hoy para el mismo filtro.
3. Cambiar el período hace UN solo pedido, sin dejar la pantalla vacía, y volver a un período ya visto no hace ninguno.
4. Con un período de más de 3.000 consultas, se ven las 3.000 más nuevas con el aviso.
5. Un admin o coordinador ve «⚠ N consultas de M avisos no tienen propiedad · Conectar avisos». La hoja lista los avisos con su conteo total, y al conectar uno, TODAS sus consultas sin propiedad quedan con esa propiedad (verificado en la base) y el aviso queda recordado en `portal_property_map`.
6. Una consulta nueva de ese aviso entra ya conectada: el cron de ingesta la rutea por el mapa. Se prueba con el emparejador real sobre una consulta `[TEST`.
7. Conectar desde una consulta suelta con código válido conecta todas las de su aviso, sin casilla. Sin código, con `https` o con REF de 9 dígitos, conecta solo esa y lo dice.
8. Con una propiedad sin asesor, se conectan las consultas existentes, no se escribe el mapa y la hoja lo explica.
9. El asesor no ve el aviso de "Conectar avisos", y la ruta le devuelve 403.
10. La pestaña Estadísticas muestra las tarjetas, el recorrido con el paso más angosto, y las tablas por portal, propiedad, mes, canal y asesor (esta última no para el asesor). Las cifras chicas dicen "orientativo" y las vacías "Sin datos". Tocar una propiedad lleva a la bandeja filtrada.
11. En un celular táctil de 390×844, la hoja de avisos, la conexión y las estadísticas se usan sin scroll horizontal y con botones de 44 px o más.

## 7. Riesgos (pre-flight)
- **Permisos:** `consultas_del_periodo` corre con service role. El alcance del asesor va COMO PARÁMETRO que fija la ruta o la página, nunca el navegador. Se le quita `EXECUTE` a `anon` y `authenticated`.
- **Datos personales en la página:** viajan solo las consultas que el usuario ya podía ver hoy.
- **Productor/consumidor:**
  - `RespuestaBandeja`, `consultasEnBandeja` y `armarBandeja` cambian de lugar: hay que grepear a todos los que los usan.
  - `POST /api/consultas/[id]/propiedad` ya no lee `recordar`. Se acepta y se ignora, por compatibilidad con una pestaña vieja abierta.
- **Migración antes del deploy:** el código nuevo llama a la función, así que la función se crea primero. Es aditiva.
- **Se escriben datos reales al conectar:** el QA conecta solo consultas `[TEST` contra una propiedad `[TEST`, y después se limpian el mapa y las consultas.
- **El tope de 1000 filas de PostgREST** no aplica: la función devuelve un solo `jsonb`.
