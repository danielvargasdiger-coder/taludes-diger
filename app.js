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
  filtro: 'pendientes',   // pendientes | realizadas
  // Filtros que arma el evaluador. Vacío = no filtra por ese criterio.
  // Se llena en la línea de abajo para no repetir la forma en cuatro sitios.
  filtros: null,
  miUbicacion: null,
  sincronizando: false
};

// filtrosVacios() se declara más abajo; las declaraciones de función se
// elevan, así que a esta altura ya se puede llamar.
APP.filtros = filtrosVacios();

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
const CLAVE_FILTROS = 'filtros' + SUFIJO;

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

/**
 * Abre el PDF en el visor de Drive, sin descargarlo.
 *
 * Se reconstruye el enlace desde el id en vez de usar el que guarda Drive
 * (.../view?usp=drivesdk): ese parámetro es el que hace que Android se lo
 * pase a la app de Drive, que intenta abrirlo con la cuenta del usuario y
 * falla aunque el archivo sea público. Sin él, el visor abre en el navegador.
 */
function enlacePdf(url) {
  const u = String(url || '');
  const m = u.match(/[-\w]{25,}/);
  return m ? 'https://drive.google.com/file/d/' + m[0] + '/view' : u;
}

/**
 * Enlace de Drive que el navegador SÍ muestra dentro de una etiqueta de imagen.
 *
 * El que devuelve Drive (uc?id=...) dejó de servir para incrustar: responde
 * bien a una descarga pero el navegador lo rechaza como imagen. El de
 * miniatura sí funciona y además llega redimensionado, que en campo ahorra
 * datos.
 */
function enlaceFoto(url, ancho) {
  const m = String(url || '').match(/[-\w]{25,}/);
  if (!m) return url;
  return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w' + (ancho || 1200);
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
 * Captura de GPS compartida por toda la app.
 *
 * El problema de la versión anterior era el tiempo: esperaba hasta 20 s
 * parado frente al celular. Tres cambios lo arreglan sin perder precisión:
 *
 *  1. EMPIEZA SOLA al abrir la ficha (si el permiso ya está dado), así el
 *     GPS se va afinando mientras el geólogo llena las primeras casillas.
 *     Cuando llega a las coordenadas la lectura suele estar lista y el
 *     botón responde al instante.
 *  2. EL LISTÓN CEDE con el tiempo: exige ±8 m al principio, se conforma
 *     con ±15 m a los 6 s y con ±25 m a los 10 s. Esperar 20 s para ganar
 *     un metro no cambia nada en campo.
 *  3. CORTA SI SE ESTANCA: si la señal deja de mejorar durante 4 s y ya es
 *     usable, no sigue esperando. Un GPS que se estabilizó ya no mejora.
 *
 * Además, mientras busca se puede aceptar lo que haya con un toque.
 */
const GPS = {
  buscando: false,
  mejor: null,      // { y, x, z, precision }
  cuando: 0,        // cuándo se logró la mejor lectura
  lecturas: 0,
  inicio: 0,
  vigia: null,
  reloj: null,
  oyentes: []
};

/** Después de 2 minutos el geólogo ya caminó: la lectura deja de servir. */
const GPS_VIGENCIA = 120000;

function gpsSegundos() { return Math.round((Date.now() - GPS.inicio) / 1000); }
function gpsFresco() { return !!GPS.mejor && (Date.now() - GPS.cuando) < GPS_VIGENCIA; }

/** Se conforma con menos a medida que pasan los segundos. */
function gpsSuficiente(metros, seg) {
  const obj = CONFIG.GPS_PRECISION_OBJETIVO || 8;
  return metros <= obj ||
         (seg >= 6 && metros <= 15) ||
         (seg >= 10 && metros <= 25);
}

/** Qué tan buena es una lectura, para pintarla de color. */
function calidadGps(metros) {
  if (metros == null) return '';
  if (metros <= (CONFIG.GPS_PRECISION_OBJETIVO || 8)) return 'ok';
  if (metros <= 25) return 'regular';
  return 'malo';
}

function gpsCerrar(err) {
  if (GPS.vigia != null) navigator.geolocation.clearWatch(GPS.vigia);
  clearInterval(GPS.reloj);
  GPS.vigia = null; GPS.reloj = null; GPS.buscando = false;

  const oyentes = GPS.oyentes;
  GPS.oyentes = [];
  oyentes.forEach((o) => {
    if (GPS.mejor && o.listo) o.listo(Object.assign({}, GPS.mejor, { lecturas: GPS.lecturas }));
    else if (!GPS.mejor && o.error) o.error(err || { code: 3, message: 'Sin lecturas de GPS.' });
  });
}

/**
 * Pide la ubicación. cb = { progreso, listo, error }.
 * Si ya hay una lectura reciente responde de una vez, sin hacer esperar.
 * Si otra parte de la app ya está midiendo, se engancha a esa medición.
 */
function pedirUbicacion(cb, remedir) {
  if (!navigator.geolocation) {
    if (cb && cb.error) cb.error({ code: 2, message: 'Este celular no tiene GPS disponible.' });
    return;
  }
  if (cb) GPS.oyentes.push(cb);

  if (GPS.buscando) {                                  // ya hay una en curso
    if (cb && cb.progreso) cb.progreso(GPS.mejor, gpsSegundos());
    return;
  }
  if (!remedir && gpsFresco()) { gpsCerrar(); return; }   // lectura guardada

  // Empieza una medición nueva, así que la lectura anterior se descarta.
  // Si todavía sirviera, se habría devuelto en la línea de arriba sin medir.
  // Conservarla haría que una lectura buena pero VIEJA —de otro talud, de
  // hace media hora— le ganara para siempre a las lecturas de ahora.
  GPS.mejor = null;
  GPS.lecturas = 0;
  GPS.buscando = true;
  GPS.inicio = Date.now();
  const limite = (CONFIG.GPS_SEGUNDOS_MAX || 15) * 1000;
  let ultimaMejora = Date.now();

  GPS.vigia = navigator.geolocation.watchPosition(
    (pos) => {
      const p = pos.coords;
      GPS.lecturas++;
      if (!GPS.mejor || p.accuracy < GPS.mejor.precision) {
        GPS.mejor = {
          y: p.latitude.toFixed(7),
          x: p.longitude.toFixed(7),
          z: p.altitude != null ? String(Math.round(p.altitude)) : '',
          precision: Math.round(p.accuracy)
        };
        GPS.cuando = Date.now();
        ultimaMejora = Date.now();
      }
      const seg = gpsSegundos();
      GPS.oyentes.forEach((o) => o.progreso && o.progreso(GPS.mejor, seg));
      if (gpsSuficiente(GPS.mejor.precision, seg)) gpsCerrar();
    },
    (err) => {
      if (!GPS.buscando) return;
      gpsCerrar(err);          // si ya había lectura, gpsCerrar la entrega igual
    },
    { enableHighAccuracy: true, timeout: limite, maximumAge: 0 }
  );

  // Late cada segundo aunque el GPS no reporte, para que se vea que trabaja.
  GPS.reloj = setInterval(() => {
    const seg = gpsSegundos();
    GPS.oyentes.forEach((o) => o.progreso && o.progreso(GPS.mejor, seg));
    const estancado = GPS.mejor && (Date.now() - ultimaMejora) >= 4000 &&
                      GPS.mejor.precision <= 30;
    if (estancado || (Date.now() - GPS.inicio) >= limite) gpsCerrar();
  }, 1000);
}

/** Acepta ya mismo la mejor lectura conseguida hasta el momento. */
function usarLoQueHayaGps() { if (GPS.buscando) gpsCerrar(); }

/**
 * Arranca el GPS al abrir la ficha, SOLO si el permiso ya está concedido.
 * Si no lo está, pedirlo aquí sacaría un cuadro de permiso que el geólogo
 * no pidió; en ese caso se espera a que toque el botón.
 */
function precalentarGps(cb) {
  if (!navigator.geolocation) return;
  if (!navigator.permissions || !navigator.permissions.query) return;
  navigator.permissions.query({ name: 'geolocation' })
    .then((p) => { if (p.state === 'granted') pedirUbicacion(cb); })
    .catch(() => {});
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
  $('#vista-filtros').hidden = vista !== 'filtros';
  $('#vista-mapa').hidden = vista !== 'mapa';
  $('#btn-nueva-no-programada').style.display = vista === 'pendientes' ? '' : 'none';
}

$('#btn-perfil').addEventListener('click', () => irA('cola'));
$('#btn-cerrar-cola').addEventListener('click', () => irA('pendientes'));
$('#aviso-cola').addEventListener('click', () => irA('cola'));

$$('#filtros .filtro[data-filtro]').forEach((b) => {
  b.addEventListener('click', () => {
    APP.filtro = b.dataset.filtro;
    pintarPendientes();
  });
});

// ---------------------------------------------------------------- MAPA
$('#btn-mapa').addEventListener('click', () => { irA('mapa'); abrirMapa(); });
$('#btn-cerrar-mapa').addEventListener('click', () => irA('pendientes'));
$('#btn-mi-ubicacion').addEventListener('click', () => centrarEnMi());

let relojBusquedaMapa = null;
$('#buscar-mapa').addEventListener('input', (ev) => {
  clearTimeout(relojBusquedaMapa);
  const texto = ev.target.value;
  // Se espera un momento: repintar 114 puntos en cada tecla se siente lento.
  relojBusquedaMapa = setTimeout(() => {
    APP.busquedaMapa = texto;
    pintarMapa();
  }, 250);
});
$('#buscar-mapa').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  clearTimeout(relojBusquedaMapa);
  APP.busquedaMapa = ev.target.value;
  pintarMapa();
  ev.target.blur();          // en el celular, esconde el teclado
});

