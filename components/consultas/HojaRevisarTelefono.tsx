'use client'

/**
 * Hoja "Revisá el teléfono" (lienzo, pantalla 2c). La ventana rápida de agendar
 * no corrige teléfonos y bloquea el envío si el de la consulta no sirve para
 * WhatsApp; acá se arregla antes. Dos modos:
 * - revisar: dejó algo que no es un celular válido (`MOTIVO_TEXTO` dice por qué);
 * - pedir: no dejó nada (MercadoLibre oculta el contacto de quien pregunta).
 *
 * El número se arma con la MISMA regla del 549 que lee las consultas
 * (`armarDesdePartes`), en vivo: lo que se ve en "Así queda guardado" es
 * exactamente lo que viaja. El nombre no se pide: el servidor conserva el de la consulta.
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MOTIVO_TEXTO } from '@/lib/consultas/telefono'
import { nombreVisible } from '@/lib/consultas/pantalla'
import {
  leerTelefonoIngresado, modoTelefono, textoSinTelefono, type TelefonoAceptado,
} from '@/lib/consultas/agendar-desde-consulta'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'
import { cn } from '@/lib/utils'
import { HojaArmazon } from './HojaArmazon'

interface Props {
  consulta: ConsultaEnBandeja
  onUsar: (telefono: TelefonoAceptado) => void
  onCerrar: () => void
}

const CLASE_INPUT = 'h-11 w-full rounded-lg border bg-card px-2 text-base outline-none focus:border-brand'

/** Lo que dejó, para arrancar: un `+` de otro país va al campo libre; lo demás, al número. */
function inicio(c: ConsultaEnBandeja) {
  const crudo = c.tel.ok ? '' : c.tel.crudo.trim()
  const extranjero = crudo.startsWith('+') && !crudo.replace(/\D/g, '').startsWith('54')
  return { extranjero, numero: extranjero ? '' : crudo, libre: extranjero ? crudo : '' }
}

export function HojaRevisarTelefono({ consulta: c, onUsar, onCerrar }: Props) {
  const modo = modoTelefono(c)
  const arranque = inicio(c)
  const [extranjero, setExtranjero] = useState(arranque.extranjero)
  const [caracteristica, setCaracteristica] = useState('')
  const [numero, setNumero] = useState(arranque.numero)
  const [libre, setLibre] = useState(arranque.libre)
  // El motivo en vivo aparece recién cuando se toca algo: al abrir, el recuadro
  // de arriba ya lo dice y repetirlo abajo es ruido.
  const [toco, setToco] = useState(false)

  const leido = leerTelefonoIngresado({ extranjero, caracteristica, numero, libre })
  const escribio = toco && (extranjero ? libre.trim() !== '' : caracteristica.trim() !== '' || numero.trim() !== '')

  const pie = (
    <Button type="button" disabled={!leido.ok} onClick={() => { if (leido.ok) onUsar(leido) }}
      className="min-h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90">
      Usar este número
    </Button>
  )

  return (
    <HojaArmazon
      titulo={modo === 'pedir' ? 'Conseguí su teléfono' : 'Revisá el teléfono'}
      descripcion="Para agendar la visita y escribirle por WhatsApp hace falta un celular que funcione."
      descripcionVisible={false}
      pie={pie}
      onCerrar={onCerrar}
    >
      <div className="flex flex-col gap-1 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        {modo === 'pedir' ? (
          <>
            <span className="font-semibold break-words">{nombreVisible(c)}</span>
            <span className="text-[13px]">{textoSinTelefono(c.portal)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold break-words">{nombreVisible(c)} dejó «{c.tel.ok ? c.tel.mostrado : c.tel.crudo}»</span>
            {!c.tel.ok && <span className="text-[13px]">{MOTIVO_TEXTO[c.tel.motivo]} Así no le llega un WhatsApp.</span>}
          </>
        )}
      </div>

      {!extranjero && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold" id="celular-para-whatsapp">Celular para WhatsApp</span>
          <div className="flex items-end gap-2" role="group" aria-labelledby="celular-para-whatsapp">
            <span className="flex h-11 shrink-0 items-center rounded-lg border bg-secondary px-3 text-base text-muted-foreground">+54 9</span>
            <label className="flex w-20 shrink-0 flex-col gap-0.5 text-[11px] text-muted-foreground">
              Caract.
              <input aria-label="Característica" inputMode="numeric" autoComplete="off" value={caracteristica}
                onChange={(e) => { setCaracteristica(e.target.value); setToco(true) }} className={CLASE_INPUT} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-muted-foreground">
              Número
              <input aria-label="Número" inputMode="numeric" autoComplete="off" value={numero}
                onChange={(e) => { setNumero(e.target.value); setToco(true) }} className={CLASE_INPUT} />
            </label>
          </div>
          <span className="text-xs text-muted-foreground">
            Sin 0 adelante de la característica y sin 15 adelante del número. Si lo escribís con 0 o 15, lo sacamos solos.
          </span>
        </div>
      )}

      <div className="rounded-xl border">
        <button type="button" aria-expanded={extranjero} onClick={() => setExtranjero((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm font-medium">
          Es un número de otro país
          <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform', extranjero && 'rotate-180')} />
        </button>
        {extranjero && (
          <div className="space-y-2 px-3 pb-3">
            <p className="text-[13px] text-muted-foreground">
              Escribilo completo empezando con + y el código del país (ej. +598…). Solo así se acepta un número que no es argentino.
            </p>
            <input aria-label="Número completo con código de país" type="tel" autoComplete="off" value={libre}
              onChange={(e) => { setLibre(e.target.value); setToco(true) }} placeholder="+598…" className={CLASE_INPUT} />
          </div>
        )}
      </div>

      {leido.ok ? (
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-300/70 bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Así queda guardado</span>
          <span className="text-xl font-semibold break-words">{leido.mostrado}</span>
          <span className="text-xs text-muted-foreground">Listo para WhatsApp</span>
          <a href={`https://wa.me/${leido.whatsapp}`} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-brand underline">
            Probar: abrir este chat en WhatsApp
          </a>
        </div>
      ) : escribio ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {extranjero && !libre.trim().startsWith('+')
            ? 'Tiene que empezar con + y el código del país.'
            : MOTIVO_TEXTO[leido.motivo]}
        </p>
      ) : null}
    </HojaArmazon>
  )
}
