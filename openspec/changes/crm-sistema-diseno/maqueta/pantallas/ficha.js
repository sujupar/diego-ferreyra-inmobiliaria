/* Ficha de contacto: persona | nota + registrar llamada + línea de tiempo | tareas, tasaciones, procesos, archivos */
(function () {
  'use strict';
  var MQ = window.MQ, ui = MQ.ui, fmt = MQ.fmt, esc = ui.esc, ic = ui.icono;
  var raiz = document.querySelector('section[data-screen="ficha"]');
  if (!raiz) return;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function quitar(lista, item) { var i = lista.indexOf(item); if (i !== -1) lista.splice(i, 1); }
  function esEscritorio() { return window.matchMedia('(min-width: 768px)').matches; }
  function ordenNuevo() { return MQ.actividad.reduce(function (m, a) { return Math.max(m, a.orden || 0); }, 0) + 0.5; }

  /* ── Datos propios de la ficha (ficticios) ───────────────────────── */
  var CAMPANAS = { 'Embudo · Tasación': 'Tasación · CABA · noviembre', 'Embudo · Clase gratuita': 'Clase para propietarios · CABA' };
  var ARCHIVOS = {
    c6: [{ icono: 'file-text', titulo: 'Tasación anterior · Bacacay 2450', sub: 'PDF · marzo 2025', aviso: 'Abre el PDF de la tasación, como hoy.' }]
  };
  function anuncioDe(c) { var m = /«(.+)»/.exec(c.campana || ''); return m ? '«' + m[1] + '»' : null; }

  // Ajusta la línea de tiempo de Marcela (c1). Solo eventos que HOY existen en la plataforma: registro, email enviado,
  // WhatsApp automático, video visto, tarea, nota. «Abrió el email», «hizo clic» y «leyó el WhatsApp» no se miden hoy
  // (diseño §5.4 y decisión 8.7): no van en la ficha; su aspecto queda en el Sistema de diseño, con la aclaración.
  (function sembrar() {
    var c = MQ.contacto('c1'); if (!c) return;
    var reg = MQ.actividad.filter(function (a) { return a.contactoId === 'c1' && a.tipo === 'registro'; })[0];
    if (!reg) return;
    reg.titulo = 'Se registró en la landing de tasación';
    reg.detalle = 'Campaña: ' + CAMPANAS[c.origen] + '\nAnuncio: ' + anuncioDe(c) + '\nDepartamento 3 ambientes en Caballito';
    function ev(tipo, titulo, fecha, orden, extra) {
      var a = { id: 'fx-' + MQ.actividad.length, contactoId: 'c1', tipo: tipo, titulo: titulo, detalle: null, autor: null, fecha: fecha, orden: orden };
      for (var k in (extra || {})) a[k] = extra[k];
      MQ.actividad.push(a);
    }
    ev('etapa', 'Entró a la etapa Solicitud de tasación', reg.fecha, reg.orden + 0.5);
  })();

  /* ── Estado de la pantalla ───────────────────────────────────────── */
  var filtro = 'todo', aviso = null, eventoNuevo = null, editandoBg = false;
  function c0() { return MQ.contactoActual(); }
  function nombreCorto(c) { return c.nombre.split(' ')[0]; }

  /* ── Cabecera ────────────────────────────────────────────────────── */
  function sinContacto(c) {
    var d = MQ.diasSinContacto(c.id);
    if (d === null) return '<span class="ficha-sc"' + (c.etapa === 'solicitud' ? ' data-nivel="alerta"' : '') + '>' + ic(c.etapa === 'solicitud' ? 'triangle-alert' : 'clock') + 'Sin llamar todavía</span>';
    if (d === 0) return '<span class="ficha-sc" data-nivel="ok">' + ic('circle-check') + 'Última llamada: hoy</span>';
    // Se dice QUÉ se cuenta (la última llamada; una nota o un WhatsApp no la corren). Solo alerta mientras el proceso
    // sigue en «Solicitud»: con la tasación ya agendada, o el proceso perdido, no hay a quién apurar.
    var alerta = d >= 2 && c.etapa === 'solicitud';
    return '<span class="ficha-sc"' + (alerta ? ' data-nivel="alerta"' : '') + '>' + ic(alerta ? 'triangle-alert' : 'clock') + 'Última llamada: ' + (d === 1 ? 'ayer' : 'hace ' + d + ' días') + '</span>';
  }
  function pintarCab(c) {
    $('#ficha-cab-persona').innerHTML = ui.avatar(c.nombre) +
      '<div class="crece pila pila--chica"><h1 class="ficha-cab__nombre">' + esc(c.nombre) + '</h1>' +
      '<div class="fila fila--envuelve ficha-cab__chips">' + ui.chipEtapa(c.etapa) + sinContacto(c) + '</div></div>';
    var ll = $('#ficha-llamar');
    ll.href = fmt.tel(c.telefono);
    ll.setAttribute('aria-label', 'Llamar a ' + c.nombre + ' al ' + c.telefono);
    ll.innerHTML = ic('phone') + '<span>Llamar · <strong>' + esc(c.telefono) + '</strong></span>';
    $('#ficha-cab-email').innerHTML = ic('mail') + '<span>' + esc(c.email) + '</span>';
    $('#ficha-hoja-mas-t').dataset.nombre = nombreCorto(c);
  }

  /* ── Datos (columna izquierda) ───────────────────────────────────── */
  function dato(etiqueta, valor) { return valor ? '<div class="dato"><span class="dato__etiqueta">' + esc(etiqueta) + '</span><span class="dato__valor">' + valor + '</span></div>' : ''; }
  function pintarDatos(c) {
    $('#ficha-contacto-datos').innerHTML =
      dato('Teléfono', '<a class="enlace ficha-tel" href="' + fmt.tel(c.telefono) + '">' + esc(c.telefono) + '</a>') + dato('Email', esc(c.email));
    $('#ficha-detalles').innerHTML =
      dato('Etapa', esc(MQ.ETAPAS[c.etapa])) +
      dato('Origen', esc(c.origen)) +
      dato('Campaña', esc(CAMPANAS[c.origen] || '')) +
      dato('Anuncio', esc(anuncioDe(c) || '')) +
      dato('Asesor', c.asesor ? esc(c.asesor) : '<span class="texto-suave">Sin asignar todavía</span>') +
      dato('Barrio', esc(c.barrio)) +
      dato('Tipo', esc(c.tipoPropiedad)) +
      dato('Ambientes', esc(c.ambientes)) +
      dato('Dirección', esc(c.direccion));
    pintarBg(c);
  }
  function pintarBg(c) {
    var caja = $('#ficha-bg'), h;
    if (editandoBg) {
      h = '<div class="card__cabecera"><h2 class="card__titulo">Background</h2></div><div class="card__cuerpo">' +
        '<textarea class="entrada" id="ficha-bg-texto" rows="4" aria-label="Background" placeholder="Contexto de la persona: por qué vende, cuándo llamarla, quién decide…">' + esc(c.background) + '</textarea>' +
        '<div class="ficha-bg__acciones"><button type="button" class="btn btn--secundario btn--chico" data-ficha="bg-cancelar">Cancelar</button>' +
        '<button type="button" class="btn btn--marca btn--chico" data-ficha="bg-guardar">Guardar</button></div></div>';
    } else if (c.background) {
      h = '<div class="card__cabecera"><h2 class="card__titulo">Background</h2><button type="button" class="btn btn--fantasma btn--chico" data-ficha="bg-editar">' + ic('pencil') + 'Editar</button></div>' +
        '<div class="card__cuerpo"><p class="ficha-bg__texto">' + esc(c.background) + '</p></div>';
    } else {
      h = '<div class="card__cabecera"><h2 class="card__titulo">Background</h2><button type="button" class="btn btn--fantasma btn--chico" data-ficha="bg-editar">' + ic('plus') + 'Agregar</button></div>';
    }
    caja.innerHTML = h;
  }

  /* ── Línea de tiempo ─────────────────────────────────────────────── */
  var VACIOS = {
    llamadas: { icono: 'phone', titulo: 'Todavía no hay llamadas', texto: 'Cuando registres una, aparece acá con su resultado.', accion: '<button type="button" class="btn btn--secundario" data-ficha="abrir-llamada">' + ic('phone') + 'Registrar llamada</button>' },
    notas: { icono: 'sticky-note', titulo: 'Todavía no hay notas', accion: '<button type="button" class="btn btn--secundario" data-ficha="abrir-nota">' + ic('plus') + 'Escribir una nota</button>' },
    actividad: { icono: 'clock', titulo: 'Sin actividad todavía' }, todo: { icono: 'clock', titulo: 'Sin actividad todavía' }
  };
  function pasaFiltro(e) {
    if (filtro === 'todo') return true;
    if (filtro === 'llamadas') return e.tipo === 'llamada';
    if (filtro === 'notas') return e.tipo === 'nota';
    return e.tipo !== 'llamada' && e.tipo !== 'nota';
  }
  function pintarLinea(c) {
    var evs = MQ.actividadDe(c.id).filter(pasaFiltro);
    $('#ficha-linea').innerHTML = evs.length
      ? '<ul class="linea-tiempo">' + evs.map(function (e) { return ui.itemEvento(e, { nuevo: e.id === eventoNuevo }); }).join('') + '</ul>'
      : ui.estadoVacio(VACIOS[filtro]);
    eventoNuevo = null;
  }

  /* ── Aviso después de guardar ────────────────────────────────────── */
  function pintarAviso(c) {
    var caja = $('#ficha-aviso');
    if (!aviso || aviso.contactoId !== c.id) { caja.innerHTML = ''; return; }
    caja.innerHTML = '<div class="ficha-aviso" role="status"><span class="ficha-aviso__icono">' + ic(aviso.icono) + '</span><div class="ficha-aviso__cuerpo">' +
      '<p class="ficha-aviso__titulo">' + esc(aviso.titulo) + '</p>' +
      aviso.lineas.map(function (l) { return '<p class="ficha-aviso__linea">' + ic(l[0]) + '<span>' + esc(l[1]) + '</span></p>'; }).join('') +
      (aviso.acciones ? '<div class="ficha-aviso__acciones">' + aviso.acciones + '</div>' : '') +
      '</div><button type="button" class="btn btn--icono" data-ficha="aviso-cerrar" aria-label="Cerrar el aviso">' + ic('x') + '</button></div>';
  }

  /* ── Columna derecha ─────────────────────────────────────────────── */
  function item(o) {
    var et = o.aviso ? 'button type="button" data-toast="' + esc(o.aviso) + '"' : 'div';
    return '<li><' + et + ' class="ficha-item"><span class="ficha-item__icono' + (o.marca ? ' ficha-item__icono--marca' : '') + '">' + ic(o.icono) + '</span>' +
      '<span class="ficha-item__cuerpo"><span class="ficha-item__titulo">' + o.titulo + '</span><span class="ficha-item__sub">' + o.sub + '</span></span>' +
      (o.aviso ? ic('chevron-right') : '') + '</' + et.split(' ')[0] + '></li>';
  }
  function bloque(id, titulo, items) {
    var caja = $(id);
    caja.hidden = !items.length;   // una sección sin datos no se muestra
    caja.innerHTML = items.length ? '<div class="card__cabecera"><h2 class="card__titulo">' + titulo + '</h2></div><div class="card__cuerpo"><ul class="lista">' + items.join('') + '</ul></div>' : '';
  }
  function pintarLado(c) {
    var tieneTasacion = MQ.tasaciones.some(function (t) { return t.contactoId === c.id; });
    // La tasación agendada ya se ve en su tarjeta, acá abajo: no se repite como tarea.
    var ts = MQ.tareasDe(c.id).filter(function (t) { return !(t.tipo === 'tasacion' && tieneTasacion); });
    $('#ficha-tareas').innerHTML = '<div class="card__cabecera"><h2 class="card__titulo">Tareas' + (ts.length ? ' <span class="texto-suave ficha-tareas__n">· ' + ts.length + '</span>' : '') + '</h2>' +
      '<button type="button" class="btn btn--secundario btn--chico" data-ficha="tarea-nueva">' + ic('plus') + 'Tarea</button></div>' +
      (ts.length ? '<div class="card__cuerpo"><ul class="lista">' + ts.map(function (t) { return ui.itemTarea(t, { sinContacto: true, conPersona: true }); }).join('') + '</ul></div>' : '');
    var n = $('#ficha-tab-tareas-n'); n.hidden = !ts.length; n.textContent = ts.length;

    bloque('#ficha-tasaciones', 'Tasaciones agendadas', MQ.tasaciones.filter(function (t) { return t.contactoId === c.id; }).map(function (t) {
      return item({ icono: 'calendar-check', marca: true, titulo: esc(fmt.diaCorto(t.fecha) + ', ' + fmt.hora(t.fecha)), sub: '<span>' + esc(t.direccion) + '</span><span>con ' + esc(t.asesor) + '</span>',
        aviso: 'Abre la tasación agendada, como hoy.' });
    }));
    bloque('#ficha-procesos', 'Procesos', [item({ icono: 'briefcase', titulo: 'Tasación · ' + esc(c.tipoPropiedad) + ' ' + esc(c.ambientes) + ' amb. · ' + esc(c.barrio),
      sub: ui.chipEtapa(c.etapa) + '<span>Abierto ' + esc(fmt.relativa(c.creado)) + '</span>', aviso: 'Abre el proceso en el CRM, como hoy.' })]);
    bloque('#ficha-archivos', 'Archivos', (ARCHIVOS[c.id] || []).map(function (a) { return item({ icono: a.icono, titulo: esc(a.titulo), sub: '<span>' + esc(a.sub) + '</span>', aviso: a.aviso }); }));
  }

  function pintar() {
    var c = c0(); if (!c) return;
    pintarCab(c); pintarDatos(c); pintarAviso(c); pintarLinea(c); pintarLado(c);
    if (MQ.pantalla === 'ficha') MQ.setTitulo(c.nombre, 'Contactos');
  }

  /* ── Formularios (dos copias: composer de escritorio y hoja del celular) ── */
  var ORDEN_RESULTADOS = ['no_atendio', 'agendo', 'volver', 'no_interesa', 'equivocado'];
  function plantillaLlamada() {
    return '<p class="eyebrow">¿Qué pasó?</p><div class="ficha-ll__opciones">' +
      ORDEN_RESULTADOS.map(function (r) {
        var d = MQ.RESULTADOS[r];
        return '<button type="button" class="opcion" aria-pressed="false" data-resultado="' + r + '"><span class="opcion__icono">' + ic(d.icono) + '</span><span class="crece">' + esc(d.texto) + '</span>' +
          (r === 'no_atendio' ? '<span class="badge badge--borde ficha-ll__rapido">Guarda al toque</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="ficha-ll__volver" hidden><p class="ficha-ll__volver-t">¿Cuándo hay que volver a llamar?</p>' +
        '<div class="filtros ficha-envuelve" aria-label="Atajos de día y hora">' +
          '<button type="button" class="filtro" aria-pressed="false" data-volver="0|16:00">Hoy 16:00</button>' +
          '<button type="button" class="filtro" aria-pressed="false" data-volver="1|10:00">Mañana 10:00</button>' +
          '<button type="button" class="filtro" aria-pressed="false" data-volver="1|16:00">Mañana 16:00</button></div>' +
        '<div class="ficha-dos"><label class="campo"><span class="campo__etiqueta">Día</span><input class="entrada ficha-ll__dia" type="date" min="' + MQ.dia(0).slice(0, 10) + '"></label>' +
        '<label class="campo"><span class="campo__etiqueta">Hora</span><input class="entrada ficha-ll__hora-v" type="time"></label></div>' +
        '<span class="campo__error ficha-ll__volver-error" hidden></span></div>' +
      '<label class="campo"><span class="campo__etiqueta">Comentario <span class="texto-suave">(opcional)</span></span>' +
        '<textarea class="entrada ficha-corta ficha-ll__nota" rows="2" placeholder="Ej.: pidió que la llamen a la tarde"></textarea></label>' +
      '<div class="ficha-ll__hora"><button type="button" class="ficha-enlace-btn" data-ficha="ll-hora" aria-expanded="false">' + ic('clock') + '¿Fue hace un rato? Corregir la hora</button>' +
        '<div class="filtros ficha-envuelve ficha-ll__atraso" aria-label="Cuándo fue la llamada" hidden>' +
          '<button type="button" class="filtro" aria-pressed="true" data-atraso="0">Recién</button>' +
          '<button type="button" class="filtro" aria-pressed="false" data-atraso="15">Hace 15 min</button>' +
          '<button type="button" class="filtro" aria-pressed="false" data-atraso="30">Hace 30 min</button>' +
          '<button type="button" class="filtro" aria-pressed="false" data-atraso="60">Hace 1 hora</button></div></div>' +
      '<button type="button" class="btn btn--marca btn--ancho ficha-ll__guardar" data-ficha="ll-guardar" hidden>Guardar llamada</button>' +
      '<hr class="divisor"><div class="ficha-ll__wa"><button type="button" class="btn btn--secundario btn--ancho" data-ficha="ll-whatsapp">' + ic('message-circle') + 'Marcar WhatsApp enviado</button>' +
      '<p class="campo__ayuda">No manda nada: deja anotado que le escribiste desde tu teléfono.</p></div>';
  }
  function plantillaNota() {
    return '<textarea class="entrada ficha-n__texto" rows="3" aria-label="Nota" placeholder="Escribí una nota…"></textarea>' +
      '<span class="campo__error ficha-n__error" hidden>' + ic('triangle-alert') + 'Escribí algo para guardar la nota</span>' +
      '<div class="ficha-nota__pie"><button type="button" class="btn btn--marca" data-ficha="nota-guardar">Guardar nota</button></div>';
  }
  function reiniciarFormularios() {
    $$('.ficha-form-llamada').forEach(function (f) { f.innerHTML = plantillaLlamada(); });
    $$('.ficha-form-nota').forEach(function (f) { f.innerHTML = plantillaNota(); });
  }

  /* ── Hoja del "+" ────────────────────────────────────────────────── */
  var hojaMas = $('#ficha-hoja-mas');
  var TITULOS = { menu: 'Agregar', llamada: 'Registrar llamada', nota: 'Nota' };
  function vista(nombre) {
    $$('[data-vista]', hojaMas).forEach(function (v) { v.hidden = v.getAttribute('data-vista') !== nombre; });
    $('#ficha-hoja-volver').hidden = nombre === 'menu';
    $('#ficha-hoja-mas-t').textContent = TITULOS[nombre];
    hojaMas.querySelector('.hoja__cuerpo').scrollTop = 0;
  }
  hojaMas.addEventListener('hoja:cerrada', function () { vista('menu'); });
  /** Abre el formulario pedido: en escritorio, la pestaña del composer; en celular, la hoja. */
  function abrirFormulario(cual) {
    if (esEscritorio()) {
      $('#ficha-ctab-' + cual).click();
      var caja = $('#ficha-composer'), foco = $(cual === 'nota' ? '.ficha-n__texto' : '.opcion', caja);
      caja.scrollIntoView({ block: 'start' });
      if (foco) foco.focus({ preventScroll: true });
    } else { vista(cual); MQ.abrirHoja('ficha-hoja-mas'); }
  }
  function despuesDeGuardar() {
    reiniciarFormularios();
    MQ.cerrarHoja('ficha-hoja-mas');
    if (esEscritorio()) $('#ficha-ctab-nota').click(); else $('#ficha-tab-actividad').click();
    filtro = 'todo';
    $$('#ficha-filtros .filtro').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-valor') === 'todo')); });
    var cont = document.getElementById('contenido'); if (cont) cont.scrollTop = 0;
    pintar();
  }
  function avisarCambios() {
    MQ.emit('actividad', { motivo: 'deshecha', evento: null });
    MQ.emit('tareas', { motivo: 'cadencia', tarea: null, completadas: [] });
  }

  /* ── Guardar llamada / WhatsApp / nota ───────────────────────────── */
  function tituloCorto(t, c) { return t.titulo.replace(' a ' + c.nombre, ''); }
  function deshacer(r) {
    quitar(MQ.actividad, r.evento);
    if (r.tareaCreada) {
      MQ.actividad.filter(function (a) { return a.tareaId === r.tareaCreada.id; }).forEach(function (a) { quitar(MQ.actividad, a); });
      quitar(MQ.tareas, r.tareaCreada);
    }
    (r.tareasCompletadas || []).forEach(function (t) { t.estado = 'pendiente'; t.completada = null; });
    aviso = null;
    avisarCambios();
    MQ.toast('Listo, se deshizo.');
  }
  function guardarLlamada(form, resultado) {
    var c = c0(), nota = $('.ficha-ll__nota', form).value.trim(), datos = { contactoId: c.id, resultado: resultado, nota: nota || null };
    if (resultado === 'volver') {
      var dia = $('.ficha-ll__dia', form), hora = $('.ficha-ll__hora-v', form), err = $('.ficha-ll__volver-error', form), msj = '';
      if (!dia.value || !hora.value) msj = 'Elegí día y hora para volver a llamar';
      else if (dia.value + 'T' + hora.value <= MQ.iso(MQ.ahora())) msj = 'Tiene que ser más adelante que ahora';
      dia.setAttribute('aria-invalid', String(!dia.value || !!msj && !!hora.value));
      hora.setAttribute('aria-invalid', String(!hora.value || !!msj && !!dia.value));
      err.hidden = !msj; err.innerHTML = ic('triangle-alert') + esc(msj);
      if (msj) { (dia.value ? hora : dia).focus(); return; }
      datos.volverEl = dia.value + 'T' + hora.value;
    }
    var chip = $('.ficha-ll__atraso [aria-pressed="true"]', form), atraso = chip ? +chip.getAttribute('data-atraso') : 0;
    var r = MQ.registrarLlamada(datos);
    if (atraso) { var d = MQ.ahora(); d.setMinutes(d.getMinutes() - atraso); r.evento.fecha = MQ.iso(d); }
    eventoNuevo = r.evento.id;

    var texto = MQ.RESULTADOS[resultado].corto, lineas = [], acciones = '', corto = 'Llamada ' + r.intento + ' guardada.';
    if (r.tareaCreada) {
      var frase = 'Se agendó ' + tituloCorto(r.tareaCreada, c) + ' para ' + fmt.relativa(r.tareaCreada.vence) + '.';
      lineas.push(['calendar-check', frase]); corto += ' ' + frase;
      acciones = '<button type="button" class="btn btn--secundario btn--chico solo-celular" data-ficha="ver-tareas">Ver en Tareas</button>';
    } else if (resultado === 'no_atendio') {
      lineas.push(['message-circle', 'Ya se le mandó WhatsApp: no se crea otra tarea. Queda en «Sin respuesta» del Inicio.']);
    }
    (r.tareasCompletadas || []).forEach(function (t) { lineas.push(['circle-check', 'Se completó sola la tarea «' + t.titulo + '».']); });
    if (resultado === 'agendo') {
      lineas.push(['arrow-right', 'Falta coordinar día, hora y asesor de la tasación.']);
      acciones = '<button type="button" class="btn btn--marca btn--chico" data-ficha="coordinar">' + ic('calendar-check') + 'Coordinar tasación</button>';
    }
    if (resultado === 'no_interesa' || resultado === 'equivocado') {
      lineas.push(['arrow-right', 'El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo.']);
      acciones = '<button type="button" class="btn btn--peligro btn--chico" data-ficha="perdido">Marcar proceso como perdido</button>' +
        '<button type="button" class="btn btn--fantasma btn--chico" data-ficha="aviso-cerrar">Dejarlo abierto</button>';
    }
    aviso = { contactoId: c.id, icono: MQ.RESULTADOS[resultado].icono, titulo: 'Llamada ' + r.intento + ' · ' + texto, lineas: lineas, acciones: acciones };
    despuesDeGuardar();
    MQ.toast(corto, { accion: 'Deshacer', alAccionar: function () { deshacer(r); } });
  }
  function guardarWhatsapp(form) {
    var c = c0(), nota = $('.ficha-ll__nota', form).value.trim();
    var r = MQ.registrarWhatsapp(c.id, nota || null);
    eventoNuevo = r.evento.id;
    var lineas = [['circle-check', 'La secuencia termina acá: no se crea ninguna tarea más.']];
    (r.tareasCompletadas || []).forEach(function (t) { lineas.push(['circle-check', 'Se completó sola la tarea «' + t.titulo + '».']); });
    lineas.push(['arrow-right', 'Si no contesta, queda en «Sin respuesta» del Inicio para decidir qué hacer.']);
    aviso = { contactoId: c.id, icono: 'message-circle', titulo: 'WhatsApp marcado como enviado', lineas: lineas, acciones: '' };
    despuesDeGuardar();
    MQ.toast('WhatsApp marcado como enviado. No se crea ninguna tarea más.', { accion: 'Deshacer', alAccionar: function () { deshacer(r); } });
  }
  function guardarNota(form) {
    var campo = $('.ficha-n__texto', form), texto = campo.value.trim(), err = $('.ficha-n__error', form);
    err.hidden = !!texto; campo.setAttribute('aria-invalid', String(!texto));
    if (!texto) { campo.focus(); return; }
    var ev = MQ.agregarNota(c0().id, texto);
    eventoNuevo = ev.id;
    despuesDeGuardar();
    MQ.toast('Nota guardada.', { accion: 'Deshacer', alAccionar: function () { quitar(MQ.actividad, ev); avisarCambios(); } });
  }
  function eventoPropio(c, tipo, titulo) {
    var ev = { id: 'fx-' + MQ.actividad.length + '-' + tipo, contactoId: c.id, tipo: tipo, titulo: titulo, detalle: null, autor: MQ.usuario().nombre, fecha: MQ.iso(MQ.ahora()), orden: ordenNuevo() };
    MQ.actividad.push(ev); return ev;
  }
  function marcarPerdido() {
    var c = c0(), antes = c.etapa; if (antes === 'perdida') return;
    c.etapa = 'perdida';
    // Un proceso perdido no deja una tasación agendada colgando.
    var canceladas = MQ.tasaciones.filter(function (t) { return t.contactoId === c.id && t.fecha > MQ.iso(MQ.ahora()); });
    canceladas.forEach(function (t) { quitar(MQ.tasaciones, t); });
    var ev = eventoPropio(c, 'etapa', 'Pasó de ' + MQ.ETAPAS[antes] + ' a Perdida');
    eventoNuevo = ev.id; aviso = null;
    MQ.emit('actividad', { motivo: 'etapa', evento: ev });
    MQ.toast('Proceso marcado como perdido.' + (canceladas.length ? ' Se quitó la tasación agendada.' : ''), { accion: 'Deshacer', alAccionar: function () {
      c.etapa = antes; quitar(MQ.actividad, ev); canceladas.forEach(function (t) { MQ.tasaciones.push(t); }); avisarCambios(); } });
  }
  function coordinar() {
    var c = c0(), antes = c.etapa, fecha = MQ.siguienteDiaHabil(new Date(MQ.siguienteDiaHabil())).slice(0, 10) + 'T10:00', asesor = 'Tomás Agüero';   // vie 27, 10:00: no pisa la tasación de Villalba
    var tas = { id: 'ta-' + c.id + '-' + MQ.tasaciones.length, contactoId: c.id, direccion: c.direccion + ', ' + c.barrio, fecha: fecha, asesor: asesor };
    MQ.tasaciones.push(tas); c.etapa = 'agendada'; c.asesor = asesor;
    var e1 = eventoPropio(c, 'etapa', 'Pasó de ' + MQ.ETAPAS[antes] + ' a Tasación agendada');
    var e2 = eventoPropio(c, 'tasacion', 'Tasación agendada · ' + fmt.diaCorto(fecha) + ', ' + fmt.hora(fecha) + ' con ' + asesor);
    eventoNuevo = e2.id; aviso = null;
    MQ.emit('actividad', { motivo: 'etapa', evento: e2 });
    MQ.toast('Simulado: acá se abre «Coordinar tasación», el formulario de hoy. Quedó para ' + fmt.relativa(fecha) + ' con ' + asesor + '.', { ms: 7000 });
    void e1;
  }

  /* ── Tarea nueva: el formulario único de la maqueta (tareas.js), con esta persona ya puesta ── */

  /* ── Clicks ──────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target, el, form;

    el = t.closest('[data-ficha-vista]');
    if (el) { vista(el.getAttribute('data-ficha-vista')); return; }
    if (t.closest('#ficha-hoja-volver')) { vista('menu'); return; }

    form = t.closest('.ficha-form-llamada');
    if (form) {
      el = t.closest('.opcion[data-resultado]');
      if (el) {
        var r = el.getAttribute('data-resultado');
        if (r === 'no_atendio') { guardarLlamada(form, r); return; }   // un toque y queda guardada
        $$('.opcion', form).forEach(function (o) { o.setAttribute('aria-pressed', String(o === el)); });
        $('.ficha-ll__volver', form).hidden = r !== 'volver';
        var g = $('.ficha-ll__guardar', form); g.hidden = false;
        // Queda un solo botón Guardar, ya enfocado. Con «volver a llamar» primero hay que elegir día y hora.
        // En la hoja del celular «Guardar llamada» queda pegado abajo (ficha.css), así que siempre se ve.
        if (r === 'volver') $('.ficha-ll__volver', form).scrollIntoView({ block: 'nearest' }); else { g.focus({ preventScroll: true }); g.scrollIntoView({ block: 'nearest' }); }
        return;
      }
      el = t.closest('[data-volver]');
      if (el) {
        var p = el.getAttribute('data-volver').split('|'), f = MQ.dia(+p[0], p[1]);
        $('.ficha-ll__dia', form).value = f.slice(0, 10); $('.ficha-ll__hora-v', form).value = f.slice(11);
        $('.ficha-ll__volver-error', form).hidden = true;
        var gv = $('.ficha-ll__guardar', form); gv.focus({ preventScroll: true }); gv.scrollIntoView({ block: 'nearest' });
        return;   // base.js marca el atajo elegido
      }
    }

    el = t.closest('[data-ficha]');
    if (!el) return;
    switch (el.getAttribute('data-ficha')) {
      case 'll-guardar': form = el.closest('.ficha-form-llamada'); guardarLlamada(form, $('.opcion[aria-pressed="true"]', form).getAttribute('data-resultado')); break;
      case 'll-whatsapp': guardarWhatsapp(el.closest('.ficha-form-llamada')); break;
      case 'll-hora': var caja = $('.ficha-ll__atraso', el.parentNode); caja.hidden = !caja.hidden; el.setAttribute('aria-expanded', String(!caja.hidden)); break;
      case 'nota-guardar': guardarNota(el.closest('.ficha-form-nota')); break;
      case 'abrir-llamada': abrirFormulario('llamada'); break;
      case 'abrir-nota': abrirFormulario('nota'); break;
      case 'tarea-nueva': MQ.nuevaTarea({ contactoId: c0().id }); break;
      case 'ver-tareas': $('#ficha-tab-tareas').click(); break;
      case 'aviso-cerrar': aviso = null; pintarAviso(c0()); break;
      case 'perdido': marcarPerdido(); break;
      case 'coordinar': coordinar(); break;
      case 'bg-editar': editandoBg = true; pintarBg(c0()); var ta = $('#ficha-bg-texto'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); break;
      case 'bg-cancelar': editandoBg = false; pintarBg(c0()); break;
      case 'bg-guardar': c0().background = $('#ficha-bg-texto').value.trim(); editandoBg = false; pintarBg(c0()); MQ.toast('Background guardado.'); break;
    }
  });
  $('#ficha-filtros').addEventListener('filtro', function (e) { filtro = e.detail.valor; pintarLinea(c0()); });

  /* ── Redibujar cuando cambia algo ────────────────────────────────── */
  MQ.on('actividad', pintar);
  MQ.on('tareas', pintar);
  MQ.on('rolchange', pintar);
  MQ.on('contacto', function () {
    aviso = null; editandoBg = false; filtro = 'todo';
    $$('#ficha-filtros .filtro').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-valor') === 'todo')); });
    reiniciarFormularios();
    $('#ficha-tab-actividad').click();
    pintar();
  });
  MQ.on('pantalla', function (p) {
    if (p !== 'ficha') return;
    pintar();
    // Llegaron desde «Registrar» del Inicio: el formulario de la llamada ya abierto (queda un toque: el resultado).
    if (MQ.alLlegarAFicha) { var cual = MQ.alLlegarAFicha; MQ.alLlegarAFicha = null; abrirFormulario(cual); }
  });

  reiniciarFormularios();
  pintar();
})();
