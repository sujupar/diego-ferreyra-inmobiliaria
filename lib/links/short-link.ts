/**
 * Acortador propio, con nuestro dominio.
 *
 * ## Qué resuelve y qué NO
 *
 * El link "Responder al interesado" del aviso de consulta lleva el saludo entero
 * precargado, así que crudo mide ~240 caracteres y en el chat se ve como un
 * bloque de texto azul de varias líneas, incómodo de tocar. Acá se cambia por
 * `inmodf.com.ar/r/<código>` (~31 caracteres, más corto que el `tinyurl.com/xxxx`
 * que se usaba antes).
 *
 * **Lo que un acortador NO puede arreglar, con nuestro dominio o con cualquiera:**
 * WhatsApp abre el chat sin salir de la app SOLO cuando el link que viaja en el
 * mensaje es de un dominio suyo (`wa.me`). Cualquier otro dominio se abre en el
 * navegador. Eso es una decisión de WhatsApp y no hay forma de esquivarla.
 *
 * Lo que sí se puede, y es la diferencia con TinyURL: **rebotar solo**. TinyURL
 * redirigía a la página web de `wa.me`, que exige tocar "Continuar al chat".
 * Acá se manda al deep link `whatsapp://send?...`, que abre la app directo,
 * **sin ese clic**. El navegador aparece un instante y rebota.
 *
 * ## Por qué la lista blanca no es opcional
 *
 * Un acortador que redirige a donde le digan es un redirector abierto: alguien
 * que consiga escribir en la tabla —o un bug nuestro— tendría links
 * `inmodf.com.ar/r/xxx` que llevan a una página de phishing, con la credibilidad
 * de nuestro dominio y del correo de la inmobiliaria detrás. Por eso solo se
 * acortan destinos de WhatsApp, y se valida DOS veces: al crear y al servir.
 */
import { randomInt } from 'node:crypto'

/** Sin O/0/I/l/1: el link se dicta y se copia a mano. Mismo criterio que los tokens de recorrido. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/**
 * 7 caracteres = 56^7 ≈ 1,7 billones de combinaciones. Adivinar uno a ciegas es
 * inviable, y cada link igual solo lleva a un chat de WhatsApp.
 */
export const LARGO_DEL_CODIGO = 7

export function generarCodigo(): string {
  let out = ''
  for (let i = 0; i < LARGO_DEL_CODIGO; i++) out += ALFABETO[randomInt(ALFABETO.length)]
  return out
}

export function urlCorta(codigo: string, base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'): string {
  return `${base.replace(/\/+$/, '')}/r/${codigo}`
}

/**
 * El código de una URL corta nuestra, o `null` si no lo es.
 *
 * Hace falta porque el **botón** de la plantilla de WhatsApp no recibe la URL
 * entera: Meta guarda la parte fija (`https://inmodf.com.ar/r/`) en la plantilla
 * aprobada y al enviar solo se le pasa el sufijo. Así que del link armado hay
 * que poder sacar el código de vuelta.
 */
export function codigoDeUrlCorta(
  url: string,
  base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar',
): string | null {
  try {
    const u = new URL(url)
    // El host tiene que ser el NUESTRO: `tinyurl.com/r/abc` tiene la misma forma
    // de path y no es un link de este acortador.
    if (u.hostname !== new URL(base).hostname) return null
    const m = u.pathname.match(/^\/r\/([^/]+)\/?$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Los únicos destinos que este acortador acepta. Ver el comentario de arriba. */
const HOSTS_DE_WHATSAPP = new Set(['wa.me', 'api.whatsapp.com'])

/**
 * Se compara el host EXACTO contra la lista, nunca con `includes` ni con un
 * `startsWith`: `wa.me.evil.com` y `evil.com/wa.me/...` pasarían cualquiera de
 * esos dos y son dominios de otro dueño.
 */
export function esDestinoPermitido(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.protocol === 'https:' && HOSTS_DE_WHATSAPP.has(u.hostname)
}

/**
 * `https://wa.me/54…?text=Hola` → `whatsapp://send?phone=54…&text=Hola`
 *
 * Es lo que hace que el rebote no pida un clic: el deep link lo toma la app de
 * WhatsApp, no su página web. `null` cuando no se puede armar con certeza — ahí
 * el que llama se queda con el `wa.me` de siempre, que funciona igual aunque
 * cueste un toque más. Inventar un deep link a medias dejaría al asesor mirando
 * una pantalla que no abre nada.
 */
export function deepLinkDeWhatsapp(url: string): string | null {
  if (!esDestinoPermitido(url)) return null
  const u = new URL(url)
  // wa.me lleva el teléfono en el path; api.whatsapp.com, en ?phone=.
  const telefono = (u.hostname === 'wa.me' ? u.pathname.replace(/^\/+/, '') : u.searchParams.get('phone') ?? '')
    .replace(/\D/g, '')
  if (!telefono) return null
  const params = new URLSearchParams({ phone: telefono })
  const texto = u.searchParams.get('text')
  if (texto) params.set('text', texto)
  // URLSearchParams codifica el espacio como '+', que WhatsApp muestra literal.
  return `whatsapp://send?${params.toString().replace(/\+/g, '%20')}`
}

/** Escapa para que un valor no pueda salirse de un atributo HTML ni de una etiqueta. */
function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * La página que se sirve en `/r/<código>`: aparece un instante y rebota sola.
 *
 * Primero al deep link `whatsapp://send?…`, que abre la app SIN el clic de
 * "Continuar al chat" que exigía TinyURL. Si a los 2,5 s sigue acá —WhatsApp no
 * instalado, o un navegador que bloquea el esquema— cae al `wa.me` de siempre.
 *
 * **El destino NO se interpola dentro del `<script>`.** Viaja en atributos ya
 * escapados y el JS lo lee del DOM: el saludo lleva el nombre del interesado, que
 * lo escribió un desconocido en un formulario de portal. Metido crudo en JS, un
 * nombre como `</script><script>…` sería XSS en nuestro dominio.
 */
export function paginaDeRebote(target: string): string {
  const deep = deepLinkDeWhatsapp(target)
  const hrefRespaldo = escaparHtml(target)
  const dataDeep = deep ? ` data-deep="${escaparHtml(deep)}"` : ''
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Abriendo WhatsApp…</title>
<style>
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
       gap:1rem;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0b141a;color:#e9edef;
       text-align:center;padding:1.5rem}
  p{margin:0;opacity:.7;font-size:.95rem}
  a{display:inline-block;background:#25d366;color:#0b141a;text-decoration:none;font-weight:600;
    padding:.85rem 1.5rem;border-radius:999px}
</style>
</head>
<body>
<p>Abriendo WhatsApp…</p>
<a id="ir" href="${hrefRespaldo}"${dataDeep}>Abrir el chat</a>
<script>
  (function () {
    var a = document.getElementById('ir');
    var deep = a.getAttribute('data-deep');
    if (deep) window.location.replace(deep);
    setTimeout(function () { window.location.replace(a.getAttribute('href')); }, 2500);
  })();
</script>
</body>
</html>`
}