/** Carga Leaflet la primera vez que se pide el mapa, no antes. */
function cargarLeaflet() {
  if (window.L) return Promise.resolve(true);
  return new Promise((ok) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => ok(true);
    js.onerror = () => ok(false);
    document.head.appendChild(js);
  });
}

const COLOR_ESTADO = {
  realizada: '#2e7d32',
  'por-enviar': '#6a1b9a',
  'en-proceso': '#ef8c00',
  pendiente: '#0b4f6c'
};
const COLOR_PRIORIDAD = { 'CRÍTICA': '#a3000d', 'CRITICA': '#a3000d', 'ALTA': '#d84315', 'MEDIA': '#ef8c00', 'BAJA': '#2e7d32' };

/**
 * El mapa solo distingue dos cosas: lo que falta y lo que ya se hizo.
 *
 * La prioridad no se pinta aquí a propósito. De un vistazo desde lejos el
 * equipo necesita una sola respuesta —¿este punto está pendiente o no?—, y
 * cuatro colores de prioridad encima de eso volvían el mapa un semáforo.
 * La prioridad se ve en la tarjeta y en los filtros, que es donde se usa.
 */
const AZUL_POR_VISITAR = '#0b4f6c';
const VERDE_VISITADA = '#1b7a1f';

async function abrirMapa() {
  const cargo = await cargarLeaflet();
  if (!cargo) {
    $('#mapa-sin-red').hidden = false;
    $('#mapa').style.display = 'none';
    return;
  }
  $('#mapa-sin-red').hidden = true;
  $('#mapa').style.display = '';

  if (!APP.mapa) {
    APP.mapa = L.map('mapa', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(APP.mapa);
    APP.capaPuntos = L.layerGroup().addTo(APP.mapa);
    APP.mapa.setView([4.8133, -75.6961], 12);   // Pereira

    // Cuando el mapa por fin conoce su tamaño real, se reencuadra. Los
    // temporizadores de abajo son una ayuda, no una garantía: en un celular
    // el alto cambia cuando se esconde la barra del navegador o se cierra el
    // teclado, y un encuadre calculado antes de eso abre demasiado cerca.
    APP.mapa.on('resize', () => { if (!APP.mapaCentrado) pintarMapa(); });
  }
  // Primero se le dice al mapa cuál es su tamaño real y SOLO DESPUÉS se
  // encuadran los puntos. Al revés, fitBounds calcula el zoom con el tamaño
  // anterior —cero, porque la pantalla acaba de aparecer— y el mapa abre
  // pegadísimo a un punto en vez de mostrar Pereira entera.
  // Dos pasadas: la pantalla del mapa acaba de aparecer y su tamaño real
  // puede tardar un instante en asentarse (barra del navegador del celular,
  // teclado que se cierra). La segunda pasada corrige el encuadre si la
  // primera se calculó con un tamaño que todavía no era el definitivo.
  setTimeout(() => { APP.mapa.invalidateSize(); pintarMapa(); }, 60);
  setTimeout(() => { APP.mapa.invalidateSize(); pintarMapa(); }, 400);
}

function pintarMapa() {
  if (!APP.mapa) return;
  APP.capaPuntos.clearLayers();

  // Se juntan las pendientes con TODAS las visitas hechas: si no, una
  // entidad invitada vería el mapa vacío.
  const pendientes = solicitudesConEstado().filter((s) => s._estado.clave !== 'realizada');
  const hechas = visitadasConDatos().map((v) => Object.assign({}, v, {
    latitud: v.latitud !== '' && v.latitud != null ? v.latitud : v._estado.visita.latitud,
    longitud: v.longitud !== '' && v.longitud != null ? v.longitud : v._estado.visita.longitud
  }));
  const todos = pendientes.concat(hechas)
    .filter((s) => s.latitud !== '' && s.latitud != null &&
                   s.longitud !== '' && s.longitud != null);

  const busqueda = (APP.busquedaMapa || '').trim();
  // Al borrar el buscador hay que volver a mostrar todo: si no, el mapa se
  // queda encima del último resultado con los otros 113 puntos fuera de
  // pantalla, y parece que se hubieran perdido.
  const seLimpio = !!APP.busquedaMapaPrevia && !busqueda;
  APP.busquedaMapaPrevia = busqueda;

  const conCoords = busqueda
    ? filtrar(todos, busqueda,
        ['idSolicitud', 'barrio', 'comuna', 'direccion', 'edificacion', 'responsable'])
    : todos;

  let nPend = 0, nReal = 0;
  const puntos = [];
  let unico = null;

  conCoords.forEach((s) => {
    const hecha = s._estado.clave === 'realizada';
    hecha ? nReal++ : nPend++;
    const color = hecha ? VERDE_VISITADA : AZUL_POR_VISITAR;

    // Aro blanco grueso y relleno opaco. Antes las visitadas iban al 75 %
    // de opacidad y sobre el verde de los parques se perdían del todo.
    const m = L.circleMarker([s.latitud, s.longitud], {
      radius: hecha ? 7 : 9,
      color: '#fff', weight: 2.5, opacity: 1,
      fillColor: color, fillOpacity: 1
    });

    const v = s._estado.visita;
    m.bindPopup(
      '<div class="popup">' +
        '<b>' + esc(s.direccion || s.barrio || 'Sin dirección') + '</b>' +
        '<small>Solicitud ' + esc(s.idSolicitud) +
          (s.barrio ? ' · ' + esc(s.barrio) : '') + '</small>' +
        '<span class="popup-estado" style="background:' + color + '">' +
          (hecha ? 'VISITADA' : 'POR VISITAR') + '</span>' +
        (hecha && v
          ? '<small>' + esc(fechaBonita(v.fechaVisita)) + '<br>' +
            esc(v.evaluadores || '') + (v.entidad ? ' · ' + esc(v.entidad) : '') + '</small>'
          : (s.responsable ? '<small>Asignada a ' + esc(s.responsable) + '</small>' : '')) +
        '<button type="button" class="popup-btn" data-id="' + esc(s.idSolicitud) + '">' +
          (hecha ? 'Ver la ficha' : 'Hacer la visita') + '</button>' +
      '</div>');
    puntos.push([s.latitud, s.longitud]);
    unico = m;
    APP.capaPuntos.addLayer(m);
  });

  $('#mapa-resumen').textContent = nPend + ' por visitar · ' + nReal + ' visitadas';

  const marcador = $('#mapa-resultados');
  marcador.textContent = busqueda
    ? (puntos.length ? puntos.length + (puntos.length === 1 ? ' punto' : ' puntos') : 'Nada coincide')
    : '';
  marcador.classList.toggle('vacio', !!busqueda && !puntos.length);

  // Al buscar, el mapa va a donde está el resultado. Sin búsqueda, se
  // encuadra una sola vez para no arrancarle el mapa de las manos al
  // geólogo cada vez que entra la sincronización.
  if (puntos.length && (busqueda || seLimpio || !APP.mapaCentrado)) {
    if (busqueda && puntos.length === 1) {
      APP.mapa.setView(puntos[0], 17);
      if (unico) unico.openPopup();
    } else {
      APP.mapa.fitBounds(puntos, { padding: [40, 40] });
    }
    // Solo se da por encuadrado si el mapa YA tenía tamaño de verdad. Si se
    // encuadró contra un alto de cero, ese encuadre no vale y hay que dejar
    // que la siguiente pasada lo rehaga.
    if (!busqueda && APP.mapa.getSize().y > 100) APP.mapaCentrado = true;
  }

  // El botón del globo se enlaza cuando el globo se abre.
  APP.mapa.off('popupopen').on('popupopen', (ev) => {
    const b = ev.popup.getElement().querySelector('.popup-btn');
    if (!b) return;
    b.addEventListener('click', () => {
      const id = String(b.dataset.id);
      irA('pendientes');

      const s = APP.solicitudes.find((x) => String(x.idSolicitud) === id);
      if (s) {
        const est = estadoSolicitud(s);
        if (est.clave === 'realizada' && est.visita) abrirDetalle(est.visita.idVisita);
        else abrirFicha(s);
        return;
      }

      // El punto puede ser una visita que no está en las solicitudes de esta
      // entidad: un hallazgo de campo, o una visita hecha por otra entidad.
      // Antes el botón no hacía nada en ese caso, que es TODOS los casos
      // para quien entra sin código.
      const v = APP.historial.find((x) => String(x.idSolicitud) === id);
      if (v) abrirDetalle(v.idVisita);
      else toast('No se encontró la ficha de ' + id, 'error');
    });
  });
}

/** Marca dónde está el geólogo y centra el mapa ahí. */
function centrarEnMi() {
  if (!navigator.geolocation || !APP.mapa) return;
  const btn = $('#btn-mi-ubicacion');
  btn.textContent = 'Buscando…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = [pos.coords.latitude, pos.coords.longitude];
      APP.miUbicacion = { lat: p[0], lon: p[1] };
      if (APP.marcadorYo) APP.mapa.removeLayer(APP.marcadorYo);
      APP.marcadorYo = L.circleMarker(p, {
        radius: 9, color: '#fff', weight: 3, fillColor: '#1565c0', fillOpacity: 1
      }).addTo(APP.mapa).bindPopup('Estás aquí');
      APP.mapa.setView(p, 16);
      btn.textContent = 'Mi ubicación';
    },
    () => { toast('No se pudo obtener tu ubicación.', 'error'); btn.textContent = 'Mi ubicación'; },
    { enableHighAccuracy: true, timeout: 20000 }
  );
}

