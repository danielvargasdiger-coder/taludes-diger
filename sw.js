/**
 * Service Worker — hace que la app abra sin señal.
 * Guarda una copia de los archivos en el celular la primera vez que se abre.
 *
 * Si publicas una versión nueva de la app, sube el número de VERSION
 * para que los celulares descarten la copia vieja.
 */
const VERSION = 'taludes-v9';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './ficha-schema.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (ev) => {
  // Se descarga la versión nueva pero NO se activa todavía: se queda
  // esperando a que el geólogo acepte el aviso. Así nunca se le cambia
  // la app debajo de los pies mientras está llenando una ficha.
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
});

// La app pide activarla cuando el geólogo toca "Actualizar".
self.addEventListener('message', (ev) => {
  if (ev.data === 'SALTAR_ESPERA') self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);

  // Las llamadas al servidor nunca se guardan en caché: siempre datos frescos.
  if (url.hostname.indexOf('script.google') !== -1 ||
      url.hostname.indexOf('googleusercontent') !== -1) {
    return;
  }
  if (ev.request.method !== 'GET') return;
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
