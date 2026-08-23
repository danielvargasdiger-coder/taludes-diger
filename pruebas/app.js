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
  filtro: 'pendientes',   // pendientes | realizadas | todas
  sincronizando: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------------------------------------------- ALMACÉN LOCAL
/**
 * Pequeña capa sobre IndexedDB. Guarda el catálogo, los borradores
 * y la cola de envío para que todo funcione sin señal.
 */
/**
 * Nombres del almacenamiento local. Produccion y pruebas comparten dominio,
 * asi que sin esto una ficha de prueba caeria en la cola de envio real.
 */
const SUFIJO = (typeof CONFIG !== 'undefined' && CONFIG.ESPACIO) ? '-' + CONFIG.ESPACIO : '';
const NOMBRE_BD = 'taludes-diger' + SUFIJO;
const CLAVE_PERFIL = 'perfil' + SUFIJO;

const DB = {
  _db: null,

  async abrir() {
    if (this._db) return this._db;
    this._db = await new Promise((ok, fallo) => {
      const req = indexedDB.open(NOMBRE_BD, 1);
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

/**
 * Deja un número escribible desde cualquier teclado de celular.
 * Muchos teclados en español ponen coma como separador decimal y
 * <input type="number"> la rechaza en silencio: por eso los campos
 * numéricos son de texto y se normalizan aquí.
 */
function normalizarNumero(txt) {
  return String(txt == null ? '' : txt)
    .replace(/,/g, '.')          // coma decimal -> punto
    .replace(/[^0-9.\-]/g, '')   // fuera letras y espacios
    .replace(/(?!^)-/g, '')      // el menos solo al principio
    .replace(/\.(?=.*\.)/g, ''); // un solo punto decimal
}

function normalizar(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Distancia en metros entre dos coordenadas (fórmula del semiverseno).
 * Se usa para avisar si ya hay una visita hecha en el mismo punto.
 */
function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Visitas ya realizadas cerca de un punto, sin importar qué entidad las hizo.
 * Es la defensa contra que dos secretarías visiten el mismo talud.
 */
function visitasCercanas(lat, lon, metros) {
  const y = parseFloat(lat), x = parseFloat(lon);
  if (isNaN(y) || isNaN(x)) return [];
  const limite = metros || CONFIG.METROS_ALERTA_CERCANIA;

  return APP.historial
    .filter((h) => h.latitud !== '' && h.longitud !== '')
    .map((h) => Object.assign({}, h, {
      distancia: distanciaMetros(y, x, parseFloat(h.latitud), parseFloat(h.longitud))
    }))
    .filter((h) => h.distancia <= limite &&
                   String(h.idSolicitud) !== String((APP.solicitudActual || {}).idSolicitud))
    .sort((a, b) => a.distancia - b.distancia);
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
        codigo: APP.perfil ? APP.perfil.codigo : '',
        entidad: APP.perfil ? APP.perfil.entidad : ''
      }, carga)),
      signal: control.signal,
      redirect: 'follow'
    });
    const texto = await res.text();
    let json;
    try { json = JSON.parse(texto); }
    catch (e) { throw new Error('El servidor respondió algo inesperado. Revisa que la app web esté publicada para "Cualquier usuario".'); }
    if (!json.ok) {
      const err = new Error(json.error || 'Error del servidor');
      // El código dejó de servir (lo cambiaron o le quitaron el acceso a la
      // entidad). Hay que avisarlo: si no, el geólogo seguiría llenando
      // fichas creyendo que se están enviando.
      if (/[Cc][oó]digo de acceso incorrecto/.test(err.message)) {
        err.codigoInvalido = true;
        pedirCodigoDeNuevo();
      }
      throw err;
    }
    return json;
  } finally {
    clearTimeout(temp);
  }
}

/**
 * Devuelve al geólogo a la pantalla de ingreso porque su código dejó de
 * servir. Lo que tenga guardado en el celular NO se toca: los borradores y
 * las fichas por enviar siguen ahí y se suben apenas ingrese con el nuevo.
 */
