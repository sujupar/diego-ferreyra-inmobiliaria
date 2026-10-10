/**
 * Llamadas del navegador a las rutas del asistente.
 *
 * Toda respuesta se lee con `leerJson`: si Netlify corta la función, devuelve
 * una página HTML de error y `res.json()` explotaría con "Unexpected token '<'",
 * un mensaje que no dice nada (CLAUDE.md, regla de la IA encadenada).
 */
import type { Adjunto, Hilo, Mensaje } from './repositorio'

export async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
    const texto = await res.text()
    try {
        return JSON.parse(texto) as T & { error?: string }
    } catch {
        if (res.status === 504 || res.status === 502 || res.status === 408) {
            return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as T & { error?: string }
        }
        return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as T & { error?: string }
    }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
    const j = await leerJson<T>(res)
    if (!res.ok || j.error) throw new Error(j.error || `Error ${res.status}`)
    return j
}

const base = (tasacionId: string) => `/api/appraisals/${tasacionId}/asistente`

export const asistenteApi = {
    listarHilos: (t: string) => pedir<{ hilos: Hilo[] }>(base(t)).then(r => r.hilos),
    crearHilo: (t: string) => pedir<{ hilo: Hilo }>(base(t), { method: 'POST' }).then(r => r.hilo),
    abrirHilo: (t: string, h: string) => pedir<{ hilo: Hilo; mensajes: Mensaje[]; urlsAdjuntos: Record<string, string> }>(`${base(t)}/${h}`),
    enviar: (t: string, h: string, texto: string, adjuntos: Adjunto[]) =>
        pedir<{ mensajeUsuario: Mensaje; respuesta: Mensaje }>(`${base(t)}/${h}/mensajes`, { method: 'POST', body: JSON.stringify({ texto, adjuntos }) }),
    reintentar: (t: string, h: string, mensajeUsuarioId: string) =>
        pedir<{ mensajeUsuario: Mensaje; respuesta: Mensaje }>(`${base(t)}/${h}/mensajes`, { method: 'POST', body: JSON.stringify({ reintentar: mensajeUsuarioId }) }),
    aplicar: (t: string, h: string, mensajeId: string) =>
        pedir<{ antes: number; despues: number }>(`${base(t)}/${h}/mensajes/${mensajeId}/aplicar`, { method: 'POST' }),
    /** Sube el archivo directo a Storage con la URL firmada que da la ruta. */
    async subirAdjunto(t: string, h: string, archivo: File): Promise<Adjunto> {
        const { signedUrl, adjunto } = await pedir<{ signedUrl: string; adjunto: Adjunto }>(`${base(t)}/${h}/adjuntos`, {
            method: 'POST', body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size, mime: archivo.type }),
        })
        const res = await fetch(signedUrl, { method: 'PUT', headers: { 'content-type': archivo.type }, body: archivo })
        if (!res.ok) throw new Error(`No se pudo subir ${archivo.name}`)
        return adjunto
    },
}
