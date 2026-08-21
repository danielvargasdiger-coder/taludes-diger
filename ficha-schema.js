/**
 * ESQUEMA DE LA FICHA DE EVALUACIÓN DE TALUDES — DIGER PEREIRA
 * ---------------------------------------------------------------
 * Este archivo es la ÚNICA fuente de verdad del formulario.
 * Define las 9 secciones del formato oficial.
 *
 * La app web lo usa para dibujar el formulario.
 * Apps Script usa una copia idéntica (Schema.gs) para generar el PDF.
 *
 * IMPORTANTE: si cambias algo aquí, copia el archivo completo también
 * en Apps Script (archivo Schema.gs). Ver GUIA_DE_INSTALACION.md.
 *
 * Tipos de campo disponibles:
 *   texto        - una línea de texto
 *   textarea     - texto largo
 *   numero       - numérico
 *   fecha_hora   - fecha y hora
 *   radio        - una sola opción
 *   checkbox     - varias opciones
 *   gps          - captura coordenadas del celular
 *   fotos        - fotografías / croquis
 *   valoracion   - Baja/Media/Alta + observación (sección 6)
 *   responsables - hasta 3 responsables con nombre, TP y entidad
 */

const FICHA_SCHEMA = {
  version: '1.0',
  entidad: 'DIGER PEREIRA',
  titulo: 'FORMATO DE EVALUACIÓN DE INESTABILIDAD DE TALUDES Y LADERAS',
  alcance:
    'La presente ficha corresponde a una inspección visual rápida de las condiciones de estabilidad ' +
    'observadas en campo. No sustituye un estudio geotécnico, análisis de estabilidad o diseño de obras ' +
    'de estabilización. Las conclusiones y recomendaciones aquí consignadas corresponden a su valoración ' +
    'profesional dentro del alcance de la inspección realizada.',

  secciones: [
    // ---------------------------------------------------------------- 1
    {
      id: 's1',
      numero: '1',
      titulo: 'IDENTIFICACIÓN DEL SITIO',
      campos: [
        { id: 'codigo_evaluacion', etiqueta: 'Código de evaluación', tipo: 'texto', soloLectura: true, ancho: 'medio' },
        { id: 'fecha_hora_visita', etiqueta: 'Fecha/hora visita', tipo: 'fecha_hora', requerido: true, ancho: 'medio' },
        { id: 'barrio_vereda', etiqueta: 'Barrio / Vereda', tipo: 'texto', requerido: true, ancho: 'medio' },
        { id: 'direccion_referencia', etiqueta: 'Dirección o referencia', tipo: 'texto', requerido: true, ancho: 'medio' },
        { id: 'coordenadas', etiqueta: 'Coordenadas / Altitud (grados decimales)', tipo: 'gps', requerido: true, ancho: 'completo' },
        { id: 'evaluadores', etiqueta: 'Evaluador(es)', tipo: 'texto', requerido: true, ancho: 'completo' }
      ]
    },

    // ---------------------------------------------------------------- 2
    {
      id: 's2',
      numero: '2',
      titulo: 'CARACTERIZACIÓN',
      campos: [
        {
          id: 'cambios_post_sismo',
          etiqueta: '¿Cambios posteriores al sismo?',
          tipo: 'radio',
          opciones: ['Sí', 'No', 'No determinado'],
          ancho: 'medio'
        },
        {
          id: 'movimiento_previo',
          etiqueta: '¿Movimiento previo?',
          tipo: 'radio',
          opciones: ['Sí', 'No', 'Reactivación'],
          ancho: 'medio'
        },
        {
          id: 'material_geologia',
          etiqueta: 'Material / geología',
          tipo: 'checkbox',
          opciones: ['Suelo', 'Roca', 'Relleno', 'Depósito', 'Otro'],
          ancho: 'completo'
        },
        { id: 'pendiente_pct', etiqueta: 'Pendiente (%)', tipo: 'numero', ancho: 'medio' },
        { id: 'altura_talud_m', etiqueta: 'Altura del talud (m)', tipo: 'numero', ancho: 'medio' },
        {
          id: 'condiciones_agua',
          etiqueta: 'Condiciones de agua',
          tipo: 'checkbox',
          opciones: ['Seco', 'Húmedo', 'Saturado', 'Surgencias', 'Filtraciones'],
          ancho: 'completo'
        },
        {
          id: 'cobertura_uso',
          etiqueta: 'Cobertura / uso',
          tipo: 'checkbox',
          opciones: ['Vegetación', 'Cultivo', 'Urbano', 'Corte', 'Relleno'],
          ancho: 'completo'
        }
      ]
    },

    // ---------------------------------------------------------------- 3
    {
      id: 's3',
      numero: '3',
      titulo: 'EVIDENCIAS DE INESTABILIDAD',
      campos: [
        {
          id: 'evidencias',
          etiqueta: 'Evidencias observadas',
          tipo: 'checkbox',
          opciones: [
            'Grietas de tensión',
            'Escarpe',
            'Hundimiento',
            'Deformación',
            'Caída/desprendimiento de bloques',
            'Inclinación de árboles/postes',
            'Daños en estructuras',
            'Surgencias/filtraciones',
            'Erosión'
          ],
          ancho: 'completo'
        },
        { id: 'evidencias_otra', etiqueta: 'Otra evidencia, ¿cuál?', tipo: 'texto', ancho: 'completo' }
      ]
    },

    // ---------------------------------------------------------------- 4
    {
      id: 's4',
      numero: '4',
      titulo: 'CARACTERIZACIÓN DEL MOVIMIENTO (SI APLICA)',
      campos: [
        {
          id: 'tipo_movimiento',
          etiqueta: 'Tipo de movimiento',
          tipo: 'checkbox',
          opciones: [
            'Rotacional',
            'Traslacional',
            'Volcamiento',
            'Reptación',
            'Flujo',
            'Caída',
            'Complejo',
            'No determinado'
          ],
          ancho: 'completo'
        },
        {
          id: 'estado_movimiento',
          etiqueta: 'Estado',
          tipo: 'radio',
          opciones: [
            'Inactivo',
            'Potencialmente inestable',
            'Activo',
            'Reactivado',
            'En evolución',
            'No determinado'
          ],
          ancho: 'completo'
        },
        { id: 'longitud_m', etiqueta: 'Longitud (m)', tipo: 'numero', ancho: 'cuarto' },
        { id: 'ancho_m', etiqueta: 'Ancho (m)', tipo: 'numero', ancho: 'cuarto' },
        { id: 'profundidad_m', etiqueta: 'Profundidad (m)', tipo: 'numero', ancho: 'cuarto' },
        { id: 'escarpe_m', etiqueta: 'Escarpe (m)', tipo: 'numero', ancho: 'cuarto' },
        { id: 'area_m2', etiqueta: 'Área (m²)', tipo: 'numero', ancho: 'medio' },
        {
          id: 'tendencia',
          etiqueta: 'Tendencia',
          tipo: 'radio',
          opciones: ['Sin evolución', 'Lenta', 'Moderada', 'Rápida', 'No determinada'],
          ancho: 'medio'
        },
        {
          id: 'factores_observables',
          etiqueta: 'Factores observables',
          tipo: 'checkbox',
          opciones: ['Sismo', 'Lluvia', 'Agua', 'Corte', 'Sobrecarga', 'Erosión'],
          ancho: 'completo'
        },
        { id: 'factores_otro', etiqueta: 'Otro factor, ¿cuál?', tipo: 'texto', ancho: 'completo' }
      ]
    },

    // ---------------------------------------------------------------- 5
    {
      id: 's5',
      numero: '5',
      titulo: 'ELEMENTOS EXPUESTOS Y AFECTACIÓN',
      campos: [
        { id: 'personas_n', etiqueta: 'Personas (No.)', tipo: 'numero', ancho: 'medio' },
        { id: 'viviendas_n', etiqueta: 'Viviendas (No.)', tipo: 'numero', ancho: 'medio' },
        {
          id: 'elementos_expuestos',
          etiqueta: 'Otros elementos expuestos',
          tipo: 'checkbox',
          opciones: ['Vías', 'Puentes', 'Servicios', 'Equipamientos', 'Cauces', 'Cultivos'],
          ancho: 'completo'
        },
        {
          id: 'afectacion',
          etiqueta: 'Afectación',
          tipo: 'radio',
          opciones: ['Ninguna', 'Leve', 'Moderada', 'Severa', 'Colapso/pérdida'],
          ancho: 'completo'
        },
        { id: 'viviendas_evacuadas', etiqueta: 'Viviendas evacuadas (No.)', tipo: 'numero', ancho: 'medio' }
      ]
    },

    // ---------------------------------------------------------------- 6
    {
      id: 's6',
      numero: '6',
      titulo: 'VALORACIÓN RÁPIDA DE LA CONDICIÓN',
      ayuda: 'Califique cada criterio y agregue una observación si aplica.',
      campos: [
        { id: 'val_evidencia', etiqueta: 'Evidencia de movimiento / deformación', tipo: 'valoracion' },
        { id: 'val_evolucion', etiqueta: 'Evolución / posibilidad de progresión', tipo: 'valoracion' },
        { id: 'val_agua', etiqueta: 'Presencia de agua / saturación', tipo: 'valoracion' },
        { id: 'val_expuestos', etiqueta: 'Elementos expuestos / consecuencias', tipo: 'valoracion' }
      ]
    },

    // ---------------------------------------------------------------- 7
    {
      id: 's7',
      numero: '7',
      titulo: 'CLASIFICACIÓN DE PRIORIDAD',
      campos: [
        {
          id: 'prioridad',
          etiqueta: 'Prioridad asignada',
          tipo: 'radio',
          requerido: true,
          destacado: true,
          opciones: ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'],
          descripciones: {
            'BAJA': 'Sin evidencia significativa o sin exposición relevante',
            'MEDIA': 'Requiere seguimiento',
            'ALTA': 'Movimiento activo/reactivado o exposición significativa',
            'CRÍTICA': 'Amenaza directa o condición potencialmente inminente'
          },
          ancho: 'completo'
        }
      ]
    },

    // ---------------------------------------------------------------- 8
    {
      id: 's8',
      numero: '8',
      titulo: 'ACCIONES / RECOMENDACIONES INMEDIATAS',
      campos: [
        {
          id: 'acciones',
          etiqueta: 'Acciones recomendadas',
          tipo: 'checkbox',
          opciones: [
            'Monitoreo',
            'Restricción/cierre de acceso',
            'Evacuación total',
            'Evacuación preventiva',
            'Manejo de aguas',
            'Cerramiento',
            'Retiro de material',
            'Evaluación geotécnica',
            'Estudio detallado',
            'Informe técnico adicional',
            'Instrumentación',
            'Árboles en riesgo'
          ],
          ancho: 'completo'
        },
        { id: 'redes_servicio_publico', etiqueta: 'Redes de servicio público, ¿cuáles?', tipo: 'texto', ancho: 'completo' },
        { id: 'acciones_otro', etiqueta: 'Otra acción, ¿cuál?', tipo: 'texto', ancho: 'completo' },
        { id: 'concepto_campo', etiqueta: 'Concepto de campo', tipo: 'textarea', requerido: true, ancho: 'completo' }
      ]
    },

    // ---------------------------------------------------------------- 9
    {
      id: 's9',
      numero: '9',
      titulo: 'REGISTRO Y SOPORTE',
      campos: [
        { id: 'fotos', etiqueta: 'Fotografías del sitio', tipo: 'fotos', maxArchivos: 8, ancho: 'completo' },
        {
          id: 'croquis',
          etiqueta: 'Croquis (planta y perfil)',
          tipo: 'fotos',
          maxArchivos: 2,
          ayuda: 'Dibuja el croquis en papel y tómale una foto.',
          ancho: 'completo'
        },
        { id: 'observaciones_adicionales', etiqueta: 'Observaciones adicionales', tipo: 'textarea', ancho: 'completo' },
        { id: 'responsables', etiqueta: 'Responsables', tipo: 'responsables', requerido: true, ancho: 'completo' }
      ]
    }
  ]
};

// Permite usar el esquema tanto en el navegador como en Apps Script.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FICHA_SCHEMA: FICHA_SCHEMA };
}
