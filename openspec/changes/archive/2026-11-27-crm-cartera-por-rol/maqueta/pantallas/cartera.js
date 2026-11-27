/* CRM por rol y Contactos: datos de ejemplo, reglas de la fila (último contacto / próximo paso) y las vistas */
(function () {
  'use strict';
  var MQ = window.MQ, ui = MQ.ui, fmt = MQ.fmt, esc = ui.esc, ic = ui.icono;

  // Sin pantalla en la dirección, la maqueta abre en el índice.
  if (!location.hash) history.replaceState(null, '', '#indice');

  /* ── Catálogos (los nombres de etapa son los de la plataforma: crm-stages.ts) ───────────── */
  var ET = MQ.ETAPAS;
  ET.solicitud = 'Solicitud'; ET.agendada = 'Coordinada'; ET.visita = 'Realizada'; ET.entregada = 'Entregada';
  ET.captada = 'Captada'; ET.perdida = 'Descartado'; ET.no_realizada = 'No realizada'; ET.seguimiento = 'Seguimiento';
  ET.clase_gratuita = 'Clase gratuita'; ET.comprador = 'Comprador';
  var EMBUDO = ['solicitud', 'agendada', 'no_realizada', 'visita', 'entregada', 'seguimiento'];
  var FUERA = ['clase_gratuita', 'comprador'];
  var CERRADAS = ['captada', 'perdida'];
  var ASESORES = { tomas: 'Tomás Agüero', florencia: 'Florencia Ledesma', martin: 'Martín Ocampo' };
  var ORIGENES = { embudo: 'Embudo', referido: 'Referido', historico: 'Histórico' };
  var PERIODOS = [['', 'Cualquier fecha'], ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', 'Últimos 7 días'], ['15', 'Últimos 15 días'],
    ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['elegir', 'Elegir fechas…']];
  var SIN_MOVIMIENTO_DIAS = 14;

  /* ── Totales de ejemplo (los de la pantalla que vio el dueño: 984 procesos) ──────────────── */
  var TOTALES = {
    coordinacion: { solicitud: 185, agendada: 15, no_realizada: 7, perdida: 358 },
    tomas:     { comprador: 2, agendada: 4, no_realizada: 2, visita: 7, entregada: 8, seguimiento: 34, captada: 7, perdida: 41 },
    florencia: { comprador: 2, agendada: 5, no_realizada: 2, visita: 6, entregada: 6, seguimiento: 30, captada: 6, perdida: 38 },
    martin:    { comprador: 2, agendada: 4, no_realizada: 3, visita: 6, entregada: 5, seguimiento: 33, captada: 6, perdida: 35 },
    dueno: { solicitud: 185, agendada: 15, no_realizada: 7, visita: 21, entregada: 21, seguimiento: 100, clase_gratuita: 138, comprador: 6, captada: 19, perdida: 472 }
  };
  var TRABADO = { sinAsesor: 9, sinMovimiento: 61, seguimientos: 100 };
  var CONTACTOS_TOTAL = { equipo: { abiertos: 478, cerrados: 704 }, tomas: { abiertos: 56, cerrados: 46 }, florencia: { abiertos: 50, cerrados: 41 }, martin: { abiertos: 52, cerrados: 39 } };

  /* ── Datos de ejemplo: se suman al store de la maqueta aprobada, así la ficha los abre ──── */
  var dia = MQ.dia, orden = 5000, nt = 0;
  function sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function A(cid, tipo, titulo, fecha, autor, extra) {
    var a = { id: 'ax' + (++orden), contactoId: cid, tipo: tipo, titulo: titulo, detalle: null, autor: autor || null, fecha: fecha, orden: orden };
    for (var k in (extra || {})) a[k] = extra[k];
    MQ.actividad.push(a); return a;
  }
  function T(titulo, tipo, cid, vence, quien, extra) {
    var t = { id: 'tx' + (++nt), titulo: titulo, tipo: tipo, contactoId: cid, vence: vence, todoElDia: false, asignadaA: quien,
      estado: 'pendiente', automatica: false, creada: dia(-1, '09:00'), completada: null };
    for (var k in (extra || {})) t[k] = extra[k];
    MQ.tareas.push(t); return t;
  }
  var ORIGEN_TXT = { embudo: 'Embudo · Tasación', clase: 'Embudo · Clase gratuita', referido: 'Referido', historico: 'Histórico' };
  var REGISTRO_TXT = { embudo: 'Se registró · Solicitud de tasación', clase: 'Se registró · Clase gratuita para propietarios',
    referido: 'Contacto cargado a mano · Referido', historico: 'Importado del sistema anterior' };
  function C(o) {
    var c = { id: o.id, nombre: o.nombre, telefono: o.tel, email: sinTildes(o.nombre).replace(/\s+/g, '.') + '@ejemplo.com', etapa: o.etapa,
      origen: ORIGEN_TXT[o.origen], campana: o.origen === 'embudo' ? 'Anuncio de Meta «Tasación sin vueltas»' : null,
      asesor: o.asesor ? ASESORES[o.asesor] : null, asignadoA: o.asesor || 'paula', asesorId: o.asesor || null,
      barrio: o.barrio, tipoPropiedad: o.tipo, ambientes: o.amb, direccion: o.dir, background: o.bg || '', creado: o.creado,
      cerrado: o.cerrado || null, motivo: o.motivo || null };
    MQ.contactos.push(c);
    A(c.id, 'registro', REGISTRO_TXT[o.origen], o.creado, o.origen === 'referido' ? 'Paula' : null,
      { detalle: c.tipoPropiedad ? c.tipoPropiedad + ' ' + c.ambientes + ' ambientes en ' + c.barrio : null });
    return c;
  }
  function llamada(cid, fecha, resultado, autor, detalle) { return A(cid, 'llamada', 'Llamada', fecha, autor, { resultado: resultado, intento: 1, detalle: detalle || null }); }
  function visita(cid, fecha, autor) { return A(cid, 'tasacion', 'Visita de tasación hecha', fecha, autor, { contacto: true }); }
  function etapa(cid, texto, fecha, autor) { return A(cid, 'etapa', texto, fecha, autor); }

  // Los 11 de la maqueta aprobada: se les agrega asesor y origen en el formato de esta pantalla.
  ['c6', 'c10', 'c11'].forEach(function (id) { MQ.contacto(id).asesorId = 'tomas'; });
  var hugo = MQ.contacto('c8'); hugo.cerrado = dia(-7, '09:27'); hugo.motivo = 'No le interesa';

  // Solicitudes
  C({ id: 'x3', nombre: 'Ramiro Echeverría', tel: '11 5555-0148', etapa: 'solicitud', origen: 'embudo', barrio: 'Villa del Parque', tipo: 'Departamento', amb: 3, dir: 'Cuenca 2980', creado: dia(-3, '19:40') });
  llamada('x3', dia(-1, '17:10'), 'volver', 'Paula', 'Está de viaje. Pidió que lo llamen el jueves a la mañana.');
  T('Llamar a Ramiro Echeverría', 'llamada', 'x3', dia(1, '10:00'), 'paula');
  C({ id: 'x4', nombre: 'Sofía Lanús', tel: '11 5555-0152', etapa: 'solicitud', origen: 'referido', barrio: 'Colegiales', tipo: 'PH', amb: 4, dir: 'Conesa 1250', creado: dia(-1, '15:00'), bg: 'La recomendó un cliente de Villa Crespo.' });
  llamada('x4', dia(0, '09:30'), 'no_atendio', 'Paula');
  T('Llamada 2 a Sofía Lanús', 'llamada', 'x4', dia(1, '09:00'), 'paula', { automatica: true });
  // Coordinadas
  C({ id: 'x1', nombre: 'Claudio Benavídez', tel: '11 5555-0113', etapa: 'agendada', origen: 'embudo', asesor: 'florencia', barrio: 'Almagro', tipo: 'Departamento', amb: 2, dir: 'Av. Corrientes 4820', creado: dia(-5, '12:00') });
  llamada('x1', dia(-3, '11:20'), 'agendo', 'Paula');
  etapa('x1', 'Pasó de Solicitud a Coordinada', dia(-3, '11:25'), 'Paula');
  MQ.tasaciones.push({ id: 'tax1', contactoId: 'x1', direccion: 'Av. Corrientes 4820, Almagro', fecha: dia(0, '15:30'), asesor: ASESORES.florencia });
  C({ id: 'x9', nombre: 'Hernán Quintana', tel: '11 5555-0177', etapa: 'agendada', origen: 'embudo', asesor: 'tomas', barrio: 'Belgrano', tipo: 'Departamento', amb: 3, dir: 'Av. Cabildo 2780', creado: dia(-6, '21:15') });
  llamada('x9', dia(-4, '10:05'), 'agendo', 'Paula');
  etapa('x9', 'Pasó de Solicitud a Coordinada', dia(-4, '10:08'), 'Paula');
  MQ.tasaciones.push({ id: 'tax9', contactoId: 'x9', direccion: 'Av. Cabildo 2780, Belgrano', fecha: dia(0, '12:30'), asesor: ASESORES.tomas });
  C({ id: 'x5', nombre: 'Adrián Pellegrini', tel: '11 5555-0121', etapa: 'agendada', origen: 'embudo', asesor: 'martin', barrio: 'Belgrano', tipo: 'Casa', amb: 4, dir: 'Juramento 1650', creado: dia(-2, '22:30') });
  llamada('x5', dia(-1, '11:40'), 'agendo', 'Paula');
  MQ.tasaciones.push({ id: 'tax5', contactoId: 'x5', direccion: 'Juramento 1650, Belgrano', fecha: dia(2, '10:00'), asesor: ASESORES.martin });
  // No realizada
  C({ id: 'x2', nombre: 'Valeria Ruggiero', tel: '11 5555-0139', etapa: 'no_realizada', origen: 'embudo', asesor: 'martin', barrio: 'Caballito', tipo: 'Departamento', amb: 3, dir: 'Rosario 455', creado: dia(-9, '13:30') });
  llamada('x2', dia(-8, '09:50'), 'agendo', 'Paula');
  etapa('x2', 'Pasó de Coordinada a No realizada', dia(-1, '17:40'), 'Martín Ocampo');
  T('Volver a coordinar con Valeria Ruggiero', 'llamada', 'x2', dia(0, '12:00'), 'paula');
  // Del asesor Tomás
  T('Entregar la tasación a Mirta Sosa', 'documentacion', 'c10', dia(-1, '18:00'), 'tomas');
  visita('c10', dia(-4, '12:30'), 'Tomás Agüero');
  T('Llamar a Jorge Altamirano por la tasación', 'llamada', 'c11', dia(0, '12:00'), 'tomas');
  C({ id: 'x8', nombre: 'Liliana Gauna', tel: '11 5555-0166', etapa: 'entregada', origen: 'embudo', asesor: 'tomas', barrio: 'Villa Devoto', tipo: 'Casa', amb: 4, dir: 'Nueva York 4120', creado: dia(-18, '10:30') });
  visita('x8', dia(-9, '16:00'), 'Tomás Agüero');
  etapa('x8', 'Pasó de Realizada a Entregada', dia(-2, '18:30'), 'Tomás Agüero');
  T('Llamar a Liliana Gauna', 'llamada', 'x8', dia(1, '10:30'), 'tomas');
  C({ id: 'x6', nombre: 'Inés Carrizo', tel: '11 5555-0187', etapa: 'seguimiento', origen: 'embudo', asesor: 'tomas', barrio: 'Palermo', tipo: 'Departamento', amb: 3, dir: 'Thames 1840', creado: dia(-40, '09:10') });
  llamada('x6', dia(-9, '11:00'), 'volver', 'Tomás Agüero', 'Decide en diciembre, cuando cobre el aguinaldo el marido.');
  T('Llamar a Inés Carrizo', 'llamada', 'x6', dia(8, '10:00'), 'tomas');
  C({ id: 'x11', nombre: 'Pablo Ibarra', tel: '11 5555-0103', etapa: 'seguimiento', origen: 'referido', asesor: 'tomas', barrio: 'Coghlan', tipo: 'PH', amb: 3, dir: 'Washington 3150', creado: dia(-35, '16:20') });
  llamada('x11', dia(-10, '12:15'), 'volver', 'Tomás Agüero', 'Quiere ver comparables de la zona antes de decidir.');
  T('Mandarle comparables a Pablo Ibarra', 'whatsapp', 'x11', dia(-3, '12:00'), 'tomas');
  C({ id: 'x7', nombre: 'Federico Montes de Oca', tel: '11 5555-0195', etapa: 'seguimiento', origen: 'embudo', asesor: 'tomas', barrio: 'Villa Urquiza', tipo: 'Departamento', amb: 2, dir: 'Av. Triunvirato 4410', creado: dia(-60, '18:00') });
  llamada('x7', dia(-22, '10:40'), 'volver', 'Tomás Agüero');
  C({ id: 'x10', nombre: 'Carolina Rivas', tel: '11 5555-0111', etapa: 'seguimiento', origen: 'embudo', asesor: 'tomas', barrio: 'Saavedra', tipo: 'Casa', amb: 3, dir: 'Pinto 3920', creado: dia(-70, '11:45') });
  llamada('x10', dia(-31, '15:30'), 'volver', 'Tomás Agüero');
  // De Florencia y Martín
  C({ id: 'x15', nombre: 'Ricardo Funes', tel: '11 5555-0158', etapa: 'entregada', origen: 'embudo', asesor: 'florencia', barrio: 'Boedo', tipo: 'PH', amb: 3, dir: 'Carlos Calvo 3640', creado: dia(-21, '10:00') });
  visita('x15', dia(-11, '11:00'), 'Florencia Ledesma');
  T('Llamar a Ricardo Funes', 'llamada', 'x15', dia(0, '17:00'), 'florencia');
  C({ id: 'x14', nombre: 'Mariana Vidal', tel: '11 5555-0124', etapa: 'seguimiento', origen: 'embudo', asesor: 'florencia', barrio: 'Flores', tipo: 'Departamento', amb: 2, dir: 'Av. Rivadavia 7020', creado: dia(-80, '09:00') });
  llamada('x14', dia(-40, '10:10'), 'volver', 'Florencia Ledesma');
  C({ id: 'x16', nombre: 'Lucía Benedetti', tel: '11 5555-0132', etapa: 'seguimiento', origen: 'referido', asesor: 'martin', barrio: 'Núñez', tipo: 'Departamento', amb: 4, dir: 'Av. del Libertador 7650', creado: dia(-55, '17:30') });
  llamada('x16', dia(-25, '12:00'), 'volver', 'Martín Ocampo');
  // Sin asesor después de la solicitud (importados)
  C({ id: 'x17', nombre: 'Roberto Sanz', tel: '11 5555-0146', etapa: 'visita', origen: 'historico', barrio: 'Parque Patricios', tipo: 'Casa', amb: 3, dir: 'Caseros 2840', creado: dia(-30, '10:00') });
  visita('x17', dia(-6, '10:30'), null);
  C({ id: 'x18', nombre: 'Graciela Pinto', tel: '11 5555-0169', etapa: 'seguimiento', origen: 'historico', barrio: 'Villa Crespo', tipo: 'Departamento', amb: 2, dir: 'Thames 640', creado: dia(-90, '10:00') });
  llamada('x18', dia(-18, '16:45'), 'volver', 'Paula');
  // Fuera del embudo de tasación
  C({ id: 'x19', nombre: 'Daniela Spinetta', tel: '11 5555-0181', etapa: 'clase_gratuita', origen: 'clase', barrio: 'Villa Luro', tipo: 'Casa', amb: 4, dir: 'Ramón Falcón 5520', creado: dia(-2, '20:30') });
  C({ id: 'x20', nombre: 'Marcos Albornoz', tel: '11 5555-0119', etapa: 'clase_gratuita', origen: 'clase', barrio: 'Balvanera', tipo: 'Departamento', amb: 2, dir: 'Av. Belgrano 2810', creado: dia(-5, '19:10') });
  C({ id: 'x21', nombre: 'Esteban Lugones', tel: '11 5555-0174', etapa: 'comprador', origen: 'referido', asesor: 'martin', barrio: 'Palermo', tipo: 'Departamento', amb: 3, dir: 'Busca en Palermo', creado: dia(-12, '12:00') });
  llamada('x21', dia(-2, '18:00'), 'volver', 'Martín Ocampo', 'Busca 3 ambientes con balcón, hasta USD 180.000.');
  T('Mandarle opciones a Esteban Lugones', 'whatsapp', 'x21', dia(1, '11:00'), 'martin');
  // Cerrados
  C({ id: 'x12', nombre: 'Alicia Moreno', tel: '11 5555-0127', etapa: 'captada', origen: 'embudo', asesor: 'tomas', barrio: 'Caballito', tipo: 'Departamento', amb: 3, dir: 'Av. La Plata 640', creado: dia(-50, '10:00'), cerrado: dia(-12, '17:00'), motivo: 'Firmó la autorización de venta' });
  C({ id: 'x13', nombre: 'Osvaldo Ríos', tel: '11 5555-0161', etapa: 'perdida', origen: 'embudo', asesor: 'tomas', barrio: 'Mataderos', tipo: 'Casa', amb: 4, dir: 'Larrazábal 1320', creado: dia(-45, '14:00'), cerrado: dia(-5, '11:15'), motivo: 'Vendió con otra inmobiliaria' });
  C({ id: 'x22', nombre: 'Beatriz Olmedo', tel: '11 5555-0145', etapa: 'captada', origen: 'embudo', asesor: 'florencia', barrio: 'Villa Ortúzar', tipo: 'PH', amb: 3, dir: 'Giribone 1180', creado: dia(-38, '09:30'), cerrado: dia(-3, '16:40'), motivo: 'Firmó la autorización de venta' });

  llamada('x12', dia(-45, '10:00'), 'agendo', 'Paula'); visita('x12', dia(-30, '11:00'), 'Tomás Agüero'); llamada('x12', dia(-13, '18:20'), 'volver', 'Tomás Agüero', 'Acepta el precio. Firma mañana.');
  llamada('x13', dia(-40, '09:40'), 'agendo', 'Paula'); visita('x13', dia(-33, '15:00'), 'Tomás Agüero'); llamada('x13', dia(-5, '11:10'), 'no_interesa', 'Tomás Agüero', 'Vendió con otra inmobiliaria.');
  llamada('x22', dia(-36, '10:15'), 'agendo', 'Paula'); visita('x22', dia(-25, '12:00'), 'Florencia Ledesma');

  /** Los eventos de etapa de la maqueta aprobada traen los nombres viejos escritos a mano: se pasan a los de la plataforma. */
  var VIEJOS = [['Solicitud de tasación', 'Solicitud'], ['Tasación agendada', 'Coordinada'], ['Visita realizada', 'Realizada'], ['Tasación entregada', 'Entregada'], [' a Perdida', ' a Descartado']];
  function nombresDeEtapa() {
    MQ.actividad.forEach(function (a) {
      if (a.tipo !== 'etapa') return;
      VIEJOS.forEach(function (x) { a.titulo = a.titulo.split(x[0]).join(x[1]); });
    });
  }
  nombresDeEtapa();

  /* ── Reglas de la fila (en la plataforma: lib/crm/cartera.ts, las mismas que usa el Inicio) ── */
  function soloDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diasEntre(a, b) { return Math.round((soloDia(b) - soloDia(a)) / 86400000); }
  function hace(fecha) { return diasEntre(new Date(fecha), MQ.ahora()); }
  function abierto(c) { return CERRADAS.indexOf(c.etapa) === -1; }
  function origenDe(c) { var o = sinTildes(c.origen); return o.indexOf('embudo') === 0 ? 'embudo' : o.indexOf('referido') === 0 ? 'referido' : 'historico'; }
  function contactos(c) { return MQ.actividadDe(c.id).filter(function (a) { return a.tipo === 'llamada' || (a.tipo === 'whatsapp' && a.origen === 'manual') || a.contacto; }); }

  /** Último contacto = la última llamada, WhatsApp marcado o visita. Una nota interna no cuenta. */
  function ultimo(c) {
    var a = contactos(c)[0]; if (!a) return null;
    var texto = a.tipo === 'llamada' ? 'Llamada · ' + MQ.RESULTADOS[a.resultado].corto.toLowerCase() : a.tipo === 'whatsapp' ? 'WhatsApp enviado' : 'Visita de tasación';
    return { fecha: a.fecha, texto: texto, quien: a.autor };
  }
  function tituloCorto(t, c) {
    if (t.tipo === 'llamada' && !contactos(c).length) return 'Primera llamada';
    return t.titulo.replace(' a ' + c.nombre, '').replace(' con ' + c.nombre, '').replace(' de ' + c.nombre, '');
  }
  function capital(s) { return /^(hoy|mañana)/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function haceTxt(f) { var d = hace(f); return d >= 7 ? 'hace ' + d + ' días' : fmt.relativa(f); }
  /** Próximo paso = lo primero que vence: una tarea pendiente o una tasación agendada. persona: de quién mirar las tareas (null = de todos). */
  function proximo(c, persona) {
    var ahora = MQ.ahora();
    var tas = MQ.tasaciones.filter(function (t) { return t.contactoId === c.id && new Date(t.fecha) >= ahora && (!persona || persona === 'paula' || t.asesor === ASESORES[persona]); });
    var tieneTas = MQ.tasaciones.some(function (t) { return t.contactoId === c.id; });
    var ts = MQ.tareasDe(c.id).filter(function (t) { return (!persona || t.asignadaA === persona) && !(t.tipo === 'tasacion' && tieneTas); });
    var cand = ts.filter(function (t) { return t.vence; }).map(function (t) { return { f: t.vence, t: t }; })
      .concat(tas.map(function (t) { return { f: t.fecha, tas: t }; }))
      .sort(function (a, b) { return a.f < b.f ? -1 : 1; });
    var x = cand[0] || (ts[0] ? { t: ts[0] } : null);
    if (!x) return null;
    if (x.tas) {
      var dd = diasEntre(ahora, new Date(x.tas.fecha));
      return { clase: 'tasacion', titulo: 'Tasación', quien: persona && persona !== 'paula' ? null : x.tas.asesor, tasacion: x.tas,
        cuando: capital(fmt.relativa(x.tas.fecha)), estado: dd === 0 ? 'hoy' : 'proxima', fecha: x.tas.fecha, icono: 'calendar-check' };
    }
    var v = fmt.vencimiento(x.t);
    return { clase: 'tarea', titulo: tituloCorto(x.t, c), cuando: v.texto, estado: v.estado, espera: !!v.espera, fecha: x.t.vence,
      quien: persona ? null : (MQ.nombreDe(x.t.asignadaA) === x.t.asignadaA ? ASESORES[x.t.asignadaA] : MQ.nombreDe(x.t.asignadaA)),
      icono: v.estado === 'vencida' ? (v.espera ? 'clock' : 'triangle-alert') : v.estado === 'hoy' ? 'clock' : 'calendar' };
  }
  function tasacionCerca(c, persona) {
    return MQ.tasaciones.filter(function (t) {
      var d = diasEntre(MQ.ahora(), new Date(t.fecha));
      return t.contactoId === c.id && new Date(t.fecha) >= MQ.ahora() && d <= 1 && (!persona || t.asesor === ASESORES[persona]);
    })[0] || null;
  }
  /** Horas hábiles (lunes a viernes, 9 a 18) entre dos fechas, en minutos. */
  function minutosHabiles(desde, hasta) {
    var m = 0, d = new Date(desde);
    while (d < hasta) {
      var dow = d.getDay(), h = d.getHours();
      if (dow > 0 && dow < 6 && h >= 9 && h < 18) m += 1;
      d = new Date(d.getTime() + 60000);
    }
    return m;
  }
  function espera(c) {
    var reloj = Math.round((MQ.ahora() - new Date(c.creado)) / 60000), habiles = minutosHabiles(new Date(c.creado), MQ.ahora());
    return reloj === habiles ? 'Espera hace ' + fmt.duracion(reloj) : 'Espera hace ' + fmt.duracion(reloj) + ' de reloj · ' + fmt.duracion(habiles) + ' hábiles';
  }
  function diasSinContacto(c) { var u = ultimo(c); return u ? hace(u.fecha) : null; }
  function sinMovimiento(c) { var d = diasSinContacto(c); return c.etapa === 'seguimiento' && (d === null || d >= SIN_MOVIMIENTO_DIAS); }
  function sinAsesor(c) { return abierto(c) && EMBUDO.indexOf(c.etapa) > 0 && !c.asesorId; }
  function sinPrimerContacto(c) { return c.etapa === 'solicitud' && !contactos(c).length; }

  /* ── Estado de cada pantalla ──────────────────────────────────────────────────────────────── */
  var PANTALLAS = {
    'crm-coordinacion': { tipo: 'crm', vista: 'coordinacion', rol: 'coordinadora' },
    'crm-asesor': { tipo: 'crm', vista: 'asesor', asesor: 'tomas', rol: 'asesor' },
    'crm-dueno': { tipo: 'crm', vista: 'dueno', rol: 'admin' },
    'contactos-equipo': { tipo: 'contactos', vista: 'equipo', rol: null },
    'contactos-asesor': { tipo: 'contactos', vista: 'asesor', asesor: 'tomas', rol: 'asesor' }
  };
  var estados = {};
  function estadoDe(p) { return estados[p] || (estados[p] = { seg: 'abiertos', etapa: '', origen: '', asesor: '', periodo: '', desde: '', hasta: '', q: '', orden: 'proximo', verComo: 'yo', trabado: '', mostrar: 0 }); }
  /** Vista efectiva: la del dueño puede mostrar la de otra persona («Ver como»). */
  function vistaDe(p) {
    var cfg = PANTALLAS[p], st = estadoDe(p);
    if (cfg.vista === 'dueno' && st.verComo !== 'yo') return st.verComo === 'coordinacion' ? { tipo: 'crm', vista: 'coordinacion' } : { tipo: 'crm', vista: 'asesor', asesor: st.verComo };
    return cfg;
  }
  function personaDe(v) { return v.vista === 'coordinacion' ? 'paula' : v.vista === 'asesor' ? v.asesor : null; }

  function carteraDe(v) {
    return MQ.contactos.filter(function (c) {
      if (v.vista === 'coordinacion') return ['solicitud', 'agendada', 'no_realizada'].indexOf(c.etapa) !== -1 || (c.etapa === 'perdida' && !c.asesorId);
      if (v.vista === 'asesor') return c.asesorId === v.asesor;
      return true;
    });
  }
  function enPeriodo(c, st) {
    if (!st.periodo) return true;
    var d = hace(c.creado);
    if (st.periodo === 'hoy') return d === 0;
    if (st.periodo === 'ayer') return d === 1;
    if (st.periodo === 'rango') { var f = c.creado.slice(0, 10); return (!st.desde || f >= st.desde) && (!st.hasta || f <= st.hasta); }
    return d < Number(st.periodo);
  }
  function coincide(c, q) {
    if (!q) return true;
    var t = sinTildes([c.nombre, c.telefono, c.telefono.replace(/\D/g, ''), c.direccion, c.barrio, c.email].join(' '));
    return sinTildes(q).trim().split(/\s+/).every(function (p) { return t.indexOf(p) !== -1; });
  }
  function filtrar(lista, st, cerrados) {
    return lista.filter(function (c) {
      if (cerrados ? abierto(c) : !abierto(c)) return false;
      if (st.etapa && c.etapa !== st.etapa) return false;
      if (st.origen && origenDe(c) !== st.origen) return false;
      if (st.asesor === 'sin' && c.asesorId) return false;
      if (st.asesor && st.asesor !== 'sin' && c.asesorId !== st.asesor) return false;
      if (st.trabado === 'sin-contacto' && !sinPrimerContacto(c)) return false;
      if (st.trabado === 'sin-asesor' && !sinAsesor(c)) return false;
      if (st.trabado === 'sin-movimiento' && !sinMovimiento(c)) return false;
      return enPeriodo(c, st) && coincide(c, st.q);
    });
  }
  function cuantosFiltros(st) { return ['etapa', 'origen', 'asesor', 'periodo', 'trabado'].filter(function (k) { return st[k]; }).length + (st.q ? 1 : 0); }
  function porProximo(persona) {
    return function (a, b) {
      var pa = proximo(a, persona), pb = proximo(b, persona);
      var ra = pa ? (pa.estado === 'vencida' ? 0 : 1) : 2, rb = pb ? (pb.estado === 'vencida' ? 0 : 1) : 2;
      if (ra !== rb) return ra - rb;
      var fa = (pa && pa.fecha) || '9999', fb = (pb && pb.fecha) || '9999';
      if (fa !== fb) return fa < fb ? -1 : 1;
      var ua = (ultimo(a) || {}).fecha || '', ub = (ultimo(b) || {}).fecha || '';
      return ua < ub ? -1 : ua > ub ? 1 : 0;   // sin nada pendiente: primero el que lleva más tiempo sin contacto
    };
  }
  function ordenar(lista, st, persona) {
    var cmp = st.orden === 'ultimo' ? function (a, b) { var x = (ultimo(a) || {}).fecha || '', y = (ultimo(b) || {}).fecha || ''; return x < y ? -1 : x > y ? 1 : 0; }
      : st.orden === 'nuevos' ? function (a, b) { return a.creado < b.creado ? 1 : -1; }
      : st.orden === 'nombre' ? function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }
      : porProximo(persona);
    return lista.slice().sort(cmp);
  }

  /* ── Grupos de cada vista ─────────────────────────────────────────────────────────────────── */
  function grupos(v, lista) {
    var persona = personaDe(v), usados = {}, out = [];
    function g(clave, titulo, texto, prueba, extra) {
      var items = lista.filter(function (c) { return !usados[c.id] && prueba(c); });
      items.forEach(function (c) { usados[c.id] = true; });
      out.push({ clave: clave, titulo: titulo, texto: texto, items: items, extra: extra || {} });
    }
    if (v.vista === 'coordinacion') {
      g('sin-contacto', 'Sin primer contacto', 'Nadie las llamó todavía. Primero la que más espera.', sinPrimerContacto, { orden: 'espera' });
      g('vencidas', 'Llamada o mensaje vencido', 'Tenían una tarea para antes de ahora.', function (c) { var p = proximo(c, persona); return p && p.estado === 'vencida'; });
      g('tasaciones', 'Tasaciones de hoy y mañana', 'Para confirmar el horario con la persona y con el asesor.', function (c) { return !!tasacionCerca(c); }, { tasacion: true });
      g('resto', 'El resto de las solicitudes y coordinadas', 'Ordenadas por el próximo paso. Al final, las que no tienen nada agendado.', function () { return true; }, { resto: true });
    } else if (v.vista === 'asesor') {
      g('hoy', 'Tasaciones de hoy', 'Las que tenés hoy, por hora.', function (c) { var t = tasacionCerca(c, persona); return t && diasEntre(MQ.ahora(), new Date(t.fecha)) === 0; }, { tasacion: true });
      g('vencidas', 'Tareas vencidas', 'Tenían que estar hechas antes de ahora.', function (c) { var p = proximo(c, persona); return p && p.estado === 'vencida'; });
      g('proximos', 'Con próximo paso', 'Ordenados por fecha.', function (c) { return !!proximo(c, persona); });
      g('nada', 'Sin nada pendiente', 'No tienen ninguna tarea ni visita. Poneles un próximo paso o cerrá el proceso.', function () { return true; }, { resto: true });
    } else {
      g('todos', 'Todos los procesos', null, function () { return true; }, { resto: true, todos: true });
    }
    out.forEach(function (gr) {
      if (gr.extra.orden === 'espera') gr.items.sort(function (a, b) { return a.creado < b.creado ? -1 : 1; });
      else gr.items = ordenar(gr.items, gr.extra.todos ? estadoActual() : { orden: 'proximo' }, persona);
    });
    return out;
  }
  function estadoActual() { return estadoDe(MQ.pantalla); }

  /* ── Piezas de HTML ───────────────────────────────────────────────────────────────────────── */
  function totalesDe(v) { return v.vista === 'coordinacion' ? TOTALES.coordinacion : v.vista === 'asesor' ? TOTALES[v.asesor] : TOTALES.dueno; }
  function suma(t, etapas) { return etapas.reduce(function (s, e) { return s + (t[e] || 0); }, 0); }
  function etapasDe(v, cerrados) {
    if (cerrados) return v.vista === 'coordinacion' ? ['perdida'] : CERRADAS;
    if (v.vista === 'coordinacion') return ['solicitud', 'agendada', 'no_realizada'];
    if (v.vista === 'asesor') return EMBUDO.slice(1).concat(['comprador']);
    return EMBUDO.concat(FUERA);
  }
  function miles(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function ultimoHtml(c) {
    var u = ultimo(c);
    if (!u) return '<span class="fp-dato fp-dato--nada">' + (abierto(c) ? 'Sin contacto todavía' : '—') + '</span>';
    // Seguimiento sin movimiento (la misma regla que «Lo que está trabado»): ícono y texto, no solo color.
    var frio = sinMovimiento(c);
    return '<span class="fp-dato"><span class="fp-dato__principal' + (frio ? ' fp-frio' : '') + '" title="' + esc(fmt.exacta(u.fecha)) + '">' + (frio ? ic('triangle-alert') : '') + esc(haceTxt(u.fecha)) + '</span>' +
      '<span class="fp-dato__sub">' + (frio ? '<span class="fp-frio">Sin movimiento</span> · ' : '') + esc(u.texto) + '</span></span>';
  }
  function proximoHtml(p, c) {
    if (!p) {
      if (!abierto(c)) return '<span class="fp-dato"><span class="fp-dato__principal">' + esc(ET[c.etapa]) + ' ' + esc(haceTxt(c.cerrado)) + '</span><span class="fp-dato__sub">' + esc(c.motivo || '') + '</span></span>';
      return '<span class="fp-dato fp-dato--nada">Nada agendado</span>';
    }
    return '<span class="fp-dato" data-estado="' + p.estado + '"><span class="fp-dato__principal">' + esc(p.titulo) + '</span>' +
      '<span class="fp-dato__sub fp-vence">' + ic(p.icono) + '<span>' + esc(p.cuando) + (quienVisible(p, c) ? '<span class="fp-quien"> · ' + esc(quienVisible(p, c)) + '</span>' : '') + '</span></span></span>';
  }
  /** De quién es la tarea: no se repite si ya figura como asesor ni si es de quien mira. */
  function quienVisible(p, c) {
    if (!p.quien || (c.asesorId && ASESORES[c.asesorId] === p.quien)) return null;
    return p.quien === MQ.usuario().nombre ? null : p.quien;
  }
  function asesorHtml(c) {
    if (c.asesorId) return '<span class="fp-dato">' + esc(ASESORES[c.asesorId]) + '</span>';
    if (sinAsesor(c)) return '<span class="fp-dato fp-dato--alerta">' + ic('user-x') + 'Sin asesor</span>';
    return '<span class="fp-dato fp-dato--nada">—</span>';
  }
  var TIPO_CORTO = { Departamento: 'Depto' };
  function propiedad(c) { var t = TIPO_CORTO[c.tipoPropiedad] || c.tipoPropiedad; return [t && c.ambientes ? t + ' ' + c.ambientes + ' amb' : t, c.barrio].filter(Boolean).join(' · '); }

  /** Una fila: toda la fila abre la ficha. */
  function fila(c, opciones) {
    var o = opciones || {}, p = o.cerrados ? null : proximo(c, o.persona);
    var etiqueta = 'Abrir la ficha de ' + c.nombre;
    // En el grupo de tasaciones, si el próximo paso es otra cosa (p. ej. confirmar el horario), la tasación va debajo del nombre.
    var tas = o.tasacion ? tasacionCerca(c, o.tasacion === 'todas' ? null : o.tasacion) : null;
    var sub = o.contactos ? c.telefono + ' · ' + propiedad(c) : propiedad(c) + ' · ' + c.direccion;
    var lineaTas = tas && !(p && p.tasacion === tas) ? 'Tasación ' + fmt.relativa(tas.fecha) + (o.conAsesor ? '' : ' con ' + tas.asesor) + (tas.direccion.split(',')[0] === c.direccion ? '' : ' · ' + tas.direccion.split(',')[0]) : '';
    return '<li><a class="fp' + (o.conAsesor ? ' fp--asesor' : '') + '" href="#ficha" data-contacto="' + esc(c.id) + '" aria-label="' + esc(etiqueta) + '">' +
      ui.avatar(c.nombre) +
      '<span class="fp__persona"><span class="fp__nombre">' + esc(c.nombre) + '</span><span class="fp__sub">' + esc(sub) + '</span>' + (lineaTas ? '<span class="fp__tas">' + ic('calendar-check') + esc(lineaTas) + '</span>' : '') + '</span>' +
      '<span class="fp__etapa"><span class="fp-etq">' + (o.contactos ? 'Proceso' : 'Etapa') + '</span>' + ui.chipEtapa(c.etapa) + (o.contactos && origenDe(c) ? '<span class="fp-origen">' + esc(ORIGENES[origenDe(c)]) + '</span>' : '') + '</span>' +
      '<span class="fp__ultimo"><span class="fp-etq">Último contacto</span>' + ultimoHtml(c) + '</span>' +
      '<span class="fp__proximo"><span class="fp-etq">' + (o.cerrados ? 'Cierre' : 'Próximo paso') + '</span>' + proximoHtml(p, c) + '</span>' +
      (o.conAsesor ? '<span class="fp__asesor' + (!c.asesorId && !sinAsesor(c) ? ' fp__asesor--vacio' : '') + '"><span class="fp-etq">Asesor</span>' + asesorHtml(c) + '</span>' : '') +
      '<span class="fp__ir" aria-hidden="true">' + ic('chevron-right') + '</span></a></li>';
  }
  function cabeceraFilas(conAsesor, contactosLista, cerrados) {
    return '<div class="fp-cabecera' + (conAsesor ? ' fp--asesor' : '') + '" aria-hidden="true"><span></span><span>' + (contactosLista ? 'Persona' : 'Persona y propiedad') + '</span><span>' + (contactosLista ? 'Proceso' : 'Etapa') + '</span><span>Último contacto</span><span>' + (cerrados ? 'Cierre' : 'Próximo paso') + '</span>' + (conAsesor ? '<span>Asesor</span>' : '') + '<span></span></div>';
  }

  function opciones(lista, valor) { return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === valor ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function selector(clave, etiqueta, lista, valor) {
    return '<label class="campo cartera-campo"><span class="campo__etiqueta">' + esc(etiqueta) + '</span><span class="tareas-select"><select class="entrada" data-filtro="' + clave + '">' + opciones(lista, valor) + '</select>' + ic('chevron-down') + '</span></label>';
  }
  function etiquetaPeriodo(st) {
    if (st.periodo !== 'rango') return null;
    function f(x) { return x ? x.slice(8, 10) + '/' + x.slice(5, 7) : '…'; }
    return 'Del ' + f(st.desde) + ' al ' + f(st.hasta);
  }
  function camposFiltro(cfg, v, st, cerrados) {
    var et = [['', cerrados ? 'Todos los cerrados' : 'Todas las etapas']].concat(etapasDe(v, cerrados).map(function (e) { return [e, ET[e]]; }));
    var periodos = PERIODOS.slice(); if (st.periodo === 'rango') periodos.splice(7, 0, ['rango', etiquetaPeriodo(st)]);
    var html = '';
    if (cfg.tipo === 'crm') html += selector('etapa', 'Etapa', et, st.etapa);
    html += selector('origen', 'Origen', [['', 'Todos los orígenes'], ['embudo', 'Embudo'], ['referido', 'Referido'], ['historico', 'Histórico']], st.origen);
    if (v.vista !== 'asesor') html += selector('asesor', 'Asesor', [['', 'Todos los asesores']].concat(Object.keys(ASESORES).map(function (k) { return [k, ASESORES[k]]; })).concat([['sin', 'Sin asesor']]), st.asesor);
    html += selector('periodo', cfg.tipo === 'crm' ? 'Entró al CRM' : 'Se registró', periodos, st.periodo);
    return html;
  }
  /** «Ordenar por» va en la cabecera de la lista, no entre los filtros: ordena, no saca a nadie. */
  function selectorOrden(st) {
    return '<label class="cartera-orden"><span class="texto-suave texto-chico">Ordenar por</span><span class="tareas-select"><select class="entrada" data-filtro="orden">' +
      opciones([['proximo', 'Próximo paso'], ['ultimo', 'Más tiempo sin contacto'], ['nuevos', 'Más nuevos primero'], ['nombre', 'Nombre (A a Z)']], st.orden) + '</select>' + ic('chevron-down') + '</span></label>';
  }
  var TRABADO_TXT = { 'sin-contacto': 'Sin primer contacto', 'sin-asesor': 'Sin asesor', 'sin-movimiento': 'Seguimiento sin movimiento' };
  function chipsActivos(st, cfg) {
    var ch = [];
    if (st.q) ch.push(['q', 'Busca: «' + st.q + '»']);
    if (st.trabado) ch.push(['trabado', TRABADO_TXT[st.trabado]]);
    if (st.etapa) ch.push(['etapa', 'Etapa: ' + ET[st.etapa]]);
    if (st.origen) ch.push(['origen', 'Origen: ' + ORIGENES[st.origen]]);
    if (st.asesor) ch.push(['asesor', 'Asesor: ' + (st.asesor === 'sin' ? 'sin asesor' : ASESORES[st.asesor])]);
    if (st.periodo) ch.push(['periodo', (cfg.tipo === 'crm' ? 'Entró: ' : 'Se registró: ') + (st.periodo === 'rango' ? etiquetaPeriodo(st) : PERIODOS.filter(function (p) { return p[0] === st.periodo; })[0][1].toLowerCase())]);
    if (!ch.length) return '';
    return '<div class="cartera-activos" aria-label="Filtros puestos">' + ch.map(function (x) {
      return '<button type="button" class="badge badge--borde cartera-activo" data-quitar="' + x[0] + '" aria-label="Sacar el filtro ' + esc(x[1]) + '">' + esc(x[1]) + ic('x') + '</button>';
    }).join('') + '<button type="button" class="btn btn--fantasma btn--chico" data-quitar="todo">Limpiar filtros</button></div>';
  }

  /** Barra chica de etapas: secundaria, sin fondos de color, cada número con su base. Tocar una etapa filtra. */
  function barraEtapas(v, st, cerrados) {
    var t = totalesDe(v), es = etapasDe(v, cerrados);
    function boton(e) {
      return '<li><button type="button" class="be__etapa" data-etapa-filtro="' + e + '" aria-pressed="' + (st.etapa === e) + '"><span>' + esc(ET[e]) + '</span><strong>' + miles(t[e] || 0) + '</strong></button></li>';
    }
    if (v.vista === 'dueno' && !cerrados) {
      return '<div class="be" aria-label="Procesos por etapa">' +
        '<div class="be__grupo"><p class="be__base">Embudo de tasación</p><ul class="be__lista">' + EMBUDO.map(boton).join('') + '</ul></div>' +
        '<div class="be__grupo"><p class="be__base">Fuera del embudo</p><ul class="be__lista">' + FUERA.map(boton).join('') + '</ul></div></div>';
    }
    return '<div class="be" aria-label="Procesos por etapa"><div class="be__grupo"><p class="be__base">Por etapa</p><ul class="be__lista">' + es.map(boton).join('') + '</ul></div></div>';
  }

  function segmento(v, st, cfg) {
    var t, a, ce;
    if (cfg.tipo === 'contactos') { t = CONTACTOS_TOTAL[v.vista === 'asesor' ? v.asesor : 'equipo']; a = t.abiertos; ce = t.cerrados; }
    else { t = totalesDe(v); a = suma(t, etapasDe(v, false)); ce = suma(t, etapasDe(v, true)); }
    var txt = cfg.tipo === 'contactos' ? ['Con proceso abierto', 'Sin proceso abierto'] : ['Abiertos', 'Cerrados'];
    return '<div class="cartera-seg" role="group" aria-label="' + (cfg.tipo === 'contactos' ? 'Qué contactos ver' : 'Qué procesos ver') + '">' +
      '<button type="button" data-seg="abiertos" aria-pressed="' + (st.seg === 'abiertos') + '">' + txt[0] + ' <span>' + miles(a) + '</span></button>' +
      '<button type="button" data-seg="cerrados" aria-pressed="' + (st.seg === 'cerrados') + '">' + txt[1] + ' <span>' + miles(ce) + '</span></button></div>';
  }

  /* ── Pantallas ────────────────────────────────────────────────────────────────────────────── */
  var SUBTITULOS = {
    coordinacion: 'Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero.',
    asesor: 'Tus procesos, ordenados por el próximo paso.',
    dueno: 'El embudo completo, lo que está trabado y la lista de todos los procesos.',
    equipo: 'Todas las personas cargadas, con su proceso, el último contacto y el próximo paso.',
    contactosAsesor: 'Tus contactos: asignados a vos, cargados por vos o con un proceso o tasación tuyos.'
  };
  var VER_COMO = [['yo', 'Mi vista (dueño)'], ['coordinacion', 'Paula · coordinación'], ['tomas', 'Tomás Agüero · asesor'], ['florencia', 'Florencia Ledesma · asesora'], ['martin', 'Martín Ocampo · asesor']];

  function pintar(p) {
    var raiz = document.querySelector('[data-cartera="' + p + '"]'); if (!raiz) return;
    var cfg = PANTALLAS[p], st = estadoDe(p), v = vistaDe(p), cerrados = st.seg === 'cerrados';
    var conAsesor = v.vista !== 'asesor', persona = personaDe(v);
    var sub = cfg.tipo === 'contactos' ? (v.vista === 'asesor' ? SUBTITULOS.contactosAsesor : SUBTITULOS.equipo) : SUBTITULOS[v.vista];
    if (cfg.vista === 'dueno' && v.vista === 'asesor') sub = 'Los procesos de ' + ASESORES[v.asesor] + ', ordenados por el próximo paso.';
    var html = '<header class="cartera-cab"><div class="pila pila--chica crece"><h1 class="titulo-pagina">' + (cfg.tipo === 'crm' ? 'CRM' : 'Contactos') + '</h1>' +
      '<p class="texto-suave texto-chico">' + esc(sub) + '</p></div>';
    if (cfg.vista === 'dueno') {
      html += '<label class="campo cartera-vercomo"><span class="campo__etiqueta">Ver como</span><span class="tareas-select"><select class="entrada" data-vercomo>' + opciones(VER_COMO, st.verComo) + '</select>' + ic('chevron-down') + '</span></label>';
    }
    if (cfg.tipo === 'contactos') html += '<button type="button" class="btn btn--secundario cartera-nuevo" data-toast="Abre el alta de contacto, como hoy.">' + ic('user-plus') + 'Nuevo contacto</button>';
    html += '</header>';
    if (cfg.vista === 'dueno' && st.verComo !== 'yo') {
      var nombre = VER_COMO.filter(function (x) { return x[0] === st.verComo; })[0][1];
      html += '<div class="cartera-aviso" role="status">' + ic('eye') + '<p class="crece">Estás viendo el CRM como lo ve <strong>' + esc(nombre.replace(' · ', ' (') + ')') + '</strong>. Es solo para revisar: no cambia nada de lo que esa persona ve.</p>' +
        '<button type="button" class="btn btn--secundario btn--chico" data-vercomo-volver>Volver a mi vista</button></div>';
    }

    var lista = filtrar(carteraDe(v), st, cerrados);
    // Dueño, vista propia: lo trabado arriba
    if (cfg.tipo === 'crm' && v.vista === 'dueno' && !cerrados) html += trabadoHtml(st);

    html += '<div class="cartera-controles">' + segmento(v, st, cfg) + (cfg.tipo === 'crm' ? barraEtapas(v, st, cerrados) : '') + '</div>';
    html += '<div class="cartera-filtros" id="cartera-filtros-' + p + '">' +
      '<label class="campo cartera-buscar"><span class="campo__etiqueta">Buscar</span><span class="cartera-buscar__caja">' + ic('search') +
      '<input class="entrada" type="search" data-filtro="q" value="' + esc(st.q) + '" placeholder="Nombre, teléfono o calle" autocomplete="off"></span></label>' +
      '<div class="cartera-filtros__campos solo-escritorio-ancho">' + camposFiltro(cfg, v, st, cerrados) + '</div>' +
      '<button type="button" class="btn btn--secundario cartera-btn-filtros" data-abrir-filtros>' + ic('sliders') + 'Filtros' + (cuantosFiltros(st) - (st.q ? 1 : 0) ? ' <span class="badge badge--marca badge--numero">' + (cuantosFiltros(st) - (st.q ? 1 : 0)) + '</span>' : '') + '</button>' +
      '</div>' + chipsActivos(st, cfg);

    if (cfg.tipo === 'contactos') html += listaContactos(v, st, lista, cerrados);
    else if (cerrados) html += tarjetaLista('Cerrados', 'Los más recientes primero. Para volver a abrir uno, entrá a su ficha.', lista.sort(function (a, b) { return a.cerrado < b.cerrado ? 1 : -1; }), { cerrados: true, conAsesor: conAsesor, persona: persona }, pie(lista.length, totalFiltrado(v, st, true)), null);
    else html += gruposHtml(v, st, lista, conAsesor, persona);

    raiz.innerHTML = html;
    pintarHojaFiltros(p);
  }

  function totalFiltrado(v, st, cerrados) {
    // Se sabe el total exacto solo con la etapa como único filtro (el resto, en la maqueta, son ejemplos).
    if (st.trabado && cuantosFiltros(st) === 1 && !cerrados) return st.trabado === 'sin-asesor' ? TRABADO.sinAsesor : st.trabado === 'sin-movimiento' ? TRABADO.sinMovimiento : MQ.contactos.filter(function (c) { return abierto(c) && sinPrimerContacto(c); }).length;
    if (cuantosFiltros(st) - (st.etapa ? 1 : 0) > 0) return null;
    var t = totalesDe(v);
    return st.etapa ? t[st.etapa] || 0 : suma(t, etapasDe(v, cerrados));
  }
  function pie(mostrados, total, menos) {
    var tot = total == null ? null : Math.max(total - (menos || 0), mostrados);
    var txt = tot == null ? 'Mostrando ' + mostrados + ' (en la maqueta hay solo algunos ejemplos)' : 'Mostrando ' + mostrados + ' de ' + miles(tot);
    return '<div class="card__pie cartera-pie"><span class="texto-suave texto-chico crece">' + txt + '</span>' +
      (tot != null && tot > mostrados ? '<button type="button" class="btn btn--secundario btn--chico" data-toast="Trae 25 más. En la maqueta hay solo algunos ejemplos.">Cargar 25 más</button>' : '') + '</div>';
  }
  /** n = null: lista paginada, sin número en la cabecera (el «Mostrando X de Y» del pie lo dice). */
  function tarjetaLista(titulo, texto, items, o, pieHtml, n) {
    var cuenta = n === null ? '' : ' <span class="badge badge--numero' + (o.urgente && items.length ? ' badge--alerta' : '') + '">' + miles(n != null ? n : items.length) + '</span>';
    return '<section class="card cartera-grupo" aria-label="' + esc(titulo) + '"><div class="card__cabecera cartera-grupo__cab"><h2 class="card__titulo">' + esc(titulo) + cuenta + '</h2>' +
      (o.seleccionar ? '<button type="button" class="btn btn--fantasma btn--chico" data-toast="Como hoy: aparece una casilla en cada fila para eliminar varios procesos juntos.">Seleccionar</button>' : '') +
      (o.orden ? selectorOrden(estadoActual()) : '') + '</div>' +
      (texto ? '<p class="cartera-grupo__texto texto-suave texto-chico">' + esc(texto) + '</p>' : '') +
      (items.length ? cabeceraFilas(o.conAsesor, o.contactos, o.cerrados) + '<ul class="lista cartera-filas">' + items.map(function (c) { return fila(c, o); }).join('') + '</ul>'
        : '<div class="card__cuerpo">' + ui.estadoVacio({ icono: 'search', titulo: 'Ningún resultado con estos filtros', texto: 'Probá sacar algún filtro.', accion: '<button type="button" class="btn btn--secundario" data-quitar="todo">Limpiar filtros</button>' }) + '</div>') +
      (pieHtml || '') + '</section>';
  }
  function gruposHtml(v, st, lista, conAsesor, persona) {
    if (!lista.length) {
      var hay = cuantosFiltros(st) > 0;
      return '<section class="card"><div class="card__cuerpo">' + (hay
        ? ui.estadoVacio({ icono: 'search', titulo: 'Ningún proceso coincide con estos filtros', texto: 'Probá sacar algún filtro o buscar de otra forma.', accion: '<button type="button" class="btn btn--secundario" data-quitar="todo">Limpiar filtros</button>' })
        : ui.estadoVacio({ icono: 'circle-check', titulo: 'No hay procesos abiertos', texto: 'Cuando entre uno nuevo, aparece acá.', ok: true })) + '</div></section>';
    }
    var gs = grupos(v, lista), html = '', total = totalFiltrado(v, st, false);
    gs.forEach(function (g) {
      if (!g.items.length && !g.extra.resto) return;   // un grupo sin datos no se muestra
      if (!g.items.length && g.extra.resto) return;
      var o = { conAsesor: conAsesor, persona: persona, orden: !!g.extra.todos, seleccionar: !!g.extra.todos, tasacion: g.extra.todos ? 'todas' : null };
      if (g.extra.tasacion) {
        html += tarjetaLista(g.titulo, g.texto, g.items, { conAsesor: conAsesor, persona: persona, tasacion: v.vista === 'asesor' ? persona : 'todas' });
        return;
      }
      o.urgente = g.clave === 'sin-contacto' || g.clave === 'vencidas';
      html += tarjetaLista(g.titulo, g.texto, g.items, o, null, g.extra.resto ? null : undefined);
    });
    var vistos = gs.reduce(function (s, g) { return s + g.items.length; }, 0);
    var txt = total == null ? 'Mostrando ' + vistos + ' procesos (en la maqueta hay solo algunos ejemplos)' : 'Mostrando ' + vistos + ' de ' + miles(total) + ' procesos abiertos';
    html += '<div class="cartera-total"><span class="texto-suave texto-chico">' + txt + '</span>' +
      (total != null && total > vistos ? '<button type="button" class="btn btn--secundario btn--chico" data-toast="Trae 25 más al final de la lista. En la maqueta hay solo algunos ejemplos.">Cargar 25 más</button>' : '') + '</div>';
    return html;
  }

  function trabadoHtml(st) {
    var todos = MQ.contactos.filter(abierto);
    var sc = todos.filter(sinPrimerContacto).sort(function (a, b) { return a.creado < b.creado ? -1 : 1; });
    var sa = todos.filter(sinAsesor), sm = todos.filter(sinMovimiento).sort(function (a, b) { return (diasSinContacto(b) || 999) - (diasSinContacto(a) || 999); });
    function item(c, detalle, alerta) {
      return '<li><a class="tr-item" href="#ficha" data-contacto="' + c.id + '"><span class="tr-item__nombre">' + esc(c.nombre) + '</span>' +
        '<span class="tr-item__det' + (alerta ? ' tr-item__det--alerta' : '') + '">' + detalle + '</span></a></li>';
    }
    function col(clave, titulo, n, base, filas, nota) {
      return '<div class="tr-col"><div class="tr-col__cab"><h3 class="tr-col__titulo">' + esc(titulo) + '</h3><span class="badge badge--numero' + (n ? ' badge--alerta' : '') + '">' + n + '</span></div>' +
        '<p class="texto-suave texto-chico">' + base + '</p><ul class="tr-lista">' + filas + '</ul>' +
        (nota ? '<p class="texto-suave texto-chico tr-nota">' + nota + '</p>' : '') +
        '<button type="button" class="btn btn--secundario btn--chico" data-trabado="' + clave + '" aria-pressed="' + (st.trabado === clave) + '">' + (st.trabado === clave ? ic('x') + 'Quitar este filtro' : 'Ver ' + (n === 1 ? 'el proceso' : 'los ' + n) + ' en la lista' + ic('arrow-right')) + '</button></div>';
    }
    return '<section class="card tr" aria-label="Lo que está trabado"><div class="card__cabecera"><h2 class="card__titulo">Lo que está trabado</h2><span class="texto-suave texto-chico">al ' + esc(fmt.exacta(MQ.iso(MQ.ahora())).replace(' 2026', '')) + '</span></div>' +
      '<div class="tr__cols">' +
      col('sin-contacto', 'Solicitudes sin primer contacto', sc.length, 'De ' + TOTALES.dueno.solicitud + ' solicitudes abiertas. Llama la coordinación.',
        sc.map(function (c) { return item(c, ic('clock') + '<span>' + esc(espera(c)) + '</span>', true); }).join('')) +
      col('sin-asesor', 'Procesos sin asesor', TRABADO.sinAsesor, 'Ya pasaron la solicitud y nadie los tiene. De ' + miles(suma(TOTALES.dueno, EMBUDO.slice(1))) + ' procesos.',
        sa.map(function (c) { return item(c, esc(ET[c.etapa]) + ' · ' + esc(c.origen), false); }).join(''), 'Acá se ven ' + sa.length + ' de ejemplo.') +
      col('sin-movimiento', 'Seguimientos sin movimiento', TRABADO.sinMovimiento, 'Sin contacto hace ' + SIN_MOVIMIENTO_DIAS + ' días o más. De ' + TRABADO.seguimientos + ' seguimientos.',
        sm.slice(0, 4).map(function (c) { return item(c, diasSinContacto(c) + ' días · ' + esc(c.asesorId ? ASESORES[c.asesorId] : 'sin asesor'), false); }).join(''), 'Acá se ven ' + Math.min(4, sm.length) + ' de ejemplo, los de más días.') +
      '</div></section>';
  }

  function listaContactos(v, st, lista, cerrados) {
    var persona = v.vista === 'asesor' ? v.asesor : null;
    var items = ordenar(lista, st, persona);
    var t = CONTACTOS_TOTAL[v.vista === 'asesor' ? v.asesor : 'equipo'], tot = cuantosFiltros(st) ? null : (cerrados ? t.cerrados : t.abiertos);
    if (!items.length) {
      return '<section class="card"><div class="card__cuerpo">' + ui.estadoVacio({ icono: 'search', titulo: 'Ningún contacto coincide con estos filtros', texto: 'Probá sacar algún filtro o buscar de otra forma.', accion: '<button type="button" class="btn btn--secundario" data-quitar="todo">Limpiar filtros</button>' }) + '</div></section>';
    }
    return tarjetaLista('Personas', cerrados ? 'Su proceso se cerró (captado o descartado) o nunca tuvo uno.' : null,
      items, { contactos: true, conAsesor: v.vista !== 'asesor', persona: persona, cerrados: cerrados, orden: true, tasacion: persona || 'todas' }, pie(items.length, tot), null);
  }

  /* ── Hoja de filtros (celular) y de fechas ────────────────────────────────────────────────── */
  function pintarHojaFiltros(p) {
    var cuerpo = document.getElementById('cartera-hoja-filtros-cuerpo'); if (!cuerpo || !PANTALLAS[p]) return;
    var st = estadoDe(p), v = vistaDe(p);
    cuerpo.innerHTML = camposFiltro(PANTALLAS[p], v, st, st.seg === 'cerrados');
    MQ.ui.hidratar(cuerpo);
  }
  function quitar(p, k) {
    var st = estadoDe(p);
    if (k === 'todo') { ['etapa', 'origen', 'asesor', 'periodo', 'desde', 'hasta', 'q', 'trabado'].forEach(function (x) { st[x] = ''; }); }
    else { st[k] = ''; if (k === 'periodo') { st.desde = ''; st.hasta = ''; } }
  }

  document.addEventListener('change', function (e) {
    var p = MQ.pantalla; if (!PANTALLAS[p]) return;
    var el = e.target, st = estadoDe(p);
    if (el.hasAttribute('data-vercomo')) { st.verComo = el.value; st.etapa = ''; st.asesor = ''; st.trabado = ''; st.seg = 'abiertos'; pintar(p); return; }
    var k = el.getAttribute('data-filtro'); if (!k || k === 'q') return;
    if (k === 'periodo' && el.value === 'elegir') { el.value = st.periodo; abrirFechas(); return; }
    st[k] = el.value;
    if (k === 'periodo') { st.desde = ''; st.hasta = ''; }
    var enHoja = !!el.closest('.hoja');
    pintar(p);
    if (enHoja) { var otro = document.querySelector('#cartera-hoja-filtros-cuerpo [data-filtro="' + k + '"]'); if (otro) otro.focus(); }
  });
  var temporizador = null;
  document.addEventListener('input', function (e) {
    var p = MQ.pantalla; if (!PANTALLAS[p] || e.target.getAttribute('data-filtro') !== 'q') return;
    var valor = e.target.value; clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      estadoDe(p).q = valor; pintar(p);
      var campo = document.querySelector('[data-cartera="' + p + '"] [data-filtro="q"]');
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    }, 250);
  });
  document.addEventListener('click', function (e) {
    var p = MQ.pantalla; if (!PANTALLAS[p]) return;
    var t = e.target, el, st = estadoDe(p);
    if ((el = t.closest('[data-seg]'))) { st.seg = el.getAttribute('data-seg'); st.etapa = ''; st.trabado = ''; pintar(p); return; }
    if ((el = t.closest('[data-etapa-filtro]'))) { var et = el.getAttribute('data-etapa-filtro'); st.etapa = st.etapa === et ? '' : et; pintar(p); return; }
    if ((el = t.closest('[data-quitar]'))) { quitar(p, el.getAttribute('data-quitar')); pintar(p); return; }
    if ((el = t.closest('[data-trabado]'))) {
      var k = el.getAttribute('data-trabado'); st.trabado = st.trabado === k ? '' : k; pintar(p);
      var lista = document.querySelector('[data-cartera="' + p + '"] .cartera-grupo'); if (lista && st.trabado) lista.scrollIntoView({ block: 'start' });
      return;
    }
    if (t.closest('[data-vercomo-volver]')) { st.verComo = 'yo'; st.etapa = ''; st.asesor = ''; st.seg = 'abiertos'; pintar(p); return; }
    if (t.closest('[data-abrir-filtros]')) { pintarHojaFiltros(p); abrirHoja('cartera-hoja-filtros'); return; }
    if (t.closest('[data-aplicar-fechas]')) {
      var d = document.getElementById('cartera-desde').value, h = document.getElementById('cartera-hasta').value;
      if (!d && !h) { toast('Elegí al menos una fecha'); return; }
      st.periodo = 'rango'; st.desde = d; st.hasta = h; cerrarHoja('cartera-hoja-fechas'); pintar(p); return;
    }
  });
  function abrirFechas() {
    var st = estadoDe(MQ.pantalla);
    document.getElementById('cartera-desde').value = st.desde || '2026-11-01';
    document.getElementById('cartera-hasta').value = st.hasta || '2026-11-25';
    abrirHoja('cartera-hoja-fechas');
  }

  /* ── Rol, menú y navegación ───────────────────────────────────────────────────────────────── */
  var DE_ROL = { coordinadora: 'crm-coordinacion', asesor: 'crm-asesor', admin: 'crm-dueno' };
  var CONTACTOS_DE_ROL = { coordinadora: 'contactos-equipo', asesor: 'contactos-asesor', admin: 'contactos-equipo' };
  function enlacesDelMenu() {
    document.querySelectorAll('[data-cartera-enlace="crm"]').forEach(function (a) { a.setAttribute('href', '#' + DE_ROL[MQ.rol]); });
    document.querySelectorAll('[data-cartera-enlace="contactos"]').forEach(function (a) { a.setAttribute('href', '#' + CONTACTOS_DE_ROL[MQ.rol]); });
  }
  var anterior = null, origenFicha = null;
  function marcarMenu(nombre) {
    var ref = nombre === 'ficha' ? (origenFicha || 'contactos-') : nombre;
    var grupo = ref.indexOf('crm-') === 0 ? 'crm' : ref.indexOf('contactos-') === 0 ? 'contactos' : null;
    if (!grupo) return;
    document.querySelectorAll('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === 'contactos' || a.getAttribute('data-nav') === 'crm') a.removeAttribute('aria-current'); });
    document.querySelectorAll('[data-nav="' + grupo + '"]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
  }
  /** La ficha recuerda de qué lista se vino: «‹ Volver al CRM» arriba (los filtros quedan como estaban). */
  function volverEnFicha() {
    var sec = document.querySelector('section[data-screen="ficha"]'); if (!sec) return;
    var v = sec.querySelector('.cartera-volver');
    if (!origenFicha) { if (v) v.remove(); return; }
    if (!v) { v = document.createElement('a'); v.className = 'cartera-volver'; sec.insertBefore(v, sec.firstChild); }
    var esCrm = origenFicha.indexOf('crm-') === 0;
    v.href = '#' + origenFicha;
    v.innerHTML = ic('chevron-left') + (esCrm ? 'Volver al CRM' : 'Volver a Contactos');
    setTimeout(function () { var c = MQ.contactoActual(); if (MQ.pantalla === 'ficha' && c) MQ.setTitulo(c.nombre, esCrm ? 'CRM' : 'Contactos'); }, 0);
  }
  MQ.on('rolchange', function (rol) {
    enlacesDelMenu();
    var p = MQ.pantalla, cfg = PANTALLAS[p];
    // Cambiar de rol arriba a la derecha lleva a la vista de ese rol en la misma sección.
    if (cfg && cfg.rol && cfg.rol !== rol) MQ.ir(cfg.tipo === 'crm' ? DE_ROL[rol] : CONTACTOS_DE_ROL[rol]);
    else if (cfg && !cfg.rol && rol === 'asesor') MQ.ir('contactos-asesor');
  });
  MQ.on('pantalla', function (nombre) {
    nombresDeEtapa();
    if (nombre === 'ficha') { if (anterior !== 'ficha') origenFicha = PANTALLAS[anterior] ? anterior : null; volverEnFicha(); }
    anterior = nombre;
    marcarMenu(nombre);
    var cfg = PANTALLAS[nombre];
    if (!cfg) return;
    if (cfg.rol && MQ.rol !== cfg.rol) MQ.setRol(cfg.rol);
    else if (!cfg.rol && MQ.rol === 'asesor') MQ.setRol('coordinadora');
    if (MQ.pantalla !== nombre) return;
    pintar(nombre);
  });
  // Si se registró algo en la ficha, la fila cambia sola al volver.
  MQ.on('actividad', function () { nombresDeEtapa(); if (PANTALLAS[MQ.pantalla]) pintar(MQ.pantalla); });
  MQ.on('tareas', function () { if (PANTALLAS[MQ.pantalla]) pintar(MQ.pantalla); });

  // Para la pantalla de estados y el índice
  MQ.cartera = { fila: fila, cabeceraFilas: cabeceraFilas, ASESORES: ASESORES, pintar: pintar };
})();
