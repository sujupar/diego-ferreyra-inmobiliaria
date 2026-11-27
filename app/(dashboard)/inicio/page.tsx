import { requireAuth } from '@/lib/auth/require-role'
import { rolDelInicio } from '@/lib/supabase/inicio'
import { Inicio } from '@/components/inicio/Inicio'
import { InicioClasico } from '@/components/inicio/InicioClasico'

// Inicio (crm-inicio, D5). Componente de SERVIDOR: decide qué Inicio ve cada rol y le pasa
// al cliente SOLO un string (un componente o un ícono como prop de servidor a cliente deja
// la pantalla en blanco: CLAUDE.md, menú lateral 2026-08-07). Coordinación, asesor, admin y
// dueño ven el Inicio nuevo; el resto de los roles sigue con el de siempre (D3).
export default async function InicioPage() {
  const user = await requireAuth()
  const role = user.profile.role
  return rolDelInicio(role) ? <Inicio rolUsuario={role} /> : <InicioClasico />
}
