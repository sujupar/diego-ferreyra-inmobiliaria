/* Pantalla #estados — muestrario del sistema de diseño.
   Nada de acá toca el store: las tareas y eventos son ejemplos sueltos (ids "estados-…"). */
(function () {
  var MQ = window.MQ, ui = MQ.ui;
  var raiz = document.querySelector('[data-screen="estados"]');
  if (!raiz) return;
  function $(id) { return document.getElementById(id); }

  /* ── Ejemplos sueltos (no entran al store) ───────────────────────── */
  function tareaEj(id, titulo, tipo, vence, extra) {
    var t = { id: 'estados-' + id, titulo: titulo, tipo: tipo, contactoId: null, vence: vence, todoElDia: false,
      asignadaA: 'paula', estado: 'pendiente', automatica: false, creada: MQ.dia(-1, '09:00'), completada: null };
    for (var k in (extra || {})) t[k] = extra[k];
    return t;
  }
  var n = 0;
  function eventoEj(tipo, titulo, fecha, autor, extra) {
    n += 1;
    var e = { id: 'estados-e' + n, contactoId: 'c1', tipo: tipo, titulo: titulo, detalle: null, autor: autor || null, fecha: fecha, orden: n };
    for (var k in (extra || {})) e[k] = extra[k];
    return e;
  }

  /* ── Tarea en cada estado ────────────────────────────────────────── */
  var TAREAS = [
    tareaEj('t1', 'Llamar a Marcela Ibáñez', 'llamada', MQ.dia(0, '09:00'), { contactoId: 'c1' }),
    tareaEj('t2', 'Llamada 2 a Rubén Castiglione', 'llamada', MQ.dia(0, '16:30'), { contactoId: 'c2' }),
    tareaEj('t3', 'Enviar WhatsApp a Silvina Arrieta', 'whatsapp', MQ.dia(1, '09:00'), { contactoId: 'c3' }),
    tareaEj('t4', 'Pedir la escritura del departamento de Belgrano', 'documentacion', null),
    tareaEj('t5', 'Confirmar el horario de la tasación', 'tasacion', MQ.dia(0, '09:00'), { estado: 'completada', completada: MQ.dia(0, '09:20') })
  ];
  $('estados-tareas').innerHTML = TAREAS.map(function (t) { return ui.itemTarea(t); }).join('');

  /* ── Línea de tiempo: un evento de cada tipo (del más nuevo al más viejo) ── */
  var EVENTOS = [
    eventoEj('tasacion', 'Tasación agendada · jue 26 nov, 11:00', MQ.dia(0, '10:32'), 'Paula', { detalle: 'Av. Pedro Goyena 1180, Caballito · va Tomás Agüero' }),
    eventoEj('etapa', 'Pasó de Solicitud a Tasación agendada', MQ.dia(0, '10:31'), 'Paula'),
    eventoEj('llamada', 'Llamada 2', MQ.dia(0, '10:30'), 'Paula', { resultado: 'agendo', intento: 2 }),
    eventoEj('nota', 'Nota', MQ.dia(0, '09:05'), 'Paula', { detalle: 'Pidió que la llamen después de las 10.' }),
    eventoEj('whatsapp', 'WhatsApp recibido', MQ.dia(-1, '19:40'), null, { origen: 'sistema', detalle: 'Hola, vi la llamada perdida. ¿Me llaman mañana a la mañana?' }),
    eventoEj('whatsapp', 'WhatsApp enviado', MQ.dia(-1, '11:10'), 'Paula', { origen: 'manual' }),
    eventoEj('tarea', 'Tarea creada sola · Llamada 2', MQ.dia(-1, '10:15')),
    eventoEj('llamada', 'Llamada 1', MQ.dia(-1, '10:15'), 'Paula', { resultado: 'no_atendio', intento: 1 }),
    eventoEj('consulta', 'Consultó por un aviso en ZonaProp', MQ.dia(-2, '21:48'), null, { detalle: 'Departamento 2 ambientes en Almagro · «¿Sigue disponible?»' }),
    eventoEj('video', 'Vio el video de la landing · 62 %', MQ.dia(-2, '18:24')),
    eventoEj('email', 'Se le envió el email «Recibimos tu solicitud de tasación»', MQ.dia(-2, '18:20')),
    eventoEj('registro', 'Se registró · Solicitud de tasación', MQ.dia(-2, '18:20'), null, { detalle: 'Anuncio de Meta · Departamento 3 ambientes en Caballito' })
  ];
  $('estados-linea').innerHTML = EVENTOS.map(function (e) { return ui.itemEvento(e); }).join('');
  /* Estos tres solo existen si se pueden medir (cambio 3). Se muestran acá, aparte y con la aclaración; no en la ficha. */
  var CONDICIONALES = [
    eventoEj('email', 'Hizo clic en el email «Recibimos tu solicitud de tasación»', MQ.dia(-2, '21:07')),
    eventoEj('email', 'Abrió el email «Recibimos tu solicitud de tasación»', MQ.dia(-2, '21:05')),
    eventoEj('whatsapp', 'Leyó el WhatsApp de confirmación', MQ.dia(-2, '18:23'), null, { origen: 'sistema' })
  ];
  $('estados-linea-condicional').innerHTML = CONDICIONALES.map(function (e) { return ui.itemEvento(e); }).join('');
  $('estados-tipos').innerHTML = MQ.TIPOS_ELEGIBLES.map(function (k) { return '<span class="badge badge--borde">' + ui.icono(MQ.TIPOS_TAREA[k].icono) + ui.esc(MQ.TIPOS_TAREA[k].texto) + '</span>'; }).join('');
  $('estados-ver-codigo').addEventListener('change', function () { raiz.classList.toggle('estados--tecnico', this.checked); });

  /* ── Resultados de llamada y etapas ──────────────────────────────── */
  var claves = Object.keys(MQ.RESULTADOS);
  $('estados-resultados-largos').innerHTML = claves.map(function (k) { return ui.chipResultado(k, true); }).join('');
  $('estados-resultados-cortos').innerHTML = claves.map(function (k) { return ui.chipResultado(k); }).join('');
  // Mismo orden que en la ficha: «No atendió» primero, porque es el único que guarda con un toque.
  $('estados-opciones').innerHTML = ['no_atendio'].concat(claves.filter(function (k) { return k !== 'no_atendio'; })).map(function (k) {
    var r = MQ.RESULTADOS[k];
    return '<button type="button" class="opcion" aria-pressed="' + (k === 'no_atendio') + '" data-resultado="' + k + '"><span class="opcion__icono">' + ui.icono(r.icono) + '</span><span>' + ui.esc(r.texto) +
      (k === 'volver' ? '<small>Pide día y hora</small>' : '') + '</span></button>';
  }).join('');
  $('estados-opciones').addEventListener('click', function (e) {
    var b = e.target.closest('.opcion'); if (!b) return;
    var todas = this.querySelectorAll('.opcion');
    for (var j = 0; j < todas.length; j++) todas[j].setAttribute('aria-pressed', String(todas[j] === b));
  });
  $('estados-etapas').innerHTML = Object.keys(MQ.ETAPAS).map(function (k) { return ui.chipEtapa(k); }).join('');

  /* ── Paleta ──────────────────────────────────────────────────────── */
  var COLORES = [
    ['--brand', 'Marca: llamar, guardar, lo elegido', '--brand-foreground'],
    ['--brand-soft', 'Fondo suave de marca', '--brand'],
    ['--primary', 'Texto y botón primario', '--primary-foreground'],
    ['--background', 'Fondo de la página', '--foreground'],
    ['--card', 'Fondo de tarjetas y hojas', '--foreground'],
    ['--secondary', 'Fondo de etiquetas e íconos', '--foreground'],
    ['--accent', 'Al pasar el cursor', '--foreground'],
    ['--border', 'Bordes y separadores', '--foreground'],
    ['--muted-foreground', 'Texto de apoyo', '--card'],
    ['--texto-suave', 'Texto chico: el gris de apoyo, algo más oscuro', '--card'],
    ['--destructive', 'Número de la campanita', '--destructive-foreground'],
    ['--destructive-suave', 'Fondo de «No atendió» y errores: el mismo rojo, aclarado', '--destructive-texto'],
    ['--destructive-texto', 'Texto de vencido y de error: el mismo rojo, oscurecido', '--card']
  ];
  $('estados-paleta').innerHTML = COLORES.map(function (c) {
    return '<div class="estados-color"><span class="estados-color__muestra" style="background: var(' + c[0] + '); color: var(' + c[2] + ')" aria-hidden="true">Aa</span>' +
      '<span class="estados-color__uso">' + ui.esc(c[1]) + '</span><span class="estados-codigo">' + c[0] + '</span></div>';
  }).join('');

  /* ── Bloque de ejemplo: cargando, vacío y error ──────────────────── */
  var bCarga = $('estados-bloque-carga'), bVacio = $('estados-bloque-vacio'), bError = $('estados-bloque-error');
  var btnVaciar = $('estados-vaciar'), btnRomper = $('estados-romper');
  var creadas = 0, reloj = null;

  /* Cuando el bloque ya muestra tareas, la tarjeta deja de titularse «Vacío» o «Error»: dice «Con datos». */
  function conDatos(bloque, si) {
    bloque.classList.toggle('estados-bloque--datos', si);
    var t = bloque.parentNode.querySelector('.card__titulo');
    if (!t) return;
    if (!t.getAttribute('data-titulo')) t.setAttribute('data-titulo', t.textContent);
    t.textContent = si ? 'Con datos' : t.getAttribute('data-titulo');
  }

  bCarga.innerHTML = ui.estadoCarga(3);

  function pintarVacio() {
    creadas = 0; conDatos(bVacio, false); btnVaciar.hidden = true;
    bVacio.innerHTML = ui.estadoVacio({ icono: 'list-checks', titulo: 'Sin tareas pendientes', texto: 'Cuando haya algo para hacer con esta persona, aparece acá.',
      accion: '<button type="button" class="btn btn--secundario" data-estados-crear>' + ui.icono('plus') + 'Crear tarea</button>' });
  }
  function botonCrear() { return '<button type="button" class="btn btn--fantasma btn--chico" data-estados-crear>' + ui.icono('plus') + 'Crear otra</button>'; }
  bVacio.addEventListener('click', function (e) {
    if (!e.target.closest('[data-estados-crear]')) return;
    creadas += 1;
    var t = tareaEj('v' + creadas, creadas === 1 ? 'Llamar a Marcela Ibáñez' : 'Tarea de ejemplo ' + creadas, creadas === 1 ? 'llamada' : 'otro', MQ.dia(1, '09:00'));
    var lista = bVacio.querySelector('.lista');
    if (!lista) { conDatos(bVacio, true); bVacio.innerHTML = '<ul class="lista"></ul><div>' + botonCrear() + '</div>'; lista = bVacio.querySelector('.lista'); }
    lista.insertAdjacentHTML('beforeend', ui.itemTarea(t));
    btnVaciar.hidden = false;
    MQ.toast('Tarea creada (ejemplo)');
  });
  btnVaciar.addEventListener('click', pintarVacio);

  function pintarError() {
    clearTimeout(reloj); conDatos(bError, false); btnRomper.hidden = true;
    bError.innerHTML = ui.estadoError({ texto: 'No pudimos traer las tareas. El resto de la pantalla sigue funcionando.' });
  }
  bError.addEventListener('click', function (e) {
    if (!e.target.closest('[data-reintentar]')) return;
    bError.innerHTML = ui.estadoCarga(3);
    clearTimeout(reloj);
    reloj = setTimeout(function () {
      conDatos(bError, true);
      bError.innerHTML = '<ul class="lista">' +
        ui.itemTarea(tareaEj('r1', 'Llamar a Marcela Ibáñez', 'llamada', MQ.dia(0, '09:00'))) +
        ui.itemTarea(tareaEj('r2', 'Recordarle la tasación', 'whatsapp', MQ.dia(1, '09:30'))) + '</ul>';
      btnRomper.hidden = false;
    }, 1200);
  });
  btnRomper.addEventListener('click', pintarError);

  pintarVacio();
  pintarError();

  /* ── Completar una tarea de ejemplo (base.js ignora los ids que no están en el store) ── */
  raiz.addEventListener('change', function (e) {
    var caja = e.target.closest && e.target.closest('[data-completar^="estados-"]');
    if (!caja) return;
    var fila = caja.closest('.tarea');
    fila.classList.toggle('tarea--hecha', caja.checked);
    if (caja.checked) {
      MQ.toast('Tarea completada (ejemplo)', { accion: 'Deshacer', alAccionar: function () { caja.checked = false; fila.classList.remove('tarea--hecha'); } });
    }
  });
})();
