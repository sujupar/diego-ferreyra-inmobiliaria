/* ══════════════════════════════════════════════════════════════════════
   Pantalla #tareas + CAMPANITA global.

   CÓMO SE MONTA LA CAMPANITA
   - El botón (#btn-campanita) y su número rojo ya viven en shell.html y los
     pinta base.js con MQ.avisos() (tope «99+», oculto en cero).
   - Este archivo aporta lo que se abre: la hoja #tareas-campanita (está en
     tareas.html, marcada data-global) y la suscripción
         MQ.on('campanita', …)
     Con esa suscripción, base.js deja de mandar el botón a #tareas y pasa a
     abrir la hoja. No hay que tocar shell.html.
   - La hoja usa "hoja hoja--completa hoja--panel": pantalla completa en
     celular, panel de 384 px bajo la barra superior desde 768.
   - Las tres hojas de tareas.html (campanita, posponer, nueva tarea) son
     globales: funcionan desde cualquier pantalla. "Posponer" se abre con
     un botón data-tareas-posponer="<id de tarea>".
   - «Nueva tarea» es UN SOLO formulario para toda la maqueta. Se abre con
     data-abrir-hoja="tareas-hoja-nueva" o, desde la ficha de alguien, con
         MQ.nuevaTarea({ contactoId: 'c1' })
     que muestra a esa persona en el formulario y deja la tarea atada a ella.
   - Cuando «Posponer» se abre desde la campanita queda ARRIBA de ella
     (base.js apila las hojas en el orden en que se abren).

   LO QUE ESTE ARCHIVO LE AGREGA AL STORE (sin tocar base.js)
   - Tareas sin fecha de Paula hasta llegar a 625 (el número real de la
     plataforma), para que se vea «Sin fecha · 625» y el «Mostrar más».
     No tienen contacto ni fecha: no suenan en la campanita ni aparecen en
     la ficha. Para sacarlas: SIN_FECHA_OBJETIVO = 0.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.MQ, ui = MQ.ui, esc = ui.esc;
  function $(id) { return document.getElementById(id); }

  var SIN_FECHA_OBJETIVO = 625;   // total de tareas sin fecha de Paula
  var PAGINA_SIN_FECHA = 25;

  /* ── Tipos: salen del catálogo único de base.js (MQ.TIPOS_ELEGIBLES). Los mismos nombres en el filtro,
        en el formulario «Nueva tarea» y en el Sistema de diseño. ── */
  function grupoDeTipo(tipo) { var d = MQ.TIPOS_TAREA[tipo]; return d ? (d.grupo || tipo) : 'otro'; }
  var TIPOS = MQ.TIPOS_ELEGIBLES.map(function (k) {
    return { valor: k, texto: MQ.TIPOS_TAREA[k].texto, icono: MQ.TIPOS_TAREA[k].icono,
      tipos: Object.keys(MQ.TIPOS_TAREA).filter(function (x) { return grupoDeTipo(x) === k; }) };
  });
  function tipoDeFiltro(t) { return grupoDeTipo(t.tipo); }

  /* ── Datos de ejemplo propios de esta pantalla ───────────────────── */
  function sembrar() {
    if (MQ._tareasSembradas) return;
    MQ._tareasSembradas = true;
    MQ.tareas.forEach(function (t) { if (/escritura/i.test(t.titulo)) t.tipo = 'documentacion'; });
    MQ.crearTarea({ titulo: 'Pedir la escritura de Bacacay 2450', tipo: 'documentacion', contactoId: 'c6', vence: MQ.dia(2, '09:00'), todoElDia: true, asignadaA: 'paula', silencioso: true });

    var nombres = ['Alicia', 'Bruno', 'Celeste', 'Darío', 'Elsa', 'Fabián', 'Graciela', 'Horacio', 'Inés', 'Joaquín', 'Karina', 'Leandro', 'Mirta', 'Néstor', 'Olga', 'Pablo', 'Raquel', 'Sergio', 'Teresa', 'Ulises'];
    var apellidos = ['Acuña', 'Barrios', 'Cabrera', 'Domínguez', 'Escobar', 'Figueroa', 'Godoy', 'Herrera', 'Insúa', 'Juárez', 'Ledesma', 'Maidana', 'Navarro', 'Ojeda', 'Paz', 'Quintana', 'Roldán', 'Sosa', 'Toledo', 'Vera', 'Zárate', 'Bustos', 'Coria', 'Duarte', 'Farías', 'Gallo', 'Luna', 'Miranda', 'Núñez', 'Ponce', 'Rivas', 'Salas'];
    var hay = MQ.tareas.filter(function (t) { return t.asignadaA === 'paula' && !t.vence && t.estado === 'pendiente'; }).length;
    for (var i = 0; i < SIN_FECHA_OBJETIVO - hay; i++) {
      var quien = nombres[(i * 13) % nombres.length] + ' ' + apellidos[(i * 7 + Math.floor(i / nombres.length) * 3) % apellidos.length];
      var k = (i * 3) % 10, titulo, tipo;
      if (k < 6) { titulo = 'Actualizar los datos de ' + quien; tipo = 'otro'; }
      else if (k < 8) { titulo = 'Llamar a ' + quien; tipo = 'llamada'; }
      else if (k === 8) { titulo = 'Pedir la documentación a ' + quien; tipo = 'documentacion'; }
      else { titulo = 'Escribirle a ' + quien; tipo = 'whatsapp'; }
      var t = MQ.crearTarea({ titulo: titulo, tipo: tipo, asignadaA: 'paula', silencioso: true });
      t.creada = MQ.dia(-(20 + (i * 37) % 241), (9 + i % 9) + ':' + (i % 6) + '0');
    }
  }
  sembrar();

  /* ── Estado de la pantalla ───────────────────────────────────────── */
  var estado = { tipo: 'todas', persona: 'mias', sinFechaVisibles: PAGINA_SIN_FECHA, resaltar: null };

  function puedeVerOtros() { return MQ.rol === 'coordinadora' || MQ.rol === 'admin'; }
  function usuarios() { return Object.keys(MQ.USUARIOS).map(function (r) { return MQ.USUARIOS[r]; }); }
  function opcionesPersona() {
    var yo = MQ.usuario().id, ops = [{ valor: 'mias', texto: 'Mías', largo: 'Mis tareas' }];
    usuarios().forEach(function (u) { if (u.id !== yo) ops.push({ valor: u.id, texto: u.nombre, largo: u.nombre }); });
    ops.push({ valor: 'todas', texto: 'Todo el equipo', largo: 'Todo el equipo' });
    return ops;
  }
  function porVence(a, b) { var x = a.vence || '9999', y = b.vence || '9999'; return x < y ? -1 : x > y ? 1 : 0; }
  /** Pendientes según el filtro de persona (antes del filtro de tipo). */
  function tareasDePersona() {
    var p = puedeVerOtros() ? estado.persona : 'mias', yo = MQ.usuario().id;
    return MQ.tareas.filter(function (t) {
      if (t.estado !== 'pendiente') return false;
      return p === 'todas' ? true : t.asignadaA === (p === 'mias' ? yo : p);
    }).sort(porVence);
  }

  /* ── Filtros ─────────────────────────────────────────────────────── */
  function pintarFiltros(base) {
    var cuenta = { todas: base.length };
    TIPOS.forEach(function (f) { cuenta[f.valor] = 0; });
    base.forEach(function (t) { cuenta[tipoDeFiltro(t)] += 1; });

    var chips = '<button type="button" class="filtro" aria-pressed="' + (estado.tipo === 'todas') + '" data-valor="todas">Todas <span class="tareas-filtro__n">' + cuenta.todas + '</span></button>';
    var ops = '<option value="todas">Todos los tipos</option>';
    TIPOS.forEach(function (f) {
      if (!cuenta[f.valor] && estado.tipo !== f.valor) return;   // un tipo sin ninguna tarea no se ofrece: no filtraría nada
      chips += '<button type="button" class="filtro" aria-pressed="' + (estado.tipo === f.valor) + '" data-valor="' + f.valor + '">' + ui.icono(f.icono) + f.texto + ' <span class="tareas-filtro__n">' + cuenta[f.valor] + '</span></button>';
      ops += '<option value="' + f.valor + '">' + f.texto + '</option>';
    });
    $('tareas-f-tipo').innerHTML = chips;
    $('tareas-sel-tipo').innerHTML = ops;
    $('tareas-sel-tipo').value = estado.tipo;

    var chipsP = '', opsP = '';
    opcionesPersona().forEach(function (o) {
      chipsP += '<button type="button" class="filtro" aria-pressed="' + (estado.persona === o.valor) + '" data-valor="' + o.valor + '">' + esc(o.texto) + '</button>';
      opsP += '<option value="' + o.valor + '">' + esc(o.largo) + '</option>';
    });
    $('tareas-f-persona').innerHTML = chipsP;
    $('tareas-sel-persona').innerHTML = opsP;
    $('tareas-sel-persona').value = estado.persona;
  }

  /* ── Lista ───────────────────────────────────────────────────────── */
  var GRUPOS = [
    { clave: 'vencida', titulo: 'Vencidas', icono: 'triangle-alert' },
    { clave: 'hoy', titulo: 'Hoy', icono: 'clock' },
    { clave: 'proxima', titulo: 'Próximas', icono: 'calendar-days' }
  ];
  function botonPosponer(t) {
    var texto = t.vence ? 'Posponer' : 'Poner fecha';
    return '<button type="button" class="btn btn--fantasma btn--chico tareas-posponer" data-tareas-posponer="' + t.id + '" aria-label="' + texto + ': ' + esc(t.titulo) + '" title="' + texto + '">' +
      ui.icono(t.vence ? 'clock' : 'calendar-days') + '<span>' + texto + '</span></button>';
  }
  function fila(t) {
    var h = ui.itemTarea(t, { conPersona: puedeVerOtros() && estado.persona !== 'mias', acciones: botonPosponer(t) });
    return estado.resaltar === t.id ? h.replace('class="tarea', 'class="tarea tarea--nueva') : h;
  }
  function plural(n, uno, muchos) { return n + ' ' + (n === 1 ? uno : muchos); }

  function pintar() {
    var base = tareasDePersona();
    pintarFiltros(base);
    var f = TIPOS.filter(function (x) { return x.valor === estado.tipo; })[0];
    var lista = f ? base.filter(function (t) { return f.tipos.indexOf(t.tipo) !== -1; }) : base;
    var por = { vencida: [], hoy: [], proxima: [], sinfecha: [] };
    lista.forEach(function (t) { por[MQ.grupoDeTarea(t)].push(t); });
    por.sinfecha.sort(function (a, b) { return a.creada < b.creada ? 1 : a.creada > b.creada ? -1 : 0; });   // la más nueva primero

    // Título y resumen
    var p = puedeVerOtros() ? estado.persona : 'mias';
    $('tareas-titulo').textContent = p === 'mias' ? 'Mis pendientes' : p === 'todas' ? 'Pendientes del equipo' : 'Pendientes de ' + MQ.nombreDe(p);
    var partes = [];
    if (por.vencida.length) partes.push(plural(por.vencida.length, 'vencida', 'vencidas'));
    if (por.hoy.length) partes.push(por.hoy.length + ' para hoy');
    if (por.proxima.length) partes.push(plural(por.proxima.length, 'próxima', 'próximas'));
    if (por.sinfecha.length) partes.push(por.sinfecha.length + ' sin fecha');
    $('tareas-resumen').textContent = partes.join(' · ') || 'Nada pendiente';

    // Vencidas / Hoy / Próximas
    var h = '';
    GRUPOS.forEach(function (g) {
      var ts = por[g.clave]; if (!ts.length) return;
      h += '<section class="card tareas-grupo" data-grupo="' + g.clave + '" aria-label="' + g.titulo + '">' +
        '<div class="card__cabecera"><span class="tareas-grupo__icono">' + ui.icono(g.icono) + '</span>' +
        '<h2 class="card__titulo">' + g.titulo + ' <span class="tareas-grupo__n">· ' + ts.length + '</span></h2></div>' +
        '<div class="card__cuerpo"><ul class="lista tareas-lista">' + ts.map(fila).join('') + '</ul></div></section>';
    });
    if (!lista.length) {
      h = '<div class="card">' + (base.length
        ? ui.estadoVacio({ icono: 'filter', titulo: 'No hay tareas de este tipo', texto: 'Probá con otro tipo o mirá todas.', accion: '<button type="button" class="btn btn--secundario" data-tareas-ver-todas>Ver todas</button>' })
        : ui.estadoVacio({ icono: 'circle-check', titulo: 'Estás al día', texto: 'No hay tareas pendientes.', ok: true, accion: '<button type="button" class="btn btn--secundario" data-abrir-hoja="tareas-hoja-nueva">' + ui.icono('plus') + 'Nueva tarea</button>' })) + '</div>';
    } else if (!h) {
      h = '<div class="card">' + ui.estadoVacio({ icono: 'circle-check', titulo: 'Nada con fecha', texto: 'No hay tareas vencidas, para hoy ni próximas. Las que quedan no tienen fecha.', ok: true }) + '</div>';
    }
    $('tareas-grupos').innerHTML = h;

    // Sin fecha (plegado; el <details> es fijo para que no se cierre al redibujar)
    var sf = $('tareas-sinfecha'), n = por.sinfecha.length;
    sf.hidden = n === 0;
    $('tareas-sinfecha-n').textContent = String(n);
    var visibles = Math.min(n, estado.sinFechaVisibles);
    $('tareas-sinfecha-lista').innerHTML = por.sinfecha.slice(0, visibles).map(fila).join('');
    var mas = $('tareas-sinfecha-mas'), quedan = n - visibles;
    mas.hidden = quedan <= 0;
    mas.textContent = 'Mostrar ' + Math.min(PAGINA_SIN_FECHA, quedan) + ' más · quedan ' + quedan;

    // Tarea recién creada o movida: que se vea
    if (estado.resaltar) {
      var id = estado.resaltar; estado.resaltar = null;
      var li = document.querySelector('[data-screen="tareas"] [data-tarea="' + id + '"]');
      if (li) {
        if (sf.contains(li)) sf.open = true;
        if (li.scrollIntoView) li.scrollIntoView({ block: 'center' });
      }
    }
  }

  /* ── Campanita ───────────────────────────────────────────────────── */
  function aviso(t) {
    var c = t.contactoId ? MQ.contacto(t.contactoId) : null, tipo = MQ.TIPOS_TAREA[t.tipo] || MQ.TIPOS_TAREA.otro;
    return '<li class="tareas-aviso" data-tarea="' + t.id + '">' +
      '<div class="tarea__cuerpo"><p class="tarea__titulo">' + ui.icono(tipo.icono) + '<span>' + esc(t.titulo) + '</span></p>' +
      '<p class="tarea__meta">' + ui.vence(t) + (c ? '<a class="tarea__contacto" href="#ficha" data-contacto="' + c.id + '">' + esc(c.nombre) + '</a>' : '') + '</p></div>' +
      '<div class="tareas-aviso__acciones">' +
      '<button type="button" class="btn btn--secundario btn--chico" data-tareas-completar="' + t.id + '">' + ui.icono('check') + 'Completar</button>' +
      '<button type="button" class="btn btn--fantasma btn--chico" data-tareas-posponer="' + t.id + '">' + ui.icono('clock') + 'Posponer</button>' +
      '</div></li>';
  }
  function grupoAvisos(clave, titulo, icono, ts) {
    if (!ts.length) return '';
    return '<section class="tareas-campanita__grupo" aria-label="' + titulo + '">' +
      '<h3 class="tareas-campanita__encabezado" data-grupo="' + clave + '">' + ui.icono(icono) + titulo + ' · ' + ts.length + '</h3>' +
      '<ul class="lista">' + ts.map(aviso).join('') + '</ul></section>';
  }
  function pintarCampanita() {
    var av = MQ.avisos();
    var vencidas = av.filter(function (t) { return MQ.grupoDeTarea(t) === 'vencida'; });
    var ahora = av.filter(function (t) { return MQ.grupoDeTarea(t) !== 'vencida'; });
    $('tareas-campanita-t').textContent = av.length ? 'Avisos · ' + av.length : 'Avisos';
    $('tareas-campanita-cuerpo').innerHTML = av.length
      ? grupoAvisos('vencida', 'Vencidas', 'triangle-alert', vencidas) + grupoAvisos('ahora', 'Ahora', 'bell', ahora)
      : ui.estadoVacio({ icono: 'circle-check', titulo: 'Estás al día', texto: 'No tenés tareas vencidas ni para ahora.', ok: true });
    /* «Lo que viene»: todavía no suena (no suma al número), pero deja ver cuándo va a sonar lo próximo;
       por ejemplo la «Llamada 2» que la cadencia agenda para mañana 9:00. */
    var enAviso = {}; av.forEach(function (t) { enAviso[t.id] = true; });
    var vienen = MQ.misTareas().filter(function (t) { return t.estado === 'pendiente' && t.vence && !enAviso[t.id]; })
      .sort(function (a, b) { return new Date(a.vence) - new Date(b.vence); }).slice(0, 3);
    if (vienen.length) $('tareas-campanita-cuerpo').insertAdjacentHTML('beforeend',
      '<section class="tareas-campanita__grupo" aria-label="Lo que viene">' +
      '<h3 class="tareas-campanita__encabezado" data-grupo="viene">' + ui.icono('calendar') + 'Lo que viene · avisa a su hora</h3>' +
      '<ul class="lista">' + vienen.map(function (t) {
        var c = t.contactoId ? MQ.contacto(t.contactoId) : null, tipo = MQ.TIPOS_TAREA[t.tipo] || MQ.TIPOS_TAREA.otro;
        return '<li class="tareas-aviso tareas-aviso--viene"><div class="tarea__cuerpo"><p class="tarea__titulo">' + ui.icono(tipo.icono) + '<span>' + esc(t.titulo) + '</span></p>' +
          '<p class="tarea__meta">' + ui.vence(t) + (c ? '<a class="tarea__contacto" href="#ficha" data-contacto="' + c.id + '">' + esc(c.nombre) + '</a>' : '') + '</p></div></li>';
      }).join('') + '</ul></section>');
  }
  var hojaCampanita = $('tareas-campanita'), btnCampanita = $('btn-campanita');
  MQ.on('campanita', function () {
    if (!hojaCampanita.hidden) { MQ.cerrarHoja('tareas-campanita'); return; }
    pintarCampanita();
    MQ.abrirHoja('tareas-campanita');
  });
  hojaCampanita.addEventListener('hoja:abierta', function () { if (btnCampanita) btnCampanita.setAttribute('aria-expanded', 'true'); });
  hojaCampanita.addEventListener('hoja:cerrada', function () { if (btnCampanita) btnCampanita.setAttribute('aria-expanded', 'false'); });

  /* ── Completar desde la campanita (los tildes de la página ya los maneja base.js) ── */
  function completarConBoton(id, boton) {
    var li = boton.closest('.tareas-aviso'); if (li) li.classList.add('tareas-aviso--hecho');
    boton.disabled = true;
    setTimeout(function () {
      MQ.completarTarea(id);
      MQ.toast('Tarea completada', { accion: 'Deshacer', alAccionar: function () { MQ.reabrirTarea(id); } });
    }, 300);
  }

  /* ── Posponer / Poner fecha ──────────────────────────────────────── */
  var posponerId = null;
  function enUnaHora() { var d = MQ.ahora(); d.setHours(d.getHours() + 1); return MQ.iso(d); }
  function abrirPosponer(id) {
    var t = MQ.tarea(id); if (!t) return;
    posponerId = id;
    $('tareas-hoja-posponer-t').textContent = t.vence ? 'Posponer' : 'Poner fecha';
    $('tareas-p-tarea').innerHTML = '<strong>' + esc(t.titulo) + '</strong> · ' + esc(MQ.fmt.vencimiento(t).texto);
    $('tareas-p-1h').textContent = MQ.fmt.relativa(enUnaHora());
    $('tareas-p-manana').textContent = MQ.fmt.diaCorto(MQ.dia(1, '09:00'));
    $('tareas-p-elegir').hidden = true; $('tareas-p-pie').hidden = true; $('tareas-p-error').hidden = true;
    document.querySelector('[data-tareas-cuando="elegir"]').setAttribute('aria-expanded', 'false');
    $('tareas-p-dia').value = MQ.dia(1).slice(0, 10); $('tareas-p-dia').min = MQ.iso(MQ.ahora()).slice(0, 10);
    $('tareas-p-hora').value = '09:00';
    $('tareas-p-dia').removeAttribute('aria-invalid'); $('tareas-p-hora').removeAttribute('aria-invalid');
    MQ.abrirHoja('tareas-hoja-posponer');
  }
  function posponer(vence) {
    var t = MQ.tarea(posponerId); if (!t) return;
    var antes = { vence: t.vence, todoElDia: t.todoElDia }, teniaFecha = !!t.vence, id = t.id;
    MQ.cerrarHoja('tareas-hoja-posponer');
    if (MQ.pantalla === 'tareas') estado.resaltar = id;
    MQ.posponerTarea(id, vence);
    MQ.toast((teniaFecha ? 'Pospuesta para ' : 'Queda para ') + MQ.fmt.relativa(vence), { accion: 'Deshacer', alAccionar: function () {
      var x = MQ.tarea(id); if (!x) return;
      x.vence = antes.vence; x.todoElDia = antes.todoElDia;
      MQ.emit('tareas', { motivo: 'pospuesta', tarea: x });
    } });
  }
  $('tareas-form-posponer').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = $('tareas-p-dia'), h = $('tareas-p-hora'), v = d.value && h.value ? d.value + 'T' + h.value : '';
    var ok = !!v && new Date(v) > MQ.ahora();
    $('tareas-p-error').hidden = ok;
    if (ok) { d.removeAttribute('aria-invalid'); h.removeAttribute('aria-invalid'); posponer(v); }
    else { d.setAttribute('aria-invalid', 'true'); h.setAttribute('aria-invalid', 'true'); }
  });

  /* ── Nueva tarea ─────────────────────────────────────────────────── */
  function ayudaNueva() {
    var dia = $('tareas-n-dia').value, todo = $('tareas-n-todo').checked, hora = $('tareas-n-hora');
    hora.disabled = todo || !dia;
    $('tareas-n-todo').disabled = !dia;
    var txt;
    if (!dia) txt = 'Sin día queda en «Sin fecha» y no avisa en la campanita.';
    else if (todo || !hora.value) txt = 'Avisa en la campanita el ' + MQ.fmt.diaCorto(dia + 'T09:00') + ' desde las 9:00.';
    else txt = 'Avisa en la campanita el ' + MQ.fmt.diaCorto(dia + 'T' + hora.value) + ' a las ' + MQ.fmt.hora(dia + 'T' + hora.value) + '.';
    $('tareas-n-ayuda').textContent = txt;
  }
  var contactoNueva = null;   // persona sobre la que es la tarea, cuando el formulario se abre desde su ficha
  /** El único «Nueva tarea» de la maqueta. opciones.contactoId: la tarea queda atada a esa persona. */
  MQ.nuevaTarea = function (opciones) {
    contactoNueva = opciones && opciones.contactoId ? MQ.contacto(opciones.contactoId) : null;
    MQ.abrirHoja('tareas-hoja-nueva');
  };
  $('tareas-hoja-nueva').addEventListener('hoja:cerrada', function () { contactoNueva = null; });
  function prepararNueva() {
    var yo = MQ.usuario();
    $('tareas-n-titulo').value = ''; $('tareas-n-titulo').removeAttribute('aria-invalid'); $('tareas-n-titulo-error').hidden = true;
    $('tareas-n-titulo').placeholder = contactoNueva ? 'Ej.: Pedirle la escritura' : 'Ej.: Llamar al propietario de Yatay 540';
    $('tareas-n-tipo').innerHTML = TIPOS.map(function (f) {
      return '<button type="button" class="filtro" aria-pressed="' + (f.valor === 'otro') + '" data-valor="' + f.valor + '">' + ui.icono(f.icono) + f.texto + '</button>';
    }).join('');
    $('tareas-n-contacto').hidden = !contactoNueva;
    $('tareas-n-contacto-nombre').textContent = contactoNueva ? contactoNueva.nombre : '';
    var sig = MQ.ahora(); sig.setHours(sig.getHours() + 1, 0, 0, 0);
    $('tareas-n-dia').value = MQ.iso(sig).slice(0, 10);
    $('tareas-n-hora').value = MQ.iso(sig).slice(11);
    $('tareas-n-todo').checked = false;
    $('tareas-n-persona').innerHTML = usuarios().map(function (u) {
      return '<option value="' + u.id + '">' + esc(u.id === yo.id ? 'Yo (' + u.nombre + ')' : u.nombre) + '</option>';
    }).join('');
    $('tareas-n-persona').value = yo.id;
    $('tareas-n-yo').textContent = 'Vos (' + yo.nombre + ')';
    ayudaNueva();
  }
  $('tareas-hoja-nueva').addEventListener('hoja:abierta', prepararNueva);
  ['tareas-n-dia', 'tareas-n-hora', 'tareas-n-todo'].forEach(function (id) {
    $(id).addEventListener('input', ayudaNueva); $(id).addEventListener('change', ayudaNueva);
  });
  $('tareas-n-titulo').addEventListener('input', function () { this.removeAttribute('aria-invalid'); $('tareas-n-titulo-error').hidden = true; });
  $('tareas-form-nueva').addEventListener('submit', function (e) {
    e.preventDefault();
    var titulo = $('tareas-n-titulo').value.trim();
    if (!titulo) {
      $('tareas-n-titulo').setAttribute('aria-invalid', 'true'); $('tareas-n-titulo-error').hidden = false; $('tareas-n-titulo').focus();
      return;
    }
    var chip = $('tareas-n-tipo').querySelector('.filtro[aria-pressed="true"]');
    var dia = $('tareas-n-dia').value, hora = $('tareas-n-hora').value;
    var todo = !!dia && ($('tareas-n-todo').checked || !hora);
    var para = puedeVerOtros() ? $('tareas-n-persona').value : MQ.usuario().id;
    // Que la tarea nueva quede a la vista: si el filtro la esconde, se afloja el filtro.
    var tipo = chip ? chip.getAttribute('data-valor') : 'otro';
    if (estado.tipo !== 'todas' && estado.tipo !== tipoDeFiltro({ tipo: tipo })) estado.tipo = 'todas';
    if (para !== MQ.usuario().id && estado.persona === 'mias') estado.persona = para;
    else if (para === MQ.usuario().id && estado.persona !== 'mias' && estado.persona !== 'todas') estado.persona = 'mias';
    var t = { titulo: titulo, tipo: tipo, vence: dia ? dia + 'T' + (todo ? '09:00' : hora) : null, todoElDia: todo, asignadaA: para };
    var sobre = contactoNueva ? contactoNueva.id : null;   // leerlo ANTES de cerrar la hoja (al cerrarse se limpia)
    MQ.cerrarHoja('tareas-hoja-nueva');
    var creada = MQ.crearTarea({ titulo: t.titulo, tipo: t.tipo, contactoId: sobre, vence: t.vence, todoElDia: t.todoElDia, asignadaA: t.asignadaA, silencioso: true });
    estado.resaltar = MQ.pantalla === 'tareas' ? creada.id : null;
    MQ.emit('tareas', { motivo: 'creada', tarea: creada });
    var donde = { vencida: 'Vencidas', hoy: 'Hoy', proxima: 'Próximas', sinfecha: 'Sin fecha' }[MQ.grupoDeTarea(creada)];
    MQ.toast('Tarea creada' + (para !== MQ.usuario().id ? ' para ' + MQ.nombreDe(para) : '') + ' · queda en «' + donde + '»',
      MQ.pantalla === 'tareas' ? undefined : { accion: 'Ver', alAccionar: function () { estado.resaltar = creada.id; MQ.ir('tareas'); } });
  });

  /* ── Clicks propios ──────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tareas-posponer]');
    if (el) { abrirPosponer(el.getAttribute('data-tareas-posponer')); return; }
    el = e.target.closest('[data-tareas-completar]');
    if (el) { completarConBoton(el.getAttribute('data-tareas-completar'), el); return; }
    el = e.target.closest('[data-tareas-cuando]');
    if (el) {
      var c = el.getAttribute('data-tareas-cuando');
      if (c === '1h') posponer(enUnaHora());
      else if (c === 'manana') posponer(MQ.dia(1, '09:00'));
      else {
        $('tareas-p-elegir').hidden = false; $('tareas-p-pie').hidden = false; el.setAttribute('aria-expanded', 'true');
        $('tareas-p-dia').focus();
      }
      return;
    }
    if (e.target.closest('[data-tareas-ver-todas]')) { estado.tipo = 'todas'; pintar(); return; }
    if (e.target.closest('#tareas-sinfecha-mas')) { estado.sinFechaVisibles += PAGINA_SIN_FECHA; pintar(); }
  });
  $('tareas-f-tipo').addEventListener('filtro', function (e) { estado.tipo = e.detail.valor; estado.sinFechaVisibles = PAGINA_SIN_FECHA; pintar(); });
  $('tareas-f-persona').addEventListener('filtro', function (e) { estado.persona = e.detail.valor; estado.sinFechaVisibles = PAGINA_SIN_FECHA; pintar(); });
  $('tareas-sel-tipo').addEventListener('change', function () { estado.tipo = this.value; estado.sinFechaVisibles = PAGINA_SIN_FECHA; pintar(); });
  $('tareas-sel-persona').addEventListener('change', function () { estado.persona = this.value; estado.sinFechaVisibles = PAGINA_SIN_FECHA; pintar(); });

  /* ── Redibujar cuando cambia algo ────────────────────────────────── */
  MQ.on('pantalla', function (nombre) { if (nombre === 'tareas') pintar(); });
  MQ.on('tareas', function () { pintar(); if (!hojaCampanita.hidden) pintarCampanita(); });
  MQ.on('rolchange', function (rol) {
    // El dueño no tiene tareas propias: arranca viendo las de todo el equipo.
    estado.persona = rol === 'admin' ? 'todas' : 'mias';
    estado.tipo = 'todas'; estado.sinFechaVisibles = PAGINA_SIN_FECHA;
    pintar(); if (!hojaCampanita.hidden) pintarCampanita();
  });
})();
