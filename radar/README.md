# Radar de referencias de Instagram

Trabajo diario que corre en la Mac del dueño (Node + tsx + Playwright con el Chrome
instalado). Lee reels públicos, métricas y comentarios de cuentas inmobiliarias con
la sesión de la cuenta "Julian Parra". **Solo lee**: nunca da like, comenta, sigue ni publica.

## Estado local: `~/.radar-referencias/`

Todo lo que tiene la sesión vive FUERA del repo y fuera de iCloud, con permisos `700`:

| Ruta | Qué es |
| --- | --- |
| `~/.radar-referencias/perfil-navegador/` | Perfil persistente de Chrome **propio del robot** (cookies de Instagram). No es el perfil de Arc ni el de Chrome de todos los días. |
| `~/.radar-referencias/tmp/muestras/` | Salida por defecto de `capturar`. |
| `~/.radar-referencias/user-agent.txt` | User agent real de Chrome, guardado en el `login`, para que sin ventana no se anuncie como `HeadlessChrome`. |

Nada de esto se versiona: está fuera de la carpeta del repo. No copiar ese perfil
adentro del repo ni pegar cookies en ningún archivo.

## Comandos

Desde la raíz del repo:

```bash
# 1. Iniciar sesión (una vez, o cuando Instagram la vence). Abre Chrome con ventana;
#    se inicia sesión a mano y el comando termina solo al ver la cookie de sesión.
node --import tsx radar/cli.ts login

# 2. Leer una cuenta con el cliente real, imprimir un resumen y guardar muestras saneadas
#    (en ~/.radar-referencias/tmp/muestras/, o en el repo con --guardar).
node --import tsx radar/cli.ts capturar <usuario> [--guardar]
```

## Cómo lee Instagram (verificado en vivo el 2026-11-28)

La web de Instagram ya **no** responde las rutas v1 clásicas de perfil, feed y búsqueda
(`/api/v1/users/web_profile_info/`, `/api/v1/feed/user/<id>/`, `/web/search/topsearch/`,
`/api/v1/fbsearch/web/top_serp/` → 404 con sesión válida). Por eso el cliente
(`radar/instagram/cliente.ts`) lee de dos maneras:

**Navegando como una persona** y leyendo las respuestas GraphQL que pide la propia web
(se reconocen por el header `x-fb-friendly-name`):

| Método | Página | Respuesta | Trae |
| --- | --- | --- | --- |
| `perfil` | `/<usuario>/` | `PolarisProfilePageContentQuery` | id, usuario, `follower_count` |
| `reelsDeCuenta` (fecha, texto) | `/<usuario>/` (+ scroll) | `PolarisProfilePostsQuery` / `PolarisProfilePostsTabContentQuery_connection` | `taken_at`, caption, likes, comentarios — **sin vistas** |
| `reelsDeCuenta` (vistas) | `/<usuario>/reels/` (+ scroll) | `PolarisProfileReelsTabContentQuery` (+ `_connection`) | `play_count` — **sin fecha ni texto** |
| `buscarCuentas` | `/explore/search/keyword/?q=<término>` | `PolarisKeywordSearchExplorePageRelayQuery` | publicaciones sobre el término; las cuentas son sus autores |

Las vistas y la fecha están en dos respuestas distintas: el cliente las cruza por shortcode, y
los pocos reels que no aparecen en la grilla se completan con `media/info` (hasta 4 por cuenta).

**Con `fetch` desde la página** a la API v1 que la web sigue usando, con los headers de la web
(`x-ig-app-id: 936619743392459`, `x-asbd-id: 359341`, `x-csrftoken`, `x-ig-www-claim`,
`x-requested-with: XMLHttpRequest`):

- `explorar` — `GET /api/v1/discover/topical_explore/?...&module=explore_popular&use_sectional_payload=true`
- `comentarios` — `GET /api/v1/media/<pk>/comments/?can_support_threading=true` (vienen ordenados por relevancia)
- `reelPorShortcode` — `GET /api/v1/media/<pk>/info/` (el pk sale del shortcode: base 64 con el alfabeto de Instagram). Trae `play_count`, `taken_at` y `video_duration` juntos.

Cada respuesta pasa por `detectarBloqueo` (login / desafío / límite → `BloqueoInstagram`)
antes del parser, y entre llamadas hay una pausa aleatoria de 2–6 s
(`InstagramCliente.pausaEntreCuentas()` para las 8–20 s entre cuentas).

## Muestras (`radar/instagram/fixtures/`)

Respuestas reales de `@toribioachaval` (inmobiliaria de Buenos Aires), saneadas con
`sanearMuestra`: sin `sessionid`, `csrftoken`, id de la cuenta que mira, `xdt_viewer`,
`friendship_status`, likers ni contexto social. Las pruebas de los parsers están fijadas a
estos archivos. `capturar` escribe por defecto en `~/.radar-referencias/tmp/muestras/`; solo
con `--guardar` pisa las del repo (y entonces hay que ajustar los valores de las pruebas).
