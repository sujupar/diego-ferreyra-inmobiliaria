/**
 * Auth de la Central de Contenido (/contenido y /api/contenido/*).
 * Solo operaciones (admin/dueno/coordinador): la producción de contenido de
 * marca no es del asesor ni del abogado. Devuelve JSON 401/403 para rutas API.
 */
import { getUser } from '@/lib/auth/get-user'

const OPS_ROLES = ['admin', 'dueno', 'coordinador']

export async function contenidoAuth() {
  const user = await getUser()
  if (!user || user.profile?.is_active === false) {
    return { user: null, error: 'No autenticado', status: 401 as const }
  }
  if (!OPS_ROLES.includes(user.profile.role)) {
    return { user: null, error: 'Sin acceso a esta sección', status: 403 as const }
  }
  return { user, error: null as string | null, status: 200 as const }
}

/** Campos editables por entidad — todo lo demás se ignora en PATCH/POST. */
export const ENTIDADES = {
  pieces: {
    tabla: 'content_pieces',
    campos: [
      'publish_date', 'slot', 'categoria', 'subcategoria', 'titular', 'enfoque',
      'formato', 'recurso', 'guion', 'copy', 'plataformas', 'estado', 'origen',
      'refrescar', 'notas', 'resultados',
    ],
    obligatorios: ['publish_date', 'categoria', 'titular'],
  },
  ideas: {
    tabla: 'content_ideas',
    campos: [
      'categoria', 'subcategoria', 'titular', 'enfoque', 'formato', 'recurso',
      'prioridad', 'origen', 'fuente', 'refrescar', 'estado', 'piece_id',
    ],
    obligatorios: ['categoria', 'titular'],
  },
  formats: {
    tabla: 'content_formats',
    campos: ['nombre', 'descripcion', 'cuando_usar', 'diego_ya_lo_hizo', 'referencias'],
    obligatorios: ['nombre'],
  },
  corrections: {
    tabla: 'content_corrections',
    campos: ['corrected_at', 'que_corrigio', 'regla', 'piece_id'],
    obligatorios: ['que_corrigio', 'regla'],
  },
} as const

export type Entidad = keyof typeof ENTIDADES

export function filtrarCampos(entidad: Entidad, body: Record<string, unknown>) {
  const def = ENTIDADES[entidad]
  const out: Record<string, unknown> = {}
  for (const k of def.campos) if (k in body) out[k] = body[k]
  return out
}
