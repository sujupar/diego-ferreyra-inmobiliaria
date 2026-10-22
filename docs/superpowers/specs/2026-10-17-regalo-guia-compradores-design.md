# Guía de gastos como regalo de la encuesta de visita — spec

Fecha: 2026-10-17 · Tamaño: GRANDE (mensajes a clientes + plantillas de Meta) · Rama `feat/regalo-guia-compradores`

## Qué se pide y para qué

Usar la guía "Los US$ 7.000 que podés perder antes de comprar" (lienzo
https://claude.ai/artifact/2GqAtnXuBFpxHfjeZuKZfU, aprobado por el dueño el 2026-10-17) como el
regalo de la encuesta post-visita, y escribir plantillas de WhatsApp nuevas que toquen ese dolor
para que quien visitó una propiedad complete la encuesta. Para el negocio: más encuestas
respondidas = más opiniones sobre precio y propiedad, y un motivo concreto para volver a escribirnos.

Todo queda en **modo prueba**: solo les llega a los teléfonos de la lista de prueba
(`visit_survey_settings.telefonos_prueba`, hoy el del dueño y el de Diego). `envio_automatico`
sigue en `false`.

## Estado de partida (verificado contra la base y Meta el 2026-10-17)

- `encuesta_visita_v1` y `regalo_visita_v1`: APPROVED · UTILITY. Sus textos los aprobó el dueño
  "solo para probar: no comunican nada, no hablan del regalo" (CLAUDE.md § Entrega 3).
- Ajustes: `envio_automatico=false`, `solo_con_regalo=true`, `regalo_por_whatsapp=true`,
  2 teléfonos de prueba. Un solo regalo cargado, en la ficha [TEST] `ad5c6ba9…`.
- El regalo hoy es POR PROPIEDAD (`property_survey_gifts`). La guía no es de una propiedad: es
  para todo comprador.

## Decisión de diseño: un regalo GENERAL que manda sobre el de la propiedad

La guía se carga UNA vez y vale para todas las visitas. Si existe, es el regalo de todas las
propiedades, aunque alguna tenga uno propio cargado. Por qué manda la general: los mensajes nuevos
prometen "la guía de gastos"; si una propiedad con regalo propio recibiera ese mensaje, el mensaje
mentiría. Con la general cargada, el regalo por propiedad queda inactivo (el código y los datos
siguen ahí; se vuelve a usar borrando la general).

## Las plantillas nuevas (textos a aprobar por el dueño)

Reglas que respetan (aprendidas en esta cuenta): sin "gratis/regalo/sin costo/sin compromiso"
(Meta las pasa a MARKETING y puede no entregarlas); el cuerpo no empieza ni termina en variable;
el link va en el cuerpo además del botón (WhatsApp de computadora no abre los botones).

**`encuesta_visita_v2`** — botón URL "Contar qué me pareció" → `inmodf.com.ar/encuesta/{{1}}`
{{1}} nombre · {{2}} dirección · {{3}} fecha · {{4}} token

> Hola {{1}}. Gracias por visitar {{2}} el {{3}}.
>
> Un dato que casi nadie tiene en cuenta: además del precio, escriturar cuesta cerca de un 7 %. En un departamento de US$ 100.000 son unos US$ 7.000 que tienen que estar el día de la firma.
>
> Contanos en menos de un minuto qué te pareció la propiedad y te mandamos la guía de gastos que usamos con nuestros clientes: https://inmodf.com.ar/encuesta/{{4}}
>
> Diego Ferreyra Inmobiliaria

**`encuesta_visita_v3`** (la que se usa; la v2 quedó MARKETING y es el respaldo si el dueño la elige)
— mismo botón, mismas variables. Aprobada por el dueño el 2026-10-17 después de que la v2 cayó en marketing:

> Hola {{1}}. Registramos tu visita a {{2}} del {{3}}. Para cerrar la ficha, contanos qué te pareció (menos de un minuto): https://inmodf.com.ar/encuesta/{{4}}
>
> Al terminar te llega la guía de gastos de compra: además del precio, escriturar cuesta cerca de un 7 %.
>
> Diego Ferreyra Inmobiliaria

**`regalo_visita_v3`** — encabezado DOCUMENTO (el PDF de la guía)
{{1}} nombre · {{2}} dirección

> Hola {{1}}, gracias por contarnos qué te pareció {{2}}. Acá tenés la guía de gastos para compradores que pediste al completar la encuesta. En la página 2 está la cuenta completa.

*Por qué v3 y no v2:* la v2 (el texto aprobado por el dueño, que terminaba con "Si querés que
hagamos la de una propiedad que estés mirando, respondé este mensaje.") Meta la aprobó como
**MARKETING** el 2026-10-17: ofrecer un servicio la vuelve promoción. Se aplicó el plan de
contingencia del spec: misma entrega sin la oferta. La invitación a escribirle a Diego sigue en la
guía (botón de WhatsApp de la última página). `regalo_visita_v2` queda fuera del catálogo.

Se activan cambiando en Netlify `WHATSAPP_TEMPLATE_ENCUESTA_VISITA=encuesta_visita_v3` y
`WHATSAPP_TEMPLATE_REGALO_VISITA=regalo_visita_v3` (lo hace el dueño; entra con el próximo deploy)
recién cuando Meta las apruebe como UTILITY. Las v1 quedan en el catálogo: volver atrás es
cambiar la variable.

## Qué ve el usuario

- **Quien visitó (teléfono de prueba):** recibe la v2 → abre la encuesta → al final, la pantalla
  ofrece "Guía de gastos para compradores" con la portada de la guía (Diego + logo) → descarga el
  PDF y además le llega por WhatsApp con la v2 del regalo.
- **Admin/dueño en `/settings/encuesta`:** tarjeta nueva "Regalo general" con título, portada,
  tamaño, botón para ver el PDF, reemplazarlo y quitarlo. Solo admin/dueño (como el resto de la
  pantalla).
- **Ficha de la propiedad → Visitas → Regalo:** si hay regalo general, avisa "Se está usando el
  regalo general (Guía de gastos para compradores)".

## Qué pasa por detrás

1. **PDF:** se exportan las 6 páginas del lienzo a un PDF A4 (Chrome sin ventana, con el botón de
   WhatsApp clickeable) + la portada en JPG. No van al repo: se suben al bucket privado
   `visit-survey-gifts` en `general/regalo-<uuid>.pdf` y `general/portada-<uuid>.jpg`.
2. **Migración** `20261017000001_regalo_general_encuesta.sql`: columnas `regalo_general_*` en
   `visit_survey_settings` (título, path, nombre, tamaño, portada) con CHECK de path exacto
   (`^general/regalo-<uuid>\.pdf$`), igual que el regalo por propiedad.
3. **Lectura única:** `leerRegaloDeLaVisita(propertyId)` = general ?? de la propiedad. La usan TODOS
   los lugares que le muestran o mandan el regalo a quien visitó: decisión de envío de la encuesta,
   página pública, descarga, aviso por WhatsApp/email y barrido del cron. La ficha sigue leyendo el
   de la propiedad.
4. **Plantillas v2** en `lib/visitas/encuesta/plantillas.ts` (cuerpo en un solo lugar) y el script
   `create-whatsapp-templates-encuesta-visita.ts` aprende `--create=encuesta-v2|regalo-v2`.
5. **Ruta** `/api/settings/encuesta-visitas/regalo-general` (GET/POST/DELETE, admin/dueño) con la
   misma validación por BYTES que la del regalo por propiedad.

## Qué queda afuera

- Prender `envio_automatico` (se decide después de la prueba total).
- Cambiar las preguntas de la encuesta.
- Revisar los porcentajes de la guía (pendiente con Diego; se reemplaza el PDF desde la pantalla).

## Criterios de aceptación

1. En `/settings/encuesta` se ve la tarjeta "Regalo general" con la guía cargada (título, portada,
   tamaño) y "Ver PDF" la abre.
2. Se puede reemplazar y quitar el regalo general desde esa tarjeta; un archivo que no es PDF de
   verdad se rechaza con mensaje claro.
3. Un rol que no es admin/dueño recibe 403 en la ruta del regalo general.
4. Con la general cargada, la encuesta de una visita de CUALQUIER propiedad (sin regalo propio)
   ofrece la guía al final y la descarga baja el PDF de la guía.
5. Con la general cargada, una propiedad CON regalo propio también ofrece la guía (manda la general).
6. Sin regalo general, todo se comporta exactamente como hoy (el de la propiedad o ninguno).
7. `encuesta_visita_v3` y `regalo_visita_v3` creadas en Meta y aprobadas como UTILITY.
8. Prueba total con un teléfono de prueba: marcar una visita [TEST] como realizada → llega la v2 de
   la encuesta → se completa → llega el PDF de la guía por WhatsApp con la v2 del regalo → el botón
   de WhatsApp del PDF abre el chat con Diego con el mensaje armado.
9. Un teléfono que NO está en la lista de prueba no recibe nada (envío automático apagado).
10. Al terminar: datos [TEST] borrados, ajustes como estaban.

## Riesgos (pre-flight)

- **Mensajes reales:** la v2 sale solo a teléfonos de prueba mientras `envio_automatico=false`
  (fail-closed ya probado en la E3).
- **Meta puede clasificar la v2 como MARKETING** (la invitación a "mandarte la guía" puede leerse
  como incentivo). Si pasa, NO se configura: se reescribe sin la promesa y se reintenta.
- **Consumidores del regalo:** son 6 lecturas de `leerRegalo`; se cambian todas menos la de la ficha
  (grep en el plan).
- **Migración antes del deploy:** el código lee columnas nuevas; se aplica y verifica primero.
- **Variables de Netlify:** solo entran con un deploy nuevo (lección del 2026-10-16).
