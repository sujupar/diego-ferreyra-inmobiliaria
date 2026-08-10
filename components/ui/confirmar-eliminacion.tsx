'use client'

/**
 * Confirmación de borrado escribiendo una palabra, DENTRO de la aplicación.
 *
 * Reemplaza al `prompt('… escribí ELIMINAR:')` del navegador. En un teléfono ese
 * diálogo del sistema es lo peor que hay para la acción más destructiva de la
 * plataforma: sale con la tipografía del sistema, muestra los saltos de línea
 * apretados, no se puede tocar el estilo del botón peligroso y, sobre todo, hay
 * que pelearle al autocorrector y al autocapitalizado del teclado para escribir
 * "ELIMINAR" exacto. Bastantes borrados legítimos se abandonan ahí.
 *
 * POR QUÉ SE APOYA EN `Dialog` Y NO EN UN PRIMITIVO `AlertDialog` NUEVO:
 * `components/ui/dialog.tsx` ya resuelve todo el piso de celular —techo de alto
 * contra `--app-vh`, scroll propio, anclado al borde inferior, área segura, X de
 * 44px—. Un `AlertDialog` aparte tendría que copiar ese bloque entero y quedaría
 * a la deriva la primera vez que alguien toque uno de los dos. Las dos cosas que
 * distinguen a un alertdialog se agregan acá y son dos líneas:
 * `role="alertdialog"` y que tocar afuera NO cierre (un borrado no se descarta
 * por accidente; Escape sí, porque es deliberado).
 *
 * La fricción de tipear la palabra se conserva a propósito. Lo que se saca es la
 * pelea contra el teclado: `autoCapitalize="characters"` la escribe en mayúscula
 * sola, el autocorrector y el corrector ortográfico quedan apagados, y la
 * comparación ignora mayúsculas y espacios de sobra.
 */

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface PedidoDeConfirmacion {
    /** Qué se va a borrar, en una línea. Ej: "Vas a eliminar 3 contactos". */
    titulo: string
    /** Qué consecuencia tiene. Se muestra en el cuerpo del diálogo. */
    detalle?: React.ReactNode
    /** Palabra a escribir. Por defecto ELIMINAR. */
    palabra?: string
    /** Texto del botón peligroso. Por defecto "Eliminar". */
    etiquetaAceptar?: string
}

interface Pendiente {
    pedido: PedidoDeConfirmacion
    resolver: (confirmado: boolean) => void
}

/** Normaliza para comparar: sin espacios de sobra y sin distinguir mayúsculas. */
export function coincideLaPalabra(escrito: string, palabra: string): boolean {
    return escrito.trim().toLocaleUpperCase('es-AR') === palabra.trim().toLocaleUpperCase('es-AR')
}

export function useConfirmarEliminacion() {
    const [pendiente, setPendiente] = React.useState<Pendiente | null>(null)
    const [escrito, setEscrito] = React.useState('')

    const confirmarEliminacion = React.useCallback(
        (pedido: PedidoDeConfirmacion) =>
            new Promise<boolean>(resolver => {
                setEscrito('')
                setPendiente({ pedido, resolver })
            }),
        []
    )

    const cerrar = React.useCallback((confirmado: boolean) => {
        setPendiente(actual => {
            // Se resuelve SIEMPRE, incluso al cerrar con Escape o con Cancelar:
            // una promesa colgada dejaría el botón que la disparó en "cargando"
            // para siempre.
            actual?.resolver(confirmado)
            return null
        })
        setEscrito('')
    }, [])

    const palabra = pendiente?.pedido.palabra ?? 'ELIMINAR'
    const puedeConfirmar = pendiente !== null && coincideLaPalabra(escrito, palabra)

    const dialogoEliminacion = (
        <Dialog open={pendiente !== null} onOpenChange={abierto => { if (!abierto) cerrar(false) }}>
            <DialogContent
                role="alertdialog"
                // Un borrado no se descarta por rozar el fondo con el pulgar.
                onPointerDownOutside={e => e.preventDefault()}
                onInteractOutside={e => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-start gap-2 text-left">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                        <span>{pendiente?.pedido.titulo}</span>
                    </DialogTitle>
                    {pendiente?.pedido.detalle && (
                        <DialogDescription asChild>
                            <div className="text-left">{pendiente.pedido.detalle}</div>
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="confirmar-eliminacion">
                        Para confirmar, escribí <span className="font-semibold">{palabra}</span>
                    </Label>
                    <Input
                        id="confirmar-eliminacion"
                        value={escrito}
                        onChange={e => setEscrito(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && puedeConfirmar) cerrar(true) }}
                        placeholder={palabra}
                        // Todo esto es para que el teclado del teléfono no pelee:
                        // escribe en mayúscula solo y nadie le corrige la palabra.
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        aria-describedby="confirmar-eliminacion-ayuda"
                    />
                    <p id="confirmar-eliminacion-ayuda" className="text-xs text-muted-foreground">
                        Esta acción no se puede deshacer.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
                    <Button variant="destructive" disabled={!puedeConfirmar} onClick={() => cerrar(true)}>
                        {pendiente?.pedido.etiquetaAceptar ?? 'Eliminar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )

    return { confirmarEliminacion, dialogoEliminacion }
}
