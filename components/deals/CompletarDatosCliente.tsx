'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserCheck } from 'lucide-react'
import {
  camposFaltantes,
  puedeReasignarAsesor,
  valoresParaCompletar,
  type CampoFaltante,
} from '@/lib/deals/proceso-manual'

/**
 * "Completá los datos del cliente para avanzar" (2026-09-18).
 *
 * Ningún proceso avanza de etapa sin nombre real, teléfono, email y asesor. Los
 * que quedaron a medias se completan acá, justo cuando alguien los quiere
 * mover: esta ventana guarda los datos y, si quedaron completos, llama
 * `onListo` para que la pantalla repita la acción que se había pedido.
 *
 * Se abre con solo el id del proceso: carga ella misma lo que hay, para
 * precargar lo que está bien y dejar vacío lo que falta. La barrera real es el
 * servidor; esto es la forma cómoda de pasarla.
 */
interface Props {
  dealId: string
  /** Qué se estaba intentando hacer, para el texto: "para finalizar la visita". */
  motivo?: string
  onCerrar: () => void
  onListo: () => void
}

const ETIQUETA: Record<CampoFaltante, string> = {
  nombre: 'el nombre', telefono: 'el teléfono', email: 'el email', asesor: 'el asesor',
}

export function CompletarDatosCliente({ dealId, motivo, onCerrar, onListo }: Props) {
  const [cargando, setCargando] = useState(true)
  const [faltan, setFaltan] = useState<CampoFaltante[]>([])
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', asesorId: '' })
  const [puedeAsignar, setPuedeAsignar] = useState(false)
  const [asesores, setAsesores] = useState<{ id: string; full_name: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const [dealRes, meRes] = await Promise.all([
          fetch(`/api/deals/${dealId}`, { cache: 'no-store' }),
          fetch('/api/auth/me'),
        ])
        const deal = dealRes.ok ? (await dealRes.json()).data : null
        const me = meRes.ok ? await meRes.json() : null
        if (cancelado) return
        if (!deal) { setErrores(['No se pudo leer el proceso. Cerrá y volvé a intentar.']); return }
        const contacto = deal.contacts ?? null
        setFaltan(camposFaltantes({
          contactoNombre: contacto?.full_name, contactoTelefono: contacto?.phone, contactoEmail: contacto?.email,
          propertyAddress: deal.property_address, assignedTo: deal.assigned_to,
        }))
        setForm({ ...valoresParaCompletar(contacto, deal.property_address), asesorId: deal.assigned_to ?? '' })
        const asigna = puedeReasignarAsesor(me?.role)
        setPuedeAsignar(asigna)
        if (asigna && !deal.assigned_to) {
          const a = await fetch('/api/users/advisors').then(r => (r.ok ? r.json() : { data: [] }))
          if (!cancelado) setAsesores(a.data || [])
        }
      } catch {
        if (!cancelado) setErrores(['No se pudo leer el proceso. Revisá la conexión.'])
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [dealId])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setErrores([])
    try {
      const res = await fetch(`/api/deals/${dealId}/cliente`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre, telefono: form.telefono, email: form.email,
          ...(faltan.includes('asesor') && form.asesorId ? { asesorId: form.asesorId } : {}),
        }),
      })
      const j = await res.json().catch(() => ({} as { error?: string; errores?: string[]; faltan?: CampoFaltante[] }))
      if (!res.ok) { setErrores(j.errores?.length ? j.errores : [j.error || `No se pudo guardar (HTTP ${res.status}).`]); return }
      if (j.faltan?.length) { setFaltan(j.faltan); setErrores([`Todavía falta ${j.faltan.map((c: CampoFaltante) => ETIQUETA[c]).join(', ')}.`]); return }
      onListo()
    } catch (err) {
      setErrores([err instanceof Error ? err.message : 'No se pudo guardar.'])
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: 'nombre' | 'telefono' | 'email') => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value })),
    'aria-invalid': faltan.includes(k) || undefined,
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="completar-titulo"
        className="bg-background rounded-2xl shadow-xl w-full max-w-lg my-8 p-6 space-y-4 max-h-[95dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <p className="eyebrow">Datos del cliente</p>
          <h2 id="completar-titulo" className="display text-2xl flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[color:var(--brand)]" />
            Completá los datos para avanzar
          </h2>
          <p className="text-sm text-muted-foreground">
            {motivo ? `Para ${motivo} ` : 'Para avanzar '}
            necesitamos el nombre, el teléfono y el email del cliente{faltan.includes('asesor') ? ', y el asesor' : ''}.
            {faltan.length > 0 && ` Falta: ${faltan.map(c => ETIQUETA[c]).join(', ')}.`}
          </p>
        </div>

        {cargando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <form onSubmit={guardar} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cdc-nombre">Nombre del propietario *</Label>
              <Input id="cdc-nombre" required placeholder="Marta Gómez" {...campo('nombre')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cdc-tel">Teléfono *</Label>
                <Input id="cdc-tel" type="tel" required placeholder="11 5555-4444" {...campo('telefono')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cdc-email">Email *</Label>
                <Input id="cdc-email" type="email" required placeholder="marta@ejemplo.com" {...campo('email')} />
              </div>
            </div>
            {faltan.includes('asesor') && (
              puedeAsignar ? (
                <div className="space-y-1">
                  <Label htmlFor="cdc-asesor">Asesor *</Label>
                  <select id="cdc-asesor" required value={form.asesorId}
                    onChange={e => setForm(f => ({ ...f, asesorId: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11">
                    <option value="">Elegí quién lo atiende…</option>
                    {asesores.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-[color:var(--destructive)]">
                  Este proceso no tiene asesor. Pedile a un coordinador que lo asigne.
                </p>
              )
            )}

            {errores.length > 0 && (
              <div role="alert" className="rounded-xl border border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/10 px-4 py-3 text-sm space-y-0.5">
                {errores.map(e => <p key={e}>{e}</p>)}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
              <Button type="submit" disabled={guardando || (faltan.includes('asesor') && !puedeAsignar)}>
                {guardando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar y seguir
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
