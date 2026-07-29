# Plantilla de WhatsApp del recorrido — `recorrido_acceso_util`

**Estado: creada por API como UTILITY, esperando aprobación de Meta.**
Se creó con `scripts/create-whatsapp-template-recorrido.ts`. Para ver en qué quedó:

```bash
node --env-file=.env.local --import tsx scripts/create-whatsapp-template-recorrido.ts
```

Cuando figure `UTILITY / APPROVED`, setear en Netlify:
`WHATSAPP_TEMPLATE_RECORRIDO=recorrido_acceso_util`

> Mientras esa variable no exista, **el sistema no manda ningún WhatsApp** y no
> rompe nada: el cliente igual recibe el link por email y en la pantalla de gracias.

---

## Por qué la primera versión salió MARKETING y esta no

Meta no clasifica por el TEMA sino por el ENCUADRE. Esta cuenta ya tenía el mismo
mensaje en las dos categorías, y comparándolos se ve el patrón exacto:

| `nueva_consulta_portal` → **MARKETING** | `consulta_portal_util` → **UTILITY** (aprobada) |
|---|---|
| `🔥 *NUEVO LEAD*` | `📩 *Nueva consulta recibida*` |
| — | `Consulta #{{2}}` ← número de referencia |
| Lenguaje entusiasta | Lenguaje de aviso de sistema |

De ahí salen las cuatro reglas que sigue esta plantilla:

1. **Encabezado factual**, nunca entusiasta.
2. **Número de referencia** de la operación (acá es el token de la persona).
3. Redacta la **confirmación de algo que la persona pidió**, no una invitación.
4. Cero adjetivos de venta ni frases tipo *"si te gusta"*, *"no te lo pierdas"*.

La versión anterior (`recorrido_propiedad_util`, quedó como MARKETING) decía
*"gracias por tu interés"*, *"te compartimos"*, *"si te gusta"*: las tres son
señales de marketing.

---

## Contenido exacto de la plantilla

| Campo | Valor |
|---|---|
| **Nombre** | `recorrido_acceso_util` |
| **Categoría** | Utilidad |
| **Idioma** | `es_AR` |
| **Encabezado** | Ninguno |

### Cuerpo

```
📩 *Acceso al recorrido* — {{2}}
Solicitud #{{3}}

Hola {{1}}, registramos tu solicitud y te enviamos el acceso al recorrido de la propiedad.

Desde el mismo enlace podés indicar el día y el horario que prefieras para coordinar la visita.

_Sistema Diego Ferreyra Inmobiliaria_
```

| Variable | Qué manda el sistema | Ejemplo |
|---|---|---|
| `{{1}}` | Nombre de pila | `Martín` |
| `{{2}}` | Propiedad | `el departamento de 3 ambientes en Villa Devoto` |
| `{{3}}` | Nº de solicitud (el token) | `Abc23Xyz99` |

### Botón

| Campo | Valor |
|---|---|
| Tipo | Visitar sitio web · **URL dinámica** |
| Texto | `Ver el recorrido` |
| URL | `https://inmodf.com.ar/v/{{1}}` |

La variable va pegada al final: Meta concatena el token y arma
`https://inmodf.com.ar/v/Abc23Xyz99`.

---

## Cómo le llega a la persona

```
📩 Acceso al recorrido — el departamento de 3 ambientes en Villa Devoto
Solicitud #Abc23Xyz99

Hola Martín, registramos tu solicitud y te enviamos el acceso al
recorrido de la propiedad.

Desde el mismo enlace podés indicar el día y el horario que prefieras
para coordinar la visita.

Sistema Diego Ferreyra Inmobiliaria

┌─────────────────────┐
│   Ver el recorrido  │
└─────────────────────┘
```

---

## Qué hacer con la plantilla vieja

`recorrido_propiedad_util` quedó como MARKETING/PENDING. Cuando se apruebe la de
utilidad, conviene **eliminar la de marketing** desde WhatsApp Manager para que
nadie la use por error (una plantilla de marketing puede no entregarse si la
persona tiene límites de marketing, que es justo lo que queremos evitar).

## Si Meta igual la reclasifica a MARKETING

Reforzar el encuadre transaccional: cambiar la primera línea del cuerpo por
`📩 *Solicitud recibida* — {{2}}` y la segunda oración por
`Hola {{1}}, esta es la confirmación de tu solicitud N° {{3}}.` El botón y el
resto no hace falta tocarlos. Volver a crearla con `--create` y otro nombre
(los nombres no se pueden reutilizar mientras exista la anterior).

## Checklist

- [x] Plantilla creada como UTILITY por API (`recorrido_acceso_util`)
- [ ] Aprobada por Meta (verificar con el script)
- [ ] `WHATSAPP_TEMPLATE_RECORRIDO=recorrido_acceso_util` en Netlify
- [ ] Borrar `recorrido_propiedad_util` (la de marketing)
- [ ] Prueba real: registrarse en una landing con un teléfono propio y confirmar
      que llega el mensaje y que el botón abre el recorrido