function pedirCodigoDeNuevo() {
  if (!APP.perfil) return;               // ya está en la pantalla de ingreso

  const nombre = APP.perfil.nombre;
  const tp = APP.perfil.tp;
  const entidadPrevia = APP.perfil.entidad;
  APP.perfil = null;
  localStorage.removeItem(CLAVE_PERFIL);

  ['ficha', 'detalle', 'pendientes', 'historial', 'cola'].forEach((v) => {
    const el = $('#vista-' + v);
    if (el) el.hidden = true;
  });
  $('#topbar').hidden = true;
  $('#aviso-cola').hidden = true;
  $('#vista-ingreso').hidden = false;
  cargando(false);

  // Se conserva lo que ya había escrito para que solo teclee el código.
  $('#in-nombre').value = nombre || '';
  $('#in-tp').value = tp || '';
  $('#in-entidad').value = entidadPrevia || '';
  $('#in-codigo').value = '';

  $('#msg-ingreso').innerHTML =
    'El código de acceso cambió. Pídele el nuevo a la DIGER, ' +
    'o déjalo vacío para entrar sin lista de solicitudes.' +
    (APP.cola.length
      ? '<br><b>Tus ' + APP.cola.length + ' ficha(s) sin enviar están a salvo</b> ' +
        'y se subirán apenas ingreses.'
      : '');
}

// ---------------------------------------------------------------- INGRESO
async function iniciar() {
  APP.perfil = JSON.parse(localStorage.getItem(CLAVE_PERFIL) || 'null');
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
  const entidad = $('#in-entidad').value.trim();
  const msg = $('#msg-ingreso');

  // El código es opcional; identificarse no lo es.
  if (!nombre || !tp || !entidad) {
    msg.textContent = 'Completa tu nombre, tu tarjeta profesional y tu entidad.';
    return;
  }
  msg.textContent = '';
  APP.perfil = { codigo, nombre, tp, entidad };

  cargando(true, codigo ? 'Verificando código…' : 'Entrando…');
  try {
    const r = await api('verificar', { entidad: entidad });
    APP.perfil.entidad = r.entidad || CONFIG.ENTIDAD;
    // Si el servidor todavía no informa este dato, se asume que sí ve
    // solicitudes: así una versión vieja del servidor no deja a la DIGER
    // sin su lista mientras se actualiza.
    APP.perfil.verSolicitudes = r.verSolicitudes !== false;
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify(APP.perfil));
    toast('Ingresaste como ' + APP.perfil.entidad, 'ok');
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

  pintarConexion();
  irA('pendientes');
  pintarTodo();
  if (navigator.onLine) sincronizar(true);
}

$('#btn-salir').addEventListener('click', async () => {
  if (APP.cola.length) {
    if (!confirm('Tienes ' + APP.cola.length + ' ficha(s) sin enviar. Si sales se quedan guardadas en este celular, pero solo tú podrás enviarlas. ¿Continuar?')) return;
  }
  localStorage.removeItem(CLAVE_PERFIL);
  location.reload();
});

// ---------------------------------------------------------------- NAVEGACIÓN
/**
 * Ya no hay pestañas: la app es una sola lista con filtros.
 * El panel de perfil y envíos se abre y se cierra por encima.
 */
function irA(vista) {
  APP.vistaActual = vista;
  $('#vista-pendientes').hidden = vista !== 'pendientes';
  $('#vista-cola').hidden = vista !== 'cola';
  $('#btn-nueva-no-programada').style.display = vista === 'pendientes' ? '' : 'none';
}

$('#btn-perfil').addEventListener('click', () => irA('cola'));
$('#btn-cerrar-cola').addEventListener('click', () => irA('pendientes'));
$('#aviso-cola').addEventListener('click', () => irA('cola'));

$$('#filtros .filtro').forEach((b) => {
  b.addEventListener('click', () => {
    APP.filtro = b.dataset.filtro;
    pintarPendientes();
  });
});

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
    // Un código inválido se avisa siempre, aunque la sincronización sea automática.
    if (!silencioso || e.codigoInvalido) toast(e.message, 'error');
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

      // El servidor dice que esa solicitud ya quedó registrada: la ficha no
      // está pendiente, está repetida. Se saca de la cola en vez de dejarla
      // reintentando para siempre.
      if (/ya tiene una visita registrada/i.test(e.message)) {
        await DB.borrar('cola', item.idLocal);
        APP.cola = APP.cola.filter((x) => x.idLocal !== item.idLocal);
        await DB.borrar('borradores', item.clave);
        if (!silencioso) {
          toast('La solicitud ' + item.idSolicitud + ' ya estaba registrada. Se quitó de la cola.', 'ok');
        }
        continue;
      }

      // El código dejó de servir: no tiene sentido reintentar, hay que
      // reingresar. La ficha se queda en la cola, intacta.
      if (e.codigoInvalido) throw e;

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
  pintarCola();
  pintarConexion();

  // El aviso de envíos pendientes solo existe cuando hay algo que enviar.
  const aviso = $('#aviso-cola');
  if (APP.cola.length) {
    $('#aviso-cola-txt').textContent = APP.cola.length === 1
      ? '1 ficha sin enviar'
      : APP.cola.length + ' fichas sin enviar';
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }

  $('#perfil-entidad').textContent = APP.perfil ? APP.perfil.entidad : '';
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


