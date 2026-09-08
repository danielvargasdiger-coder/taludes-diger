/**
 * Service Worker — hace que la app abra sin señal.
 * Guarda una copia de los archivos en el celular la primera vez que se abre.
 *
 * Si publicas una versión nueva de la app, sube el número de VERSION
 * para que los celulares descarten la copia vieja.
 */
/**
 * PREFIJO separa las cachés de produccion y de pruebas. Tienen que ser
 * distintos y que ninguno empiece igual que el otro: al activarse, cada
 * service worker borra solo las cachés de SU prefijo.
 */
const PREFIJO = 'taludes';        // en el gemelo de pruebas: 'pruebas'
const VERSION = PREFIJO + '-v63';

/**
 * Caché del mapa: Leaflet y los cuadritos del mapa ya vistos.
 *
 * NO lleva el número de versión a propósito. Los cuadritos que el geólogo
 * ya descargó son suyos: borrarlos en cada actualización de la app lo
 * dejaría sin mapa en campo justo después de actualizar, que es cuando
 * menos falta hace. Se conserva entre versiones y se limpia sola por
 * tamaño (ver TOPE_CUADRITOS).
 */
const CACHE_MAPA = PREFIJO + '-mapa';

/**
 * Cuántos cuadritos de mapa se guardan. Cada uno pesa ~20 KB, así que 400
 * son unos 8 MB: suficiente para varias zonas de trabajo sin llenarle el
 * celular a nadie. Al pasarse, se borran los más viejos.
 */
const TOPE_CUADRITOS = 400;

/**
 * Leaflet, la librería del mapa. Viene de unpkg y hasta ahora se bajaba en
 * cada estreno de versión sin guardarse: si unpkg estaba caído o la red del
 * municipio lo bloqueaba, el mapa decía "necesita internet" AUNQUE hubiera
 * internet. Guardándolo, eso solo puede fallar la primerísima vez.
 */
const LEAFLET = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './ficha-schema.js',
  './app.js',
  './manifest.json',
  './logo-app.png',
  './logo-carder.png',
  './logo-carder-compacto.png',
  './icon-192.png',
  './icon-512.png'
];

const esCuadritoDeMapa = (url) => url.hostname.indexOf('tile.openstreetmap.org') !== -1;
const esLeaflet = (url) => LEAFLET.indexOf(url.href) !== -1;

self.addEventListener('install', (ev) => {
  // Se descarga la versión nueva pero NO se activa todavía: se queda
  // esperando a que el geólogo acepte el aviso. Así nunca se le cambia
  // la app debajo de los pies mientras está llenando una ficha.
  //
  // cache:'reload' es imprescindible: GitHub Pages manda los archivos con
  // Cache-Control max-age=600, así que sin esto el navegador entregaría
  // desde SU caché las copias viejas, y como la caché de cada versión es
  // inmutable, quedarían congeladas para siempre. Ese fue el motivo real
  // de que una actualización recién subida no se viera.
  ev.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(guardarLeaflet)
  );
});

/**
 * Guarda Leaflet, pero sin poder tumbar la instalación.
 *
 * Va aparte del addAll de arriba a propósito: si unpkg no responde en este
 * momento, addAll fallaría entero y la actualización NO se instalaría. Un
 * mapa que hoy no se pudo guardar es un problema pequeño; una app que no
 * se actualiza es uno grande.
 */
function guardarLeaflet() {
  return caches.open(CACHE_MAPA).then((cache) =>
    Promise.all(LEAFLET.map((u) =>
      fetch(u, { cache: 'reload' })
        .then((res) => (res && res.ok ? cache.put(u, res) : null))
        .catch(() => null)
    ))
  ).catch(() => null);
}

// La app pide activarla cuando el geólogo toca "Actualizar".
self.addEventListener('message', (ev) => {
  if (ev.data === 'SALTAR_ESPERA') self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves
        // CACHE_MAPA se respeta: son los mapas que ya descargó el geólogo.
        .filter((k) => k.indexOf(PREFIJO + '-') === 0 && k !== VERSION && k !== CACHE_MAPA)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/**
 * Deja como mucho TOPE_CUADRITOS cuadritos de mapa guardados.
 *
 * No se revisa en cada uno —moviendo el mapa llegan decenas por segundo—
 * sino cada tantos, que para esto sobra.
 */
let puestosDesdeLaUltimaLimpieza = 0;
function limpiarCuadritosViejos(cache) {
  if (++puestosDesdeLaUltimaLimpieza < 25) return Promise.resolve();
  puestosDesdeLaUltimaLimpieza = 0;
  return cache.keys().then((claves) => {
    const cuadritos = claves.filter((r) => esCuadritoDeMapa(new URL(r.url)));
    if (cuadritos.length <= TOPE_CUADRITOS) return null;
    // keys() los devuelve en el orden en que entraron: los primeros son los
    // más viejos.
    return Promise.all(
      cuadritos.slice(0, cuadritos.length - TOPE_CUADRITOS).map((r) => cache.delete(r))
    );
  }).catch(() => null);
}

/**
 * Mapa: primero lo guardado, y si no está, la red.
 *
 * Así una zona que ya se miró con señal se sigue viendo sin ella. Es lo que
 * de verdad sirve en campo: el geólogo revisa la zona antes de salir y el
 * mapa le funciona en la vereda.
 */
function responderDelMapa(pedido) {
  return caches.open(CACHE_MAPA).then((cache) =>
    cache.match(pedido).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido).then((res) => {
        if (res && res.ok) {
          cache.put(pedido, res.clone()).then(() => limpiarCuadritosViejos(cache));
        }
        return res;
      });
    })
  );
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);

  // Las llamadas al servidor nunca se guardan en caché: siempre datos frescos.
  if (url.hostname.indexOf('script.google') !== -1 ||
      url.hostname.indexOf('googleusercontent') !== -1) {
    return;
  }
  if (ev.request.method !== 'GET') return;

  if (esCuadritoDeMapa(url) || esLeaflet(url)) {
    ev.respondWith(responderDelMapa(ev.request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  /**
   * Todo sale de la caché de ESTA versión, y esa caché NO se toca.
   *
   * Antes se refrescaba cada archivo por separado en segundo plano, y eso
   * mezclaba versiones: quedaba el index.html viejo con el app.js nuevo.
   * Manteniendo cada caché inmutable, la app siempre corre con archivos
   * de una sola versión; los cambios entran únicamente al activarse un
   * service worker nuevo, que trae su propia caché completa.
   */
  ev.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(ev.request, { ignoreSearch: true }).then((guardado) => {
        if (guardado) return guardado;
        // No estaba precargado: se busca en la red y se guarda para la próxima.
        return fetch(ev.request)
          .then((res) => {
            if (res && res.ok) cache.put(ev.request, res.clone());
            return res;
          })
          .catch(() => cache.match('./index.html'));   // sin señal: al menos abre la app
      })
    )
  );
});
