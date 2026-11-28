// Motor de IA intercambiable. Hoy: Claude por la CLI con el plan del dueño (pruebas
// internas). Para pasar a una API: RADAR_IA=gemini (+ GEMINI_API_KEY). Nada más.
import { pedirAClaude } from './claude-cli'
import { pedirAGemini } from './gemini'

export type ParteIA = { texto: string } | { imagen: string /* ruta absoluta a .jpg */ }

/** `rapido` = filtro de relevancia; `profundo` = análisis de por qué funcionó. */
export type NivelIA = 'rapido' | 'profundo'

export interface PedidoIA {
  system: string
  partes: ParteIA[]
  nivel: NivelIA
  timeoutMs: number
}

type LlamadaMotor = (opts: {
  system: string
  partes: ParteIA[]
  modelo: string
  timeoutMs: number
}) => Promise<string>

export interface Motores {
  claude: LlamadaMotor
  gemini: LlamadaMotor
}

function modeloClaude(nivel: NivelIA): string {
  return nivel === 'rapido'
    ? (process.env.RADAR_CLAUDE_MODELO_RAPIDO ?? 'sonnet')
    : (process.env.RADAR_CLAUDE_MODELO_PROFUNDO ?? 'sonnet')
}

function modeloGemini(nivel: NivelIA): string {
  return nivel === 'rapido'
    ? (process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash')
    : (process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash')
}

/** Separado de los motores reales para poder probarlo con dobles. */
export function crearPedirJSON(motores: Motores) {
  return async function pedirJSON(opts: PedidoIA): Promise<string> {
    const motor = process.env.RADAR_IA ?? 'claude'
    const base = { system: opts.system, partes: opts.partes, timeoutMs: opts.timeoutMs }
    if (motor === 'claude') return motores.claude({ ...base, modelo: modeloClaude(opts.nivel) })
    if (motor === 'gemini') return motores.gemini({ ...base, modelo: modeloGemini(opts.nivel) })
    throw new Error(`RADAR_IA="${motor}" no es un motor válido: usá "claude" o "gemini"`)
  }
}

/** Devuelve el TEXTO JSON (sin cercos); lo parsea cada llamador. */
export const pedirJSON = crearPedirJSON({ claude: pedirAClaude, gemini: pedirAGemini })