/**
 * Estado de una solicitud desde el punto de vista del geólogo.
 * Se calcula en el celular para que también funcione sin señal.
 */
function estadoSolicitud(s) {
  const visita = APP.historial.find((h) => String(h.idSolicitud) === String(s.idSolicitud));
  if (visita) return { clave: 'realizada', texto: 'REALIZADA', visita: visita };
  if (APP.cola.some((c) => String(c.idSolicitud) === String(s.idSolicitud))) {
    return { clave: 'por-enviar', texto: 'POR ENVIAR' };
  }
  if (String(s.estado).toUpperCase() === 'ATENDIDA') return { clave: 'realizada', texto: 'REALIZADA' };
  if (s._tieneBorrador) return { clave: 'en-proceso', texto: 'EN PROCESO' };
  return { clave: 'pendiente', texto: 'POR VISITAR' };
}

/** Solicitudes con su estado resuelto, lo que falta primero. */
function solicitudesConEstado() {
  return APP.solicitudes
    .map((s) => Object.assign({}, s, { _estado: estadoSolicitud(s) }))
    .sort((a, b) => {
      const ra = a._estado.clave === 'realizada' ? 1 : 0;
      const rb = b._estado.clave === 'realizada' ? 1 : 0;
      if (ra !== rb) return ra - rb;   // lo que falta, primero

      // Entre visitadas manda la fecha: lo más reciente arriba, que es
      // lo que se quiere consultar. La prioridad ahí ya no ordena nada.
      if (ra === 1) {
        const fa = (a._estado.visita && a._estado.visita.fechaVisita) || '';
        const fb = (b._estado.visita && b._estado.visita.fechaVisita) || '';
        if (fa !== fb) return fb.localeCompare(fa);
      } else {
        const pa = ORDEN_PRIORIDAD[(a.prioridad || '').toUpperCase()] ?? 4;
        const pb = ORDEN_PRIORIDAD[(b.prioridad || '').toUpperCase()] ?? 4;
        if (pa !== pb) return pa - pb;
      }
      return String(a.idSolicitud).localeCompare(String(b.idSolicitud), 'es', { numeric: true });
    });
}

