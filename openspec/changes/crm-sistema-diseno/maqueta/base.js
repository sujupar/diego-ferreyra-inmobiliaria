/* ══════════════════════════════════════════════════════════════════════
   MAQUETA CRM — base.js
   Router por hash, conmutador de rol, hojas, desplegables, pestañas, toast
   y el "store" en memoria compartido (window.MQ). Ver GUIA.md.
   Todo es simulado: no hay red, no se guarda nada, al recargar vuelve al inicio.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Reloj fijo: la maqueta siempre "es" miércoles 25/11/2026 10:40 ── */
  var AHORA = new Date(2026, 10, 25, 10, 40, 0);
  function ahora() { return new Date(AHORA.getTime()); }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + 'T' + dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  /** dia(-1, '10:15') = ayer 10:15, en formato "AAAA-MM-DDTHH:MM" (hora local). */
  function dia(desplazamiento, hora) {
    var d = ahora(); d.setDate(d.getDate() + desplazamiento);
    var p = (hora || '09:00').split(':'); d.setHours(+p[0], +p[1], 0, 0);
    return iso(d);
  }
  function soloDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diasEntre(a, b) { return Math.round((soloDia(b) - soloDia(a)) / 86400000); }
  /** Día hábil siguiente (lun a vie) a las 9:00. Feriados: fuera de alcance. */
  function siguienteDiaHabil(desde) {
    var d = new Date((desde || ahora()).getTime());
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    d.setHours(9, 0, 0, 0);
    return iso(d);
  }

  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function hora(d) { return d.getHours() + ':' + dos(d.getMinutes()); }
  function diaCorto(d) { return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }

  var fmt = {
    hora: function (f) { return hora(new Date(f)); },
    diaCorto: function (f) { return diaCorto(new Date(f)); },
    /** "mié 25 nov 2026, 10:15" */
    exacta: function (f) { var d = new Date(f); return diaCorto(d) + ' ' + d.getFullYear() + ', ' + hora(d); },
    /** Pasado: "recién", "hace 12 min", "hace 2 h", "ayer", "hace 3 días", "12 nov". Futuro: "hoy 16:30", "mañana 9:00", "vie 27 nov, 9:00". */
    relativa: function (f) {
      var d = new Date(f), n = ahora(), min = Math.round((n - d) / 60000), dd = diasEntre(d, n);
      if (min < 0) {
        if (dd === 0) return 'hoy ' + hora(d);
        if (dd === -1) return 'mañana ' + hora(d);
        return diaCorto(d) + ', ' + hora(d);
      }
      if (min < 1) return 'recién';
      if (dd === 0) return min < 60 ? 'hace ' + min + ' min' : 'hace ' + Math.floor(min / 60) + ' h';
      if (dd === 1) return 'ayer';
      if (dd < 7) return 'hace ' + dd + ' días';
      return d.getDate() + ' ' + MESES[d.getMonth()];
    },
    /** Texto y estado del vencimiento de una tarea. estado: 'vencida' | 'hoy' | 'proxima' | 'sinfecha' */
    vencimiento: function (t) {
      if (!t.vence) return { texto: 'Sin fecha', estado: 'sinfecha' };
      var d = new Date(t.vence), n = ahora(), dd = diasEntre(d, n), min = Math.round((n - d) / 60000);
      if (dd > 0) return { texto: 'Vencida hace ' + dd + (dd === 1 ? ' día' : ' días'), estado: 'vencida' };
      if (dd === 0) {
        if (t.todoElDia) return { texto: 'Hoy, todo el día', estado: 'hoy' };
        if (min >= 60) return { texto: 'Vencida hace ' + Math.floor(min / 60) + ' h', estado: 'vencida' };
        if (min >= 1) return { texto: 'Vencida hace ' + min + ' min', estado: 'vencida' };
        return { texto: 'Hoy ' + hora(d), estado: 'hoy' };
      }
      if (dd === -1) return { texto: 'Mañana' + (t.todoElDia ? '' : ' ' + hora(d)), estado: 'proxima' };
      return { texto: diaCorto(d) + (t.todoElDia ? '' : ', ' + hora(d)), estado: 'proxima' };
    },
    iniciales: function (nombre) {
      var p = String(nombre || '').trim().split(/\s+/);
      return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : (p[0] || '').charAt(1))).toUpperCase();
    },
    /** "11 5555-0142" → "tel:+5491155550142" */
    tel: function (telefono) { return 'tel:+549' + String(telefono).replace(/\D/g, ''); }
  };

  /* ── Catálogos ───────────────────────────────────────────────────── */
  var RESULTADOS = {
    agendo:      { texto: 'Atendió y agendó',            corto: 'Agendó',            icono: 'calendar-check' },
    volver:      { texto: 'Atendió · volver a llamar',   corto: 'Volver a llamar',   icono: 'phone-forwarded' },
    no_interesa: { texto: 'Atendió · no le interesa',    corto: 'No le interesa',    icono: 'thumbs-down' },
    no_atendio:  { texto: 'No atendió',                  corto: 'No atendió',        icono: 'phone-missed' },
    equivocado:  { texto: 'Número equivocado',           corto: 'Número equivocado', icono: 'phone-off' }
  };
  var ETAPAS = {
    solicitud: 'Solicitud de tasación', agendada: 'Tasación agendada', visita: 'Visita realizada',
    entregada: 'Tasación entregada', captada: 'Captada', perdida: 'Perdida'
  };
  var TIPOS_EVENTO = {
    registro: 'user-plus', llamada: 'phone', nota: 'sticky-note', whatsapp: 'message-circle', etapa: 'arrow-right-left',
    tarea: 'list-checks', video: 'circle-play', email: 'mail', tasacion: 'calendar-check', consulta: 'building'
  };
  var TIPOS_TAREA = {
    llamada: { texto: 'Llamada', icono: 'phone' }, whatsapp: { texto: 'Mensaje', icono: 'message-circle' },
    visita: { texto: 'Visita', icono: 'map-pin' }, tasacion: { texto: 'Visita', icono: 'calendar-check', grupo: 'visita' },
    documentacion: { texto: 'Documentación', icono: 'file-text' }, otro: { texto: 'Otro', icono: 'list-checks' }
  };
  /** Los tipos que se eligen al crear una tarea y por los que se filtra: una sola lista para toda la maqueta. */
  var TIPOS_ELEGIBLES = ['llamada', 'whatsapp', 'visita', 'documentacion', 'otro'];
  var USUARIOS = {
    coordinadora: { id: 'paula', nombre: 'Paula', rol: 'coordinadora', rolTexto: 'Coordinadora' },
    asesor:       { id: 'tomas', nombre: 'Tomás Agüero', rol: 'asesor', rolTexto: 'Asesor' },
    admin:        { id: 'admin', nombre: 'Dueño', rol: 'admin', rolTexto: 'Vista del dueño' }
  };
  function nombreDe(usuarioId) {
    for (var r in USUARIOS) if (USUARIOS[r].id === usuarioId) return USUARIOS[r].nombre;
    return usuarioId;
  }

  /* ── Datos ficticios ─────────────────────────────────────────────── */
  var contactos = [
    { id: 'c1', nombre: 'Marcela Ibáñez', telefono: '11 5555-0142', email: 'marcela.ibanez@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «¿Cuánto te queda en mano?»', asesor: null, asignadoA: 'paula',
      barrio: 'Caballito', tipoPropiedad: 'Departamento', ambientes: 3, direccion: 'Av. Pedro Goyena 1180',
      background: 'Quiere vender para mudarse a algo más chico. Prefiere que la llamen después de las 10.', creado: dia(-1, '18:20') },
    { id: 'c2', nombre: 'Rubén Castiglione', telefono: '11 5555-0117', email: 'ruben.castiglione@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: null, asignadoA: 'paula',
      barrio: 'Villa Urquiza', tipoPropiedad: 'Casa', ambientes: 4, direccion: 'Bucarelli 2630', background: '', creado: dia(-2, '11:30') },
    { id: 'c3', nombre: 'Silvina Arrieta', telefono: '11 5555-0163', email: 'silvina.arrieta@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «¿Cuánto te queda en mano?»', asesor: null, asignadoA: 'paula',
      barrio: 'Almagro', tipoPropiedad: 'PH', ambientes: 3, direccion: 'Yatay 540', background: '', creado: dia(-5, '16:00') },
    { id: 'c4', nombre: 'Gustavo Peralta', telefono: '11 5555-0108', email: 'gustavo.peralta@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: null, asignadoA: 'paula',
      barrio: 'Palermo', tipoPropiedad: 'Departamento', ambientes: 2, direccion: 'Guatemala 4720', background: '', creado: dia(-7, '13:45') },
    { id: 'c5', nombre: 'Lorena Quiroga', telefono: '11 5555-0155', email: 'lorena.quiroga@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: null, asignadoA: 'paula',
      barrio: 'Belgrano', tipoPropiedad: 'Departamento', ambientes: 4, direccion: 'Mendoza 2350', background: 'Trabaja hasta las 16. Llamar a la tarde.', creado: dia(-2, '20:10') },
    { id: 'c6', nombre: 'Ernesto Villalba', telefono: '11 5555-0129', email: 'ernesto.villalba@ejemplo.com', etapa: 'agendada',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «¿Cuánto te queda en mano?»', asesor: 'Tomás Agüero', asignadoA: 'tomas',
      barrio: 'Flores', tipoPropiedad: 'Casa', ambientes: 5, direccion: 'Bacacay 2450', background: 'Casa de los padres, son tres hermanos. Decide él.', creado: dia(-6, '09:50') },
    { id: 'c7', nombre: 'Patricia Medrano', telefono: '11 5555-0171', email: 'patricia.medrano@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: null, asignadoA: 'paula',
      barrio: 'Núñez', tipoPropiedad: 'Departamento', ambientes: 3, direccion: 'Cuba 3100', background: '', creado: dia(0, '10:12') },
    { id: 'c8', nombre: 'Hugo Benítez', telefono: '11 5555-0136', email: 'hugo.benitez@ejemplo.com', etapa: 'perdida',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: null, asignadoA: 'paula',
      barrio: 'Boedo', tipoPropiedad: 'PH', ambientes: 2, direccion: 'Maza 890', background: '', creado: dia(-8, '15:20') },
    { id: 'c9', nombre: 'Nélida Ferrari', telefono: '11 5555-0190', email: 'nelida.ferrari@ejemplo.com', etapa: 'solicitud',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «¿Cuánto te queda en mano?»', asesor: null, asignadoA: 'paula',
      barrio: 'Parque Chacabuco', tipoPropiedad: 'Casa', ambientes: 3, direccion: 'Av. Asamblea 1420', background: '', creado: dia(-2, '08:35') },
    { id: 'c10', nombre: 'Mirta Sosa', telefono: '11 5555-0184', email: 'mirta.sosa@ejemplo.com', etapa: 'visita',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «Tasación sin vueltas»', asesor: 'Tomás Agüero', asignadoA: 'tomas',
      barrio: 'Villa Crespo', tipoPropiedad: 'PH', ambientes: 3, direccion: 'Aguirre 760', background: 'Vende para comprar más cerca de la hija.', creado: dia(-13, '12:10') },
    { id: 'c11', nombre: 'Jorge Altamirano', telefono: '11 5555-0126', email: 'jorge.altamirano@ejemplo.com', etapa: 'entregada',
      origen: 'Embudo · Tasación', campana: 'Anuncio de Meta «¿Cuánto te queda en mano?»', asesor: 'Tomás Agüero', asignadoA: 'tomas',
      barrio: 'Saavedra', tipoPropiedad: 'Departamento', ambientes: 2, direccion: 'Av. García del Río 3350', background: '', creado: dia(-20, '17:40') }
  ];

  var sec = 0;
  function nuevoId(prefijo) { sec += 1; return prefijo + sec; }
  function T(titulo, tipo, contactoId, vence, asignadaA, extra) {
    var t = { id: nuevoId('t'), titulo: titulo, tipo: tipo, contactoId: contactoId, vence: vence, todoElDia: false,
      asignadaA: asignadaA, estado: 'pendiente', automatica: false, creada: dia(-1, '09:00'), completada: null };
    for (var k in (extra || {})) t[k] = extra[k];
    return t;
  }
  function A(contactoId, tipo, titulo, fecha, autor, extra) {
    var a = { id: nuevoId('a'), contactoId: contactoId, tipo: tipo, titulo: titulo, detalle: null, autor: autor || null, fecha: fecha, orden: sec };
    for (var k in (extra || {})) a[k] = extra[k];
    return a;
  }

  var tareas = [
    T('Llamar a Marcela Ibáñez', 'llamada', 'c1', dia(0, '09:00'), 'paula', { automatica: true, creada: dia(-1, '18:20') }),
    T('Llamada 2 a Rubén Castiglione', 'llamada', 'c2', dia(0, '09:00'), 'paula', { automatica: true, creada: dia(-1, '10:15') }),
    T('Enviar WhatsApp a Silvina Arrieta', 'whatsapp', 'c3', dia(0, '09:00'), 'paula', { automatica: true, creada: dia(-1, '09:20') }),
    T('Llamar a Patricia Medrano', 'llamada', 'c7', dia(0, '10:12'), 'paula', { automatica: true, creada: dia(0, '10:12') }),
    T('Llamar a Lorena Quiroga', 'llamada', 'c5', dia(0, '16:30'), 'paula', { automatica: true, creada: dia(-1, '09:40') }),
    T('Revisar las solicitudes del fin de semana', 'otro', null, dia(-2, '09:00'), 'paula', { creada: dia(-5, '17:00') }),
    T('Confirmar el horario con Ernesto Villalba', 'otro', 'c6', dia(0, '09:00'), 'paula', { todoElDia: true }),
    T('Recordarle la tasación a Ernesto Villalba', 'whatsapp', 'c6', dia(1, '09:30'), 'paula'),
    T('Pedir la escritura del departamento de Belgrano', 'otro', null, null, 'paula'),
    T('Tasación de Ernesto Villalba · Bacacay 2450', 'tasacion', 'c6', dia(1, '11:00'), 'tomas', { creada: dia(-5, '10:12') }),
    T('Visita con compradores · Av. Rivadavia 5240', 'visita', null, dia(0, '15:00'), 'tomas'),
    T('Subir las fotos del PH de Almagro', 'otro', null, dia(-2, '18:00'), 'tomas', { creada: dia(-6, '12:00') }),
    T('Llamar al propietario de Yerbal 2300 por la reserva', 'llamada', null, null, 'tomas')
  ];

  var actividad = [
    // c1 · Marcela Ibáñez — todavía sin llamadas: en ella se prueba la cadencia completa
    A('c1', 'registro', 'Se registró · Solicitud de tasación', dia(-1, '18:20'), null, { detalle: 'Anuncio de Meta «¿Cuánto te queda en mano?» · Departamento 3 ambientes en Caballito' }),
    A('c1', 'email', 'Recibió el email «Recibimos tu solicitud de tasación»', dia(-1, '18:20')),
    A('c1', 'tarea', 'Tarea creada · Llamar a Marcela Ibáñez', dia(-1, '18:20'), null, { detalle: null }),
    A('c1', 'whatsapp', 'WhatsApp automático · Confirmación de la solicitud', dia(-1, '18:21'), null, { origen: 'sistema' }),
    A('c1', 'video', 'Vio el video de la landing · 62 %', dia(-1, '18:24')),
    A('c1', 'nota', 'Nota', dia(0, '09:05'), 'Paula', { detalle: 'En el formulario pidió que la llamen después de las 10.' }),
    // c2 · Rubén Castiglione — 1 "No atendió"
    A('c2', 'registro', 'Se registró · Solicitud de tasación', dia(-2, '11:30'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · Casa 4 ambientes en Villa Urquiza' }),
    A('c2', 'video', 'Vio el video de la landing · 35 %', dia(-2, '11:33')),
    A('c2', 'llamada', 'Llamada 1', dia(-1, '10:15'), 'Paula', { resultado: 'no_atendio', intento: 1 }),
    A('c2', 'tarea', 'Tarea creada sola · Llamada 2 a Rubén Castiglione', dia(-1, '10:15')),
    // c3 · Silvina Arrieta — 2 "No atendió" seguidas
    A('c3', 'registro', 'Se registró · Solicitud de tasación', dia(-5, '16:00'), null, { detalle: 'Anuncio de Meta «¿Cuánto te queda en mano?» · PH 3 ambientes en Almagro' }),
    A('c3', 'llamada', 'Llamada 1', dia(-2, '09:30'), 'Paula', { resultado: 'no_atendio', intento: 1 }),
    A('c3', 'llamada', 'Llamada 2', dia(-1, '09:20'), 'Paula', { resultado: 'no_atendio', intento: 2 }),
    A('c3', 'tarea', 'Tarea creada sola · Enviar WhatsApp a Silvina Arrieta', dia(-1, '09:20')),
    // c4 · Gustavo Peralta — 2 "No atendió" + WhatsApp: sin respuesta
    A('c4', 'registro', 'Se registró · Solicitud de tasación', dia(-7, '13:45'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · Departamento 2 ambientes en Palermo' }),
    A('c4', 'video', 'Vio el video de la landing · 80 %', dia(-7, '13:49')),
    A('c4', 'llamada', 'Llamada 1', dia(-6, '09:40'), 'Paula', { resultado: 'no_atendio', intento: 1 }),
    A('c4', 'llamada', 'Llamada 2', dia(-5, '09:15'), 'Paula', { resultado: 'no_atendio', intento: 2 }),
    A('c4', 'whatsapp', 'WhatsApp enviado', dia(-2, '09:10'), 'Paula', { origen: 'manual' }),
    // c5 · Lorena Quiroga — pidió que la vuelvan a llamar
    A('c5', 'registro', 'Se registró · Solicitud de tasación', dia(-2, '20:10'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · Departamento 4 ambientes en Belgrano' }),
    A('c5', 'llamada', 'Llamada 1', dia(-1, '09:40'), 'Paula', { resultado: 'volver', intento: 1, detalle: 'Estaba en el trabajo. Pidió que la llamen el miércoles a las 16:30.' }),
    // c6 · Ernesto Villalba — agendó
    A('c6', 'registro', 'Se registró · Solicitud de tasación', dia(-6, '09:50'), null, { detalle: 'Anuncio de Meta «¿Cuánto te queda en mano?» · Casa 5 ambientes en Flores' }),
    A('c6', 'llamada', 'Llamada 1', dia(-5, '10:05'), 'Paula', { resultado: 'agendo', intento: 1 }),
    A('c6', 'etapa', 'Pasó de Solicitud a Tasación agendada', dia(-5, '10:12'), 'Paula'),
    A('c6', 'tasacion', 'Tasación agendada · jue 26 nov, 11:00 con Tomás Agüero', dia(-5, '10:12'), 'Paula'),
    // c7 · Patricia Medrano — recién entró
    A('c7', 'registro', 'Se registró · Solicitud de tasación', dia(0, '10:12'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · Departamento 3 ambientes en Núñez' }),
    // c8 · Hugo Benítez — no le interesa
    A('c8', 'registro', 'Se registró · Solicitud de tasación', dia(-8, '15:20'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · PH 2 ambientes en Boedo' }),
    A('c8', 'llamada', 'Llamada 1', dia(-7, '09:25'), 'Paula', { resultado: 'no_interesa', intento: 1, detalle: 'Solo quería saber el precio. No piensa vender este año.' }),
    A('c8', 'etapa', 'Pasó de Solicitud a Perdida', dia(-7, '09:27'), 'Paula'),
    // c9 · Nélida Ferrari — número equivocado
    A('c9', 'registro', 'Se registró · Solicitud de tasación', dia(-2, '08:35'), null, { detalle: 'Anuncio de Meta «¿Cuánto te queda en mano?» · Casa 3 ambientes en Parque Chacabuco' }),
    A('c9', 'llamada', 'Llamada 1', dia(-1, '11:02'), 'Paula', { resultado: 'equivocado', intento: 1 }),
    // c10 · Mirta Sosa — visita hecha, falta entregar la tasación
    A('c10', 'registro', 'Se registró · Solicitud de tasación', dia(-13, '12:10'), null, { detalle: 'Anuncio de Meta «Tasación sin vueltas» · PH 3 ambientes en Villa Crespo' }),
    A('c10', 'llamada', 'Llamada 1', dia(-12, '09:35'), 'Paula', { resultado: 'agendo', intento: 1 }),
    A('c10', 'etapa', 'Pasó de Solicitud a Tasación agendada', dia(-12, '09:40'), 'Paula'),
    A('c10', 'etapa', 'Pasó de Tasación agendada a Visita realizada', dia(-4, '12:30'), 'Tomás Agüero'),
    A('c10', 'nota', 'Nota', dia(-4, '12:35'), 'Tomás Agüero', { detalle: 'PH en buen estado, terraza propia. Quiere el número antes de fin de mes.' }),
    // c11 · Jorge Altamirano — tasación entregada, falta la respuesta
    A('c11', 'registro', 'Se registró · Solicitud de tasación', dia(-20, '17:40'), null, { detalle: 'Anuncio de Meta «¿Cuánto te queda en mano?» · Departamento 2 ambientes en Saavedra' }),
    A('c11', 'llamada', 'Llamada 1', dia(-19, '10:20'), 'Paula', { resultado: 'agendo', intento: 1 }),
    A('c11', 'etapa', 'Pasó de Solicitud a Tasación agendada', dia(-19, '10:25'), 'Paula'),
    A('c11', 'etapa', 'Pasó de Tasación agendada a Visita realizada', dia(-12, '11:45'), 'Tomás Agüero'),
    A('c11', 'etapa', 'Pasó de Visita realizada a Tasación entregada', dia(-6, '16:10'), 'Tomás Agüero')
  ];

  var tasaciones = [
    { id: 'ta1', contactoId: 'c6', direccion: 'Bacacay 2450, Flores', fecha: dia(1, '11:00'), asesor: 'Tomás Agüero' }
  ];

  /* ── Eventos del store ───────────────────────────────────────────── */
  var oyentes = {};
  function on(evt, fn) { (oyentes[evt] = oyentes[evt] || []).push(fn); return fn; }
  function emit(evt, dato) { (oyentes[evt] || []).slice().forEach(function (fn) { try { fn(dato); } catch (e) { console.error('[MQ] ' + evt, e); } }); }
  function tieneOyentes(evt) { return !!(oyentes[evt] && oyentes[evt].length); }

  /* ── Lecturas ────────────────────────────────────────────────────── */
  function contacto(id) { return contactos.filter(function (c) { return c.id === id; })[0] || null; }
  function tarea(id) { return tareas.filter(function (t) { return t.id === id; })[0] || null; }
  function usuario() { return USUARIOS[MQ.rol]; }
  function porFechaDesc(a, b) { return (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.orden - a.orden); }
  function porVence(a, b) { return (a.vence || '9999') < (b.vence || '9999') ? -1 : (a.vence || '9999') > (b.vence || '9999') ? 1 : 0; }
  /** Eventos de un contacto, del más nuevo al más viejo. */
  function actividadDe(contactoId) { return actividad.filter(function (a) { return a.contactoId === contactoId; }).sort(porFechaDesc); }
  /** Tareas pendientes de un contacto (de cualquier persona), por vencimiento. */
  function tareasDe(contactoId) { return tareas.filter(function (t) { return t.contactoId === contactoId && t.estado === 'pendiente'; }).sort(porVence); }
  /** Tareas pendientes de una persona (por defecto, el rol actual), por vencimiento. */
  function misTareas(usuarioId) {
    var u = usuarioId || usuario().id;
    return tareas.filter(function (t) { return t.asignadaA === u && t.estado === 'pendiente'; }).sort(porVence);
  }
  /** 'vencida' | 'hoy' | 'proxima' | 'sinfecha' — para agrupar la página de tareas. */
  function grupoDeTarea(t) { return fmt.vencimiento(t).estado; }
  /** ¿Ya "suena" en la campanita? Con fecha ≤ ahora; las de todo el día, desde las 9:00. Sin fecha: nunca. */
  function yaVencio(t) {
    if (!t.vence || t.estado !== 'pendiente') return false;
    var d = new Date(t.vence);
    if (t.todoElDia) d.setHours(9, 0, 0, 0);
    return d <= ahora();
  }
  /** Lo que avisa la campanita al rol actual. */
  function avisos(usuarioId) { return misTareas(usuarioId).filter(yaVencio); }
  function llamadasDe(contactoId) { return actividad.filter(function (a) { return a.contactoId === contactoId && a.tipo === 'llamada'; }); }
  /** Días desde la última llamada (atendida o no). null si nunca se lo llamó. Una nota no cuenta. */
  function diasSinContacto(contactoId) {
    var ll = llamadasDe(contactoId).sort(porFechaDesc);
    return ll.length ? diasEntre(new Date(ll[0].fecha), ahora()) : null;
  }
  /** Estado de la cadencia: { llamadas, noAtendioSeguidas, whatsappEnviado } */
  function cadenciaDe(contactoId) {
    var evs = actividad.filter(function (a) { return a.contactoId === contactoId && (a.tipo === 'llamada' || (a.tipo === 'whatsapp' && a.origen === 'manual')); }).sort(porFechaDesc);
    var seguidas = 0, whatsapp = false;
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].tipo === 'whatsapp') { whatsapp = true; continue; }
      if (evs[i].resultado === 'no_atendio') seguidas += 1; else break;
    }
    return { llamadas: llamadasDe(contactoId).length, noAtendioSeguidas: seguidas, whatsappEnviado: whatsapp };
  }

  /* ── Escrituras (todas emiten 'tareas' y/o 'actividad') ──────────── */
  function crearTarea(datos) {
    var t = T(datos.titulo, datos.tipo || 'otro', datos.contactoId || null, datos.vence || null, datos.asignadaA || usuario().id,
      { todoElDia: !!datos.todoElDia, automatica: !!datos.automatica, creada: iso(ahora()) });
    tareas.push(t);
    if (!datos.silencioso) emit('tareas', { motivo: 'creada', tarea: t });
    return t;
  }
  function completarTarea(id, opciones) {
    var t = tarea(id); if (!t || t.estado === 'completada') return t;
    t.estado = 'completada'; t.completada = iso(ahora());
    if (!(opciones && opciones.silencioso)) emit('tareas', { motivo: 'completada', tarea: t });
    return t;
  }
  function reabrirTarea(id) {
    var t = tarea(id); if (!t) return t;
    t.estado = 'pendiente'; t.completada = null;
    emit('tareas', { motivo: 'reabierta', tarea: t });
    return t;
  }
  function posponerTarea(id, vence) {
    var t = tarea(id); if (!t) return t;
    t.vence = vence; t.todoElDia = false;
    emit('tareas', { motivo: 'pospuesta', tarea: t });
    return t;
  }
  function agregarNota(contactoId, texto) {
    var ev = A(contactoId, 'nota', 'Nota', iso(ahora()), usuario().nombre, { detalle: texto });
    actividad.push(ev);
    emit('actividad', { motivo: 'nota', evento: ev });
    return ev;
  }
  function completarPendientes(contactoId, tipos) {
    var hechas = [];
    tareas.forEach(function (t) {
      if (t.contactoId === contactoId && t.estado === 'pendiente' && tipos.indexOf(t.tipo) !== -1) { completarTarea(t.id, { silencioso: true }); hechas.push(t); }
    });
    return hechas;
  }
  /**
   * Registra una llamada y aplica la cadencia.
   * datos: { contactoId, resultado, nota?, volverEl? }  (volverEl obligatorio si resultado === 'volver')
   * Devuelve { evento, intento, tareaCreada, tareasCompletadas, aviso }.
   */
  function registrarLlamada(datos) {
    var c = contacto(datos.contactoId), r = datos.resultado;
    if (!c || !RESULTADOS[r]) throw new Error('registrarLlamada: contacto o resultado inválido');
    if (r === 'volver' && !datos.volverEl) throw new Error('registrarLlamada: "volver a llamar" necesita día y hora (volverEl)');
    var intento = llamadasDe(c.id).length + 1;
    var completadas = completarPendientes(c.id, ['llamada']);
    var ev = A(c.id, 'llamada', 'Llamada ' + intento, iso(ahora()), usuario().nombre, { resultado: r, intento: intento, detalle: datos.nota || null });
    var creada = null, aviso = 'Llamada ' + intento + ' registrada.';
    if (r === 'no_atendio') {
      actividad.push(ev);
      var cad = cadenciaDe(c.id);
      if (cad.whatsappEnviado) {
        aviso += ' Ya se le mandó WhatsApp: no se crea otra tarea.';
      } else if (cad.noAtendioSeguidas >= 2) {
        creada = crearTarea({ titulo: 'Enviar WhatsApp a ' + c.nombre, tipo: 'whatsapp', contactoId: c.id, vence: siguienteDiaHabil(), automatica: true, silencioso: true });
      } else {
        creada = crearTarea({ titulo: 'Llamada ' + (intento + 1) + ' a ' + c.nombre, tipo: 'llamada', contactoId: c.id, vence: siguienteDiaHabil(), automatica: true, silencioso: true });
      }
      actividad.pop();
    } else if (r === 'volver') {
      creada = crearTarea({ titulo: 'Llamar a ' + c.nombre, tipo: 'llamada', contactoId: c.id, vence: datos.volverEl, automatica: true, silencioso: true });
    }
    if (creada) {
      // El aviso de "tarea creada" entra ANTES que la llamada: así la llamada queda primera en la línea de tiempo.
      actividad.push(A(c.id, 'tarea', 'Tarea creada sola · ' + creada.titulo, iso(ahora()), null, { tareaId: creada.id }));
      aviso += ' Se creó la tarea «' + creada.titulo + '» para ' + fmt.relativa(creada.vence) + '.';
    }
    ev.orden = (sec += 1);
    actividad.push(ev);
    emit('actividad', { motivo: 'llamada', evento: ev });
    emit('tareas', { motivo: 'cadencia', tarea: creada, completadas: completadas });
    return { evento: ev, intento: intento, tareaCreada: creada, tareasCompletadas: completadas, aviso: aviso };
  }
  /** Marca "WhatsApp enviado" (no envía nada). Corta la cadencia: no crea ninguna tarea más. */
  function registrarWhatsapp(contactoId, nota) {
    var c = contacto(contactoId); if (!c) throw new Error('registrarWhatsapp: contacto inválido');
    var completadas = completarPendientes(c.id, ['whatsapp', 'llamada']);
    var ev = A(c.id, 'whatsapp', 'WhatsApp enviado', iso(ahora()), usuario().nombre, { origen: 'manual', detalle: nota || null });
    actividad.push(ev);
    emit('actividad', { motivo: 'whatsapp', evento: ev });
    emit('tareas', { motivo: 'cadencia', tarea: null, completadas: completadas });
    return { evento: ev, tareaCreada: null, tareasCompletadas: completadas, aviso: 'WhatsApp marcado como enviado. No se crea ninguna tarea más.' };
  }

  /* ── Íconos (trazo estilo lucide, 24×24, 2 px, sin relleno) ──────── */
  var TEL = '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>';
  var CAL = '<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>';
  var ICONOS = {
    'menu': '<path d="M4 12h16M4 6h16M4 18h16"/>',
    'panel-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    'bell': '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'phone': TEL,
    'phone-missed': TEL + '<path d="m22 2-6 6M16 2l6 6"/>',
    'phone-forwarded': TEL + '<path d="m18 2 4 4-4 4M14 6h8"/>',
    'phone-off': '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="M22 2 2 22"/>',
    'calendar': CAL,
    'calendar-check': CAL + '<path d="m9 16 2 2 4-4"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'x': '<path d="M18 6 6 18M6 6l12 12"/>',
    'plus': '<path d="M5 12h14M12 5v14"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'sticky-note': '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'arrow-right-left': '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'list-checks': '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    'circle-play': '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
    'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'columns': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    'contact': '<path d="M16 2v2M8 2v2M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><circle cx="12" cy="11" r="3"/><rect x="3" y="4" width="18" height="18" rx="2"/>',
    'building': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'thumbs-down': '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
    'paperclip': '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'megaphone': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'briefcase': '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect x="2" y="6" width="20" height="14" rx="2"/>',
    'external-link': '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'filter': '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    'more': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    'calendar-days': CAL + '<path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    'layers': '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icono(nombre, clase) {
    var d = ICONOS[nombre];
    if (!d) { console.warn('[MQ] ícono desconocido: ' + nombre); d = '<circle cx="12" cy="12" r="9"/>'; }
    return '<svg class="icono' + (clase ? ' ' + clase : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  /** Reemplaza cada <i data-icono="phone"></i> dentro de raiz por su SVG. Llamala después de insertar HTML propio. */
  function hidratar(raiz) {
    var nodos = (raiz || document).querySelectorAll('i[data-icono]');
    for (var i = 0; i < nodos.length; i++) {
      var n = nodos[i], tmp = document.createElement('div');
      tmp.innerHTML = icono(n.getAttribute('data-icono'), n.className);
      n.parentNode.replaceChild(tmp.firstChild, n);
    }
  }

  /* ── Constructores de HTML (devuelven texto) ─────────────────────── */
  var ui = {
    esc: esc, icono: icono, hidratar: hidratar,
    avatar: function (nombre, modificador) { return '<span class="avatar' + (modificador ? ' avatar--' + modificador : '') + '" aria-hidden="true">' + esc(fmt.iniciales(nombre)) + '</span>'; },
    chipEtapa: function (etapa) { return '<span class="badge etapa" data-etapa="' + esc(etapa) + '">' + esc(ETAPAS[etapa] || etapa) + '</span>'; },
    /** largo=true usa el texto completo ("Atendió · volver a llamar"); si no, el corto ("Volver a llamar"). */
    chipResultado: function (resultado, largo) {
      var r = RESULTADOS[resultado]; if (!r) return '';
      return '<span class="resultado" data-resultado="' + esc(resultado) + '">' + icono(r.icono) + esc(largo ? r.texto : r.corto) + '</span>';
    },
    fecha: function (f) {
      return '<time class="fecha" datetime="' + esc(f) + '" title="' + esc(fmt.exacta(f)) + '" data-relativa="' + esc(fmt.relativa(f)) + '" data-exacta="' + esc(fmt.exacta(f)) + '" tabindex="0" role="button" aria-label="' + esc(fmt.relativa(f) + ' (' + fmt.exacta(f) + ')') + '">' + esc(fmt.relativa(f)) + '</time>';
    },
    vence: function (t) {
      var v = fmt.vencimiento(t);
      return '<span class="vence" data-estado="' + v.estado + '"' + (t.vence ? ' title="' + esc(fmt.exacta(t.vence)) + '"' : '') + '>' + icono(v.estado === 'vencida' ? 'triangle-alert' : v.estado === 'sinfecha' ? 'calendar' : 'clock') + esc(v.texto) + '</span>';
    },
    /** opciones: { sinContacto: bool, conPersona: bool, acciones: 'html de botones' } */
    itemTarea: function (t, opciones) {
      var o = opciones || {}, c = t.contactoId ? contacto(t.contactoId) : null, tipo = TIPOS_TAREA[t.tipo] || TIPOS_TAREA.otro;
      var hecha = t.estado === 'completada';
      return '<li class="tarea' + (hecha ? ' tarea--hecha' : '') + '" data-tarea="' + t.id + '" data-estado="' + grupoDeTarea(t) + '">' +
        '<label class="tarea__check"><input type="checkbox" data-completar="' + t.id + '"' + (hecha ? ' checked' : '') + ' aria-label="Completar: ' + esc(t.titulo) + '"><span class="tarea__caja">' + icono('check') + '</span></label>' +
        '<div class="tarea__cuerpo"><p class="tarea__titulo">' + icono(tipo.icono) + '<span class="truncar">' + esc(t.titulo) + '</span></p>' +
        '<p class="tarea__meta">' + ui.vence(t) +
        (c && !o.sinContacto ? '<a class="tarea__contacto" href="#ficha" data-contacto="' + c.id + '">' + esc(c.nombre) + '</a>' : '') +
        (o.conPersona ? '<span>' + esc(nombreDe(t.asignadaA)) + '</span>' : '') +
        '</p></div>' + (o.acciones ? '<div class="tarea__acciones">' + o.acciones + '</div>' : '') + '</li>';
    },
    /** opciones: { nuevo: bool } resalta el evento recién agregado */
    itemEvento: function (ev, opciones) {
      var o = opciones || {};
      return '<li class="evento' + (o.nuevo ? ' evento--nuevo' : '') + '" data-tipo="' + esc(ev.tipo) + '" data-evento="' + ev.id + '">' +
        '<span class="evento__icono">' + icono(ev.tipo === 'llamada' && ev.resultado ? RESULTADOS[ev.resultado].icono : (TIPOS_EVENTO[ev.tipo] || 'clock')) + '</span>' +
        '<div class="evento__cuerpo"><p class="evento__titulo"><span>' + esc(ev.titulo) + (ev.resultado ? ' ·' : '') + '</span>' + (ev.resultado ? ui.chipResultado(ev.resultado) : '') + '</p>' +
        (ev.detalle ? '<p class="evento__detalle">' + esc(ev.detalle) + '</p>' : '') +
        '<p class="evento__meta">' + (ev.autor ? '<span>' + esc(ev.autor) + '</span><span aria-hidden="true">·</span>' : '') + ui.fecha(ev.fecha) + '</p></div></li>';
    },
    /** Filas de carga. filas = cuántas (3 por defecto). */
    estadoCarga: function (filas) {
      var h = '<div class="pila" aria-busy="true"><span class="solo-lectores">Cargando…</span>';
      for (var i = 0; i < (filas || 3); i++) h += '<div class="fila"><span class="esqueleto esqueleto--circulo"></span><div class="pila pila--chica crece"><span class="esqueleto esqueleto--medio"></span><span class="esqueleto esqueleto--corto"></span></div></div>';
      return h + '</div>';
    },
    /** datos: { icono, titulo, texto, accion: 'html de un botón', ok: bool } */
    estadoVacio: function (datos) {
      var d = datos || {};
      return '<div class="estado' + (d.ok ? ' estado--ok' : '') + '"><span class="estado__icono">' + icono(d.icono || 'inbox') + '</span><p class="estado__titulo">' + esc(d.titulo || 'Nada por acá') + '</p>' +
        (d.texto ? '<p class="estado__texto">' + esc(d.texto) + '</p>' : '') + (d.accion || '') + '</div>';
    },
    /** El botón lleva data-reintentar: escuchá el click en tu bloque. Nunca muestres un cero en su lugar. */
    estadoError: function (datos) {
      var d = datos || {};
      return '<div class="estado estado--error" role="alert"><span class="estado__icono">' + icono('triangle-alert') + '</span><p class="estado__titulo">' + esc(d.titulo || 'No se pudo cargar') + '</p>' +
        '<p class="estado__texto">' + esc(d.texto || 'El resto de la pantalla sigue funcionando.') + '</p><button type="button" class="btn btn--secundario" data-reintentar>' + icono('refresh') + 'Reintentar</button></div>';
    }
  };

  /* ── Toast ───────────────────────────────────────────────────────── */
  function toast(texto, opciones) {
    var o = opciones || {}, zona = document.getElementById('toasts');
    if (!zona) return;
    cerrarToasts();   // uno solo a la vez: el nuevo reemplaza al anterior
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast__texto">' + esc(texto) + '</span>';
    if (o.accion) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'toast__accion'; b.textContent = o.accion;
      b.addEventListener('click', function () { cerrar(); if (o.alAccionar) o.alAccionar(); });
      el.appendChild(b);
    }
    function cerrar() { if (el.parentNode) el.parentNode.removeChild(el); }
    zona.appendChild(el);
    setTimeout(cerrar, o.ms || (o.accion ? 6000 : 3500));
    return el;
  }

  function cerrarToasts() { var zona = document.getElementById('toasts'); if (zona) zona.innerHTML = ''; }
  function esCelular() { return window.matchMedia('(max-width: 767.98px)').matches; }

  /* ── Hojas ───────────────────────────────────────────────────────── */
  var focoAnterior = {}, pilaHojas = [];   // la última que se abre queda arriba (por ejemplo «Posponer» sobre la campanita)
  function abrirHoja(id) {
    var h = document.getElementById(id); if (!h) { console.warn('[MQ] no existe la hoja #' + id); return; }
    if (!h.hidden) return;
    focoAnterior[id] = document.activeElement;
    if (esCelular()) cerrarToasts();   // en celular la hoja sale desde abajo: que ningún aviso tape sus botones
    pilaHojas.push(id);
    h.style.zIndex = String(60 + pilaHojas.length);
    h.hidden = false;
    var foco = h.querySelector('[data-foco]') || h.querySelector('.hoja__panel');
    if (foco) { if (!foco.hasAttribute('tabindex') && foco.classList.contains('hoja__panel')) foco.setAttribute('tabindex', '-1'); try { foco.focus({ preventScroll: true }); } catch (e) {} }
    h.dispatchEvent(new CustomEvent('hoja:abierta', { bubbles: true, detail: { id: id } }));
  }
  function cerrarHoja(id) {
    var h = typeof id === 'string' ? document.getElementById(id) : id; if (!h || h.hidden) return;
    h.hidden = true; h.style.zIndex = '';
    var pos = pilaHojas.indexOf(h.id); if (pos !== -1) pilaHojas.splice(pos, 1);
    var f = focoAnterior[h.id]; if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    h.dispatchEvent(new CustomEvent('hoja:cerrada', { bubbles: true, detail: { id: h.id } }));
  }
  function cerrarHojas() { var hs = document.querySelectorAll('.hoja:not([hidden])'); for (var i = 0; i < hs.length; i++) cerrarHoja(hs[i]); }
  function cerrarDesplegables(excepto) {
    var ps = document.querySelectorAll('.desplegable__panel:not([hidden])');
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] === excepto) continue;
      ps[i].hidden = true;
      var b = ps[i].parentNode.querySelector('[data-desplegable-btn]'); if (b) b.setAttribute('aria-expanded', 'false');
    }
  }

  /* ── Router por hash ─────────────────────────────────────────────── */
  var NAV_DE = { ficha: 'ficha' };
  function pantallaActual() { return (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0]; }
  function setTitulo(titulo, seccion) {
    var t = document.getElementById('titulo-pantalla'), s = document.getElementById('seccion-pantalla');
    if (t && titulo != null) { t.textContent = titulo; t.title = titulo; }
    if (s) { s.textContent = seccion || ''; s.hidden = !seccion; }
  }
  function navegar() {
    var nombre = pantallaActual(), secciones = document.querySelectorAll('section[data-screen]'), destino = null, i;
    for (i = 0; i < secciones.length; i++) if (secciones[i].getAttribute('data-screen') === nombre) destino = secciones[i];
    if (!destino) {
      for (i = 0; i < secciones.length; i++) if (secciones[i].getAttribute('data-screen') === 'inicio') destino = secciones[i];
      destino = destino || secciones[0];
      if (!destino) return;
      nombre = destino.getAttribute('data-screen');
    }
    for (i = 0; i < secciones.length; i++) secciones[i].hidden = secciones[i] !== destino;
    var enlaces = document.querySelectorAll('[data-nav]');
    for (i = 0; i < enlaces.length; i++) {
      if (enlaces[i].getAttribute('data-nav') === (NAV_DE[nombre] || nombre)) enlaces[i].setAttribute('aria-current', 'page'); else enlaces[i].removeAttribute('aria-current');
    }
    setTitulo(destino.getAttribute('data-titulo') || nombre, destino.getAttribute('data-seccion'));
    if (MQ.pantalla && MQ.pantalla !== nombre) cerrarToasts();   // un aviso no sigue a otra pantalla
    document.body.dataset.pantalla = nombre;
    document.body.classList.remove('menu-abierto');
    document.body.classList.toggle('con-fab', !!destino.querySelector('.fab'));
    cerrarHojas(); cerrarDesplegables();
    var cont = document.getElementById('contenido'); if (cont) cont.scrollTop = 0;
    MQ.pantalla = nombre;
    emit('pantalla', nombre);
    document.dispatchEvent(new CustomEvent('pantalla', { detail: { pantalla: nombre } }));
  }
  function ir(nombre) {
    var h = '#' + String(nombre).replace(/^#/, '');
    if (location.hash === h) navegar(); else location.hash = h;
  }
  /** Abre la ficha de un contacto (cambia MQ.contactoActualId, emite 'contacto' y navega a #ficha). */
  function abrirFicha(contactoId, opciones) {
    if (contacto(contactoId)) { MQ.contactoActualId = contactoId; emit('contacto', contactoId); }
    // opciones.registrar: la ficha se abre con «Registrar llamada» ya abierto (lo lee ficha.js al llegar)
    MQ.alLlegarAFicha = opciones && opciones.registrar ? 'llamada' : null;
    ir('ficha');
  }

  /* ── Rol ─────────────────────────────────────────────────────────── */
  function setRol(rol) {
    if (!USUARIOS[rol]) return;
    MQ.rol = rol;
    document.body.dataset.rol = rol;
    var u = USUARIOS[rol], b = document.getElementById('rol-btn');
    if (b) {
      b.querySelector('.avatar').textContent = fmt.iniciales(u.nombre);
      b.querySelector('strong').textContent = u.nombre;
      b.querySelector('.rol-btn__texto span').textContent = u.rolTexto;
      b.setAttribute('aria-label', 'Estás viendo como ' + u.rolTexto + ' (' + u.nombre + '). Cambiar de rol');
    }
    var ops = document.querySelectorAll('[data-rol-opcion]');
    for (var i = 0; i < ops.length; i++) ops[i].setAttribute('aria-checked', String(ops[i].getAttribute('data-rol-opcion') === rol));
    pintarCampanita();
    emit('rolchange', rol);
    document.dispatchEvent(new CustomEvent('rolchange', { detail: { rol: rol } }));
  }

  /* ── Campanita (solo el botón y su número; el panel es de la pantalla campanita) ── */
  function pintarCampanita() {
    var b = document.getElementById('btn-campanita'); if (!b) return;
    var n = avisos().length, num = b.querySelector('.campana__numero');
    num.hidden = n === 0;
    num.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', n === 0 ? 'Avisos: todo al día' : 'Avisos: ' + n + (n === 1 ? ' tarea para ahora' : ' tareas para ahora'));
  }

  /* ── Clicks delegados ────────────────────────────────────────────── */
  function alClick(e) {
    var t = e.target, el;

    // Desplegables
    el = t.closest('[data-desplegable-btn]');
    if (el) {
      var panel = el.parentNode.querySelector('.desplegable__panel'), abrir = panel.hidden;
      cerrarDesplegables(panel);
      panel.hidden = !abrir; el.setAttribute('aria-expanded', String(abrir));
      return;
    }
    if (!t.closest('.desplegable__panel') || t.closest('.desplegable__item:not([data-mantener])')) {
      // se cierra al elegir un ítem o al tocar afuera (después de procesar lo demás)
      setTimeout(cerrarDesplegables, 0);
    }

    el = t.closest('[data-rol-opcion]');
    if (el) { setRol(el.getAttribute('data-rol-opcion')); toast('Ahora ves la plataforma como ' + USUARIOS[MQ.rol].rolTexto.toLowerCase() + '.'); return; }

    el = t.closest('[data-menu-abrir]');
    if (el) {
      if (window.matchMedia('(min-width: 1024px)').matches) document.body.classList.toggle('menu-colapsado');
      else document.body.classList.add('menu-abierto');
      return;
    }
    if (t.closest('[data-menu-cerrar]')) { document.body.classList.remove('menu-abierto'); return; }

    el = t.closest('#btn-campanita');
    if (el) { if (tieneOyentes('campanita')) emit('campanita'); else ir('tareas'); return; }

    el = t.closest('[data-abrir-hoja]');
    if (el) { e.preventDefault(); abrirHoja(el.getAttribute('data-abrir-hoja')); return; }
    el = t.closest('[data-cerrar-hoja]');
    if (el) { cerrarHoja(el.closest('.hoja')); return; }

    el = t.closest('[data-contacto]');
    if (el && el.tagName !== 'SECTION') { e.preventDefault(); abrirFicha(el.getAttribute('data-contacto'), { registrar: el.hasAttribute('data-registrar') }); return; }

    el = t.closest('[data-ir]');
    if (el) { e.preventDefault(); ir(el.getAttribute('data-ir')); return; }

    el = t.closest('[data-toast]');
    if (el) { e.preventDefault(); document.body.classList.remove('menu-abierto'); toast(el.getAttribute('data-toast')); return; }

    // Pestañas
    el = t.closest('[role="tab"]');
    if (el && el.closest('[role="tablist"]')) { elegirPestana(el); return; }

    // Filtros excluyentes
    el = t.closest('.filtro');
    if (el && el.closest('.filtros')) {
      var hermanos = el.closest('.filtros').querySelectorAll('.filtro');
      for (var i = 0; i < hermanos.length; i++) hermanos[i].setAttribute('aria-pressed', String(hermanos[i] === el));
      el.dispatchEvent(new CustomEvent('filtro', { bubbles: true, detail: { valor: el.getAttribute('data-valor') } }));
      return;
    }

    // Fecha relativa ⇄ exacta
    el = t.closest('.fecha');
    if (el) { alternarFecha(el); return; }
    // En pantallas táctiles, toda la fila (el evento de la línea de tiempo, o un bloque marcado con data-fecha-fila)
    // sirve para ver la fecha exacta: la fecha sola es un blanco demasiado chico para el dedo.
    if (window.matchMedia('(max-width: 767.98px), (pointer: coarse)').matches && !t.closest('a, button, input, select, textarea, label, summary')) {
      el = t.closest('.evento, [data-fecha-fila]');
      if (el) { var fs = el.querySelectorAll('.fecha'); for (var k = 0; k < fs.length; k++) alternarFecha(fs[k]); if (fs.length) return; }
    }

    // Enlace del menú o de la barra de abajo hacia la pantalla en la que ya estás
    el = t.closest('a[href^="#"]');
    if (el && el.getAttribute('href') === location.hash) navegar();
  }
  function alternarFecha(el) {
    var exacta = el.getAttribute('data-exacta'), rel = el.getAttribute('data-relativa');
    el.textContent = el.textContent === exacta ? rel : exacta;
  }
  function elegirPestana(tab) {
    var lista = tab.closest('[role="tablist"]'), tabs = lista.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var activa = tabs[i] === tab, p = document.getElementById(tabs[i].getAttribute('aria-controls'));
      tabs[i].setAttribute('aria-selected', String(activa));
      tabs[i].tabIndex = activa ? 0 : -1;
      if (p) p.hidden = !activa;
    }
    lista.dispatchEvent(new CustomEvent('pestana', { bubbles: true, detail: { id: tab.getAttribute('aria-controls'), pestana: tab } }));
  }
  function alCambiar(e) {
    var el = e.target.closest && e.target.closest('[data-completar]');
    if (!el) return;
    var id = el.getAttribute('data-completar'), t = tarea(id); if (!t) return;
    if (el.checked) {
      var fila = el.closest('.tarea'); if (fila) fila.classList.add('tarea--hecha');
      // un instante para que se vea el tilde antes de que la lista se vuelva a dibujar
      setTimeout(function () {
        completarTarea(id);
        toast('Tarea completada', { accion: 'Deshacer', alAccionar: function () { reabrirTarea(id); } });
      }, 350);
    } else { reabrirTarea(id); }
  }
  function alTeclear(e) {
    if (e.key === 'Escape') {
      if (document.querySelector('.desplegable__panel:not([hidden])')) { cerrarDesplegables(); return; }
      var hs = document.querySelectorAll('.hoja:not([hidden])');
      if (hs.length) { cerrarHoja(pilaHojas.length ? pilaHojas[pilaHojas.length - 1] : hs[hs.length - 1]); return; }
      document.body.classList.remove('menu-abierto');
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('fecha')) { e.preventDefault(); alternarFecha(e.target); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.getAttribute && e.target.getAttribute('role') === 'tab') {
      var tabs = Array.prototype.slice.call(e.target.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
      var sig = tabs[(tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      sig.focus(); elegirPestana(sig);
    }
  }

  /* ── API pública ─────────────────────────────────────────────────── */
  var MQ = window.MQ = {
    rol: 'coordinadora', pantalla: null, contactoActualId: 'c1', alLlegarAFicha: null,
    contactos: contactos, tareas: tareas, actividad: actividad, tasaciones: tasaciones,
    USUARIOS: USUARIOS, RESULTADOS: RESULTADOS, ETAPAS: ETAPAS, TIPOS_EVENTO: TIPOS_EVENTO, TIPOS_TAREA: TIPOS_TAREA, TIPOS_ELEGIBLES: TIPOS_ELEGIBLES,
    on: on, emit: emit,
    ahora: ahora, iso: iso, dia: dia, siguienteDiaHabil: siguienteDiaHabil, fmt: fmt, ui: ui,
    usuario: usuario, nombreDe: nombreDe, contacto: contacto, contactoActual: function () { return contacto(MQ.contactoActualId); },
    tarea: tarea, actividadDe: actividadDe, tareasDe: tareasDe, misTareas: misTareas, grupoDeTarea: grupoDeTarea, yaVencio: yaVencio, avisos: avisos,
    llamadasDe: llamadasDe, diasSinContacto: diasSinContacto, cadenciaDe: cadenciaDe,
    crearTarea: crearTarea, completarTarea: completarTarea, reabrirTarea: reabrirTarea, posponerTarea: posponerTarea,
    agregarNota: agregarNota, registrarLlamada: registrarLlamada, registrarWhatsapp: registrarWhatsapp,
    setRol: setRol, ir: ir, abrirFicha: abrirFicha, setTitulo: setTitulo,
    abrirHoja: abrirHoja, cerrarHoja: cerrarHoja, toast: toast, cerrarToasts: cerrarToasts
  };
  window.abrirHoja = abrirHoja; window.cerrarHoja = cerrarHoja; window.toast = toast;

  on('tareas', pintarCampanita);
  document.addEventListener('click', alClick);
  document.addEventListener('change', alCambiar);
  document.addEventListener('keydown', alTeclear);
  window.addEventListener('hashchange', navegar);

  function arrancar() {
    hidratar(document);
    setRol(MQ.rol);
    navegar();
  }
  // Los JS de las pantallas se cargan después de este archivo y antes de arrancar():
  // llegan a suscribirse a 'pantalla', 'rolchange', 'tareas', 'actividad' y 'contacto'.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else setTimeout(arrancar, 0);
})();
