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

  /** Calidad de compresión de las fotos (0.5 = liviana, 0.9 = pesada). */
  CALIDAD_FOTO: 0.7,

  /** Lado mayor de la foto en píxeles después de comprimir. */
  ANCHO_MAX_FOTO: 1400,

  /** Cada cuántos minutos intenta sincronizar sola la app. */
  MINUTOS_AUTOSYNC: 10
};