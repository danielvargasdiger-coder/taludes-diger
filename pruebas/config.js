/**
 * CONFIGURACIÓN DE LA APP — DIGER PEREIRA
 * =======================================
 * Este es el ÚNICO archivo que necesitas editar después de instalar.
 * Ver GUIA_DE_INSTALACION.md, paso 5.
 */

const CONFIG = {

  /**
   * URL de la aplicación web de Apps Script. Ya está configurada.
   * Solo hay que cambiarla si algún día creas una implementación NUEVA
   * (no hace falta al publicar una versión nueva de la existente).
   */
  API_URL: 'https://script.google.com/macros/s/AKfycby5wFeE_iQCvbtqIcKE_50XCbdP3rMx6G6coRh9TgUVerO9KNL9ujugZA7JovD-KS4/exec',

  /**
   * Separa este montaje de cualquier otro que viva en la misma direccion.
   * Vacio  = produccion (no tocar: cambiarlo borraria los borradores guardados).
   * 'pruebas' = gemelo de pruebas, con su propio almacenamiento en el celular.
   */
  ESPACIO: 'pruebas',

  /** Nombre que aparece en la app y en el PDF. */
  ENTIDAD: 'DIGER Pereira',

  /** Prefijo del código automático de las visitas no programadas. */
  PREFIJO_CODIGO: 'TAL',

  /**
   * Fotos que se archivan en Drive.
   * Medido con fotos de campo reales de 4000x3000:
   *   1400 px / 0.70  ->  382 KB por foto
   *   1200 px / 0.60  ->  237 KB por foto   <- actual
   *   1024 px / 0.60  ->  173 KB por foto
   */
  ANCHO_MAX_FOTO: 1200,
  CALIDAD_FOTO: 0.60,

  /**
   * Miniatura que se incrusta en el PDF. La foto de buena calidad queda en
   * Drive; el PDF solo necesita que se vea la evidencia, no ampliarla.
   * A 700 px / 0.50 son ~72 KB por foto en vez de 237 KB.
   */
  ANCHO_MINIATURA: 700,
  CALIDAD_MINIATURA: 0.50,

  /** Cada cuántos minutos intenta sincronizar sola la app. */
  MINUTOS_AUTOSYNC: 10,

  /** Cada cuántos minutos revisa si hay una versión nueva de la app. */
  MINUTOS_BUSCAR_ACTUALIZACION: 15,

  /**
   * Radio para avisar que ya hay una visita hecha en el sitio.
   * 150 m cubre el error típico del GPS de un celular (5-20 m) más el
   * tamaño de un talud, sin llenar de avisos en zona urbana densa.
   */
  METROS_ALERTA_CERCANIA: 150,

  /** Radio del filtro "cerca de mí" en la lista de solicitudes. */
  METROS_CERCA_DE_MI: 2000
};