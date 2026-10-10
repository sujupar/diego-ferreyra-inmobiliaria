/**
 * Llamada a OpenAI Chat Completions con imágenes y PDF (asistente de la tasación).
 *
 * El cliente general (`chat-client.ts`) es solo texto y soporta DeepSeek, que no
 * ve imágenes; por eso este va aparte y solo con OpenAI. Verificado el
 * 2026-10-10 con gpt-4.1: una imagen PNG respondió en 1,7 s y un PDF de 3,4 MB
 * en 6,5 s (partes `image_url` y `file` con data URL).
 *
 * UNA llamada por request (regla dura de CLAUDE.md) y con techo de tiempo: corre
 * dentro de una función de Netlify.
 */
export interface AdjuntoParaModelo {
    tipo: 'imagen' | 'pdf'
    nombre: string
    mime: string
    base64: string
}

export interface EntradaMultimodal {
    system: string
    historial: { role: 'user' | 'assistant'; texto: string }[]
    mensaje: string
    adjuntos: AdjuntoParaModelo[]
    apiKey: string
    modelo: string
    timeoutMs: number
    maxTokens?: number
    /** Inyectable para las pruebas. */
    fetchImpl?: typeof fetch
}

export interface RespuestaMultimodal {
    content: string
    model: string
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

type Parte =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } }

function parteDeAdjunto(a: AdjuntoParaModelo): Parte {
    const url = `data:${a.mime};base64,${a.base64}`
    return a.tipo === 'imagen'
        ? { type: 'image_url', image_url: { url } }
        : { type: 'file', file: { filename: a.nombre, file_data: url } }
}

export async function pedirRespuestaMultimodal(e: EntradaMultimodal): Promise<RespuestaMultimodal> {
    if (!e.apiKey) throw new Error('Falta la clave de OpenAI (OPENAI_API_KEY)')
    const hacerFetch = e.fetchImpl ?? fetch
    const contenidoUsuario: Parte[] = [{ type: 'text', text: e.mensaje || '(sin texto, mirá los adjuntos)' }, ...e.adjuntos.map(parteDeAdjunto)]
    const body = {
        model: e.modelo,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: e.maxTokens ?? 2500,
        messages: [
            { role: 'system', content: e.system },
            ...e.historial.map(m => ({ role: m.role, content: m.texto })),
            { role: 'user', content: contenidoUsuario },
        ],
    }
    let res: Response
    try {
        res = await hacerFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${e.apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(e.timeoutMs),
        })
    } catch (err) {
        const nombre = err instanceof Error || err instanceof DOMException ? err.name : ''
        if (nombre === 'AbortError' || nombre === 'TimeoutError') throw new Error('El asistente tardó demasiado en responder. Probá de nuevo o con un adjunto más chico.')
        throw err
    }
    const json = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[]; model?: string; error?: { message?: string }
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    } | null
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json?.error?.message ?? 'error sin detalle'}`)
    const content = json?.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenAI devolvió una respuesta vacía')
    const u = json?.usage
    return {
        content,
        model: json?.model ?? e.modelo,
        ...(u ? { usage: { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0 } } : {}),
    }
}
