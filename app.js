/* =========================================================================
   Evaluación de Taludes — DIGER Pereira
   Aplicación de campo. Funciona sin señal y sincroniza al recuperar internet.
   ========================================================================= */
'use strict';

// ---------------------------------------------------------------- ESTADO
const APP = {
  perfil: null,        // { codigo, nombre, tp, entidad }
  solicitudes: [],     // catálogo descargado del servidor
  historial: [],       // visitas ya realizadas
  cola: [],            // fichas pendientes de enviar
  datos: {},           // ficha que se está llenando ahora
  solicitudActual: null,
  vistaActual: 'pendientes',
  sincronizando: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------------------------------------------- ALMACÉN LOCAL
/**
 * Pequeña capa sobre IndexedDB. Guarda el catálogo, los borradores
 * y la cola de envío para que todo funcione sin señal.
 */
const DB = {
  _db: null,

  async abrir() {
    if (this._db) return this._db;
    this._db = await new Promise((ok, fallo) => {
      const req = indexedDB.open('taludes-diger', 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('borradores')) db.createObjectStore('borradores', { keyPath: 'clave' });
        if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'idLocal' });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fallo(req.error);
    });
    return this._db;
  },

  async _tx(almacen, modo, fn) {
    const db = await this.abrir();
    return new Promise((ok, fallo) => {
      const tx = db.transaction(almacen, modo);
      const req = fn(tx.objectStore(almacen));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => fallo(tx.error);
    });
  },

  guardar: (almacen, valor) => DB._tx(almacen, 'readwrite', (s) => s.put(valor)),
  leer: (almacen, clave) => DB._tx(almacen, 'readonly', (s) => s.get(clave)),
  borrar: (almacen, clave) => DB._tx(almacen, 'readwrite', (s) => s.delete(clave)),
  todos: (almacen) => DB._tx(almacen, 'readonly', (s) => s.getAll()),

  guardarKV: (clave, valor) => DB._tx('kv', 'readwrite', (s) => s.put(valor, clave)),
  leerKV: (clave) => DB._tx('kv', 'readonly', (s) => s.get(clave))
};

// ---------------------------------------------------------------- UTILIDADES
function toast(texto, tipo = '') {
  const t = $('#toast');
  t.textContent = texto;
  t.className = 'ver ' + tipo;
  clearTimeout(t._temp);
  t._temp = setTimeout(() => (t.className = tipo), 3200);
}

function cargando(mostrar, texto = 'Cargando…') {
  $('#cargando-texto').textContent = texto;
  $('#cargando').hidden = !mostrar;
}

function esc(txt) {
  return String(txt == null ? '' : txt)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ahoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fechaBonita(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function normalizar(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ORDEN_PRIORIDAD = { 'CRÍTICA': 0, 'CRITICA': 0, 'ALTA': 1, 'MEDIA': 2, 'BAJA': 3, '': 4 };

function claseP(p) {
  const limpio = normalizar(p).replace(/[^a-z]/g, '');
  return 'p-' + (limpio || 'sin');
}

// ---------------------------------------------------------------- API
/**
 * Habla con Apps Script. Usa text/plain a propósito: así el navegador
 * no manda la petición previa OPTIONS, que Apps Script no sabe responder.
 */
async function api(accion, carga = {}, msTimeout = 45000) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PEGA_AQUI') === 0) {
    throw new Error('Falta configurar API_URL en config.js');
  }
  const control = new AbortController();
  const temp = setTimeout(() => control.abort(), msTimeout);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({
        accion: accion,
        codigo: APP.perfil ? APP.perfil.codigo : ''
      }, carga)),
      signal: control.signal,
      redirect: 'follow'
    });
    const texto = await res.text();
    let json;
    try { json = JSON.parse(texto); }
    catch (e) { throw new Error('El servidor respondió algo inesperado. Revisa que la app web esté publicada para "Cualquier usuario".'); }
    if (!json.ok) throw new Error(json.error || 'Error del servidor');
    return json;
  } finally {
    clearTimeout(temp);
  }
}

// ---------------------------------------------------------------- INGRESO
async function iniciar() {
  APP.perfil = JSON.parse(localStorage.getItem('perfil') || 'null');
  APP.cola = (await DB.todos('cola')) || [];
  APP.solicitudes = (await DB.leerKV('solicitudes')) || [];
  APP.historial = (await DB.leerKV('historial')) || [];

  if (APP.perfil) entrarApp();
  else $('#vista-ingreso').hidden = false;

  registrarSW();
  window.addEventListener('online', () => { pintarConexion(); sincronizar(true); });
  window.addEventListener('offline', pintarConexion);
  setInterval(() => { if (navigator.onLine) sincronizar(true); }, CONFIG.MINUTOS_AUTOSYNC * 60000);
}

$('#btn-ingresar').addEventListener('click', async () => {
  const codigo = $('#in-codigo').value.trim();
  const nombre = $('#in-nombre').value.trim();
  const tp = $('#in-tp').value.trim();
  const entidad = $('#in-entidad').value.trim() || CONFIG.ENTIDAD;
  const msg = $('#msg-ingreso');

  if (!codigo || !nombre || !tp) {
    msg.textContent = 'Completa el código, tu nombre y tu tarjeta profesional.';
    return;
  }
  msg.textContent = '';
  APP.perfil = { codigo, nombre, tp, entidad };

  cargando(true, 'Verificando código…');
  try {
    await api('verificar');
    localStorage.setItem('perfil', JSON.stringify(APP.perfil));
    cargando(false);
    entrarApp();
    sincronizar();
  } catch (e) {
    cargando(false);
    APP.perfil = null;
    msg.textContent = navigator.onLine
      ? e.message
      : 'Sin conexión: para ingresar por primera vez necesitas internet una sola vez.';
  }
});

function entrarApp() {
  $('#vista-ingreso').hidden = true;
  $('#topbar').hidden = false;
  $('#tabs').hidden = false;
  pintarConexion();
  irA('pendientes');
  pintarTodo();
  if (navigator.onLine) sincronizar(true);
}

$('#btn-salir').addEventListener('click', async () => {
  if (APP.cola.length) {
    if (!confirm('Tienes ' + APP.cola.length + ' ficha(s) sin enviar. Si sales se quedan guardadas en este celular, pero solo tú podrás enviarlas. ¿Continuar?')) return;
  }
  localStorage.removeItem('perfil');
  location.reload();
});