// ---------------------------------------------------------------- FILTROS
$('#btn-filtros').addEventListener('click', () => { dibujarPanelFiltros(); irA('filtros'); });
$('#btn-cerrar-filtros').addEventListener('click', () => irA('pendientes'));
$('#btn-aplicar-filtros').addEventListener('click', () => { irA('pendientes'); pintarPendientes(); });
$('#btn-limpiar-filtros').addEventListener('click', () => {
  APP.filtros = filtrosVacios();
  APP.miUbicacion = null;
  dibujarPanelFiltros();
  pintarPendientes();
});

/**
 * Campos por los que se puede filtrar. El evaluador elige cuáles usar;
 * no se le imponen. Agregar uno nuevo es agregar una línea aquí.
 */
/**
 * Un mismo talud lo pueden ir a ver dos geólogos, y el campo EVALUADORES
 * guarda los nombres juntos en un solo texto. Se separan para que la visita
 * aparezca al filtrar por cualquiera de los dos, no solo por el que quedó
 * escrito de primero.
 */
function evaluadoresDe(s) {
  return String(s.evaluadores || '')
    .split(/\s*[,;/]\s*|\s+y\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** La forma que debe tener SIEMPRE APP.filtros. Un solo sitio que cambiar. */
function filtrosVacios() {
  return { prioridad: [], evaluadores: [], comuna: [], barrio: [], entidad: [],
           sinCoords: false, cercanas: false, abiertos: [] };
}

/**
 * Ajusta un filtro guardado a la forma actual.
 *
 * Los filtros guardados viven en el celular y sobreviven a las versiones de
 * la app: uno guardado antes de que existiera "evaluador" no trae esa clave,
 * y al marcar una opción el panel se topaba con un undefined y se caía. Las
 * claves que ya no existen (como "responsable") se descartan aquí.
 */
function normalizarFiltros(guardado) {
  const base = filtrosVacios();
  const g = guardado || {};
  Object.keys(base).forEach((k) => {
    if (Array.isArray(base[k])) base[k] = Array.isArray(g[k]) ? g[k].slice() : [];
    else if (typeof base[k] === 'boolean') base[k] = !!g[k];
  });
  return base;
}

const CAMPOS_FILTRABLES = [
  { clave: 'prioridad',   titulo: 'Prioridad',              vacio: 'SIN PRIORIDAD' },
  // Quién HIZO la visita. Solo tiene sentido sobre las visitadas: una
  // solicitud pendiente todavía no tiene evaluador.
  //
  // El filtro por RESPONSABLE (a quién está asignada la solicitud) se quitó
  // a propósito: eran dos filtros de persona seguidos y se confundían. El
  // nombre del responsable sigue viéndose en la tarjeta y el buscador de
  // arriba sigue encontrándolo si se escribe.
  { clave: 'evaluadores', titulo: 'Evaluador que hizo la visita',
    vacio: '(sin evaluador)', multiple: true, soloEn: 'realizadas' },
  { clave: 'comuna',      titulo: 'Comuna o corregimiento', vacio: '(sin comuna)' },
  { clave: 'barrio',      titulo: 'Barrio o vereda',        vacio: '(sin barrio)' },
  { clave: 'entidad',     titulo: 'Entidad',                vacio: '(sin entidad)' }
];

/**
 * Valores distintos de un campo con su conteo.
 *
 * Cuenta solo dentro del estado que se está viendo (por visitar / visitadas):
 * ofrecer "ALTA 12" y que al marcarlo salgan cero porque esas doce ya se
 * visitaron es desconcertante. Las opciones que quedarían en cero se ocultan.
 */
function opcionesDe(campo, vacio, multiple) {
  const cuenta = {};
  (APP.filtro === 'realizadas'
    ? visitadasConDatos()
    : solicitudesConEstado().filter((s) => s._estado.clave !== 'realizada'))
    .forEach((s) => {
      // Un campo "multiple" puede aportar varios valores por registro: una
      // visita hecha entre dos geólogos cuenta para los dos.
      const valores = multiple
        ? (evaluadoresDe(s).length ? evaluadoresDe(s) : [vacio])
        : [String(s[campo] || '').trim() || vacio];
      valores.forEach((v) => { cuenta[v] = (cuenta[v] || 0) + 1; });
    });
  return Object.keys(cuenta)
    .filter((v) => v !== '' && cuenta[v] > 0)
    .sort((a, b) => cuenta[b] - cuenta[a])
    .map((v) => ({ valor: v, n: cuenta[v] }));
}

function dibujarPanelFiltros() {
  const f = APP.filtros;
  if (!f.abiertos) f.abiertos = [];

  // Un campo se despliega si el evaluador lo abrió o si ya tiene algo marcado.
  const estaAbierto = (c) => f.abiertos.indexOf(c) !== -1 || (f[c] && f[c].length);

  const grupo = (campo) => {
    // Hay filtros que solo aplican a un estado (el evaluador, a las
    // visitadas). Ofrecerlo en el otro solo daría una lista vacía.
    if (campo.soloEn && campo.soloEn !== APP.filtro) return '';
    const opciones = opcionesDe(campo.clave, campo.vacio, campo.multiple);
    if (!opciones.length) return '';
    const marcados = (f[campo.clave] || []).length;
    const abierto = estaAbierto(campo.clave);

    return '<div class="grupo-filtro' + (abierto ? ' abierto' : '') + '">' +
      '<button type="button" class="grupo-cabeza" data-abrir="' + esc(campo.clave) + '">' +
        '<span>' + esc(campo.titulo) + '</span>' +
        (marcados ? '<span class="grupo-marcados">' + marcados + '</span>' : '') +
        '<span class="grupo-flecha">' + (abierto ? '&#9662;' : '&#9656;') + '</span>' +
      '</button>' +
      (abierto
        ? '<div class="opciones-filtro">' + opciones.map((o) =>
            '<button type="button" class="op-filtro' +
              ((f[campo.clave] || []).indexOf(o.valor) !== -1 ? ' activa' : '') + '" ' +
              'data-clave="' + esc(campo.clave) + '" data-valor="' + esc(o.valor) + '">' +
              esc(o.valor) + ' <b>' + o.n + '</b></button>').join('') + '</div>'
        : '') +
    '</div>';
  };

  const guardados = filtrosGuardados();

  $('#cuerpo-filtros').innerHTML =
    '<p class="ambito-filtro">Filtrando sobre <b>' +
      (APP.filtro === 'realizadas' ? 'las visitadas' : 'las que faltan por visitar') +
    '</b></p>' +

    (guardados.length
      ? '<div class="grupo-filtro abierto"><h3>Mis filtros guardados</h3>' +
        '<div class="opciones-filtro">' + guardados.map((g, i) =>
          '<span class="op-filtro guardado" data-guardado="' + i + '">' + esc(g.nombre) +
            '<button type="button" class="borrar-guardado" data-borrar="' + i + '">&times;</button>' +
          '</span>').join('') + '</div></div>'
      : '') +

    '<div class="grupo-filtro abierto"><h3>Dónde estoy</h3>' +
      '<button type="button" id="btn-cerca-mi" class="op-filtro grande' +
        (f.cercanas ? ' activa' : '') + '">&#9678; Solo las cercanas a mí</button>' +
      '<p class="ayuda-filtro">Usa el GPS para mostrar lo que tienes a menos de ' +
        (CONFIG.METROS_CERCA_DE_MI / 1000) + ' km.</p>' +
    '</div>' +

    '<h3 class="titulo-seccion-filtros">Filtrar por</h3>' +
    CAMPOS_FILTRABLES.map(grupo).join('') +

    '<div class="grupo-filtro abierto"><h3>Otros</h3>' +
      '<button type="button" class="op-filtro' + (f.sinCoords ? ' activa' : '') + '" ' +
        'data-clave="sinCoords">Sin coordenadas (hay que capturar GPS)</button>' +
    '</div>' +

    '<button type="button" id="btn-guardar-filtro" class="btn-secundario">' +
      'Guardar esta combinación</button>';

  // Abrir o cerrar un campo
  $('#cuerpo-filtros').querySelectorAll('.grupo-cabeza').forEach((b) => {
    b.addEventListener('click', () => {
      const c = b.dataset.abrir;
      const i = f.abiertos.indexOf(c);
      if (i === -1) f.abiertos.push(c); else f.abiertos.splice(i, 1);
      dibujarPanelFiltros();
    });
  });

  // Aplicar un filtro guardado
  $('#cuerpo-filtros').querySelectorAll('.op-filtro.guardado').forEach((b) => {
    b.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('borrar-guardado')) return;
      const g = filtrosGuardados()[Number(b.dataset.guardado)];
      if (!g) return;
      APP.filtros = normalizarFiltros(g.filtros);
      dibujarPanelFiltros();
      actualizarConteoFiltros();
    });
  });
  $('#cuerpo-filtros').querySelectorAll('.borrar-guardado').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const lista = filtrosGuardados();
      lista.splice(Number(b.dataset.borrar), 1);
      localStorage.setItem(CLAVE_FILTROS, JSON.stringify(lista));
      dibujarPanelFiltros();
    });
  });

  const btnGuardar = $('#btn-guardar-filtro');
  if (btnGuardar) btnGuardar.addEventListener('click', () => {
    const nombre = prompt('¿Con qué nombre guardas esta combinación?\n\nEj: Mis ALTA de Cuba');
    if (!nombre || !nombre.trim()) return;
    const lista = filtrosGuardados();
    const copia = JSON.parse(JSON.stringify(APP.filtros));
    delete copia.abiertos;
    lista.push({ nombre: nombre.trim(), filtros: copia });
    localStorage.setItem(CLAVE_FILTROS, JSON.stringify(lista));
    toast('Filtro guardado', 'ok');
    dibujarPanelFiltros();
  });

  $('#cuerpo-filtros').querySelectorAll('.op-filtro[data-clave]').forEach((b) => {
    b.addEventListener('click', () => {
      const clave = b.dataset.clave;
      if (clave === 'sinCoords') {
        f.sinCoords = !f.sinCoords;
      } else {
        const i = f[clave].indexOf(b.dataset.valor);
        if (i === -1) f[clave].push(b.dataset.valor); else f[clave].splice(i, 1);
      }
      b.classList.toggle('activa');
      actualizarConteoFiltros();
    });
  });

  const btnCerca = $('#btn-cerca-mi');
  if (btnCerca) btnCerca.addEventListener('click', async () => {
    if (f.cercanas) { f.cercanas = false; APP.miUbicacion = null; btnCerca.classList.remove('activa'); actualizarConteoFiltros(); return; }
    if (!navigator.geolocation) { toast('Este celular no tiene GPS disponible.', 'error'); return; }
    btnCerca.textContent = 'Buscando tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        APP.miUbicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        f.cercanas = true;
        dibujarPanelFiltros();
        actualizarConteoFiltros();
      },
      () => { toast('No se pudo obtener tu ubicación.', 'error'); dibujarPanelFiltros(); },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  });

  actualizarConteoFiltros();
}

