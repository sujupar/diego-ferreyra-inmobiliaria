# Conectar avisos desde Consultas: ver el aviso, elegir la propiedad, decir quién la muestra

**Fecha:** 2026-10-30 · **Tamaño:** mediano (cambia un flujo y saca una pantalla) · **Requiere OK del dueño.**

## 1. Qué se pide y para qué
El dueño quiere identificar los avisos sin propiedad desde **un solo lugar** (Consultas), viendo el aviso del portal para reconocerlo, eligiendo la propiedad de la lista y diciendo quién la muestra. Sirve para que ninguna consulta se quede sin asesor y sin seguimiento: hoy hay 231 consultas sin propiedad.

## 2. Lo que se encontró (medido el 2026-10-30)
- **Ninguna** de las 231 consultas sin propiedad (186 de ZonaProp, 45 de Argenprop) tiene guardado el enlace del aviso. Por eso el botón "Ver aviso" que ya existe en la hoja nunca aparece.
- **El mail del portal sí trae el aviso:**
  - **ZonaProp:** el enlace va por un redireccionador (`link.zonaprop.com.ar/ls/click…`) que lleva al aviso real (`zonaprop.com.ar/propiedades/clasificado/…-60360354.html`). Funciona también en mails de agosto. Además trae la foto principal (`imgar.zonapropcdn.com/avisos/…`).
  - **Argenprop:** trae el enlace directo (`argenprop.com/aviso--20538824`) y la foto (`argenprop.com/static-content/…`).
- **"Avisos por identificar" (`/avisos`)** hace en 3 pasos lo que Consultas ya hace en uno: link → dirección → asesor. Lo único que tiene de más es poder identificar un aviso cuya propiedad **no está cargada** (por eso pide la dirección).

## 3. Qué ve el usuario
**Consultas → "Conectar avisos" (hoja "Avisos sin propiedad"):** cada aviso muestra:
- la foto del aviso (si el mail la trajo);
- el título, el portal, el código y cuántas consultas tiene;
- **"Ver aviso en ZonaProp/Argenprop"**, que abre el aviso en otra pestaña;
- "Conectar".

**Al tocar "Conectar":**
1. **Elegir la propiedad** de la lista, que es lo principal. Arriba van las sugeridas, como hoy.
2. **"¿Quién la muestra?"**, con el asesor de la propiedad ya elegido. Se puede cambiar, y si la propiedad no tiene asesor hay que elegir uno.
3. **"Conectar N consultas"**, que conecta todas las consultas del aviso. Las próximas entran solas.

La dirección no se pide: sale de la propiedad.

**Abajo, en chico: "¿No la encontrás? Pegá el link del aviso".** Si ese aviso ya está publicado desde la plataforma, se reconoce solo.

**Se va del menú "Avisos por identificar".** La dirección vieja `/avisos` lleva a Consultas con la hoja abierta. El cartel de Inicio "N avisos sin identificar" también lleva ahí.

**Roles:** igual que hoy, solo admin, dueño y coordinador conectan avisos. El asesor no lo ve.

## 4. Qué pasa por detrás
- **Al entrar una consulta nueva** (cron `portal-inquiries`), se guarda el enlace del aviso en `portal_inquiries.property_url`, que ya existe, y la foto en una columna nueva, `property_photo_url`.
  - **ZonaProp:** se sigue UNA vez el redireccionador de clic, sin bajar la página, con 5 s de techo. Solo se acepta el destino si el host es exactamente `www.zonaprop.com.ar` y la ruta es `/propiedades/clasificado/…`, y se le sacan los `utm_*`.
  - **Argenprop:** solo se acepta `www.argenprop.com/aviso--<número>`.
  - Si algo falla, la consulta entra igual, sin enlace. Nunca se frena una consulta por esto.
  - **Nunca se abre** el píxel de apertura del mail (`wf/open`).
- **Para lo que ya entró:** un script lee el mail original de UNA consulta por aviso sin propiedad y completa el enlace y la foto de todas las de ese aviso. Simula por defecto y escribe con `--commit`.
- **"Quién la muestra":**
  - si la propiedad no tenía asesor, el elegido queda **también como asesor de la propiedad** (así las próximas consultas entran solas);
  - si tenía uno y se elige otro, se **cambia el asesor de la propiedad**.
  - Es lo mismo que "reasignar asesor" del CRM, y solo lo pueden hacer operaciones.
- **Migración:** `portal_inquiries.property_photo_url text`. Se agrega a la vista `consultas_unificadas` y a `consultas_del_periodo`.

## 5. Qué queda afuera
- Leer la ficha del portal para sacar la dirección (no hace falta: la propiedad la trae).
- Cambiar cómo se reconocen solas las consultas de avisos ya conectados.
- MercadoLibre: sus consultas ya vienen con su aviso.

## 6. Criterios de aceptación
1. En "Avisos sin propiedad", un aviso de ZonaProp y uno de Argenprop muestran la foto y el botón "Ver aviso", que abre el aviso correcto en el portal.
2. Una consulta NUEVA de ZonaProp entra con `property_url` del aviso real (sin utm) y su foto; si el redireccionador falla, entra igual sin enlace.
3. Después del script, los avisos que ya estaban en la hoja tienen enlace (los que tengan mail legible).
4. Conectar: elegir la propiedad → aparece su asesor ya elegido → "Conectar N consultas" → todas las consultas del aviso quedan con esa propiedad y ese asesor; la siguiente consulta del mismo código entra conectada sola.
5. Si la propiedad no tenía asesor, después de conectar la ficha de la propiedad muestra el asesor elegido.
6. No se pide dirección en ningún paso.
7. "Avisos por identificar" no está en el menú; `/avisos` lleva a Consultas con la hoja abierta; el cartel de Inicio también.
8. Un asesor no ve la hoja ni puede conectar (403), igual que hoy.

## 7. Riesgos (pre-flight)
- **Migración antes del deploy:** el cron escribe `property_photo_url`. Sin la columna, se rompería la entrada de consultas. Por eso la columna va primero.
- **Seguir un enlace de un mail es entrada de terceros:** se valida el host exacto y el esquema https; nunca se usa `includes`.
- **Tiempo del cron:** son 5 s de techo por consulta nueva de ZonaProp, y entran pocas por corrida. Si se pasa del presupuesto, la consulta entra sin enlace.
- **Cambiar el asesor de una propiedad** cambia a quién le llegan sus consultas: la hoja lo dice antes de confirmar.
