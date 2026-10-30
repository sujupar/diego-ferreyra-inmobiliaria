/**
 * Llamadas a la API tolerantes a HTML: si Netlify corta por tiempo devuelve una
 * página de error 504, y `res.json()` explotaría con "Unexpected token '<'"
 * (patrón de `components/properties/LandingSection.tsx`).
 */
export class ErrorApi extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
}

/** fetch + JSON con body opcional; tira `ErrorApi` con el mensaje legible si no salió bien. */
export async function api<T>(url: string, opciones: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: opciones.method ?? 'GET',
      headers: opciones.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
      keepalive: opciones.keepalive,
    })
  } catch {
    throw new ErrorApi(0, 'Sin conexión. Revisá internet y volvé a intentar.')
  }
  const data = await leerJson<T>(res)
  if (!res.ok) throw new ErrorApi(res.status, data.error || `Error ${res.status}`)
  return data
}

/** PUT del archivo directo a Storage con barra de progreso (XHR: fetch no informa progreso de subida). */
export function subirConProgreso(
  url: string,
  archivo: Blob,
  tipo: string,
  onProgreso: (porcentaje: number) => void = () => {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso((e.loaded / e.total) * 100)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`No se pudo subir el archivo (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Se cortó la conexión mientras se subía. Tocá Reintentar.'))
    xhr.send(archivo)
  })
}
