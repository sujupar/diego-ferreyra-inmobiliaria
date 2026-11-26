/* Estados de la lista: cargando, error, vacío (dos casos) y todo al día */
(function () {
  'use strict';
  var MQ = window.MQ, ui = MQ.ui, ic = ui.icono;
  var grilla = document.getElementById('est-grilla'); if (!grilla) return;
  function tarjeta(rotulo, barra, cuerpo) {
    return '<section class="card"><p class="est__rotulo">' + rotulo + '</p><div class="est__barra">' + barra + '</div><div class="card__cuerpo">' + cuerpo + '</div></section>';
  }
  function pintar() {
    grilla.innerHTML =
      tarjeta('Cargando', '<span class="esqueleto"></span><span class="esqueleto"></span><span class="esqueleto"></span>', ui.estadoCarga(4)) +
      tarjeta('Error al traer la lista', ic('triangle-alert') + 'No se pudo contar por etapa',
        ui.estadoError({ titulo: 'No se pudo cargar la lista de procesos', texto: 'Los filtros siguen ahí. El resto de la plataforma funciona.' })) +
      tarjeta('Error en «Lo que está trabado» (vista del dueño)', 'La lista de abajo sigue funcionando',
        ui.estadoError({ titulo: 'No se pudo cargar lo trabado', texto: 'No mostramos ningún número hasta poder contarlo.' })) +
      tarjeta('Vacío · un asesor sin procesos', 'Abiertos <strong>0</strong>',
        ui.estadoVacio({ icono: 'briefcase', titulo: 'Todavía no tenés procesos', texto: 'Cuando te asignen una tasación, aparece acá con su próximo paso.' })) +
      tarjeta('Vacío · los filtros no encuentran nada', 'Etapa: Solicitud · Busca «Lavalle 900»',
        ui.estadoVacio({ icono: 'search', titulo: 'Ningún proceso coincide con estos filtros', texto: 'Probá sacar algún filtro o buscar de otra forma.', accion: '<button type="button" class="btn btn--secundario" data-toast="Saca todos los filtros y vuelve a la lista completa.">Limpiar filtros</button>' })) +
      tarjeta('Todo al día · coordinación', 'Abiertos <strong>207</strong>',
        ui.estadoVacio({ icono: 'circle-check', ok: true, titulo: 'Nada urgente', texto: 'No hay solicitudes sin primer contacto ni llamadas vencidas. Abajo sigue el resto de la cartera.' }));
    ui.hidratar(grilla);
  }
  grilla.addEventListener('click', function (e) {
    if (!e.target.closest('[data-reintentar]')) return;
    var cuerpo = e.target.closest('.card').querySelector('.card__cuerpo');
    cuerpo.innerHTML = ui.estadoCarga(3);
    setTimeout(function () {
      cuerpo.innerHTML = ui.estadoError({ titulo: 'No se pudo cargar la lista de procesos', texto: 'Volvió a fallar. En la plataforma, «Reintentar» vuelve a pedir los datos.' });
      ui.hidratar(cuerpo);
    }, 1200);
  });
  MQ.on('pantalla', function (p) { if (p === 'estados-lista') pintar(); });
})();