/** Combinaciones que el evaluador guardó en este celular. */
function filtrosGuardados() {
  try { return JSON.parse(localStorage.getItem(CLAVE_FILTROS) || '[]'); }
  catch (e) { return []; }
}

/** Cuántas solicitudes quedarían con los filtros marcados ahora mismo. */
function actualizarConteoFiltros() {
  const antes = $('#lista-pendientes').innerHTML;
  pintarPendientes();
  const n = document.querySelectorAll('#lista-pendientes .tarjeta').length;
  // En "Visitadas" lo que se cuenta son visitas, no solicitudes.
  $('#filtros-resultado').textContent = n + (APP.filtro === 'realizadas'
    ? (n === 1 ? ' visita' : ' visitas')
    : (n === 1 ? ' solicitud' : ' solicitudes'));
  $('#lista-pendientes').innerHTML = antes;
}

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

/**
 * Lista las visitas hechas alrededor de una solicitud, con dirección y
 * fecha, para que el geólogo COMPARE y decida si es el mismo talud.
 * Se abre solo si él lo pide: nunca interrumpe ni sugiere saltarse nada.
 */
function mostrarVecinas(s) {
  const filas = s._vecinas.map((v) =>
    '<button type="button" class="vecina" data-id="' + esc(v.idVisita) + '">' +
      '<span class="vecina-dist">' + v.distancia + ' m</span>' +
      '<span class="vecina-txt">' +
        '<b>Solicitud ' + esc(v.idSolicitud) + ' — ' +
          esc(v.direccion || v.barrio || 'sin dirección') + '</b>' +
        '<small>' + esc(fechaBonita(v.fechaVisita)) +
          (v.entidad ? ' · ' + esc(v.entidad) : '') + '</small>' +
      '</span>' +
    '</button>').join('');

  $('#detalle-titulo').textContent = 'Visitas cerca de la solicitud ' + s.idSolicitud;
  $('#detalle-subtitulo').textContent = esc(s.direccion || s.barrio || '');
  $('#detalle-cuerpo').innerHTML =
    '<div class="detalle-seccion">' +
      '<p class="nota-vecinas">Estas visitas corresponden a <b>otras solicitudes</b> ' +
        'cercanas. Compáralas con la tuya: si es un talud distinto, ' +
        '<b>haz tu visita igual</b>.</p>' +
      filas +
    '</div>';
  $('#vista-detalle').hidden = false;
  $('#detalle-cuerpo').querySelectorAll('.vecina').forEach((b) => {
    b.addEventListener('click', () => abrirDetalle(b.dataset.id));
  });
}

