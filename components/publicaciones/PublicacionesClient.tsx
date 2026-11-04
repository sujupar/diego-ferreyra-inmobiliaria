'use client'

/**
 * Publicaciones: subir videos en tanda, elegir el ritmo, revisar y programar.
 * Pestañas: Nueva tanda · Programado · Publicado. Ajustes en el panel lateral.
 */
import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NuevaTanda } from './NuevaTanda'
import { PanelAjustes } from './PanelAjustes'
import { PestanaProgramado } from './PestanaProgramado'
import { PestanaPublicado } from './PestanaPublicado'

type Pestana = 'nueva' | 'programado' | 'publicado'

/** Lo que se le dice a la persona al volver de conectar una cuenta (Google o TikTok vuelven con `?conexion=`). */
const AL_VOLVER: Record<string, { ok: boolean; texto: string }> = {
  youtube_ok: { ok: true, texto: 'YouTube quedó conectado.' },
  tiktok_ok: { ok: true, texto: 'TikTok quedó conectado.' },
  cancelada: { ok: false, texto: 'No se conectó: se canceló el permiso.' },
  vencido: { ok: false, texto: 'Pasaron más de 10 minutos. Tocá Conectar de nuevo.' },
  invalida: { ok: false, texto: 'No se pudo verificar la conexión. Tocá Conectar de nuevo desde esta pantalla.' },
  sin_permiso: { ok: false, texto: 'Las cuentas las conectan el administrador o el dueño.' },
  sin_configurar: { ok: false, texto: 'Falta configurar las claves de esa red. Avisale al administrador.' },
  fallo: { ok: false, texto: 'La red no aceptó la conexión. Probá de nuevo en un rato.' },
}

export function PublicacionesClient() {
  const [pestana, setPestana] = useState<Pestana>('nueva')
  const [vueltaNueva, setVueltaNueva] = useState(0)
  const [ajustes, setAjustes] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const r = url.searchParams.get('conexion')
    if (!r) return
    const aviso = AL_VOLVER[r] ?? AL_VOLVER.fallo
    if (aviso.ok) toast.success(aviso.texto)
    else toast.error(aviso.texto)
    url.searchParams.delete('conexion')
    // null y no history.state: con el estado de Next, el router no se entera (lección de /consultas).
    window.history.replaceState(null, '', url.pathname + url.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se abre UNA vez al volver de la red, no en cada render.
    setAjustes(true)
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Publicaciones</h1>
          <p className="text-sm text-muted-foreground">
            Subí los videos, elegí cada cuánto salen y quedan programados en Instagram, Facebook, YouTube y TikTok.
          </p>
        </div>
        <Button variant="outline" size="icon" aria-label="Ajustes" onClick={() => setAjustes(true)}>
          <Settings className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <TabsList>
          <TabsTrigger value="nueva">Nueva tanda</TabsTrigger>
          <TabsTrigger value="programado">Programado</TabsTrigger>
          <TabsTrigger value="publicado">Publicado</TabsTrigger>
        </TabsList>
        {/* forceMount: la tanda NO se desmonta al cambiar de pestaña. Desmontarla
            perdía los archivos en memoria y dejaba subidas huérfanas corriendo. */}
        <TabsContent value="nueva" forceMount className="pt-4 data-[state=inactive]:hidden">
          <NuevaTanda
            key={vueltaNueva}
            onProgramada={() => {
              setVueltaNueva((n) => n + 1)
              setPestana('programado')
            }}
          />
        </TabsContent>
        <TabsContent value="programado" className="pt-4">
          {pestana === 'programado' && <PestanaProgramado />}
        </TabsContent>
        <TabsContent value="publicado" className="pt-4">
          {pestana === 'publicado' && <PestanaPublicado />}
        </TabsContent>
      </Tabs>

      <PanelAjustes abierto={ajustes} onCerrar={() => setAjustes(false)} />
    </div>
  )
}
