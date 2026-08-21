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
  API_URL: 'https://script.google.com/macros/s/AKfycbxSDpvnPd82Pk2vyYe-tgdDLKCjLj99XXPRoos632HDC-5fVVMJQHwxgfiKFtKZYXU/exec',

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
  MINUTOS_BUSCAR_ACTUALIZACION: 15
};