/** Muestra qué filtros están puestos, y permite quitarlos de a uno. */
function pintarChipsActivos() {
  const f = APP.filtros;
  const cont = $('#chips-activos');
  if (!cont) return;
  const activos = [];
  ['prioridad', 'evaluadores', 'comuna', 'barrio', 'entidad'].forEach((clave) => {
    (f[clave] || []).forEach((v) => activos.push({ clave: clave, valor: v, texto: v }));
  });
  if (f.sinCoords) activos.push({ clave: 'sinCoords', texto: 'Sin coordenadas' });
  if (f.cercanas) activos.push({ clave: 'cercanas', texto: 'Cerca de mí' });

  const btn = $('#filtros-activos');
  if (btn) btn.textContent = activos.length ? String(activos.length) : '';

  cont.innerHTML = activos.map((a, i) =>
    '<button type="button" class="chip-activo" data-i="' + i + '">' +
      esc(a.texto) + ' <span>&times;</span></button>').join('') +
    (activos.length > 1 ? '<button type="button" class="chip-activo limpiar">Quitar todos</button>' : '');

  cont.querySelectorAll('.chip-activo').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.classList.contains('limpiar')) {
        APP.filtros = filtrosVacios();
        APP.miUbicacion = null;
      } else {
        const a = activos[Number(b.dataset.i)];
        if (a.clave === 'sinCoords') f.sinCoords = false;
        else if (a.clave === 'cercanas') { f.cercanas = false; APP.miUbicacion = null; }
        else f[a.clave].splice(f[a.clave].indexOf(a.valor), 1);
      }
      pintarPendientes();
    });
  });
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
    .map((s) => {
      const con = Object.assign({}, s, { _estado: estadoSolicitud(s) });
      // Contexto, NO advertencia de repetido: en zona urbana dos casas
      // vecinas están a 10 m y son taludes distintos. La duplicidad real
      // la define el número de solicitud, no la distancia. Esto solo
      // informa que hay trabajo hecho al lado, para que el geólogo compare
      // y decida. Nunca debe llevar a omitir una visita.
      if (con._estado.clave !== 'realizada' && s.latitud !== '') {
        const cerca = visitasCercanas(s.latitud, s.longitud, CONFIG.METROS_ALERTA_CERCANIA)
          .filter((v) => String(v.idSolicitud) !== String(s.idSolicitud));
        if (cerca.length) con._vecinas = cerca;
      }
      // Distancia a donde está parado el geólogo, si la pidió.
      if (APP.miUbicacion && s.latitud !== '') {
        con._distancia = distanciaMetros(APP.miUbicacion.lat, APP.miUbicacion.lon,
                                         parseFloat(s.latitud), parseFloat(s.longitud));
        con._cerca = con._distancia <= CONFIG.METROS_CERCA_DE_MI;
      }
      return con;
    })
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