function pintarPendientes() {
  const conEstado = solicitudesConEstado();
  const nPend = conEstado.filter((s) => s._estado.clave !== 'realizada').length;
  const nReal = conEstado.length - nPend;

  $('#dato-pendientes').textContent = nPend;
  $('#dato-realizadas').textContent = nReal;
  $$('#filtros .filtro').forEach((b) => {
    b.classList.toggle('activo', b.dataset.filtro === APP.filtro);
  });

  const porFiltro = conEstado.filter((s) => {
    if (APP.filtro === 'realizadas') return s._estado.clave === 'realizada';
    if (APP.filtro === 'pendientes') return s._estado.clave !== 'realizada';
    return true;
  });
  const lista = filtrar(porFiltro, $('#buscar-pendientes').value,
    ['idSolicitud', 'barrio', 'comuna', 'direccion', 'edificacion', 'responsable']);

  const cont = $('#lista-pendientes');
  $('#resumen-pendientes').textContent = lista.length
    ? lista.length + (lista.length === 1 ? ' solicitud' : ' solicitudes')
    : '';

  if (!lista.length) {
    const sinLista = APP.perfil && APP.perfil.verSolicitudes === false;
    cont.innerHTML = APP.solicitudes.length
      ? '<div class="vacio"><span class="vacio-icono">&#10003;</span>' +
        ($('#buscar-pendientes').value
          ? 'Ninguna solicitud coincide con la búsqueda.'
          : APP.filtro === 'realizadas' ? 'Todavía no hay solicitudes visitadas.'
          : 'No queda ninguna solicitud por visitar.') + '</div>'
      : sinLista
        ? '<div class="vacio"><span class="vacio-icono">&#43;</span>' +
          '<b>' + esc(APP.perfil.entidad) + '</b><br>' +
          'Tu entidad no tiene solicitudes asignadas.<br>' +
          'Toca el botón <b>+</b> para registrar una visita de talud.<br><br>' +
          '<small>En "Realizadas" puedes consultar las visitas hechas por todas ' +
          'las entidades, para no repetir trabajo.</small></div>'
        : '<div class="vacio"><span class="vacio-icono">&#8681;</span>' +
          'Toca el botón de sincronizar (arriba a la derecha) para descargar las solicitudes.</div>';
    return;
  }

  // Tarjeta pensada para escanear en la calle: número y barrio arriba,
  // dirección como titular, el motivo en dos líneas, y el resto abajo en
  // letra menuda. Solo se marca lo que aporta: la prioridad se muestra si
  // existe, y el estado solo cuando no es "por visitar".
  cont.innerHTML = lista.map((s) => {
    const p = (s.prioridad || '').toUpperCase();
    const e = s._estado;
    const hecha = e.clave === 'realizada';
    const lugar = [s.barrio, s.comuna].filter(Boolean).join(' · ');

    const pie = hecha
      ? '<div class="tarjeta-pie hecha">' +
          '<span class="visto">&#10003;</span>' +
          (e.visita
            ? esc(fechaBonita(e.visita.fechaVisita)) + ' · ' + esc(e.visita.evaluadores || '')
            : 'Registrada como atendida') +
        '</div>'
      : '<div class="tarjeta-pie">' +
          (s.telefono
            ? '<a href="tel:' + esc(s.telefono) + '" class="tel" onclick="event.stopPropagation()">' +
              esc(s.telefono) + '</a>' : '') +
          (s.responsable ? '<span>' + esc(s.responsable) + '</span>' : '') +
          (!s.latitud ? '<span class="aviso-sin-gps">sin GPS</span>' : '') +
        '</div>';

    return '<div class="tarjeta ' + claseP(p) + ' est-' + e.clave + '" data-id="' + esc(s.idSolicitud) + '">' +
      '<div class="tarjeta-alto">' +
        '<span class="tarjeta-id">' + esc(s.idSolicitud) +
          (lugar ? ' · ' + esc(lugar) : '') + '</span>' +
        (p ? '<span class="chip ' + normalizar(p) + '">' + esc(p) + '</span>' : '') +
        // El chip de estado solo cuando pide atención. Que una visita esté
        // hecha ya lo dicen el borde verde, el fondo y el visto del pie.
        (e.clave === 'en-proceso' || e.clave === 'por-enviar'
          ? '<span class="chip estado ' + e.clave + '">' + e.texto + '</span>' : '') +
      '</div>' +
      '<div class="tarjeta-titulo">' + esc(s.direccion || s.edificacion || 'Sin dirección') + '</div>' +
      (s.recomendaciones && !hecha
        ? '<div class="tarjeta-desc">' + esc(s.recomendaciones) + '</div>' : '') +
      pie +
    '</div>';
  }).join('');

  cont.querySelectorAll('.tarjeta').forEach((el) => {
    el.addEventListener('click', () => {
      const s = lista.find((x) => String(x.idSolicitud) === el.dataset.id);
      if (!s) return;
      // Una solicitud ya visitada se consulta, no se vuelve a llenar.
      if (s._estado.clave === 'realizada') {
        if (s._estado.visita) abrirDetalle(s._estado.visita.idVisita);
        else toast('Esta solicitud ya está registrada como atendida.');
        return;
      }
      abrirFicha(APP.solicitudes.find((x) => String(x.idSolicitud) === el.dataset.id));
    });
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
      '<button type="button" class="btn-eliminar-cola" data-id="' + esc(c.idLocal) + '">' +
        'Eliminar del celular</button>' +
    '</div>';
  }).join('') +
  '<button id="btn-forzar-envio" class="btn-principal" style="margin-top:12px">Intentar enviar ahora</button>';

  const btn = $('#btn-forzar-envio');
  if (btn) btn.addEventListener('click', () => sincronizar());

  cont.querySelectorAll('.btn-eliminar-cola').forEach((b) => {
    b.addEventListener('click', () => eliminarDeLaCola(b.dataset.id));
  });
}