// ---------------------------------------------------------------- NAVEGACIÓN
function irA(vista) {
  APP.vistaActual = vista;
  ['pendientes', 'historial', 'cola'].forEach((v) => {
    $('#vista-' + v).hidden = v !== vista;
  });
  $$('#tabs .tab').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));
  $('#btn-nueva-no-programada').style.display = vista === 'pendientes' ? '' : 'none';
}

$$('#tabs .tab').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

function pintarConexion() {
  const el = $('#estado-conexion');
  if (!navigator.onLine) {
    el.className = 'estado-linea sin-conexion';
    el.textContent = 'Sin conexión · las fichas se guardan en el celular';
  } else if (APP.cola.length) {
    el.className = 'estado-linea';
    el.textContent = APP.cola.length + ' ficha(s) esperando envío';
  } else {
    el.className = 'estado-linea oculto';
  }
}

// ---------------------------------------------------------------- SINCRONIZACIÓN
$('#btn-sync').addEventListener('click', () => sincronizar());

async function sincronizar(silencioso = false) {
  if (APP.sincronizando) return;
  if (!navigator.onLine) {
    if (!silencioso) toast('Sin conexión a internet', 'error');
    return;
  }
  APP.sincronizando = true;
  $('#sync-icon').classList.add('girando');

  try {
    // 1) Primero sube lo que está pendiente, para no perder trabajo.
    if (APP.cola.length) await enviarCola(silencioso);

    // 2) Luego baja el catálogo actualizado.
    const r = await api('catalogo');
    APP.solicitudes = r.solicitudes || [];
    APP.historial = r.historial || [];
    await DB.guardarKV('solicitudes', APP.solicitudes);
    await DB.guardarKV('historial', APP.historial);
    await DB.guardarKV('ultimaSync', new Date().toISOString());
    pintarTodo();
    if (!silencioso) toast('Actualizado: ' + pendientes().length + ' pendientes', 'ok');
  } catch (e) {
    if (!silencioso) toast(e.message, 'error');
  } finally {
    APP.sincronizando = false;
    $('#sync-icon').classList.remove('girando');
    pintarConexion();
  }
}

/**
 * Envía la cola en tres pasos por ficha (datos → fotos → cierre).
 * Así una conexión que se cae a mitad de camino no obliga a repetir todo:
 * al reintentar continúa donde quedó.
 */
async function enviarCola(silencioso) {
  for (const item of APP.cola.slice()) {
    try {
      if (!item.idServidor) {
        const r = await api('crear_visita', { ficha: item.datos, idSolicitud: item.idSolicitud, perfil: APP.perfil });
        item.idServidor = r.idVisita;
        item.fotosSubidas = 0;
        await DB.guardar('cola', item);
      }

      const fotos = recolectarFotos(item.datos);
      while (item.fotosSubidas < fotos.length) {
        const f = fotos[item.fotosSubidas];
        if (!silencioso) cargando(true, 'Subiendo foto ' + (item.fotosSubidas + 1) + ' de ' + fotos.length + '…');
        await api('subir_foto', {
          idVisita: item.idServidor, campo: f.campo, indice: f.indice,
          nombre: f.nombre, contenido: f.dataUrl, miniatura: f.mini
        }, 90000);
        item.fotosSubidas++;
        await DB.guardar('cola', item);
      }

      if (!silencioso) cargando(true, 'Generando el PDF…');
      await api('finalizar_visita', { idVisita: item.idServidor }, 90000);

      await DB.borrar('cola', item.idLocal);
      APP.cola = APP.cola.filter((x) => x.idLocal !== item.idLocal);
      await DB.borrar('borradores', item.clave);
    } catch (e) {
      cargando(false);
      if (!silencioso) toast('No se pudo enviar la ficha ' + item.idSolicitud + ': ' + e.message, 'error');
      break; // sin conexión estable: deja el resto para el próximo intento
    }
  }
  cargando(false);
  pintarTodo();
}

function recolectarFotos(datos) {
  const lista = [];
  FICHA_SCHEMA.secciones.forEach((sec) => sec.campos.forEach((campo) => {
    if (campo.tipo !== 'fotos') return;
    (datos[campo.id] || []).forEach((f, i) => {
      lista.push({ campo: campo.id, indice: i, nombre: f.nombre, dataUrl: f.dataUrl, mini: f.mini || '' });
    });
  }));
  return lista;
}

// ---------------------------------------------------------------- LISTAS
function idsAtendidos() {
  const set = new Set();
  APP.historial.forEach((h) => set.add(String(h.idSolicitud)));
  APP.cola.forEach((c) => set.add(String(c.idSolicitud)));
  return set;
}

function pendientes() {
  const hechos = idsAtendidos();
  return APP.solicitudes
    .filter((s) => s.estado !== 'ATENDIDA' && !hechos.has(String(s.idSolicitud)))
    .sort((a, b) => {
      const pa = ORDEN_PRIORIDAD[(a.prioridad || '').toUpperCase()] ?? 4;
      const pb = ORDEN_PRIORIDAD[(b.prioridad || '').toUpperCase()] ?? 4;
      if (pa !== pb) return pa - pb;
      return String(a.idSolicitud).localeCompare(String(b.idSolicitud), 'es', { numeric: true });
    });
}

function pintarTodo() {
  pintarPendientes();
  pintarHistorial();
  pintarCola();
  pintarConexion();
  $('#badge-pendientes').textContent = pendientes().length || '';
  $('#badge-cola').textContent = APP.cola.length || '';
  $('#perfil-datos').innerHTML = APP.perfil
    ? esc(APP.perfil.nombre) + '<br>TP ' + esc(APP.perfil.tp) + ' · ' + esc(APP.perfil.entidad)
    : '';
}

function filtrar(lista, texto, campos) {
  const q = normalizar(texto);
  if (!q) return lista;
  return lista.filter((it) => campos.some((c) => normalizar(it[c]).includes(q)));
}

$('#buscar-pendientes').addEventListener('input', pintarPendientes);
$('#buscar-historial').addEventListener('input', pintarHistorial);