/**
 * Cada visita realizada como tarjeta, venga de donde venga: de una solicitud
 * programada, de un hallazgo en campo o de otra entidad. Si existe la
 * solicitud se le pegan sus datos; si no, la tarjeta se arma con lo que
 * trae la propia visita.
 */
function visitadasConDatos() {
  return APP.historial.map((v) => {
    const s = APP.solicitudes.find((x) => String(x.idSolicitud) === String(v.idSolicitud)) || {};
    return Object.assign({}, s, {
      idSolicitud: v.idSolicitud,
      barrio: s.barrio || v.barrio || '',
      direccion: s.direccion || v.direccion || '',
      prioridad: v.prioridad || s.prioridad || '',
      evaluadores: v.evaluadores || '',
      _estado: { clave: 'realizada', texto: 'REALIZADA', visita: v }
    });
  });
}

function pintarPendientes() {
  const conEstado = solicitudesConEstado();
  const visitadas = visitadasConDatos();
  const nPend = conEstado.filter((s) => s._estado.clave !== 'realizada').length;
  const nReal = visitadas.length;

  // Una entidad sin solicitudes asignadas no tiene nada "por visitar":
  // esa pestaña solo la confundiría. Le queda la lista de visitadas -que es
  // común a todas las entidades- y el botón + para registrar lo que encuentre.
  const sinLista = !!(APP.perfil && APP.perfil.verSolicitudes === false);
  $('#filtros .filtro[data-filtro="pendientes"]').hidden = sinLista;
  if (sinLista && APP.filtro !== 'realizadas') APP.filtro = 'realizadas';

  $('#dato-pendientes').textContent = nPend;
  $('#dato-realizadas').textContent = nReal;
  $$('#filtros .filtro[data-filtro]').forEach((b) => {
    b.classList.toggle('activo', b.dataset.filtro === APP.filtro);
  });
  pintarChipsActivos();

  const f = APP.filtros;
  const base = APP.filtro === 'realizadas' ? visitadas : conEstado;
  const porFiltro = base.filter((s) => {
    if (APP.filtro === 'pendientes' && s._estado.clave === 'realizada') return false;

    if (f.prioridad.length &&
        f.prioridad.indexOf((s.prioridad || 'SIN PRIORIDAD').toUpperCase()) === -1) return false;
    if ((f.evaluadores || []).length) {
      const nombres = evaluadoresDe(s);
      const lista = nombres.length ? nombres : ['(sin evaluador)'];
      if (!lista.some((n) => f.evaluadores.indexOf(n) !== -1)) return false;
    }
    if (f.comuna.length && f.comuna.indexOf(s.comuna || '(sin comuna)') === -1) return false;
    if ((f.barrio || []).length && f.barrio.indexOf(s.barrio || '(sin barrio)') === -1) return false;
    if (f.entidad.length && f.entidad.indexOf(s.entidad || '(sin entidad)') === -1) return false;
    if (f.sinCoords && s.latitud !== '') return false;
    if (f.cercanas && !s._cerca) return false;
    return true;
  });
  const lista = filtrar(porFiltro, $('#buscar-pendientes').value,
    ['idSolicitud', 'barrio', 'comuna', 'direccion', 'edificacion', 'responsable']);

  const cont = $('#lista-pendientes');
  $('#resumen-pendientes').textContent = lista.length
    // En 'Visitadas' lo que se cuenta son visitas, no solicitudes: puede
    // haber varias visitas de una misma solicitud, y hallazgos que no
    // nacieron de ninguna.
    ? lista.length + (APP.filtro === 'realizadas'
        ? (lista.length === 1 ? ' visita' : ' visitas')
        : (lista.length === 1 ? ' solicitud' : ' solicitudes'))
    : '';

  if (!lista.length) {
    cont.innerHTML = APP.solicitudes.length
      ? '<div class="vacio"><span class="vacio-icono">&#10003;</span>' +
        ($('#buscar-pendientes').value
          ? 'Ninguna solicitud coincide con la búsqueda.'
          : APP.filtro === 'realizadas' ? 'Todavía no hay solicitudes visitadas.'
          : 'No queda ninguna solicitud por visitar.') + '</div>'
      : sinLista
        ? '<div class="vacio"><span class="vacio-icono">&#43;</span>' +
          '<b>' + esc(APP.perfil.entidad) + '</b><br>' +
          ($('#buscar-pendientes').value
            ? 'Ninguna visita coincide con la búsqueda.'
            : 'Todavía no hay visitas registradas.') + '<br>' +
          'Toca el botón <b>+</b> para registrar una visita de talud.<br><br>' +
          '<small>Aquí verás las visitas hechas por todas las entidades, ' +
          'para no repetir trabajo.</small></div>'
        : '<div class="vacio"><span class="vacio-icono">&#8681;</span>' +
          'Toca el botón de sincronizar (arriba a la derecha) para descargar las solicitudes.</div>';
    return;
  }

  // Tarjeta pensada para escanear en la calle: número y barrio arriba,
  // dirección como titular, el motivo en dos líneas, y el resto abajo en
  // letra menuda. Solo se marca lo que aporta: la prioridad se muestra si
  // existe, y el estado solo cuando no es "por visitar".
  cont.innerHTML = lista.map((s) => {
    const e = s._estado;
    const hecha = e.clave === 'realizada';
    // En una visitada vale la prioridad que asignó el geólogo en campo,
    // no la que traía la solicitud desde la oficina.
    const p = ((hecha && e.visita && e.visita.prioridad) || s.prioridad || '').toUpperCase();
    const lugar = [s.barrio, s.comuna].filter(Boolean).join(' · ');

    // Una visita por hacer necesita todo lo que sirve para llegar y para
    // llamar antes; una ya hecha solo necesita decir cuándo y quién.
    const pie = hecha
      ? '<div class="tarjeta-visita">' +
          '<div class="visita-linea">' +
            '<span class="visto">&#10003;</span>' +
            '<span>' + (e.visita
              ? esc(fechaBonita(e.visita.fechaVisita))
              : 'Registrada como atendida') + '</span>' +
          '</div>' +
          (e.visita
            ? '<div class="visita-quien">' + esc(e.visita.evaluadores || '') +
                (e.visita.entidad ? ' · ' + esc(e.visita.entidad) : '') + '</div>' +
              '<div class="visita-acciones">' +
                '<span class="enlace-ficha">Ver ficha completa</span>' +
                (e.visita.pdfUrl
                  ? '<a class="enlace-pdf" target="_blank" rel="noopener" ' +
                    'href="' + esc(enlacePdf(e.visita.pdfUrl)) + '" ' +
                    'onclick="event.stopPropagation()">PDF</a>'
                  : '') +
              '</div>'
            : '') +
        '</div>'
      : (s.contacto || s.telefono
          ? '<div class="tarjeta-contacto">' +
              (s.contacto ? '<span class="contacto-nombre">' + esc(s.contacto) + '</span>' : '') +
              (s.telefono
                ? '<a href="tel:' + esc(s.telefono) + '" class="tel btn-llamar" ' +
                  'onclick="event.stopPropagation()">&#128222; ' + esc(s.telefono) + '</a>'
                : '') +
            '</div>'
          : '') +
        '<div class="tarjeta-pie">' +
          (s.responsable ? '<span>Asignada a <b>' + esc(s.responsable) + '</b></span>' : '') +
          (!s.latitud ? '<span class="aviso-sin-gps">Sin coordenadas — capturar GPS</span>' : '') +
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
      (s.edificacion && s.direccion && !hecha
        ? '<div class="tarjeta-edif">' + esc(s.edificacion) + '</div>' : '') +
      (s._vecinas
        ? '<div class="aviso-vecinas">' +
            '<b>&#9432; ' + s._vecinas.length +
              (s._vecinas.length === 1 ? ' visita hecha cerca' : ' visitas hechas cerca') +
              ' (' + s._vecinas.slice(0, 3).map((v) => v.distancia + ' m').join(', ') + ')</b>' +
            '<span>Son <b>otras solicitudes</b>. Revísalas solo para confirmar que ' +
              'no es el mismo talud. Si es distinto, haz tu visita normalmente.</span>' +
            '<span class="ver-vecinas">Ver cuáles &rarr;</span>' +
          '</div>'
        : '') +
      (typeof s._distancia === 'number'
        ? '<div class="tarjeta-distancia">A ' +
          (s._distancia >= 1000 ? (s._distancia/1000).toFixed(1) + ' km' : s._distancia + ' m') +
          ' de donde estás</div>'
        : '') +
      (hecha
        ? (e.visita && e.visita.concepto
            ? '<div class="tarjeta-concepto">' + esc(e.visita.concepto) +
              (e.visita.concepto.length >= 260 ? '…' : '') + '</div>'
            : '')
        : (s.recomendaciones
            ? '<div class="tarjeta-desc">' + esc(s.recomendaciones) + '</div>' : '')) +
      pie +
    '</div>';
  }).join('');

  cont.querySelectorAll('.aviso-vecinas').forEach((av) => {
    av.addEventListener('click', (ev) => {
      ev.stopPropagation();   // no abrir la ficha, solo mostrar las vecinas
      const el = av.closest('.tarjeta');
      const s = lista.find((x) => String(x.idSolicitud) === el.dataset.id);
      if (s && s._vecinas) mostrarVecinas(s);
    });
  });

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
      // Un campo de solo lectura NO se dibuja como campo de escritura:
      // "readonly" bloquea el teclado pero no el autocompletado ni el pegado,
      // y sobre todo se ve idéntico a uno editable. El código de evaluación
      // es la llave que une la ficha con la solicitud: no puede cambiarse.
      if (campo.soloLectura) {
        div.innerHTML = etiqueta +
          '<div class="valor-fijo">' + esc(valor || '—') +
            '<span class="candado" title="No se puede modificar">&#128274;</span>' +
          '</div>';
        break;
      }

      const tipoHtml = campo.tipo === 'fecha_hora' ? 'datetime-local' : 'text';
      div.innerHTML = etiqueta + '<input type="' + tipoHtml + '"' +
        (campo.tipo === 'numero' ? ' inputmode="decimal"' : '') +
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

        // El margen del GPS puede ser mayor que el radio del aviso. En ese
        // caso el aviso no es concluyente y hay que decirlo: si no, el
        // equipo confía en un silencio que no significa nada.
        const margen = v.precision || 0;
        const dudoso = margen > CONFIG.METROS_ALERTA_CERCANIA;

        cajaCercanas.innerHTML =
          '<div class="aviso-cercanas">' +
            '<b>&#9432; ' + cerca.length + ' visita(s) a menos de ' +
              CONFIG.METROS_ALERTA_CERCANIA + ' m de este punto</b>' +
            '<p>Están prácticamente encima. Aun así <b>pueden ser otro talud</b>: ' +
              'ábrelas y compara. Si el tuyo es distinto, sigue con tu ficha normalmente — ' +
              'nunca omitas una visita por este aviso.' +
              (dudoso ? ' <b>Tu ubicación tiene ±' + margen + ' m de margen</b>, ' +
                'así que esta comparación es apenas orientativa.' : '') + '</p>' +
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

      const btnGps = div.querySelector('.btn-gps');
      const ETIQUETA_GPS = '\u25CE Capturar mi ubicación';

      /** Escribe una lectura en las casillas y en el borrador. */
      const ponerUbicacion = (p, sola) => {
        div.querySelector('.gps-y').value = p.y;
        div.querySelector('.gps-x').value = p.x;
        if (p.z !== '') div.querySelector('.gps-z').value = p.z;
        setValor(campo.id, { y: p.y, x: p.x, z: p.z, precision: p.precision, fuente: 'gps' });
        estado.className = 'gps-estado ' + calidadGps(p.precision);
        estado.textContent = (sola ? 'Ubicación tomada automáticamente' : 'Ubicación capturada') +
          ' · precisión ±' + p.precision + ' m' +
          (p.lecturas > 1 ? ' (mejor de ' + p.lecturas + ' lecturas)' : '');
        revisarCercanas();
      };

      const oyenteGps = (sola) => ({
        progreso: (mejor, seg) => {
          estado.className = 'gps-estado';
          estado.textContent = mejor
            ? 'Afinando… ±' + mejor.precision + ' m (' + seg + ' s)'
            : 'Buscando señal GPS… (' + seg + ' s)';
          btnGps.textContent = mejor
            ? '\u2713 Usar esta (\u00b1' + mejor.precision + ' m)'
            : '\u25CB Buscando… (' + seg + ' s)';
        },
        listo: (p) => { btnGps.textContent = ETIQUETA_GPS; ponerUbicacion(p, sola); },
        error: (err) => {
          btnGps.textContent = ETIQUETA_GPS;
          estado.className = 'gps-estado malo';
          estado.textContent = err.code === 1
            ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
            : 'No se pudo obtener la ubicación. Escríbela a mano o intenta al aire libre.';
        }
      });

      btnGps.addEventListener('click', () => {
        if (GPS.buscando) { usarLoQueHayaGps(); return; }   // segundo toque = aceptar ya
        btnGps.textContent = '\u25CB Buscando…';
        // remedir: si ya hay una coordenada puesta, el geólogo quiere una nueva
        pedirUbicacion(oyenteGps(false), !!(APP.datos[campo.id] || {}).y);
      });

      // El GPS empieza a afinar apenas se abre la ficha. Si el campo está
      // vacío la lectura se escribe sola; si ya trae la coordenada de la
      // solicitud no se pisa, solo se avisa que hay una mejor disponible.
      const yaTiene = !!(APP.datos[campo.id] || {}).y;
      precalentarGps(yaTiene ? {
        progreso: () => {},
        listo: (p) => {
          estado.className = 'gps-estado';
          estado.textContent = 'GPS listo (±' + p.precision + ' m). ' +
            'Toca «Capturar» para usar esta lectura.';
        },
        error: () => {}
      } : oyenteGps(true));

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
      '<a class="btn-pdf" href="' + esc(enlacePdf(h.pdfUrl)) + '" target="_blank" rel="noopener">&#128196; Abrir el PDF de la ficha</a>' +
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
        '<a href="' + esc(enlaceFoto(u, 1600)) + '" target="_blank" rel="noopener">' +
        '<img src="' + esc(enlaceFoto(u, 800)) + '" alt="" loading="lazy"></a>').join('') + '</div>' : '') +
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
