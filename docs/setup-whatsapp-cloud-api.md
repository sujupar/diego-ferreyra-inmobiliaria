# Setup — WhatsApp Cloud API (paso a paso en Meta Business Manager)

Qué necesitás hacer vos en Meta para que el sistema pueda mandar los WhatsApp al
asesor. Resultado final: 3 valores (`WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`) + 1 plantilla aprobada.

## Conceptos antes de empezar (importante)

- **Número EMISOR dedicado:** el número desde el que sale el WhatsApp tiene que
  estar registrado en WhatsApp Cloud API y **NO puede ser un número que ya uses en
  la app de WhatsApp normal** (ni WhatsApp Business app). Conseguí una línea nueva
  (un chip/SIM o un número virtual) solo para esto. Los que RECIBEN (Diego, Lucas)
  son sus celulares personales de siempre — eso está bien.
- **Plantilla obligatoria:** como el negocio le escribe primero al asesor (no hay
  una conversación abierta), Meta exige una **plantilla de mensaje pre-aprobada**.
  La aprobación tarda de minutos a ~24-48 h.

---

## Paso 1 — Cuenta de Meta Business (si no tenés)

1. Andá a https://business.facebook.com → tu negocio (el mismo donde manejás los
   anuncios de Meta Ads sirve).
2. **Configuración del negocio (Business Settings).**

## Paso 2 — Crear la app de WhatsApp en Meta for Developers

1. Andá a https://developers.facebook.com/apps → **Crear app**.
2. Tipo: **Negocio (Business)**. Asociala a tu Business.
3. En el panel de la app → **Agregar productos** → **WhatsApp** → **Configurar**.
4. Esto crea automáticamente una **WhatsApp Business Account (WABA)** de prueba y un
   número de prueba. Vamos a reemplazar el de prueba por el tuyo real.

## Paso 3 — Registrar tu número emisor real

1. En el panel de WhatsApp de la app → **Configuración de la API** → **Agregar número
   de teléfono**.
2. Cargá el número dedicado (el que NO está en WhatsApp normal). Verificá por SMS/llamada.
3. Una vez verificado, anotá:
   - **Identificador del número de teléfono** → `WHATSAPP_PHONE_NUMBER_ID`
   - **Identificador de la cuenta de WhatsApp Business (WABA ID)** → `WHATSAPP_BUSINESS_ACCOUNT_ID`

## Paso 4 — Token que no expira (System User Token)

El token temporal de prueba dura 24 h. Para producción necesitás un **token de
usuario del sistema** (no expira):
1. **Business Settings → Usuarios → Usuarios del sistema** → **Agregar** → tipo Admin.
2. **Asignar activos** → asigná la **app** y la **WhatsApp Business Account** con
   permisos de administrar.
3. **Generar token nuevo** → elegí la app → permisos: **`whatsapp_business_messaging`**
   y **`whatsapp_business_management`** → generar.
4. Copiá el token → `WHATSAPP_ACCESS_TOKEN`. (Guardalo: no se vuelve a mostrar.)

## Paso 5 — Crear la plantilla `nueva_consulta_portal`

1. https://business.facebook.com → **WhatsApp Manager** → **Plantillas de mensajes**
   → **Crear plantilla**.
2. Categoría: **Utilidad (Utility)**. Idioma: **Español (Argentina)** → `es_AR`.
3. Nombre: **`nueva_consulta_portal`** (igual que `WHATSAPP_TEMPLATE_NAME`).
4. **Cuerpo** — pegá EXACTAMENTE esto (con los `{{n}}`):

   ```
   🔥 NUEVO LEAD para {{1}}
   #{{2}}

   🏢 Portal: {{3}}
   📌 Tipo: {{4}}
   🏠 Propiedad: {{5}}
   🧾 Aviso: {{6}}

   👤 Nombre: {{7}}
   📞 Tel: {{8}}
   📧 Email: {{9}}

   💬 Responder por WhatsApp:
   {{10}}
   ```

5. **Ejemplos** (Meta los pide para aprobar). Cargá valores de muestra:
   - {{1}} LUCAS · {{2}} #155 · {{3}} ZonaProp · {{4}} WhatsApp · {{5}} Santo Tomé 2600
   - {{6}} Santo Tomé 2600 · {{7}} Marisa Garcia · {{8}} +5491124615396
   - {{9}} marisa@gmail.com · {{10}} https://wa.me/5491124615396?text=Hola
6. **Enviar a revisión.** Cuando quede en estado **Aprobada**, ya se puede usar.

> El orden de los 10 parámetros está fijado en el código
> (`lib/integrations/portal-inquiries/notify.ts`, función `buildBodyParams`). Si
> cambiás el texto de la plantilla, mantené los `{{1}}..{{10}}` en ese mismo orden.

## Paso 6 — Cargar las env vars y activar

En Netlify → Environment variables:
```
WHATSAPP_PHONE_NUMBER_ID = <paso 3>
WHATSAPP_BUSINESS_ACCOUNT_ID = <paso 3>
WHATSAPP_ACCESS_TOKEN = <paso 4>
WHATSAPP_API_VERSION = v21.0
WHATSAPP_TEMPLATE_NAME = nueva_consulta_portal
WHATSAPP_TEMPLATE_LANG = es_AR
WHATSAPP_TEST_MODE = true     # cambiá a false cuando quieras enviar de verdad
```
Asegurate de que Diego y Lucas tengan su **teléfono cargado en su perfil** (profiles.phone),
o seteá `WHATSAPP_FALLBACK_PHONE` para Diego.

## Notas / problemas comunes

- **Calidad del número:** un número nuevo arranca con límite bajo de mensajes/día;
  sube solo con el uso. Para avisos internos al equipo alcanza de sobra.
- **Idioma del botón/plantilla:** mantené `es_AR`. Si Meta rechaza, revisá que el
  idioma del cuerpo coincida con `WHATSAPP_TEMPLATE_LANG`.
- **El token de Meta Ads NO sirve** acá: es de otra app y otro permiso. Usá el
  system-user token del paso 4.
