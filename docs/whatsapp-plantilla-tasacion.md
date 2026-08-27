# El primer WhatsApp a quien pide una tasación

Es el único mensaje de la cola del embudo que le llega a una **persona de
afuera**, y cumple lo que el formulario le promete ("Te escribimos por WhatsApp
en los próximos segundos").

Lo elige la variable **`WHATSAPP_TEMPLATE_TASACION`** en Netlify. Vacía, no se
manda nada: el trabajo de la cola queda en `skipped`, sin error y sin escalación.
Ese es el estado de estreno de cualquier plantilla nueva.

| | |
|---|---|
| **Plantilla del corte** | `tasacion_llamada_v1` |
| **Estado al 2026-08-27** | creada y **APROBADA** en Meta. **Todavía NO activa**: `WHATSAPP_TEMPLATE_TASACION` sigue valiendo `tasacion_coordinar_v2`. Ver "Cómo se estrena". |
| **Idioma** | `es_AR` |
| **Categoría** | Utilidad — **pedida y obtenida** |
| **Encabezado / botones** | Ninguno |
| **Variables** | `{{1}}` = nombre de pila |
| **Se crea con** | `scripts/create-whatsapp-template-tasacion-llamada.ts` |

### Cuerpo

```
Hola {{1}}, ¡recibimos tu solicitud de tasación!

Te llamará Paula desde el número +54 9 11 2292-6434 para coordinarla

Seguimos en contacto
```

**El teléfono va literal, no como variable.** Cambiar de número o de persona
obliga a crear otra plantilla y esperar otra aprobación de Meta. No es un dato
que se edite en un panel.

---

## Lo que cambió, y por qué importa más de lo que parece

Las plantillas anteriores (`tasacion_coordinar_util`, `tasacion_coordinar_v2`)
**preguntaban** cómo coordinar, con dos botones de respuesta rápida:
"Coordinar por acá" y "Prefiero que me llamen". Esos botones no eran cosméticos.

> Tocar un botón hace **ENTRAR** un mensaje del cliente, y un mensaje entrante es
> lo único que abre la **ventana de 24 h** de Meta. Sin esa ventana no se puede
> mandar texto libre.

La plantilla nueva no pregunta nada: avisa que el equipo llama. Consecuencias
reales, todas buscadas, pero que conviene tener escritas:

1. **WhatsApp queda como vía de salida, no de ida y vuelta.** Quien no escriba
   por su cuenta deja la ventana cerrada, y no hay ningún proceso automático de
   reintento. Si la llamada no ocurre, no hay segundo camino.
2. **El agente de tasación se apaga en el corte** (`ai_agent_settings.tasacion_enabled
   → false`; al 2026-08-27 todavía está en `true`, sosteniendo el flujo actual).
   Prendido con la plantilla nueva, le pediría día, horario y dirección **por
   chat** a quien acaba de leer que lo van a llamar. Su guion entero
   (`lib/ai/tasacion-brain.ts`) apunta a coordinar por chat: no alcanza con "que
   conteste menos".
3. **La marca `deals.tasacion_wa_state = {}` se sigue escribiendo**, y sacarla
   sería un error. Es lo que hace que un mensaje entrante se rutee a la rama de
   tasación; sin ella cae en el agente de PROPIEDADES y le habla al cliente de
   algún departamento que consultó una vez (pasó de verdad el 2026-08-13).
   Con el interruptor apagado, el agente entra, ve que está apagado y no dice
   nada — pero el ruteo igual cortó donde tenía que cortar.

El copy de la landing se ajustó en el mismo movimiento
(`lib/funnel/content.ts`): antes decía "Coordinás el día y la hora por
WhatsApp", que pasó a ser falso.

---

## Categoría: quedó UTILITY, y eso afina la regla

`tasacion_coordinar_util` se mandó como UTILITY y **Meta la aprobó como
MARKETING**: el clasificador leyó "gratuita / sin costo / sin compromiso" como
promoción. No es cosmético — los mensajes de marketing tienen tope de frecuencia
por persona y Meta puede **no entregarlos**. Con esta plantilla sería grave: el
mensaje es todo el contacto, no hay agente que lo repare después.

**`tasacion_llamada_v1` se pidió UTILITY y volvió UTILITY** (aprobada el
2026-08-27, misma tarde en que se creó). Lo que se aprende del caso:

- El arranque "recibimos tu solicitud de tasación" —textualmente el que Meta ya
  había aceptado en `tasacion_coordinar_v2`— vuelve a pasar. Referirse a lo que
  la persona pidió es lo que sostiene la categoría.
- **El signo de exclamación NO la volteó**, ni tampoco "Seguimos en contacto".
  La regla 1 de [`whatsapp-plantilla-recorrido.md`](./whatsapp-plantilla-recorrido.md)
  —*encabezado factual, nunca entusiasta*— sigue siendo buena práctica, pero el
  disparador real de la reclasificación es el **vocabulario de venta**
  ("gratuita", "sin costo", "sin compromiso"), no la puntuación.
- **Un número de teléfono literal en el cuerpo tampoco molesta.** Es el primer
  caso en esta cuenta: ninguna de las otras plantillas aprobadas tiene uno.

La categoría que se pide no es siempre la que se obtiene, así que después de
crear cualquier plantilla hay que preguntar:

```bash
node --experimental-strip-types --env-file=.env.local \
  scripts/create-whatsapp-template-tasacion-llamada.ts
```

---

## Cómo se estrena (el orden importa)

Los tres primeros pasos **ya están hechos** (2026-08-27) y quedan acá como
receta para la próxima plantilla.

1. ✅ **Crear la plantilla** en Meta:
   ```bash
   node --experimental-strip-types --env-file=.env.local \
     scripts/create-whatsapp-template-tasacion-llamada.ts --create
   ```
2. ✅ **Esperar la aprobación** (de minutos a horas). Correr el script sin flags
   dice el estado y la categoría.
3. ✅ **Sincronizar el catálogo de cuerpos** y commitear el resultado.
   **Desde la raíz del repo** — el script escribe a una ruta RELATIVA
   (`lib/integrations/whatsapp/cuerpos-aprobados.ts`), así que corrido desde
   otro directorio crea el archivo en el lugar equivocado:
   ```bash
   node --experimental-strip-types --env-file=.env.local \
     scripts/sincronizar-cuerpos-plantillas.ts
   ```
   Ese archivo es de dónde sale el texto que el equipo lee en el Inbox como "lo
   que le dijimos al cliente". **Trampa:** el script filtra
   `status === 'APPROVED'`, así que corrido antes de la aprobación no incorpora
   nada **y no avisa** — parece que sincronizaste y no sincronizaste.
4. ⬜ **Deployar.**
5. ⬜ **Recién ahí**, en Netlify: `WHATSAPP_TEMPLATE_TASACION=tasacion_llamada_v1`
   (hoy vale `tasacion_coordinar_v2`).
6. ⬜ **Inmediatamente después**, apagar el agente:
   ```bash
   node --experimental-strip-types --env-file=.env.local \
     scripts/interruptor-agente-tasacion-pg.ts --apagar
   ```

Al revés (env var antes del sync), los leads de ese intervalo quedan con el
nombre de pila suelto como texto del chat. No se pierde nada: el Inbox rearma
esos mensajes retroactivamente en cuanto el catálogo se sincroniza.

**Los pasos 5 y 6 van pegados**, en ese orden y sin dejarlos a medias:

- Solo el 5 → la plantilla ya no pregunta nada, pero el agente sigue prendido y
  le pide día, horario y dirección por chat a quien acaba de leer que lo llaman.
- Solo el 6 → la plantilla sigue preguntando "¿cómo preferís que sigamos?" y no
  queda nadie leyendo la respuesta.

Entre uno y otro pasan segundos, y en esa ventana solo cae quien se registre
justo ahí. Al 2026-08-27 hay **7 conversaciones con el guion abierto**: cuando se
apague el agente dejan de recibir respuesta automática. Siguen visibles en el
Inbox — hay que avisarle al equipo que las atienda a mano.

**Un nombre no aprobado hace fallar el envío de verdad.** El error no está en la
lista de límites de volumen, así que quema los cinco reintentos (30 s, 2 min,
10 min, 1 h, 6 h), termina en `failed` y escala por email — y ningún cliente de
ese período recibe su primer mensaje.

---

## Dos cosas que sorprenden al operar esto

**El botón "apagar el agente" del chat del Inbox NO sirve para una conversación
de tasación.** Ese botón escribe `conversation_ai_state.agent_handed_off`, que es
el freno del agente de PROPIEDADES. La rama de tasación del webhook
(`app/api/webhooks/whatsapp/route.ts`, ~línea 251) corta antes de que se lea:
`agent_handed_off` no aparece ni una vez en `lib/ai/tasacion-agent.ts`. El único
freno de este agente es `ai_agent_settings.tasacion_enabled`, y es global — no
hay forma de apagarlo para una sola conversación.

**Nada avisa si Meta reclasifica la plantilla después de aprobada.** Meta puede
recategorizar una plantilla ya aprobada, y el sistema no lo mira: seguiría
mandándola igual, con el tope de frecuencia de marketing y el riesgo de no
entrega. La única forma de enterarse es preguntar:

```bash
node --experimental-strip-types --env-file=.env.local \
  scripts/create-whatsapp-template-tasacion-llamada.ts
```

Vale la pena correrlo si alguna vez se reporta que "no llegó el WhatsApp".

---

## Lo que NO hay que hacer

- **No borrar `tasacion_coordinar_util` ni `tasacion_coordinar_v2` de Meta.** Al
  re-sincronizar desaparecerían del catálogo y el Inbox perdería el texto de
  todos los mensajes históricos (además de poner en rojo `cuerpos.test.ts`). La
  práctica del repo es no borrar plantillas nunca.
- **No confundir con `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG`**: son
  de las consultas de portales, y `_LANG` lo reusan además `responder-consulta.ts`
  y `send-recorrido-whatsapp.ts`.
- **No pasar `bodyText` desde el handler.** Ahí vivía un diccionario a mano con
  el texto de las plantillas y un `?? CUERPOS.tasacion_coordinar_util` al final:
  al cambiar de plantilla sin actualizarlo, el Inbox mostraba el mensaje VIEJO
  como si el cliente lo hubiera recibido. Hoy el texto sale del catálogo
  generado, y hay un test que lo fija
  (`lib/funnel/side-effect-handlers.test.ts`, "NO decide por su cuenta el texto
  que el equipo va a leer en el Inbox").

---

## Para volver a la coordinación por chat

1. `WHATSAPP_TEMPLATE_TASACION=tasacion_coordinar_v2` en Netlify (la que Meta
   aceptó como UTILITY, con los dos botones).
2. `update ai_agent_settings set tasacion_enabled = true;`
3. Devolver el footnote de `lib/funnel/content.ts` a "Coordinás el día y la hora
   por WhatsApp".

Los tres van juntos. Prender el agente sin la plantilla con botones lo deja sin
ventana de 24 h; cambiar la plantilla sin prender el agente deja la pregunta
"¿cómo preferís que la coordinemos?" sin nadie que lea la respuesta.