/**
 * Borra una ficha de la cola del celular. Es una acción sin vuelta atrás,
 * así que se avisa distinto según lo que se vaya a perder.
 */
async function eliminarDeLaCola(idLocal) {
  const item = APP.cola.find((x) => x.idLocal === idLocal);
  if (!item) return;

  const fotos = recolectarFotos(item.datos).length;
  const yaEnServidor = !!item.idServidor;

  let aviso =
    'ELIMINAR LA FICHA DE LA SOLICITUD ' + item.idSolicitud + '\n\n' +
    'Se borrará de este celular:\n' +
    '  · Toda la ficha diligenciada\n' +
    (fotos ? '  · Las ' + fotos + ' fotografía(s) tomadas\n' : '') +
    '\nESTO NO SE PUEDE DESHACER.\n';

  if (yaEnServidor) {
    aviso += '\nATENCIÓN: esta ficha ya empezó a subirse al servidor. ' +
      'Puede haber quedado registrada a medias. Revisa la hoja VISITAS ' +
      'antes de volver a hacer esta visita.\n';
  } else {
    aviso += '\nLa visita NO quedó registrada. Si la borras, la solicitud ' +
      item.idSolicitud + ' vuelve a aparecer como pendiente y toca visitarla de nuevo.\n';
  }

  aviso += '\n¿Continuar?';
  if (!confirm(aviso)) return;

  // Segunda confirmación: es una pérdida de trabajo de campo.
  if (!confirm('Confirma otra vez.\n\nSe pierde el trabajo de la visita a la solicitud ' +
      item.idSolicitud + '. ¿Eliminar definitivamente?')) return;

  await DB.borrar('cola', idLocal);
  await DB.borrar('borradores', item.clave);
  APP.cola = APP.cola.filter((x) => x.idLocal !== idLocal);
  pintarTodo();
  toast('Ficha eliminada del celular', 'ok');
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

    // Pasar a la siguiente sección que SÍ aplique, saltándose las apagadas.
    bloque.querySelector('.btn-siguiente').addEventListener('click', () => {
      bloque.classList.add('cerrada');
      const desde = FICHA_SCHEMA.secciones.findIndex((x) => x.id === sec.id);
      const siguiente = FICHA_SCHEMA.secciones.slice(desde + 1).find((x) => !seccionOmitida(x));
      if (siguiente) abrirSeccion(siguiente.id);
      else $('#btn-enviar-ficha').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      // Los numéricos van como texto con teclado decimal: así el celular
      // deja escribir el punto aunque su teclado muestre coma.
      const tipoHtml = campo.tipo === 'fecha_hora' ? 'datetime-local' : 'text';
      div.innerHTML = etiqueta + '<input type="' + tipoHtml + '"' +
        (campo.tipo === 'numero' ? ' inputmode="decimal"' : '') +
        (campo.soloLectura ? ' readonly' : '') +
        ' value="' + esc(valor || '') + '">';
      div.querySelector('input').addEventListener('input', (e) => {
        if (campo.tipo === 'numero') {
          const limpio = normalizarNumero(e.target.value);
          if (limpio !== e.target.value) e.target.value = limpio;
          setValor(campo.id, limpio);
        } else {
          setValor(campo.id, e.target.value);
        }
      });
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
            const esNumero = d.tipo === 'numero';
            return '<div class="detalle' + (esNumero ? ' detalle-numero' : '') + '" data-detalle="' + esc(d.id) + '">' +
              '<label class="campo-etiqueta">' + esc(d.etiqueta) +
                (d.requerido ? ' <span class="req">*</span>' : '') + '</label>' +
              '<input type="text" data-id="' + esc(d.id) + '"' +
                (esNumero ? ' inputmode="numeric" data-numero="1"' : '') +
                ' value="' + esc(APP.datos[d.id] || '') + '" ' +
                'placeholder="' + (esNumero ? 'Cantidad' : 'Escribe aquí') + '">' +
            '</div>';
          }).join('');
        caja.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => {
            if (inp.dataset.numero) {
              const limpio = normalizarNumero(inp.value);
              if (limpio !== inp.value) inp.value = limpio;
              setValor(inp.dataset.id, limpio);
            } else {
              setValor(inp.dataset.id, inp.value);
            }
          });
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
            '<label>Latitud (Y)<input type="text" inputmode="decimal" class="gps-y" value="' + esc(c.y || '') + '" placeholder="4.8123456"></label>' +
            '<label>Longitud (X)<input type="text" inputmode="decimal" class="gps-x" value="' + esc(c.x || '') + '" placeholder="-75.7012345"></label>' +
            '<label>Altitud (Z m)<input type="text" inputmode="decimal" class="gps-z" value="' + esc(c.z || '') + '" placeholder="1487"></label>' +
          '</div>' +
          '<p class="gps-estado' + (c.y ? ' ok' : '') + '">' +
            (c.fuente === 'base' ? 'Coordenada de la solicitud. Captura el GPS para mayor precisión.'
              : c.y ? 'Coordenadas registradas.' : 'Sin coordenadas todavía.') +
          '</p>' +
          '<div class="cercanas"></div>' +
        '</div>';

      const estado = div.querySelector('.gps-estado');
      const cajaCercanas = div.querySelector('.cercanas');

      /** Avisa si ya hay visitas registradas en este mismo punto. */
      const revisarCercanas = () => {
        const v = APP.datos[campo.id] || {};
        const cerca = visitasCercanas(v.y, v.x);
        if (!cerca.length) { cajaCercanas.innerHTML = ''; return; }

        cajaCercanas.innerHTML =
          '<div class="aviso-cercanas">' +
            '<b>&#9888; Ya hay ' + cerca.length + ' visita(s) realizada(s) cerca de aquí</b>' +
            '<p>Verifica que no sea el mismo talud antes de continuar.</p>' +
            cerca.slice(0, 4).map((h) =>
              '<button type="button" class="cercana" data-id="' + esc(h.idVisita) + '">' +
                '<span class="cercana-dist">' + h.distancia + ' m</span>' +
                '<span class="cercana-txt">' +
                  '<b>' + esc(h.direccion || h.barrio || 'Sin dirección') + '</b>' +
                  '<small>' + esc(fechaBonita(h.fechaVisita)) +
                    (h.entidad ? ' · ' + esc(h.entidad) : '') + '</small>' +
                '</span>' +
              '</button>').join('') +
          '</div>';

        cajaCercanas.querySelectorAll('.cercana').forEach((b) => {
          b.addEventListener('click', () => abrirDetalle(b.dataset.id));
        });
      };
      const sincronizaCampos = () => setValor(campo.id, {
        y: div.querySelector('.gps-y').value,
        x: div.querySelector('.gps-x').value,
        z: div.querySelector('.gps-z').value,
        precision: (APP.datos[campo.id] || {}).precision,
        fuente: 'manual'
      });
      div.querySelectorAll('.gps-coords input').forEach((i) => {
        i.addEventListener('input', () => {
          const limpio = normalizarNumero(i.value);
          if (limpio !== i.value) i.value = limpio;
          sincronizaCampos();
          revisarCercanas();
        });
      });

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
            revisarCercanas();
          },
          (err) => {
            estado.textContent = err.code === 1
              ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
              : 'No se pudo obtener la ubicación. Escríbela a mano o intenta al aire libre.';
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      });
      revisarCercanas();   // la solicitud puede traer coordenadas de entrada
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

  // Si la respuesta decide qué secciones aplican, se avisa y se lleva al
  // geólogo a la primera sección que sí tiene que llenar.
  if (esCampoFiltro(id)) reaccionarAFiltro(id);

  clearTimeout(setValor._temp);
  setValor._temp = setTimeout(() => guardarBorrador(true), 1200); // autoguardado
}

