/* Inicio por rol. Todo sale del store (MQ): lo que se registra en la ficha aparece acá. */
(function () {
  'use strict';
  var MQ = window.MQ, ui = MQ.ui, fmt = MQ.fmt, esc = ui.esc;
  var COORD = 'paula'; // la cola de llamados es una sola, de coordinación

  /* ── Fechas ──────────────────────────────────────────────────────── */
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function diaDe(f) { return String(f).slice(0, 10); }
  function hoy() { return diaDe(MQ.dia(0)); }
  function manana() { return diaDe(MQ.dia(1)); }
  function minutosDesde(f) { return Math.max(0, Math.round((MQ.ahora() - new Date(f)) / 60000)); }
  /** 28 → "28 min" · 980 → "16 h 20 min" · 4000 → "2 días 18 h" */
  function duracion(min) {
    min = Math.round(min);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 48) return h + ' h' + (m ? ' ' + m + ' min' : '');
    var d = Math.floor(h / 24), hr = h % 24;
    return d + ' días' + (hr ? ' ' + hr + ' h' : '');
  }
  /** Minutos dentro del horario laboral (lunes a viernes, 9 a 13) entre dos momentos. */
  function minutosHabiles(desde, hasta) {
    var a = new Date(desde), b = new Date(hasta), total = 0;
    var d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    while (d <= b) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        var ini = new Date(d); ini.setHours(9, 0, 0, 0);
        var fin = new Date(d); fin.setHours(13, 0, 0, 0);
        var x = Math.max(ini, a), y = Math.min(fin, b);
        if (y > x) total += (y - x) / 60000;
      }
      d.setDate(d.getDate() + 1);
    }
    return total;
  }

  /* ── Lecturas del store ──────────────────────────────────────────── */
  function propiedad(c) {
    var tipo = c.tipoPropiedad === 'Departamento' ? 'Depto' : c.tipoPropiedad;
    return tipo + ' ' + c.ambientes + ' amb, ' + c.barrio;
  }
  function tareaDeLlamada(c) {
    return MQ.tareasDe(c.id).filter(function (t) { return t.tipo === 'llamada' && t.asignadaA === COORD && MQ.yaVencio(t); })[0] || null;
  }
  function sinPrimerContacto(c) {
    return c.etapa === 'solicitud' && MQ.llamadasDe(c.id).length === 0 && !MQ.cadenciaDe(c.id).whatsappEnviado;
  }
  function porAntiguedad(a, b) { return a.contacto.creado < b.contacto.creado ? -1 : 1; }
  /** Llamada vencida o sin primer contacto, del registro más viejo al más nuevo. */
  function colaParaLlamar() {
    var cola = [];
    MQ.contactos.forEach(function (c) {
      var t = tareaDeLlamada(c);
      if (!t && !(sinPrimerContacto(c) && c.asignadoA === COORD)) return;
      var ll = MQ.llamadasDe(c.id).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
      cola.push({ contacto: c, tarea: t, intento: ll.length + 1, ultima: ll[0] || null });
    });
    return cola.sort(porAntiguedad);
  }
  function sinRespuesta() {
    var lista = [];
    MQ.contactos.forEach(function (c) {
      var cad = MQ.cadenciaDe(c.id);
      if (c.etapa !== 'solicitud' || !cad.whatsappEnviado || tareaDeLlamada(c)) return;
      var w = MQ.actividadDe(c.id).filter(function (a) { return a.tipo === 'whatsapp' && a.origen === 'manual'; })[0];
      lista.push({ contacto: c, whatsapp: w, llamadas: cad.llamadas });
    });
    return lista.sort(porAntiguedad);
  }
  function tareasDeHoy(usuarioId, descartar) {
    return MQ.misTareas(usuarioId).filter(function (t) {
      var g = MQ.grupoDeTarea(t);
      return (g === 'vencida' || g === 'hoy') && !(descartar && descartar(t));
    });
  }
  function tareasDeManana(usuarioId) {
    return MQ.misTareas(usuarioId).filter(function (t) { return t.vence && diaDe(t.vence) === manana(); });
  }
  function tasacionesCerca() {
    return MQ.tasaciones.filter(function (t) { return diaDe(t.fecha) === hoy() || diaDe(t.fecha) === manana(); })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }
  function numerosDelDia() {
    var llamadas = MQ.actividad.filter(function (a) { return a.tipo === 'llamada' && diaDe(a.fecha) === hoy(); });
    return {
      solicitudes: MQ.contactos.filter(function (c) { return diaDe(c.creado) === hoy(); }).length,
      llamadas: llamadas.length,
      agendadas: llamadas.filter(function (a) { return a.resultado === 'agendo'; }).length
    };
  }
  /** Cohorte: leads registrados desde el lunes. Promedia solo los que ya tienen primera llamada. */
  function tiempoPrimeraLlamada() {
    var lunes = MQ.ahora(); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7)); lunes.setHours(0, 0, 0, 0);
    var reloj = 0, habiles = 0, n = 0, sinLlamar = 0;
    MQ.contactos.forEach(function (c) {
      if (new Date(c.creado) < lunes) return;
      var primera = MQ.llamadasDe(c.id).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; })[0];
      if (!primera) { sinLlamar += 1; return; }
      n += 1;
      reloj += (new Date(primera.fecha) - new Date(c.creado)) / 60000;
      habiles += minutosHabiles(c.creado, primera.fecha);
    });
    return { n: n, sinLlamar: sinLlamar, reloj: n ? reloj / n : null, habiles: n ? habiles / n : null };
  }

  /* Procesos del asesor que esperan algo de él. Los tres abren la ficha de la persona. */
  var PROCESOS = [
    { contactoId: 'c6', nombre: 'Ernesto Villalba', propiedad: 'Casa 5 amb, Flores', etapa: 'agendada',
      espera: 'Tasación mañana a las 11:00: falta armar los comparables.' },
    { contactoId: 'c10', nombre: 'Mirta Sosa', propiedad: 'PH 3 amb, Villa Crespo', etapa: 'visita',
      espera: 'Entregar la tasación: la visita fue hace 4 días.' },
    { contactoId: 'c11', nombre: 'Jorge Altamirano', propiedad: 'Depto 2 amb, Saavedra', etapa: 'entregada',
      espera: 'Llamar por la respuesta: la tasación se entregó hace 6 días.' }
  ];

  /* ── Piezas de HTML ──────────────────────────────────────────────── */
  /** Una línea de datos sueltos separados por «·». El punto nunca queda colgado al cortar el renglón (ver .inicio-hechos). */
  function hechos(lista) { return '<span class="inicio-hechos">' + lista.map(function (h) { return '<span>' + h + '</span>'; }).join('') + '</span>'; }
  function soloLectura() { return '<span class="badge badge--borde">' + ui.icono('eye') + 'Solo lectura</span>'; }
  function card(o) {
    return '<section class="card' + (o.marca ? ' card--marca' : '') + '" style="order:' + o.orden + '" aria-label="' + esc(o.titulo) + '">' +
      '<div class="card__cabecera"><h2 class="card__titulo">' + esc(o.titulo) + '</h2>' +
      (o.n != null ? '<span class="badge badge--numero' + (o.marca ? ' badge--marca' : '') + '">' + o.n + '</span>' : '') + (o.extra || '') + '</div>' +
      '<div class="card__cuerpo">' + o.cuerpo + '</div>' + (o.pie ? '<div class="card__pie fila inicio-pie">' + o.pie + '</div>' : '') + '</section>';
  }
  function filaPersona(c, o) {
    var acciones = o.lectura ? '' :
      '<div class="inicio-fila__acciones">' +
      '<a class="btn btn--marca inicio-tel" href="' + fmt.tel(c.telefono) + '" aria-label="Llamar a ' + esc(c.nombre) + ' al ' + esc(c.telefono) + '">' + ui.icono('phone') + esc(c.telefono) + '</a>' +
      '<a class="btn btn--secundario" href="#ficha" data-contacto="' + c.id + '" data-registrar aria-label="Registrar la llamada a ' + esc(c.nombre) + '">' + ui.icono('pencil') + 'Registrar</a></div>';
    return '<li class="inicio-fila' + (o.lectura ? ' inicio-fila--lectura' : '') + '"><div class="inicio-fila__info" data-fecha-fila>' + ui.avatar(c.nombre) +
      '<div class="inicio-fila__texto"><p class="inicio-fila__titulo">' +
      '<a class="inicio-fila__nombre" href="#ficha" data-contacto="' + c.id + '"><span class="truncar">' + esc(c.nombre) + '</span></a>' + (o.badge || '') + '</p>' +
      o.lineas.map(function (l) { return '<p class="inicio-fila__meta">' + hechos(l) + '</p>'; }).join('') +
      (o.lectura ? '<p class="inicio-fila__meta">' + hechos([ui.icono('phone') + esc(c.telefono)]) + '</p>' : '') +
      '</div></div>' + acciones + '</li>';
  }
  function registro(c) { return ['Se registró ' + ui.fecha(c.creado), esc(propiedad(c))]; }
  /** Cuánto hace que espera su primera llamada. Si el reloj y el horario laboral no coinciden, se dicen los dos. */
  function espera(c) {
    var reloj = minutosDesde(c.creado), habiles = Math.round(minutosHabiles(c.creado, MQ.iso(MQ.ahora())));
    var h = ['<span class="vence" data-estado="vencida">' + ui.icono('clock') + 'Espera hace ' + duracion(reloj) + (habiles !== reloj ? ' de reloj' : '') + '</span>'];
    if (habiles !== reloj) h.push(duracion(habiles) + ' hábiles');
    return h;
  }

  function bloqueLlamar(orden, lectura) {
    var cola = colaParaLlamar(), cuerpo;
    if (!cola.length) {
      cuerpo = ui.estadoVacio({ icono: 'circle-check', ok: true, titulo: 'Nadie para llamar ahora', texto: 'Cuando entre una solicitud o venza una llamada, aparece acá.' });
    } else {
      cuerpo = '<ul class="lista inicio-lista">' + cola.map(function (x) {
        // Primera llamada de alguien que recién entra: «espera hace…», no «vencida» (nadie llegó tarde todavía).
        // «Vencida» queda para una tarea cuya hora ya pasó.
        var recienEntra = !x.ultima && (!x.tarea || x.tarea.vence <= x.contacto.creado);
        var estado = recienEntra ? espera(x.contacto) : [ui.vence(x.tarea)];
        if (x.ultima) estado.push('Anterior: ' + esc(MQ.RESULTADOS[x.ultima.resultado].corto.toLowerCase()) + ', ' + esc(fmt.relativa(x.ultima.fecha)));
        return filaPersona(x.contacto, { lectura: lectura, lineas: [registro(x.contacto), estado],
          badge: '<span class="badge badge--suave">' + ui.icono('phone') + 'Llamada ' + x.intento + '</span>' });
      }).join('') + '</ul>';
    }
    return card({ titulo: 'Para llamar ahora', n: cola.length || null, marca: !lectura, orden: orden, extra: lectura ? soloLectura() : '', cuerpo: cuerpo });
  }
  function bloqueSinRespuesta(orden, lectura) {
    var lista = sinRespuesta();
    if (!lista.length) return '';
    return card({ titulo: 'Sin respuesta tras WhatsApp', n: lista.length, orden: orden, extra: lectura ? soloLectura() : '',
      cuerpo: '<p class="inicio-bajada">Ya se los llamó y se les escribió. No tienen tarea: hay que decidir si se insiste o se cierra.</p>' +
        '<ul class="lista inicio-lista">' + lista.map(function (x) {
          return filaPersona(x.contacto, { lectura: lectura, lineas: [
            [ui.icono('message-circle') + 'WhatsApp enviado ' + ui.fecha(x.whatsapp.fecha), x.llamadas + (x.llamadas === 1 ? ' llamada' : ' llamadas') + ' sin atender'],
            registro(x.contacto)] });
        }).join('') + '</ul>' });
  }
  function tareaLectura(t) {
    var tipo = MQ.TIPOS_TAREA[t.tipo] || MQ.TIPOS_TAREA.otro, c = t.contactoId ? MQ.contacto(t.contactoId) : null;
    return '<li class="tarea inicio-tarea-lectura"><div class="tarea__cuerpo"><p class="tarea__titulo">' + ui.icono(tipo.icono) + '<span class="truncar">' + esc(t.titulo) + '</span></p>' +
      '<p class="tarea__meta">' + ui.vence(t) + (c ? '<a class="tarea__contacto" href="#ficha" data-contacto="' + c.id + '">' + esc(c.nombre) + '</a>' : '') +
      '<span>' + esc(MQ.nombreDe(t.asignadaA)) + '</span></p></div></li>';
  }
  function bloqueTareas(o) {
    var lista = tareasDeHoy(o.usuario, o.descartar), nManana = tareasDeManana(o.usuario).length;
    if (!lista.length && !nManana && !o.siempre) return '';
    var cuerpo = lista.length
      ? '<ul class="lista">' + lista.map(function (t) { return o.lectura ? tareaLectura(t) : ui.itemTarea(t); }).join('') + '</ul>'
      : ui.estadoVacio({ icono: 'circle-check', ok: true, titulo: 'Todo al día', texto: 'No queda nada vencido ni para hoy.' });
    /* Lo de mañana se lista (no solo se cuenta): ahí aparece la «Llamada 2» que agenda la cadencia. */
    var deManana = tareasDeManana(o.usuario);
    if (deManana.length) cuerpo += '<p class="eyebrow inicio-manana">Para mañana · ' + deManana.length + '</p><ul class="lista">' +
      deManana.map(function (t) { return o.lectura ? tareaLectura(t) : ui.itemTarea(t); }).join('') + '</ul>';
    return card({ titulo: o.titulo, n: lista.length || null, orden: o.orden, extra: o.lectura ? soloLectura() : '', cuerpo: cuerpo,
      pie: '<span>' + (nManana ? 'Hoy y mañana' : 'Nada cargado para mañana') + '</span>' +
        '<a class="enlace" href="#tareas">Ver todos los pendientes' + ui.icono('arrow-right') + '</a>' });
  }
  function bloqueTasaciones(orden) {
    var lista = tasacionesCerca();
    if (!lista.length) return '';
    return card({ titulo: 'Tasaciones · hoy y mañana', n: lista.length, orden: orden,
      cuerpo: '<ul class="lista inicio-lista">' + lista.map(function (t) {
        var c = MQ.contacto(t.contactoId);
        return '<li class="inicio-cita"><div class="inicio-cita__cuando" title="' + esc(fmt.exacta(t.fecha)) + '"><strong>' + esc(fmt.hora(t.fecha)) + '</strong><span>' + (diaDe(t.fecha) === hoy() ? 'Hoy' : 'Mañana') + '</span></div>' +
          '<div class="inicio-cita__texto"><p class="inicio-cita__titulo">' + ui.icono('map-pin') + '<span>' + esc(t.direccion) + '</span></p>' +
          '<p class="tarea__meta">' + (c ? '<a class="tarea__contacto" href="#ficha" data-contacto="' + c.id + '">' + esc(c.nombre) + '</a>' : '') + '<span>con ' + esc(t.asesor) + '</span></p></div></li>';
      }).join('') + '</ul>' });
  }
  function bloqueNumeros(orden) {
    var n = numerosDelDia();
    return card({ titulo: 'Hoy, hasta las ' + fmt.hora(MQ.iso(MQ.ahora())), orden: orden,
      cuerpo: '<dl class="inicio-numeros">' +
        '<div><dt>Solicitudes nuevas</dt><dd>' + n.solicitudes + '</dd></div>' +
        '<div><dt>Llamadas hechas</dt><dd>' + n.llamadas + '</dd></div>' +
        '<div><dt>Agendadas</dt><dd>' + n.agendadas + '</dd></div></dl>' });
  }
  function bloqueAgenda(orden) {
    var lista = tareasDeHoy('tomas').filter(function (t) { return t.tipo === 'visita' || t.tipo === 'tasacion'; });
    if (!lista.length) return '';
    return card({ titulo: 'Mis visitas y tasaciones de hoy', n: lista.length, orden: orden,
      cuerpo: '<ul class="lista">' + lista.map(function (t) { return ui.itemTarea(t); }).join('') + '</ul>' });
  }
  function bloqueProcesos(orden) {
    return card({ titulo: 'Mis procesos que esperan algo de mí', n: PROCESOS.length, orden: orden,
      cuerpo: '<ul class="lista inicio-lista">' + PROCESOS.map(function (p) {
        var abrir = '<a class="btn btn--icono btn--secundario" href="#ficha" data-contacto="' + p.contactoId + '" aria-label="Abrir la ficha de ' + esc(p.nombre) + '">' + ui.icono('chevron-right') + '</a>';
        return '<li class="inicio-proceso"><div class="inicio-proceso__texto"><p class="inicio-proceso__titulo"><span>' + esc(p.nombre) + '</span>' + ui.chipEtapa(p.etapa) + '</p>' +
          '<p class="texto-chico texto-suave">' + esc(p.propiedad) + '</p>' +
          '<p class="inicio-proceso__espera">' + ui.icono('clock') + '<span>' + esc(p.espera) + '</span></p></div>' + abrir + '</li>';
      }).join('') + '</ul>' });
  }
  function bloqueSinContacto(orden) {
    var lista = MQ.contactos.filter(sinPrimerContacto).map(function (c) { return { contacto: c }; }).sort(porAntiguedad), cuerpo;
    if (!lista.length) {
      cuerpo = ui.estadoVacio({ icono: 'circle-check', ok: true, titulo: 'Todos los leads tienen su primera llamada', texto: 'Si entra una solicitud y nadie la llama, aparece acá con el tiempo que lleva esperando.' });
    } else {
      cuerpo = '<ul class="lista inicio-lista">' + lista.map(function (x) {
        var c = x.contacto;
        return filaPersona(c, { lectura: true, lineas: [
          espera(c).concat(['la llama ' + esc(MQ.nombreDe(c.asignadoA))]),
          registro(c)] });
      }).join('') + '</ul>';
    }
    return card({ titulo: 'Leads sin primer contacto', n: lista.length || null, marca: true, orden: orden, cuerpo: cuerpo });
  }
  function bloqueTiempo(orden) {
    var t = tiempoPrimeraLlamada(), leads = t.n + (t.n === 1 ? ' lead' : ' leads'), cuerpo;
    if (!t.n) {
      cuerpo = ui.estadoVacio({ icono: 'clock', titulo: 'Todavía sin datos esta semana', texto: 'Aparece cuando algún lead registrado desde el lunes reciba su primera llamada.' });
    } else {
      cuerpo = '<div class="inicio-tiempos">' +
        '<div><span class="inicio-tiempos__valor">' + duracion(t.habiles) + '</span><span class="inicio-tiempos__etiqueta">' + ui.icono('briefcase') + 'horas hábiles</span><span class="inicio-tiempos__n">' + leads + '</span></div>' +
        '<div><span class="inicio-tiempos__valor">' + duracion(t.reloj) + '</span><span class="inicio-tiempos__etiqueta">' + ui.icono('clock') + 'horas de reloj</span><span class="inicio-tiempos__n">' + leads + '</span></div></div>' +
        (t.n < 20 ? '<p class="inicio-aviso">' + ui.icono('triangle-alert') + '<span><strong>Pocos casos.</strong> Con menos de 20 leads, una sola llamada mueve mucho el promedio.</span></p>' : '') +
        '<p class="texto-chico texto-suave">Leads registrados desde el lunes que ya recibieron su primera llamada. Hábiles: lunes a viernes de 9 a 13.' +
        (t.sinLlamar ? ' Otros ' + t.sinLlamar + ' todavía sin llamar no entran en el promedio.' : '') + '</p>';
    }
    return card({ titulo: 'Tiempo medio a la primera llamada', orden: orden, extra: '<span class="badge badge--borde">Esta semana</span>', cuerpo: cuerpo });
  }

  /* ── Dibujo ──────────────────────────────────────────────────────── */
  function enCola(t) { return t.tipo === 'llamada' && t.contactoId && MQ.yaVencio(t); } // ya está en «Para llamar ahora»
  function dibujar() {
    var raiz = document.getElementById('inicio-raiz');
    if (!raiz) return;
    var rol = MQ.rol, a = MQ.ahora(), principal, lateral;
    document.getElementById('inicio-hola').textContent = rol === 'admin' ? 'Inicio · vista del dueño' : 'Hola, ' + MQ.usuario().nombre.split(' ')[0];
    document.getElementById('inicio-fecha').textContent = DIAS[a.getDay()] + ' ' + a.getDate() + ' de ' + MESES[a.getMonth()] + ' · ' + fmt.hora(MQ.iso(a));

    if (rol === 'asesor') {
      principal = bloqueTareas({ usuario: 'tomas', titulo: 'Mis tareas vencidas y de hoy', orden: 1, siempre: true,
        descartar: function (t) { return t.tipo === 'visita' || t.tipo === 'tasacion'; } }) + bloqueProcesos(3);
      lateral = bloqueAgenda(2);
    } else if (rol === 'admin') {
      principal = bloqueSinContacto(1) + bloqueLlamar(3, true) + bloqueSinRespuesta(4, true);
      lateral = bloqueTiempo(2) + bloqueTareas({ usuario: COORD, titulo: 'Tareas de hoy · coordinación', orden: 5, lectura: true, descartar: enCola }) +
        bloqueTasaciones(6) + bloqueNumeros(7);
    } else {
      principal = bloqueLlamar(1, false) + bloqueSinRespuesta(2, false);
      lateral = bloqueTareas({ usuario: COORD, titulo: 'Tareas de hoy', orden: 3, descartar: enCola }) + bloqueTasaciones(4) + bloqueNumeros(5);
    }
    raiz.innerHTML = '<div class="inicio-col">' + principal + '</div><div class="inicio-col">' + lateral + '</div>';
  }

  MQ.on('rolchange', dibujar);
  MQ.on('tareas', dibujar);
  MQ.on('actividad', dibujar);
  MQ.on('pantalla', function (nombre) { if (nombre === 'inicio') dibujar(); });
})();
