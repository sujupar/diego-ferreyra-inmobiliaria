/**
 * Cliente AI agnóstico de proveedor.
 *
 * Soporta DeepSeek (default) y OpenAI con la MISMA API request/response
 * (OpenAI Chat Completions format). Para cambiar de proveedor, basta con
 * setear AI_PROVIDER y la API key correspondiente. Ambos modelos soportan
 * response_format: json_object.
 *
 * Default: DeepSeek (más barato, calidad comparable para tareas de copy
 * en español).
 */

export type AiProvider = 'deepseek' | 'openai'

interface ProviderConfig {
  baseUrl: string
  defaultModel: string
  apiKeyEnv: string
}

const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionInput {
  messages: ChatMessage[]
  temperature?: number
  /** Forzar JSON output (compatible OpenAI y DeepSeek) */
  jsonMode?: boolean
  /** Override del modelo. Si no, usa el default del proveedor o AI_MODEL env. */
  model?: string
  /**
   * Override del PROVEEDOR por llamada. Necesario para escalar a un modelo de
   * otro proveedor (ej. reintentar con OpenAI gpt-4.1 aunque el default sea
   * DeepSeek). Sin esto, pasar `model:'gpt-4.1'` al endpoint de DeepSeek falla.
   */
  provider?: AiProvider
  /**
   * Techo duro de tokens de OUTPUT por llamada (compatible OpenAI y DeepSeek:
   * ambos aceptan `max_tokens`). Opcional — si no se pasa, el proveedor usa su
   * default. Pensado para llamadas de análisis frecuente donde el costo por
   * request importa (ver `lib/ai/analyze-conversation.ts`).
   */
  maxTokens?: number
}

export interface ChatCompletionResult {
  content: string
  provider: AiProvider
  model: string
  /** Tokens reportados por el proveedor para ESTA llamada. `undefined` si el proveedor no los reportó. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function getActiveProvider(): AiProvider {
  const fromEnv = process.env.AI_PROVIDER as AiProvider | undefined
  if (fromEnv && fromEnv in PROVIDERS) return fromEnv
  // Auto-detect: si hay DEEPSEEK_API_KEY usar deepseek, sino openai
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'deepseek' // default; fallará con mensaje claro si no hay key
}

function getApiKey(provider: AiProvider): string {
  const env = PROVIDERS[provider].apiKeyEnv
  const key = process.env[env]
  if (!key) {
    throw new Error(`${env} no configurada (proveedor activo: ${provider})`)
  }
  return key
}

function getModel(provider: AiProvider, override?: string): string {
  if (override) return override
  if (process.env.AI_MODEL) return process.env.AI_MODEL
  return PROVIDERS[provider].defaultModel
}

/**
 * Helper para hacer una chat completion. Lanza error si la API key no
 * está o si el provider responde con error.
 */
export async function chatCompletion(
  input: ChatCompletionInput,
): Promise<ChatCompletionResult> {
  const provider =
    input.provider && input.provider in PROVIDERS ? input.provider : getActiveProvider()
  const config = PROVIDERS[provider]
  const apiKey = getApiKey(provider)
  const model = getModel(provider, input.model)

  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    temperature: input.temperature ?? 0.7,
  }
  if (input.jsonMode) {
    body.response_format = { type: 'json_object' }
  }
  if (input.maxTokens) {
    body.max_tokens = input.maxTokens
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${provider} ${res.status}: ${text}`)
  }
  const data = (await res.json()) as OpenAIChatResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error(`${provider}: respuesta sin content`)
  const usage = data.usage
    ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      }
    : undefined
  return { content, provider, model, usage }
}

/**
 * Helper sync: ¿hay alguna API key configurada para hacer AI calls?
 */
export function hasAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY)
}