function reaccionarAFiltro(id) {
  const apagadas = FICHA_SCHEMA.secciones.filter(
    (s) => s.soloSi && s.soloSi.campo === id && seccionOmitida(s)
  );

  if (apagadas.length) {
    toast('Secciones ' + apagadas[0].numero + ' a ' +
      apagadas[apagadas.length - 1].numero + ' no aplican. Pasa a registro y soporte.');
    // Lleva a la primera sección que sí queda por llenar.
    const siguiente = FICHA_SCHEMA.secciones.find(
      (s) => !seccionOmitida(s) && s.numero > apagadas[apagadas.length - 1].numero
    );
    if (siguiente) abrirSeccion(siguiente.id);
  } else {
    // Volvió a activarse: se abre la primera para que continúe.
    const primera = FICHA_SCHEMA.secciones.find((s) => s.soloSi && s.soloSi.campo === id);
    if (primera) abrirSeccion(primera.id);
  }
}

function abrirSeccion(idSeccion) {
  const bloque = $('#form-ficha .seccion[data-seccion="' + idSeccion + '"]');
  if (!bloque) return;
  bloque.classList.remove('cerrada');
  setTimeout(() => bloque.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
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
/**
 * Una sección deja de exigirse cuando el geólogo la marcó "no aplica",
 * o cuando depende de otra respuesta que no se cumple (por ejemplo, las
 * secciones 2 a 8 solo aplican si hay movimiento en masa).
 */
function seccionOmitida(sec) {
  if (sec.noAplica && APP.datos[sec.noAplica.id]) return true;
  if (sec.soloSi && APP.datos[sec.soloSi.campo] !== sec.soloSi.valor) return true;
  return false;
}

/** Campos de los que depende alguna sección. Al cambiarlos se repinta todo. */
function esCampoFiltro(id) {
  return FICHA_SCHEMA.secciones.some((s) => s.soloSi && s.soloSi.campo === id);
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
    const sec = FICHA_SCHEMA.secciones.find((x) => x.id === bloque.dataset.seccion);
    if (!sec) return;
    const omitida = seccionOmitida(sec);

    // La sección se apaga o se enciende según las respuestas del momento.
    bloque.classList.toggle('omitida', omitida);
    if (omitida) bloque.classList.add('cerrada');

    const chip = bloque.querySelector('.seccion-faltan');
    if (!chip) return;
    const n = porSeccion[bloque.dataset.seccion] || 0;

    // Mientras no se responda la pregunta que la gobierna, la sección no está
    // descartada: está a la espera. Decir "No aplica" antes de tiempo confunde.
    const sinDecidir = sec.soloSi && !APP.datos[sec.soloSi.campo];

    chip.textContent = sinDecidir ? 'Según la pregunta 1'
      : omitida ? 'No aplica'
      : n ? 'Faltan ' + n : 'Completa';
    chip.className = 'seccion-faltan ' + (sinDecidir ? 'espera'
      : omitida ? 'omitida' : n ? 'pendiente' : 'lista');
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
/**
 * Registra el modo sin conexión y vigila si sale una versión nueva.
 *
 * El service worker descarga la versión nueva pero se queda esperando;
 * aquí se le avisa al geólogo y solo se activa cuando él lo acepta.
 * Sin esto habría que cerrar y abrir la app dos veces tras cada cambio.
 */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;

  // Al tomar el control la versión nueva, la pantalla se refresca una sola vez.
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    // Puede haber quedado una versión esperando desde la vez pasada.
    if (reg.waiting && navigator.serviceWorker.controller) avisarVersionNueva(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        // Si no había controlador es la primera instalación, no un cambio.
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          avisarVersionNueva(nuevo);
        }
      });
    });

    // Busca versiones nuevas cada tanto y al volver a la app.
    const revisar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(revisar, CONFIG.MINUTOS_BUSCAR_ACTUALIZACION * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
  }).catch(() => {
    console.warn('El modo sin conexión no quedó activo (requiere https o localhost).');
  });
}

function avisarVersionNueva(worker) {
  const barra = $('#aviso-version');
  const btn = $('#btn-actualizar');
  if (!barra || !btn) return;
  barra.hidden = false;
  document.body.classList.add('con-aviso');

  // Se mide el alto real para que el aviso no tape la barra superior.
  // getBoundingClientRect fuerza el cálculo ahí mismo, sin esperar a que
  // el celular pinte: si la app estaba en segundo plano igual queda bien.
  document.documentElement.style.setProperty(
    '--alto-aviso', Math.ceil(barra.getBoundingClientRect().height) + 'px');

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
    // Se guarda lo que esté escrito para que la recarga no se lleve nada.
    if (!$('#vista-ficha').hidden) await guardarBorrador(true);
    worker.postMessage('SALTAR_ESPERA');
  };
}

// ---------------------------------------------------------------- ARRANQUE
iniciar().catch((e) => {
  console.error(e);
  alert('No se pudo iniciar la aplicación: ' + e.message);
});
