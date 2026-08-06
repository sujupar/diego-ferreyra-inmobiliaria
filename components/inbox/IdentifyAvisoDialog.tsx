'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, Info, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export interface AvisoPendiente {
  portal: string
  externalCode: string
  title: string | null
  inquiryCount: number
  lastInquiryAt: string
  lastLeadName: string | null
}

interface Advisor { id: string; full_name: string | null }
interface PropertyOption { id: string; address: string; assigned_to: string | null }

/** Lo que el sistema dedujo del link (o de la propiedad elegida a mano). */
interface Resolved {
  propertyId: string | null
  address: string
  assignedTo: string
  assignedName: string | null
}

export function IdentifyAvisoDialog({
  aviso, advisors, properties, onDone,
}: {
  aviso: AvisoPendiente
  advisors: Advisor[]
  properties: PropertyOption[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState<{ kind: 'ok' | 'info' | 'error'; text: string } | null>(null)
  const [address, setAddress] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  const apply = (r: Resolved) => {
    setPropertyId(r.propertyId)
    setAddress(r.address)
    setAssignedTo(r.assignedTo)
  }

  async function resolveLink(value: string) {
    setLink(value)
    const trimmed = value.trim()
    if (!trimmed) { setHint(null); return }
    setChecking(true)
    setHint(null)
    try {
      const res = await fetch(`/api/portal-inquiries/resolve-link?url=${encodeURIComponent(trimmed)}`)
      if (res.status === 400) {
        setHint({ kind: 'error', text: 'Ese link no parece de ZonaProp ni de Argenprop. Copialo desde la barra de direcciones del navegador.' })
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as {
        property: { id: string; address: string; assignedTo: string | null; assignedName: string | null } | null
      }
      if (data.property) {
        // La propiedad SÍ está en el sistema: prellenamos lo que sabemos.
        // Ojo con el caso intermedio: puede existir y todavía no tener asesor
        // (propiedad recién captada). Decirle "no está cargada" sería falso.
        setPropertyId(data.property.id)
        if (data.property.address) setAddress(data.property.address)
        if (data.property.assignedTo) {
          setAssignedTo(data.property.assignedTo)
          setHint({ kind: 'ok', text: `Es ${data.property.address} — la muestra ${data.property.assignedName ?? 'el asesor asignado'}.` })
        } else {
          setHint({ kind: 'info', text: `Es ${data.property.address}, pero todavía no tiene asesor. Elegí quién la muestra.` })
        }
      } else {
        setPropertyId(null)
        setHint({ kind: 'info', text: 'Esta propiedad no está cargada en el sistema. Completá los datos de abajo.' })
      }
    } catch {
      setHint({ kind: 'info', text: 'No pudimos verificarlo ahora. Igual podés completar los datos a mano.' })
    } finally {
      setChecking(false)
    }
  }

  function pickProperty(id: string) {
    const p = properties.find(x => x.id === id)
    if (!p) return
    apply({ propertyId: p.id, address: p.address, assignedTo: p.assigned_to ?? '', assignedName: null })
    setHint({ kind: 'ok', text: `Elegiste ${p.address}.` })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/portal-inquiries/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal: aviso.portal,
          externalCode: aviso.externalCode,
          address: address.trim(),
          assignedTo,
          propertyId,
          // Solo persistimos el link si de verdad resolvió a un aviso de portal:
          // si fue rechazado por inválido, guardarlo dejaría basura en external_url.
          externalUrl: hint?.kind === 'error' ? null : (link.trim() || null),
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { updatedInquiries } = await res.json() as { updatedInquiries: number }
      const asesor = advisors.find(a => a.id === assignedTo)?.full_name ?? 'el asesor'
      toast.success(`Listo. ${updatedInquiries} consulta${updatedInquiries === 1 ? '' : 's'} quedaron asignadas a ${asesor}.`)
      setOpen(false)
      onDone()
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = address.trim().length >= 3 && !!assignedTo && !saving

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Identificar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{aviso.title ?? `Aviso ${aviso.externalCode}`}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {aviso.portal === 'zonaprop' ? 'ZonaProp' : aviso.portal === 'argenprop' ? 'Argenprop' : aviso.portal}
            {' · '}CÓD {aviso.externalCode}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Paso 1 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-link">Paso 1 — Pegá el link del aviso</Label>
            <Input
              id="aviso-link"
              value={link}
              onChange={e => resolveLink(e.target.value)}
              placeholder="https://www.zonaprop.com.ar/propiedades/clasificado/..."
            />
            <p className="text-xs text-muted-foreground">
              Buscá el aviso en el portal, copiá el link de la barra del navegador y pegalo acá.
            </p>
            {checking && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
              </p>
            )}
            {hint && !checking && (
              <p className={`text-xs flex items-start gap-1.5 ${
                hint.kind === 'ok' ? 'text-emerald-700' : hint.kind === 'error' ? 'text-rose-700' : 'text-amber-700'
              }`}>
                {hint.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span>{hint.text}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowPicker(v => !v)}
              className="text-xs underline text-[color:var(--brand)] inline-flex items-center gap-1"
            >
              <ChevronDown className={`h-3 w-3 transition ${showPicker ? 'rotate-180' : ''}`} />
              ¿Ya sabés cuál es? Elegila de la lista
            </button>
            {showPicker && (
              <Select
                options={properties.map(p => ({ value: p.id, label: p.address }))}
                placeholder="Elegí la propiedad"
                value={propertyId ?? ''}
                onChange={e => pickProperty(e.target.value)}
              />
            )}
          </div>

          {/* Paso 2 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-address">Paso 2 — ¿Cuál es la dirección?</Label>
            <Input
              id="aviso-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Ej: Av. Rivadavia 5400"
            />
          </div>

          {/* Paso 3 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-advisor">Paso 3 — ¿Quién la muestra?</Label>
            <Select
              id="aviso-advisor"
              options={advisors.map(a => ({ value: a.id, label: a.full_name ?? 'Sin nombre' }))}
              placeholder="Elegí el asesor"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
