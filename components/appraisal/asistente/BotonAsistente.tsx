'use client'

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PanelAsistente } from './PanelAsistente'

/**
 * Botón "Asistente de tasación" + su panel. Se oculta si el usuario no puede
 * usar el asistente de esta tasación (p. ej. el abogado): las pantallas que lo
 * muestran no conocen el rol, así que se lo pregunta a la ruta. El candado de
 * verdad está en el servidor; esto solo evita mostrar un botón que daría 403.
 */
export function BotonAsistente({ tasacionId, size = 'default', className }: { tasacionId: string; size?: 'default' | 'lg'; className?: string }) {
    const [permitido, setPermitido] = useState(false)
    const [abierto, setAbierto] = useState(false)

    useEffect(() => {
        let cancelado = false
        fetch(`/api/appraisals/${tasacionId}/asistente`, { method: 'GET' })
            .then(r => { if (!cancelado) setPermitido(r.ok) })
            .catch(() => { if (!cancelado) setPermitido(false) })
        return () => { cancelado = true }
    }, [tasacionId])

    if (!permitido) return null
    return (
        <>
            <Button variant="outline" size={size} className={className} onClick={() => setAbierto(true)}>
                <MessageSquare className="h-4 w-4" /> Asistente de tasación
            </Button>
            <PanelAsistente
                tasacionId={tasacionId}
                abierto={abierto}
                onCerrar={() => setAbierto(false)}
                // La tasación cambió en la base: recargar es la única forma segura
                // de que la pantalla no la pise con su estado viejo al autoguardar.
                onTasacionCambiada={() => window.location.reload()}
            />
        </>
    )
}
