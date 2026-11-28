# Radar de referencias de Instagram

Trabajo diario que corre en la Mac del dueño (Node + tsx + Playwright con el Chrome
instalado). Lee reels públicos, métricas y comentarios de cuentas inmobiliarias con
la sesión de la cuenta "Julian Parra". **Solo lee**: nunca da like, comenta, sigue ni publica.

## Estado local: `~/.radar-referencias/`

Todo lo que tiene la sesión vive FUERA del repo y fuera de iCloud, con permisos `700`:

| Ruta | Qué es |
| --- | --- |
| `~/.radar-referencias/perfil-navegador/` | Perfil persistente de Chrome **propio del robot** (cookies de Instagram). No es el perfil de Arc ni el de Chrome de todos los días. |
| `~/.radar-referencias/user-agent.txt` | User agent real de Chrome, guardado en el `login`, para que sin ventana no se anuncie como `HeadlessChrome`. |

Nada de esto se versiona: está fuera de la carpeta del repo. No copiar ese perfil
adentro del repo ni pegar cookies en ningún archivo.

## Comandos

Desde la raíz del repo:

```bash
# 1. Iniciar sesión (una vez, o cuando Instagram la vence). Abre Chrome con ventana;
#    se inicia sesión a mano y el comando termina solo al ver la cookie de sesión.
node --import tsx radar/cli.ts login

# 2. Guardar muestras crudas de la API web en radar/instagram/fixtures/
#    (sin sessionid, csrf ni datos de la cuenta que mira).
node --import tsx radar/cli.ts capturar <usuario>
```

## Endpoints de la API web (llamados desde la página, con `x-ig-app-id: 936619743392459`)

Pendiente de confirmar con el navegador real tras el primer `capturar`:

- perfil — `GET /api/v1/users/web_profile_info/?username=<usuario>`
- reels (feed de la cuenta) — `GET /api/v1/feed/user/<id>/?count=12`
- reels (solo clips) — `POST /api/v1/clips/user/` (`target_user_id`, `page_size`)
- búsqueda — `GET /api/v1/web/search/topsearch/?context=blended&query=<término>`
- explorar — `GET /api/v1/discover/web/explore_grid/`
- comentarios — `GET /api/v1/media/<pk>/comments/`
- reel por id — `GET /api/v1/media/<pk>/info/`
