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

  /**
   * Separa este montaje de cualquier otro que viva en la misma direccion.
   * Vacio  = produccion (no tocar: cambiarlo borraria los borradores guardados).
   * 'pruebas' = gemelo de pruebas, con su propio almacenamiento en el celular.
   */
  ESPACIO: '',

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
   * 10 m = prácticamente el mismo punto. Es un radio exigente a propósito:
   * casas vecinas o taludes contiguos NO deben generar el aviso, porque el
   * riesgo real es que el equipo se salte una visita creyendo que ya la
   * hicieron. Para que 10 m signifique algo, la captura de GPS insiste
   * hasta afinar (ver GPS_PRECISION_OBJETIVO); si el celular no baja de
   * ese margen, la ficha lo advierte.
   */
  METROS_ALERTA_CERCANIA: 10,

  /**
   * Captura de GPS. El primer dato que entrega un celular suele venir de la
   * red (±30-100 m) y va afinando en segundos a medida que engancha
   * satélites. Antes se tomaba esa primera lectura y ya. Ahora se escucha
   * durante GPS_SEGUNDOS_MAX y se guarda la MEJOR lectura; si llega a
   * GPS_PRECISION_OBJETIVO metros, corta antes y no hace esperar.
   */
  GPS_PRECISION_OBJETIVO: 8,
  GPS_SEGUNDOS_MAX: 15,

  /** Radio del filtro "cerca de mí" en la lista de solicitudes. */
  METROS_CERCA_DE_MI: 2000
};