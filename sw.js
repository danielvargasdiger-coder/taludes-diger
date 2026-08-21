/**
 * Service Worker — hace que la app abra sin señal.
 * Guarda una copia de los archivos en el celular la primera vez que se abre.
 *
 * Si publicas una versión nueva de la app, sube el número de VERSION
 * para que los celulares descarten la copia vieja.
 */
const VERSION = 'taludes-v3';

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
  ev.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
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

  // Los archivos de la app se sirven primero desde el celular (rápido y sin señal),
  // y en segundo plano se refresca la copia guardada.
  ev.respondWith(
    caches.match(ev.request).then((guardado) => {
      const red = fetch(ev.request).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(ev.request, copia));
        }
        return res;
      }).catch(() => guardado);
      return guardado || red;
    })
  );
});
