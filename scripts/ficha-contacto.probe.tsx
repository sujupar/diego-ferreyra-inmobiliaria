/**
 * Probe de render de la ficha de contacto (crm-ficha-y-llamadas, D10).
 * Correr: npx tsx scripts/ficha-contacto.probe.tsx [salida.html]
 *
 * `FichaContacto` pide sus datos en el navegador, así que acá se arma el MISMO árbol que
 * dibuja (cabecera, tres paneles, "+") con las piezas y datos de prueba, y se revisa:
 * estructura, textos de la maqueta y que nada quede con `opacity:0`. Con un argumento,
 * escribe el HTML para mirarlo en Chrome sin ventana (capturas a 1280, 1024 y 390).
 */
import { writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { Actividad } from '@/components/crm/ficha/Actividad'
import { AvisoGuardado } from '@/components/crm/ficha/AvisoGuardado'
import { BloqueLista } from '@/components/crm/ficha/BloqueLista'
import { BotonMas } from '@/components/crm/ficha/BotonMas'
import { Composer } from '@/components/crm/ficha/Composer'
import { FichaCabecera } from '@/components/crm/ficha/FichaCabecera'
import { FichaDatos } from '@/components/crm/ficha/FichaDatos'
import { FichaPestanas } from '@/components/crm/ficha/FichaPestanas'
import { LateralTareas } from '@/components/crm/ficha/LateralTareas'
import { actividadDePrueba, fichaDePrueba, tareaDePrueba } from '@/components/crm/ficha/datos-prueba'
import { armarAviso } from '@/lib/crm/aviso-guardado'

const ahora = new Date('2026-11-25T13:00:00Z')
const nada = () => {}

const base = fichaDePrueba()
const ficha = {
  ...base,
  persona: { ...base.persona, full_name: 'Marcela Ibáñez', notes: 'Quiere vender para mudarse a algo más chico. Prefiere que la llamen a la tarde.' },
  detalles: { ...base.detalles, campana: 'Tasación · CABA · noviembre', anuncio: '«¿Cuánto te queda en mano?»' },
  procesos: base.procesos.map((p) => ({ ...p, direccion: 'Departamento 3 amb. · Caballito' })),
}
const actividades = [
  actividadDePrueba({
    id: 'l2',
    kind: 'call',
    call_outcome: 'no_atendio',
    body: null,
    intento: 2,
    titulo: 'Llamada 2 · No atendió',
    occurred_at: '2026-11-25T12:20:00Z',
    tarea_creada: { id: 't', title: 'Enviar WhatsApp a Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00:00' },
  }),
  actividadDePrueba({ id: 'w', kind: 'whatsapp_sent', titulo: 'WhatsApp enviado', body: 'Le mandé el link de la tasación', occurred_at: '2026-11-24T19:00:00Z' }),
  actividadDePrueba({ id: 'n', body: 'En el formulario pidió que la llamen después de las 10.', occurred_at: '2026-11-25T12:00:00Z' }),
  actividadDePrueba({ id: 'l3', kind: 'call', call_outcome: 'volver_a_llamar', body: null, intento: 3, titulo: 'Llamada 3 · Volver a llamar', occurred_at: '2026-11-20T15:00:00Z', puede_editar: false }),
]
const tareas = [
  tareaDePrueba({ title: 'Llamar a Marcela Ibáñez', due_date: '2026-11-25', due_time: '09:00:00' }),
  tareaDePrueba({ id: 't2', title: 'Enviar WhatsApp a Marcela Ibáñez', channel: 'message', due_date: '2026-11-26', due_time: '09:00:00' }),
]
const aviso = armarAviso({
  tipo: 'call',
  titulo: 'Llamada 2 · No atendió',
  intento: 2,
  resultado: 'no_atendio',
  cadencia: {
    aplica: true,
    tareaCreada: { id: 't', title: 'Enviar WhatsApp a Marcela Ibáñez', due_date: '2026-11-26', due_time: '09:00', channel: 'message' },
    motivoSinTarea: null,
    tareasCerradas: [{ id: 'x', title: 'Llamada 2 a Marcela Ibáñez' }],
    ofrecer: null,
    dealId: 'd-1',
  },
  pendiente: false,
  contactoId: 'c-1',
  nombreContacto: 'Marcela Ibáñez',
  etiquetaEtapa: 'Solicitud',
  ahora,
})

// El mismo árbol de `FichaContacto` (clases `ficha`, `ficha-grilla`, `ficha-panel`, `ficha-cab`, `ficha-mas`).
function Ficha({ conAviso }: { conAviso: boolean }) {
  return (
    <div className="ficha" data-ficha="c-1">
      <div className="ficha-grilla">
        <FichaCabecera estado="ok" ficha={ficha} onReintentar={nada} pestanas={<FichaPestanas activa="actividad" onCambiar={nada} numeroTareas={tareas.length} />} />
        <div id="ficha-p-datos" role="tabpanel" data-activa="false" className="ficha-panel ficha-persona">
          <FichaDatos estado="ok" ficha={ficha} contactoId="c-1" onReintentar={nada} onEditarContacto={nada} onBackgroundGuardado={nada} avisar={nada} />
        </div>
        <div id="ficha-p-actividad" role="tabpanel" data-activa="true" className="ficha-panel ficha-centro">
          <Composer contactoId="c-1" pestana="nota" onPestana={nada} onNotaGuardada={nada} onLlamadaGuardada={nada} />
          <div aria-live="polite">{conAviso && <AvisoGuardado aviso={aviso} onAccion={nada} onCerrar={nada} />}</div>
          <Actividad
            bloque={{ estado: 'ok', items: actividades, hayMas: false, filtro: 'todo', cargandoMas: false, errorMas: null }}
            contactoId="c-1"
            ahora={ahora}
            nuevoId={null}
            onFiltrar={nada}
            onReintentar={nada}
            onVerMas={nada}
            onEditada={nada}
            onAnular={async () => true}
            onAbrirLlamada={nada}
            onAbrirNota={nada}
          />
        </div>
        <div id="ficha-p-tareas" role="tabpanel" data-activa="false" className="ficha-panel ficha-lado">
          <LateralTareas contactoId="c-1" nombre="Marcela Ibáñez" estado="ok" tareas={tareas} ahora={ahora} onReintentar={nada} onCreada={nada} onCompletada={nada} avisar={nada} />
          <BloqueLista ficha={ficha} ahora={ahora} onDeshacerPerdido={async () => true} />
        </div>
      </div>
      <BotonMas onClick={nada} />
    </div>
  )
}

function revisar(nombre: string, html: string, textos: string[], prohibidos: string[] = []) {
  for (const t of textos) if (!html.includes(t)) throw new Error(`[${nombre}] falta en el render: ${t}`)
  for (const t of prohibidos) if (html.includes(t)) throw new Error(`[${nombre}] no debería aparecer: ${t}`)
  console.log(`✓ ${nombre}`)
}

const html = renderToStaticMarkup(<Ficha conAviso />)
revisar(
  'ficha completa',
  html,
  [
    'class="ficha"',
    'class="ficha-grilla"',
    'ficha-cab',
    'ficha-mas',
    'Marcela Ibáñez',
    'Solicitud',
    'Sin contacto todavía',
    'Llamar · ',
    '11 5555-0142',
    'Actividad',
    'Datos',
    'Tareas',
    'Detalles',
    'Sin asignar todavía',
    'Background',
    'Nota',
    'Registrar llamada',
    'Escribí una nota…',
    'Guardar nota',
    'Línea de tiempo',
    'Todo',
    'Llamadas',
    'Notas',
    'Llamada 2 ·',
    'No atendió',
    'WhatsApp enviado',
    'Tarea creada sola · Enviar WhatsApp a Marcela Ibáñez, mañana 9:00',
    'Se agendó Enviar WhatsApp para mañana 9:00.',
    'Se completó sola la tarea «Llamada 2 a Marcela Ibáñez».',
    'Procesos',
    'Coordinar tasación',
    'aria-label="Agregar nota o registrar llamada"',
    'aria-label="Cerrar el aviso"',
  ],
  ['opacity:0', 'opacity: 0', 'Sin respuesta', 'Última llamada'],
)

if (process.argv[2]) {
  writeFileSync(process.argv[2], html)
  console.log(`HTML escrito en ${process.argv[2]}`)
}
