/**
 * Admin client de la Central de Contenido. Sin genérico Database: las tablas
 * content_* todavía no están en los types generados (mismo patrón que
 * lib/supabase/contacts.ts / deals.ts). El acceso siempre pasa por el gate de
 * contenidoAuth antes de llegar acá.
 */
import { createClient } from '@supabase/supabase-js'

export function contenidoDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
