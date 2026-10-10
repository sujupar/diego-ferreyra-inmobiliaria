/** Reglas de los adjuntos del asistente (mismas que el bucket appraisal-chat). */
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024
export const MAX_ADJUNTOS_POR_MENSAJE = 3

const TIPOS: Record<string, 'imagen' | 'pdf'> = {
    'image/jpeg': 'imagen', 'image/png': 'imagen', 'image/webp': 'imagen', 'application/pdf': 'pdf',
}

export function tipoDeAdjunto(mime: string): 'imagen' | 'pdf' | null {
    return TIPOS[mime.toLowerCase()] ?? null
}

/**
 * Un adjunto que viene del navegador es aceptable solo si su ruta está dentro de
 * la carpeta de ESTA tasación y ESTE hilo: si no, alguien podría hacerle leer al
 * asistente un archivo de otra tasación cambiando la ruta.
 */
export function rutaDeAdjuntoValida(path: string, appraisalId: string, hiloId: string): boolean {
    const prefijo = `${appraisalId}/${hiloId}/`
    return path.startsWith(prefijo) && !path.includes('..') && path.length > prefijo.length && !path.slice(prefijo.length).includes('/')
}