function pintarPendientes() {
  const todas = pendientes();
  const lista = filtrar(todas, $('#buscar-pendientes').value,
    ['idSolicitud', 'barrio', 'comuna', 'direccion', 'edificacion', 'responsable']);
  const cont = $('#lista-pendientes');

  $('#resumen-pendientes').textContent =
    todas.length + ' pendientes de ' + APP.solicitudes.length + ' solicitudes' +
    (lista.length !== todas.length ? ' · ' + lista.length + ' coinciden' : '');

  if (!lista.length) {
    cont.innerHTML = APP.solicitudes.length
      ? '<div class="vacio"><span class="vacio-icono">&#10003;</span>No hay solicitudes pendientes que coincidan.</div>'
      : '<div class="vacio"><span class="vacio-icono">&#8681;</span>Toca el botón de sincronizar (arriba a la derecha) para descargar las solicitudes.</div>';
    return;
  }

  cont.innerHTML = lista.map((s) => {
    const p = (s.prioridad || '').toUpperCase();
    const borrador = s._tieneBorrador ? '<span class="chip borrador">BORRADOR</span>' : '';
    return '<div class="tarjeta ' + claseP(p) + '" data-id="' + esc(s.idSolicitud) + '">' +
      '<div class="tarjeta-cabeza">' +
        '<div><div class="tarjeta-id">SOLICITUD ' + esc(s.idSolicitud) + '</div>' +
        '<div class="tarjeta-titulo">' + esc(s.direccion || 'Sin dirección') + '</div>' +
        '<div class="tarjeta-sub">' + esc(s.barrio || '') + (s.comuna ? ' · ' + esc(s.comuna) : '') + '</div></div>' +
        (p ? '<span class="chip ' + normalizar(p) + '">' + esc(p) + '</span>' : '<span class="chip gris">SIN PRIORIDAD</span>') +
      '</div>' +
      (s.edificacion ? '<div class="tarjeta-linea"><b>Edificación:</b> ' + esc(s.edificacion) + '</div>' : '') +
      (s.contacto ? '<div class="tarjeta-linea"><b>Contacto:</b> ' + esc(s.contacto) + '</div>' : '') +
      (s.telefono ? '<div class="tarjeta-linea"><b>Teléfono:</b> ' +
        '<a href="tel:' + esc(s.telefono) + '" class="tel" onclick="event.stopPropagation()">' + esc(s.telefono) + '</a></div>' : '') +
      (s.recomendaciones ? '<div class="tarjeta-desc">' + esc(s.recomendaciones) + '</div>' : '') +
      '<div class="tarjeta-pie">' + borrador +
        (s.responsable ? '<span>Asignada a ' + esc(s.responsable) + '</span>' : '') +
        (!s.latitud ? '<span class="aviso-sin-gps">Sin coordenadas — capturar GPS</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  cont.querySelectorAll('.tarjeta').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(APP.solicitudes.find((s) => String(s.idSolicitud) === el.dataset.id)));
  });
}

function pintarHistorial() {
  const lista = filtrar(APP.historial, $('#buscar-historial').value,
    ['idSolicitud', 'barrio', 'direccion', 'evaluadores', 'prioridad']);
  const cont = $('#lista-historial');
  $('#resumen-historial').textContent = APP.historial.length + ' visitas realizadas';

  if (!lista.length) {
    cont.innerHTML = '<div class="vacio"><span class="vacio-icono">&#9998;</span>Todavía no hay visitas realizadas.</div>';
    return;
  }

  cont.innerHTML = lista.map((h) => {
    const p = (h.prioridad || '').toUpperCase();
    return '<div class="tarjeta ' + claseP(p) + '" data-id="' + esc(h.idVisita) + '">' +
      '<div class="tarjeta-cabeza">' +
        '<div><div class="tarjeta-id">SOLICITUD ' + esc(h.idSolicitud) + '</div>' +
        '<div class="tarjeta-titulo">' + esc(h.direccion || '') + '</div>' +
        '<div class="tarjeta-sub">' + esc(h.barrio || '') + '</div></div>' +
        (p ? '<span class="chip ' + normalizar(p) + '">' + esc(p) + '</span>' : '') +
      '</div>' +
      '<div class="tarjeta-pie"><span>' + fechaBonita(h.fechaVisita) + '</span><span>· ' + esc(h.evaluadores || '') + '</span></div>' +
    '</div>';
  }).join('');

  cont.querySelectorAll('.tarjeta').forEach((el) => {
    el.addEventListener('click', () => abrirDetalle(el.dataset.id));
  });
}

function pintarCola() {
  const cont = $('#lista-cola');
  $('#resumen-cola').textContent = APP.cola.length
    ? APP.cola.length + ' ficha(s) guardadas en este celular, esperando internet'
    : 'No hay fichas pendientes de enviar';

  if (!APP.cola.length) {
    cont.innerHTML = '<div class="vacio"><span class="vacio-icono">&#10003;</span>Todo enviado. No queda nada en el celular.</div>';
    return;
  }

  cont.innerHTML = APP.cola.map((c) => {
    const fotos = recolectarFotos(c.datos).length;
    return '<div class="tarjeta p-media">' +
      '<div class="tarjeta-cabeza"><div>' +
        '<div class="tarjeta-id">SOLICITUD ' + esc(c.idSolicitud) + '</div>' +
        '<div class="tarjeta-titulo">' + esc(c.datos.direccion_referencia || '') + '</div>' +
        '<div class="tarjeta-sub">' + esc(c.datos.barrio_vereda || '') + '</div>' +
      '</div><span class="chip pendiente-envio">POR ENVIAR</span></div>' +
      '<div class="tarjeta-pie">' +
        '<span>' + fechaBonita(c.datos.fecha_hora_visita) + '</span>' +
        '<span>· ' + fotos + ' foto(s)</span>' +
        (c.idServidor ? '<span>· subiendo (' + c.fotosSubidas + '/' + fotos + ')</span>' : '') +
      '</div>' +
    '</div>';
  }).join('') +
  '<button id="btn-forzar-envio" class="btn-principal" style="margin-top:12px">Intentar enviar ahora</button>';

  const btn = $('#btn-forzar-envio');
  if (btn) btn.addEventListener('click', () => sincronizar());
}

// ---------------------------------------------------------------- FICHA: ABRIR
$('#btn-nueva-no-programada').addEventListener('click', () => {
  const codigo = CONFIG.PREFIJO_CODIGO + '-' + Date.now().toString(36).toUpperCase();
  abrirFicha({
    idSolicitud: codigo, noProgramada: true,
    barrio: '', comuna: '', direccion: '', edificacion: '',
    latitud: '', longitud: '', recomendaciones: '', prioridad: ''
  });
});

async function abrirFicha(solicitud) {
  if (!solicitud) return;
  APP.solicitudActual = solicitud;

  const clave = 'sol-' + solicitud.idSolicitud;
  const borrador = await DB.leer('borradores', clave);

  APP.datos = borrador ? borrador.datos : datosIniciales(solicitud);

  $('#ficha-titulo').textContent = solicitud.noProgramada
    ? 'Hallazgo en campo'
    : 'Solicitud ' + solicitud.idSolicitud;
  $('#ficha-subtitulo').textContent = [solicitud.direccion, solicitud.barrio].filter(Boolean).join(' · ') ||
    'Ficha nueva no programada';
  $('#msg-validacion').textContent = '';

  dibujarFormulario();
  $('#vista-ficha').hidden = false;
  $('#vista-ficha').scrollTop = 0;
  if (borrador) toast('Se recuperó el borrador guardado');
}

function datosIniciales(s) {
  return {
    codigo_evaluacion: String(s.idSolicitud),
    fecha_hora_visita: ahoraLocal(),
    barrio_vereda: s.barrio || '',
    direccion_referencia: [s.direccion, s.edificacion].filter(Boolean).join(' — '),
    coordenadas: { y: s.latitud || '', x: s.longitud || '', z: '', precision: null, fuente: s.latitud ? 'base' : '' },
    evaluadores: APP.perfil.nombre,
    responsables: [{ nombre: APP.perfil.nombre, tp: APP.perfil.tp, entidad: APP.perfil.entidad }, {}, {}]
  };
}

$('#btn-cerrar-ficha').addEventListener('click', async () => {
  await guardarBorrador(true);
  $('#vista-ficha').hidden = true;
  pintarTodo();
});

$('#btn-guardar-borrador').addEventListener('click', () => guardarBorrador());

async function guardarBorrador(silencioso) {
  if (!APP.solicitudActual) return;
  const clave = 'sol-' + APP.solicitudActual.idSolicitud;
  await DB.guardar('borradores', { clave, datos: APP.datos, guardado: new Date().toISOString() });
  APP.solicitudActual._tieneBorrador = true;
  if (!silencioso) toast('Borrador guardado en el celular', 'ok');
}

// ---------------------------------------------------------------- FICHA: DIBUJAR
/**
 * Panel de solo lectura con TODOS los datos que trae la solicitud desde el
 * Sheet. El geólogo necesita verlos completos en sitio (a quién llamar,
 * qué reportó el ciudadano) sin salir de la ficha.
 */
function panelSolicitud(s) {
  if (!s || s.noProgramada) return null;

  const filas = [
    ['N.º de solicitud', s.idSolicitud],
    ['Prioridad asignada', s.prioridad || 'Sin asignar'],
    ['Responsable', s.responsable],
    ['Entidad', s.entidad],
    ['Barrio / Vereda', s.barrio],
    ['Comuna / Corregimiento', s.comuna],
    ['Dirección', s.direccion],
    ['Nombre de la edificación', s.edificacion],
    ['Persona de contacto', s.contacto],
    ['Teléfono', s.telefono, 'tel'],
    ['Coordenadas de la base', s.latitud ? s.latitud + ', ' + s.longitud : '', 'mapa'],
    ['Recomendaciones / comentarios', s.recomendaciones, 'largo']
  ].filter((f) => String(f[1] || '').trim() !== '');

  const bloque = document.createElement('section');
  bloque.className = 'seccion panel-solicitud';
  bloque.innerHTML =
    '<div class="seccion-cabeza">' +
      '<span class="seccion-num">i</span>' +
      '<span class="seccion-titulo">DATOS DE LA SOLICITUD</span>' +
      '<span class="seccion-flecha">&#9660;</span>' +
    '</div>' +
    '<div class="seccion-cuerpo"><table class="tabla-solicitud">' +
      filas.map(([etiqueta, valor, tipo]) => {
        let celda;
        if (tipo === 'tel') {
          celda = '<a href="tel:' + esc(valor) + '" class="tel">' + esc(valor) + '</a>' +
                  '<span class="pista">toca para llamar</span>';
        } else if (tipo === 'mapa') {
          celda = esc(valor) + '<br><a class="tel" target="_blank" rel="noopener" ' +
                  'href="https://www.google.com/maps/search/?api=1&query=' + esc(valor) + '">Ver en el mapa</a>';
        } else if (tipo === 'largo') {
          celda = '<div class="texto-largo">' + esc(valor) + '</div>';
        } else {
          celda = esc(valor);
        }
        return '<tr><th>' + esc(etiqueta) + '</th><td>' + celda + '</td></tr>';
      }).join('') +
    '</table>' +
    (!s.latitud ? '<p class="aviso-panel">Esta solicitud no trae coordenadas. ' +
      'Captúralas con el GPS en la sección 1.</p>' : '') +
    '</div>';

  bloque.querySelector('.seccion-cabeza')
    .addEventListener('click', () => bloque.classList.toggle('cerrada'));
  return bloque;
}

function dibujarFormulario() {
  const form = $('#form-ficha');
  form.innerHTML = '';

  const panel = panelSolicitud(APP.solicitudActual);
  if (panel) form.appendChild(panel);

  FICHA_SCHEMA.secciones.forEach((sec, i) => {
    const bloque = document.createElement('section');
    bloque.className = 'seccion' + (i > 0 ? ' cerrada' : '');
    bloque.dataset.seccion = sec.id;
    bloque.innerHTML =
      '<div class="seccion-cabeza">' +
        '<span class="seccion-num">' + sec.numero + '</span>' +
        '<span class="seccion-titulo">' + esc(sec.titulo) + '</span>' +
        '<span class="seccion-faltan"></span>' +
        '<span class="seccion-flecha">&#9660;</span>' +
      '</div>' +
      '<div class="seccion-cuerpo">' +
        (sec.noAplica ? '<label class="no-aplica">' +
          '<input type="checkbox"' + (APP.datos[sec.noAplica.id] ? ' checked' : '') + '>' +
          '<span>' + esc(sec.noAplica.etiqueta) + '</span></label>' : '') +
        (sec.ayuda ? '<p class="seccion-ayuda">' + esc(sec.ayuda) + '</p>' : '') +
        '<div class="rejilla"></div>' +
        '<button type="button" class="btn-siguiente">Siguiente sección &rarr;</button>' +
      '</div>';

    bloque.querySelector('.seccion-cabeza').addEventListener('click', () => bloque.classList.toggle('cerrada'));

    const rejilla = bloque.querySelector('.rejilla');
    sec.campos.forEach((campo) => rejilla.appendChild(dibujarCampo(campo)));

    // Interruptor "no aplica": apaga la sección entera y deja de exigirla.
    if (sec.noAplica) {
      const sw = bloque.querySelector('.no-aplica input');
      const pintar = () => bloque.classList.toggle('omitida', !!APP.datos[sec.noAplica.id]);
      sw.addEventListener('change', () => {
        setValor(sec.noAplica.id, sw.checked);
        pintar();
      });
      pintar();
    }

    // Pasar a la siguiente sección sin tener que buscarla y cerrarla a mano.
    bloque.querySelector('.btn-siguiente').addEventListener('click', () => {
      bloque.classList.add('cerrada');
      const siguiente = bloque.nextElementSibling;
      if (siguiente && siguiente.classList.contains('seccion')) {
        siguiente.classList.remove('cerrada');
        siguiente.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        $('#btn-enviar-ficha').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    form.appendChild(bloque);
  });

  actualizarProgreso();
}

function dibujarCampo(campo) {
  const div = document.createElement('div');
  div.className = 'campo ancho-' + (campo.ancho || 'completo');
  div.dataset.campo = campo.id;

  const etiqueta = campo.tipo === 'valoracion' ? '' :
    '<label class="campo-etiqueta">' + esc(campo.etiqueta) +
    (campo.requerido ? ' <span class="req">*</span>' : '') + '</label>' +
    (campo.ayuda ? '<p class="campo-ayuda">' + esc(campo.ayuda) + '</p>' : '');

  const valor = APP.datos[campo.id];

  switch (campo.tipo) {
    case 'texto':
    case 'numero':
    case 'fecha_hora': {
      const tipoHtml = campo.tipo === 'numero' ? 'number' : campo.tipo === 'fecha_hora' ? 'datetime-local' : 'text';
      div.innerHTML = etiqueta + '<input type="' + tipoHtml + '"' +
        (campo.tipo === 'numero' ? ' inputmode="decimal" step="any"' : '') +
        (campo.soloLectura ? ' readonly' : '') +
        ' value="' + esc(valor || '') + '">';
      div.querySelector('input').addEventListener('input', (e) => setValor(campo.id, e.target.value));
      break;
    }

    case 'textarea': {
      div.innerHTML = etiqueta + '<textarea>' + esc(valor || '') + '</textarea>';
      div.querySelector('textarea').addEventListener('input', (e) => setValor(campo.id, e.target.value));
      break;
    }

    case 'radio':
    case 'checkbox': {
      const multiple = campo.tipo === 'checkbox';
      const sel = multiple ? (valor || []) : valor;
      const clase = campo.destacado ? 'opciones opciones-destacadas' : 'opciones';
      div.innerHTML = etiqueta + '<div class="' + clase + '">' + campo.opciones.map((op) => {
        const marcado = multiple ? sel.includes(op) : sel === op;
        const desc = campo.descripciones && campo.descripciones[op]
          ? '<em>' + esc(campo.descripciones[op]) + '</em>' : '';
        return '<label class="opcion">' +
          '<input type="' + (multiple ? 'checkbox' : 'radio') + '" name="' + campo.id + '" value="' + esc(op) + '"' +
          (marcado ? ' checked' : '') + '>' +
          '<span>' + esc(op) + desc + '</span></label>';
      }).join('') + '</div>' +
      (campo.detalles ? '<div class="detalles"></div>' : '');

      // Campos que se abren al marcar su opción ("Otro" → ¿cuál?).
      const caja = div.querySelector('.detalles');
      const pintarDetalles = () => {
        if (!caja) return;
        const activos = Array.from(div.querySelectorAll('.opciones input:checked')).map((x) => x.value);
        caja.innerHTML = Object.keys(campo.detalles)
          .filter((op) => activos.includes(op))
          .map((op) => {
            const d = campo.detalles[op];
            return '<div class="detalle" data-detalle="' + esc(d.id) + '">' +
              '<label class="campo-etiqueta">' + esc(d.etiqueta) +
                (d.requerido ? ' <span class="req">*</span>' : '') + '</label>' +
              '<input type="text" data-id="' + esc(d.id) + '" value="' + esc(APP.datos[d.id] || '') + '" ' +
                'placeholder="Escribe aquí">' +
            '</div>';
          }).join('');
        caja.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => setValor(inp.dataset.id, inp.value));
        });
      };

      div.querySelectorAll('.opciones input').forEach((inp) => inp.addEventListener('change', () => {
        if (multiple) {
          setValor(campo.id, Array.from(div.querySelectorAll('.opciones input:checked')).map((x) => x.value));
        } else {
          setValor(campo.id, inp.value);
        }
        // Al desmarcar la opción se borra su detalle, para no dejar datos huérfanos.
        if (campo.detalles) {
          const activos = Array.from(div.querySelectorAll('.opciones input:checked')).map((x) => x.value);
          Object.keys(campo.detalles).forEach((op) => {
            if (!activos.includes(op)) delete APP.datos[campo.detalles[op].id];
          });
          pintarDetalles();
        }
      }));

      pintarDetalles();
      break;
    }

    case 'gps': {
      const c = valor || {};
      div.innerHTML = etiqueta +
        '<div class="gps-caja">' +
          '<button type="button" class="btn-secundario btn-gps">&#9678; Capturar mi ubicación</button>' +
          '<div class="gps-coords">' +
            '<label>Latitud (Y)<input type="number" step="any" inputmode="decimal" class="gps-y" value="' + esc(c.y || '') + '"></label>' +
            '<label>Longitud (X)<input type="number" step="any" inputmode="decimal" class="gps-x" value="' + esc(c.x || '') + '"></label>' +
            '<label>Altitud (Z m)<input type="number" step="any" inputmode="decimal" class="gps-z" value="' + esc(c.z || '') + '"></label>' +
          '</div>' +
          '<p class="gps-estado' + (c.y ? ' ok' : '') + '">' +
            (c.fuente === 'base' ? 'Coordenada de la solicitud. Captura el GPS para mayor precisión.'
              : c.y ? 'Coordenadas registradas.' : 'Sin coordenadas todavía.') +
          '</p>' +
        '</div>';

      const estado = div.querySelector('.gps-estado');
      const sincronizaCampos = () => setValor(campo.id, {
        y: div.querySelector('.gps-y').value,
        x: div.querySelector('.gps-x').value,
        z: div.querySelector('.gps-z').value,
        precision: (APP.datos[campo.id] || {}).precision,
        fuente: 'manual'
      });
      div.querySelectorAll('.gps-coords input').forEach((i) => i.addEventListener('input', sincronizaCampos));

      div.querySelector('.btn-gps').addEventListener('click', () => {
        if (!navigator.geolocation) { estado.textContent = 'Este celular no tiene GPS disponible.'; return; }
        estado.className = 'gps-estado';
        estado.textContent = 'Buscando señal GPS…';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = pos.coords;
            div.querySelector('.gps-y').value = p.latitude.toFixed(7);
            div.querySelector('.gps-x').value = p.longitude.toFixed(7);
            if (p.altitude != null) div.querySelector('.gps-z').value = Math.round(p.altitude);
            setValor(campo.id, {
              y: p.latitude.toFixed(7), x: p.longitude.toFixed(7),
              z: p.altitude != null ? Math.round(p.altitude) : '',
              precision: Math.round(p.accuracy), fuente: 'gps'
            });
            estado.className = 'gps-estado ok';
            estado.textContent = 'Ubicación capturada · precisión ' + Math.round(p.accuracy) + ' m';
          },
          (err) => {
            estado.textContent = err.code === 1
              ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
              : 'No se pudo obtener la ubicación. Escríbela a mano o intenta al aire libre.';
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      });
      break;
    }

    case 'valoracion': {
      const v = valor || {};
      div.className += ' valoracion-fila';
      div.innerHTML =
        '<label class="campo-etiqueta">' + esc(campo.etiqueta) + '</label>' +
        '<div class="opciones">' + ['Baja', 'Media', 'Alta'].map((op) =>
          '<label class="opcion"><input type="radio" name="' + campo.id + '" value="' + op + '"' +
          (v.nivel === op ? ' checked' : '') + '><span>' + op + '</span></label>').join('') + '</div>' +
        '<input type="text" placeholder="Observación (opcional)" value="' + esc(v.obs || '') + '">';

      const guarda = () => {
        const marcado = div.querySelector('input[type=radio]:checked');
        setValor(campo.id, { nivel: marcado ? marcado.value : '', obs: div.querySelector('input[type=text]').value });
      };
      div.querySelectorAll('input').forEach((i) => i.addEventListener('input', guarda));
      div.querySelectorAll('input[type=radio]').forEach((i) => i.addEventListener('change', guarda));
      break;
    }

    case 'fotos': {
      // Dos botones separados: con "capture" el celular abre la cámara y no
      // deja llegar a la galería. Sin él, se pueden subir fotos ya tomadas.
      div.innerHTML = etiqueta +
        '<div class="fotos-caja">' +
          '<div class="fotos-acciones">' +
            '<label class="fotos-btn">&#128247; Tomar foto' +
              '<input type="file" accept="image/*" capture="environment" hidden>' +
            '</label>' +
            '<label class="fotos-btn alterno">&#128194; Elegir de la galería' +
              '<input type="file" accept="image/*" multiple hidden>' +
            '</label>' +
          '</div>' +
          '<div class="fotos-grid"></div>' +
          '<p class="fotos-conteo"></p>' +
        '</div>';

      const grid = div.querySelector('.fotos-grid');
      const conteo = div.querySelector('.fotos-conteo');

      const repintar = () => {
        const fotos = APP.datos[campo.id] || [];
        grid.innerHTML = fotos.map((f, i) =>
          '<div class="foto-item"><img src="' + f.dataUrl + '" alt="">' +
          '<button type="button" class="foto-quitar" data-i="' + i + '">&times;</button></div>').join('');
        conteo.textContent = fotos.length + ' de ' + campo.maxArchivos + ' fotos';
        grid.querySelectorAll('.foto-quitar').forEach((b) => b.addEventListener('click', () => {
          const arr = (APP.datos[campo.id] || []).slice();
          arr.splice(Number(b.dataset.i), 1);
          setValor(campo.id, arr);
          repintar();
        }));
      };

      div.querySelectorAll('input[type=file]').forEach((entrada) => {
        entrada.addEventListener('change', async (e) => {
          const archivos = Array.from(e.target.files || []);
          e.target.value = '';
          const actuales = (APP.datos[campo.id] || []).slice();
          for (const arch of archivos) {
            if (actuales.length >= campo.maxArchivos) {
              toast('Máximo ' + campo.maxArchivos + ' fotos', 'error');
              break;
            }
            cargando(true, 'Procesando foto…');
            try {
              // Dos versiones: la de archivo (Drive) y una liviana para el PDF.
              actuales.push({
                nombre: arch.name || 'foto.jpg',
                dataUrl: await comprimirImagen(arch, CONFIG.ANCHO_MAX_FOTO, CONFIG.CALIDAD_FOTO),
                mini: await comprimirImagen(arch, CONFIG.ANCHO_MINIATURA, CONFIG.CALIDAD_MINIATURA)
              });
            } catch (err) {
              toast('No se pudo procesar la foto', 'error');
            }
            cargando(false);
          }
          setValor(campo.id, actuales);
          repintar();
        });
      });

      repintar();
      break;
    }

    case 'responsables': {
      const resp = valor || [{}, {}, {}];
      div.innerHTML = etiqueta + [0, 1, 2].map((i) =>
        '<div class="responsable-caja" data-i="' + i + '">' +
          '<h4>RESPONSABLE ' + (i + 1) + (i === 0 ? ' (obligatorio)' : ' (opcional)') + '</h4>' +
          '<label>Nombre<input type="text" class="r-nombre" value="' + esc((resp[i] || {}).nombre || '') + '"></label>' +
          '<label>Tarjeta profesional<input type="text" class="r-tp" value="' + esc((resp[i] || {}).tp || '') + '"></label>' +
          '<label>Entidad<input type="text" class="r-entidad" value="' + esc((resp[i] || {}).entidad || '') + '"></label>' +
        '</div>').join('');

      const guarda = () => setValor(campo.id, Array.from(div.querySelectorAll('.responsable-caja')).map((caja) => ({
        nombre: caja.querySelector('.r-nombre').value.trim(),
        tp: caja.querySelector('.r-tp').value.trim(),
        entidad: caja.querySelector('.r-entidad').value.trim()
      })));
      div.querySelectorAll('input').forEach((i) => i.addEventListener('input', guarda));
      break;
    }
  }

  return div;
}

function setValor(id, valor) {
  APP.datos[id] = valor;
  actualizarProgreso();
  clearTimeout(setValor._temp);
  setValor._temp = setTimeout(() => guardarBorrador(true), 1200); // autoguardado
}

// ---------------------------------------------------------------- FOTOS
/**
 * Reduce la foto antes de guardarla. Se usa dos veces por foto:
 * una versión de archivo (la que queda en Drive) y una miniatura
 * liviana que es la que se incrusta en el PDF.
 */
function comprimirImagen(archivo, anchoMax, calidad) {
  return new Promise((ok, fallo) => {
    const lector = new FileReader();
    lector.onerror = () => fallo(lector.error);
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => fallo(new Error('imagen ilegible'));
      img.onload = () => {
        const max = anchoMax;
        let { width: w, height: h } = img;
        if (Math.max(w, h) > max) {
          const f = max / Math.max(w, h);
          w = Math.round(w * f); h = Math.round(h * f);
        }
        const lienzo = document.createElement('canvas');
        lienzo.width = w; lienzo.height = h;
        lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
        ok(lienzo.toDataURL('image/jpeg', calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

// ---------------------------------------------------------------- PROGRESO Y VALIDACIÓN
/** Una sección marcada "no aplica" deja de exigirse por completo. */
function seccionOmitida(sec) {
  return !!(sec.noAplica && APP.datos[sec.noAplica.id]);
}

/** Opciones marcadas de un campo, sea de una o de varias respuestas. */
function seleccionadas(campo) {
  const v = APP.datos[campo.id];
  return Array.isArray(v) ? v : (v ? [v] : []);
}

/**
 * Todo lo que falta por llenar, con la sección a la que pertenece.
 * Incluye los campos que se abrieron al marcar "Otro".
 */
function camposPendientes() {
  const faltan = [];
  FICHA_SCHEMA.secciones.forEach((sec) => {
    if (seccionOmitida(sec)) return;
    sec.campos.forEach((campo) => {
      if (campo.requerido && !estaLleno(campo)) {
        faltan.push({ seccion: sec, id: campo.id, etiqueta: campo.etiqueta });
      }
      if (!campo.detalles) return;
      const activos = seleccionadas(campo);
      Object.keys(campo.detalles).forEach((op) => {
        const d = campo.detalles[op];
        if (activos.indexOf(op) !== -1 && d.requerido && !String(APP.datos[d.id] || '').trim()) {
          faltan.push({ seccion: sec, id: campo.id, detalle: d.id, etiqueta: d.etiqueta });
        }
      });
    });
  });
  return faltan;
}

/** Cuántos campos exige la ficha en total, según cómo esté llena ahora. */
function totalRequeridos() {
  let n = 0;
  FICHA_SCHEMA.secciones.forEach((sec) => {
    if (seccionOmitida(sec)) return;
    sec.campos.forEach((campo) => {
      if (campo.requerido) n++;
      if (!campo.detalles) return;
      const activos = seleccionadas(campo);
      Object.keys(campo.detalles).forEach((op) => {
        if (activos.indexOf(op) !== -1 && campo.detalles[op].requerido) n++;
      });
    });
  });
  return n;
}

function estaLleno(campo) {
  const v = APP.datos[campo.id];
  if (v == null || v === '') return false;
  if (Array.isArray(v)) {
    if (campo.tipo === 'responsables') return !!(v[0] && v[0].nombre && v[0].tp);
    return v.length > 0;
  }
  if (campo.tipo === 'gps') return !!(v.y && v.x);
  if (campo.tipo === 'valoracion') return !!v.nivel;
  return true;
}

function actualizarProgreso() {
  const total = totalRequeridos();
  const faltan = camposPendientes();
  const listos = total - faltan.length;
  $('#barra-progreso-relleno').style.width =
    (total ? Math.round((listos / total) * 100) : 100) + '%';

  // Cada sección muestra cuánto le falta, para no tener que abrirlas todas.
  const porSeccion = {};
  faltan.forEach((f) => { porSeccion[f.seccion.id] = (porSeccion[f.seccion.id] || 0) + 1; });

  $$('#form-ficha .seccion[data-seccion]').forEach((bloque) => {
    const chip = bloque.querySelector('.seccion-faltan');
    if (!chip) return;
    const sec = FICHA_SCHEMA.secciones.find((x) => x.id === bloque.dataset.seccion);
    const n = porSeccion[bloque.dataset.seccion] || 0;
    const omitida = sec && seccionOmitida(sec);
    chip.textContent = omitida ? 'No aplica' : (n ? 'Faltan ' + n : 'Completa');
    chip.className = 'seccion-faltan ' + (omitida ? 'omitida' : n ? 'pendiente' : 'lista');
  });

  const btn = $('#btn-enviar-ficha');
  if (btn) {
    btn.textContent = faltan.length
      ? 'Finalizar y enviar · faltan ' + faltan.length
      : 'Finalizar y enviar';
    btn.classList.toggle('incompleto', faltan.length > 0);
  }
}

$('#btn-enviar-ficha').addEventListener('click', async () => {
  $$('#form-ficha .campo, #form-ficha .detalle').forEach((c) => c.classList.remove('faltante'));
  const faltan = camposPendientes();

  if (faltan.length) {
    faltan.forEach((f) => {
      const campo = $('#form-ficha .campo[data-campo="' + f.id + '"]');
      if (!campo) return;
      campo.closest('.seccion').classList.remove('cerrada');
      const objetivo = f.detalle
        ? campo.querySelector('.detalle[data-detalle="' + f.detalle + '"]')
        : campo;
      if (objetivo) objetivo.classList.add('faltante');
    });

    // Agrupado por sección: es más fácil de leer que una lista corrida.
    const porSeccion = {};
    faltan.forEach((f) => {
      const k = f.seccion.numero + '. ' + f.seccion.titulo;
      (porSeccion[k] = porSeccion[k] || []).push(f.etiqueta);
    });
    $('#msg-validacion').innerHTML =
      '<b>Faltan ' + faltan.length + ' campo(s):</b>' +
      Object.keys(porSeccion).map((k) =>
        '<span class="falta-seccion">' + esc(k) + ': ' + esc(porSeccion[k].join(', ')) + '</span>'
      ).join('');

    const primero = $('#form-ficha .faltante');
    if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!confirm('¿Enviar la ficha de la solicitud ' + APP.solicitudActual.idSolicitud + '?\n\nDespués de enviarla ya no podrás modificarla.')) return;

  const item = {
    idLocal: 'loc-' + Date.now().toString(36),
    clave: 'sol-' + APP.solicitudActual.idSolicitud,
    idSolicitud: String(APP.solicitudActual.idSolicitud),
    noProgramada: !!APP.solicitudActual.noProgramada,
    datos: APP.datos,
    creado: new Date().toISOString(),
    idServidor: null,
    fotosSubidas: 0
  };

  await DB.guardar('cola', item);
  APP.cola.push(item);

  $('#vista-ficha').hidden = true;
  APP.solicitudActual = null;
  pintarTodo();

  if (navigator.onLine) {
    toast('Ficha guardada. Enviando…');
    sincronizar();
  } else {
    toast('Guardada en el celular. Se enviará al recuperar internet.', 'ok');
    irA('cola');
  }
});

// ---------------------------------------------------------------- DETALLE
$('#btn-cerrar-detalle').addEventListener('click', () => { $('#vista-detalle').hidden = true; });

async function abrirDetalle(idVisita) {
  const h = APP.historial.find((x) => String(x.idVisita) === String(idVisita));
  if (!h) return;

  $('#detalle-titulo').textContent = 'Solicitud ' + h.idSolicitud;
  $('#detalle-subtitulo').textContent = fechaBonita(h.fechaVisita) + ' · ' + (h.evaluadores || '');
  $('#detalle-cuerpo').innerHTML = '<div class="vacio">Cargando la ficha…</div>';
  $('#vista-detalle').hidden = false;

  let ficha = h.ficha;
  if (!ficha) {
    if (!navigator.onLine) {
      $('#detalle-cuerpo').innerHTML =
        '<div class="vacio">Necesitas internet para ver el detalle completo de esta visita.</div>';
      return;
    }
    try {
      const r = await api('detalle_visita', { idVisita: idVisita });
      ficha = r.ficha;
      h.ficha = ficha;
      await DB.guardarKV('historial', APP.historial);
    } catch (e) {
      $('#detalle-cuerpo').innerHTML = '<div class="vacio">' + esc(e.message) + '</div>';
      return;
    }
  }

  let html = '';
  if (h.pdfUrl) {
    html += '<div class="detalle-seccion"><div class="detalle-acciones">' +
      '<a class="btn-pdf" href="' + esc(h.pdfUrl) + '" target="_blank" rel="noopener">&#128196; Abrir el PDF de la ficha</a>' +
      '</div></div>';
  }

  FICHA_SCHEMA.secciones.forEach((sec) => {
    const filas = sec.campos.map((campo) => {
      const v = ficha[campo.id];
      const texto = formatearValor(campo, v);
      if (!texto) return '';
      if (campo.tipo === 'fotos') return '';
      return '<tr><th>' + esc(campo.etiqueta) + '</th><td>' + texto + '</td></tr>';
    }).filter(Boolean).join('');

    const fotos = sec.campos.filter((c) => c.tipo === 'fotos')
      .flatMap((c) => (ficha['_urls_' + c.id] || []));

    if (!filas && !fotos.length) return;
    html += '<div class="detalle-seccion"><h3>' + sec.numero + '. ' + esc(sec.titulo) + '</h3>' +
      (filas ? '<table class="detalle-tabla">' + filas + '</table>' : '') +
      (fotos.length ? '<div class="detalle-fotos">' + fotos.map((u) =>
        '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" loading="lazy"></a>').join('') + '</div>' : '') +
      '</div>';
  });

  $('#detalle-cuerpo').innerHTML = html || '<div class="vacio">Sin datos.</div>';
}

function formatearValor(campo, v) {
  if (v == null || v === '') return '';
  switch (campo.tipo) {
    case 'checkbox': return Array.isArray(v) && v.length ? esc(v.join(', ')) : '';
    case 'gps': return v.y ? esc(v.y + ', ' + v.x) + (v.z ? ' · ' + esc(v.z) + ' m' : '') +
      (v.precision ? ' <small>(±' + v.precision + ' m)</small>' : '') : '';
    case 'valoracion': return v.nivel ? '<b>' + esc(v.nivel) + '</b>' + (v.obs ? ' — ' + esc(v.obs) : '') : '';
    case 'responsables': return (v || []).filter((r) => r && r.nombre)
      .map((r) => esc(r.nombre) + ' · TP ' + esc(r.tp) + ' · ' + esc(r.entidad)).join('<br>');
    case 'fecha_hora': return esc(fechaBonita(v));
    default: return esc(v);
  }
}

// ---------------------------------------------------------------- SERVICE WORKER
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    console.warn('El modo sin conexión no quedó activo (requiere https o localhost).');
  });
}

// ---------------------------------------------------------------- ARRANQUE
iniciar().catch((e) => {
  console.error(e);
  alert('No se pudo iniciar la aplicación: ' + e.message);
});
