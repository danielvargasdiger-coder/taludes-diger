/**
 * PROPUESTA — FICHA DE EVALUACIÓN PRELIMINAR DE TALUDES Y LADERAS, VERSIÓN 2.0 (DIGER Pereira)
 * ---------------------------------------------------------------------------------------------
 * BORRADOR EN REVISIÓN (17/11/2026). No lo usa la app todavía.
 * Evaluación RÁPIDA y preliminar: valida, caracteriza y prioriza el sitio; el detalle queda para la segunda
 * etapa (estudio geotécnico). Criterio para cada pregunta: entra solo si alimenta la calificación o si la
 * segunda etapa la necesita, y nunca dos preguntas sobre lo mismo.
 * Misma forma que app/ficha-schema.js (secciones → campos) para poder llevarlo luego a la app.
 * Tipos de respuesta: unica (radio) · multiple (checkbox) · numero · texto · textarea · fecha_hora · municipio · gps ·
 *   fotos · responsables · calculado (lo llena el sistema) · prioridad (sugerida + final + justificación)
 * Propiedades: requerido, opciones, descripciones{opción: texto}, detalles{opción: {id, etiqueta, tipo}} ("Otro → ¿cuál?"),
 *   exclusivas[] (al marcarla se desmarcan las demás), unidad, ayuda, soloSi{campo, valor|valores|distintoDe|contiene},
 *   criticidad (para qué sirve en el cálculo).
 * Al final: calcularCriticidad(respuestas) — la MISMA regla de herramientas/prueba_criticidad.py.
 */
(function (raiz) {
  const OTRO = (id, etq) => ({ 'Otro': { id: id, etiqueta: etq || '¿Cuál?', tipo: 'texto', requerido: true } });
  const MOV = { campo: 'hay_movimiento', valores: ['Sí, movimiento en masa ocurrido', 'Sí, inestabilidad incipiente'] };
  const MEDIDO = { campo: 'forma_magnitud', valor: 'Medidas aproximadas en campo' };
  const BANDERA_VIVIENDA = 'Vivienda habitada con daño estructural severo o grietas que avanzan por el movimiento';

  const FICHA2 = {
    version: '2.0 (borrador)',
    entidad: 'DIGER PEREIRA',
    titulo: 'FORMATO DE EVALUACIÓN PRELIMINAR DE INESTABILIDAD DE TALUDES Y LADERAS',
    alcance:
      'La presente ficha corresponde a una evaluación preliminar mediante inspección visual de las condiciones de estabilidad ' +
      'observadas en campo. Las dimensiones y volúmenes son aproximados. No sustituye un estudio geotécnico, análisis de estabilidad ' +
      'o diseño de obras. La prioridad sugerida resulta de la calificación sistemática de amenaza y exposición; la prioridad final y las ' +
      'recomendaciones corresponden a la valoración profesional del evaluador dentro del alcance de la inspección.',
    referencias: [
      'Varnes (1978); Cruden y Varnes (1996). Landslide types and processes. TRB Special Report 247.',
      'WP/WLI (1993). A suggested method for describing the activity of a landslide. Bulletin IAEG 47.',
      'Servicio Geológico Colombiano (2017). Clasificación de movimientos en masa y su distribución en terrenos geológicos de Colombia.',
      'Pierson et al. (1990). Rockfall Hazard Rating System (calificación por categorías cerradas).'
    ],

    secciones: [
      // ------------------------------------------------------------------ 1
      {
        id: 's1', numero: '1', titulo: 'IDENTIFICACIÓN',
        campos: [
          { id: 'codigo_evaluacion', etiqueta: 'Código de evaluación', tipo: 'texto', soloLectura: true, ayuda: 'Lo asigna el sistema.' },
          { id: 'fecha_hora_visita', etiqueta: 'Fecha y hora de la visita', tipo: 'fecha_hora', requerido: true },
          { id: 'municipio', etiqueta: 'Municipio', tipo: 'municipio', requerido: true,
            opciones: ['Apía', 'Balboa', 'Belén de Umbría', 'Dosquebradas', 'Guática', 'La Celia', 'La Virginia', 'Marsella', 'Mistrató', 'Pereira', 'Pueblo Rico', 'Quinchía', 'Santa Rosa de Cabal', 'Santuario'],
            ayuda: 'DIGER: Pereira fijo. CARDER: elige entre los 14 municipios.' },
          { id: 'barrio_vereda', etiqueta: 'Barrio / vereda', tipo: 'texto', requerido: true },
          { id: 'direccion_referencia', etiqueta: 'Dirección o referencia', tipo: 'texto', requerido: true },
          { id: 'coordenadas', etiqueta: 'Coordenadas y altitud (GPS, grados decimales)', tipo: 'gps', requerido: true },
          { id: 'evaluadores', etiqueta: 'Evaluador(es)', tipo: 'texto', requerido: true },
          { id: 'hay_movimiento', etiqueta: '¿Se identifica un movimiento en masa o una condición de inestabilidad?', tipo: 'unica',
            requerido: true, destacado: true, esFiltro: true,
            opciones: ['Sí, movimiento en masa ocurrido', 'Sí, inestabilidad incipiente', 'No'],
            descripciones: {
              'Sí, movimiento en masa ocurrido': 'Hay masa desplazada (deslizamiento, caída, flujo).',
              'Sí, inestabilidad incipiente': 'Sin masa desplazada todavía, pero con evidencias (grietas, deformación, abombamiento).',
              'No': 'Sin movimiento ni evidencias de inestabilidad del terreno: se registra el hallazgo y se pasa al registro fotográfico.'
            } },
          { id: 'hallazgo_sin_movimiento', etiqueta: 'Hallazgo', tipo: 'unica', requerido: true, soloSi: { campo: 'hay_movimiento', valor: 'No' },
            opciones: ['Daño estructural de la edificación sin relación con el terreno', 'Problema de drenaje o alcantarillado', 'Erosión superficial sin desplazamiento de masa',
              'Socavación hidráulica de cauce', 'Árbol en riesgo de caída', 'Otro'],
            detalles: OTRO('hallazgo_otro') },
          { id: 'remitir_a', etiqueta: 'Entidad a la que se remite', tipo: 'texto', soloSi: { campo: 'hay_movimiento', valor: 'No' }, ayuda: 'Opcional.' }
        ]
      },

      // ------------------------------------------------------------------ 2
      {
        id: 's2', numero: '2', titulo: 'CONDICIONES DEL TALUD', soloSi: MOV,
        campos: [
          { id: 'tipo_talud', etiqueta: 'Tipo de talud', tipo: 'unica', requerido: true,
            opciones: ['Ladera natural', 'Talud de corte', 'Talud de relleno (lleno)', 'Mixto (corte y relleno)'] },
          { id: 'material', etiqueta: 'Material', tipo: 'multiple', requerido: true,
            opciones: ['Roca', 'Suelo residual o saprolito', 'Cenizas volcánicas', 'Flujo de lodo volcánico (Formación Pereira)', 'Depósito de vertiente (coluvión)',
              'Depósito aluvial o fluviotorrencial', 'Relleno antrópico (lleno, escombros)', 'Otro'],
            detalles: OTRO('material_otro', '¿Cuál material?') },
          { id: 'altura_talud_m', etiqueta: 'Altura aproximada del talud', tipo: 'numero', unidad: 'm', requerido: true,
            criticidad: 'A1 · magnitud (clase por altura)' },
          { id: 'pendiente', etiqueta: 'Inclinación', tipo: 'unica', requerido: true,
            opciones: ['Baja', 'Media', 'Alta'],
            descripciones: {
              'Baja': 'Menos de 15° aprox.: se camina sin dificultad.',
              'Media': 'Entre 15° y 45° aprox.: se sube apoyándose en las manos.',
              'Alta': 'Más de 45° aprox.: no se puede subir caminando.'
            },
            criticidad: 'A3 · indicio "inclinación alta sin cobertura"' },
          { id: 'cobertura', etiqueta: 'Cobertura', tipo: 'unica', requerido: true,
            opciones: ['Arbórea o arbustiva', 'Pastos o cultivos', 'Suelo desnudo', 'Superficie impermeable (concreto, pavimento)'],
            criticidad: 'A3 · indicio "inclinación alta sin cobertura"' },
          { id: 'agua', etiqueta: 'Condición de agua', tipo: 'multiple', requerido: true,
            opciones: ['Seco', 'Húmedo', 'Saturado', 'Surgencias o filtraciones', 'Encharcamientos en la corona', 'Escorrentía concentrada sin manejo',
              'Fuga de redes de acueducto o alcantarillado', 'Cauce o drenaje al pie'],
            exclusivas: ['Seco'],
            descripciones: { 'Saturado': 'Agua libre; el material escurre al presionarlo.', 'Escorrentía concentrada sin manejo': 'Aguas de vía, techos o descoles que llegan al talud sin cuneta ni canal.' },
            criticidad: 'A3 · indicios "agua en el talud" y "aguas sin manejo"' },
          { id: 'obras', etiqueta: 'Obras de estabilización o de manejo de aguas', tipo: 'unica', requerido: true,
            opciones: ['No hay', 'Existen y funcionan', 'Existen con daño o falladas'],
            ayuda: 'Muros, gaviones, trinchos, drenes, cunetas, revegetalización, etc.',
            criticidad: 'A3 · indicio "obras con daño"' }
        ]
      },

      // ------------------------------------------------------------------ 3
      {
        id: 's3', numero: '3', titulo: 'EVIDENCIAS DE INESTABILIDAD', soloSi: MOV,
        campos: [
          { id: 'evidencias', etiqueta: 'Evidencias observadas', tipo: 'multiple', requerido: true,
            opciones: ['Grietas de tensión en la corona', 'Grietas en el cuerpo del movimiento', 'Escarpe', 'Retrogresión: el escarpe avanza hacia viviendas o vías',
              'Abombamiento o material acumulado al pie', 'Hundimiento o asentamiento', 'Inclinación de árboles, postes o cercas', 'Desprendimiento o caída de bloques',
              'Fisuras en edificaciones, pavimentos o redes', 'Erosión en surcos o cárcavas', 'La comunidad reporta movimiento reciente', 'Otra'],
            detalles: { 'Otra': { id: 'evidencias_otra', etiqueta: '¿Cuál evidencia?', tipo: 'texto', requerido: true } },
            criticidad: 'A3 · indicios "grietas en la corona", "retrogresión" y "bloques o árboles"' },
          { id: 'antiguedad_evidencias', etiqueta: 'Aspecto de las evidencias', tipo: 'unica', requerido: true,
            opciones: ['Frescas', 'Recientes', 'Antiguas'],
            descripciones: {
              'Frescas': 'Bordes nítidos, sin vegetación, raíces expuestas (menos de un mes).',
              'Recientes': 'Bordes suavizados, vegetación incipiente (menos de un año).',
              'Antiguas': 'Bordes redondeados, vegetación establecida.'
            },
            ayuda: 'Respalda el estado de actividad.' }
        ]
      },

      // ------------------------------------------------------------------ 4
      {
        id: 's4', numero: '4', titulo: 'CARACTERIZACIÓN DEL MOVIMIENTO', soloSi: MOV,
        ayuda: 'Tipo según Varnes (1978) y Cruden y Varnes (1996); estado de actividad según WP/WLI (1993). Dimensiones y volumen son aproximados.',
        campos: [
          { id: 'mecanismo', etiqueta: 'Tipo de movimiento', tipo: 'unica', requerido: true,
            opciones: ['Caída', 'Volcamiento', 'Deslizamiento rotacional', 'Deslizamiento traslacional', 'Flujo', 'Reptación', 'Movimiento complejo', 'No determinado'],
            descripciones: {
              'Caída': 'Desprendimiento y descenso por el aire, rebote o rodadura.',
              'Volcamiento': 'Rotación hacia adelante de bloques.',
              'Deslizamiento rotacional': 'Superficie de falla curva; la masa bascula hacia atrás.',
              'Deslizamiento traslacional': 'Superficie de falla plana, poco profunda.',
              'Flujo': 'La masa se mueve como fluido viscoso (lodo, detritos).',
              'Reptación': 'Deformación muy lenta y continua de la capa superficial.',
              'Movimiento complejo': 'Combinación de dos o más tipos.'
            },
            criticidad: 'A4 · velocidad esperada' },
          { id: 'estado_actividad', etiqueta: 'Estado de actividad', tipo: 'unica', requerido: true,
            opciones: ['Activo', 'Reactivado', 'Suspendido', 'Latente', 'Inactivo (estabilizado, abandonado o relicto)'],
            descripciones: {
              'Activo': 'Se está moviendo actualmente.',
              'Reactivado': 'Activo de nuevo después de haber estado inactivo.',
              'Suspendido': 'Se movió en el último año pero hoy no se mueve.',
              'Latente': 'Inactivo, pero las causas siguen presentes y puede reactivarse.',
              'Inactivo (estabilizado, abandonado o relicto)': 'Las causas se eliminaron por obras o de forma natural, o es un movimiento antiguo.'
            },
            criticidad: 'A2 · actividad' },
          { id: 'detonantes', etiqueta: 'Factores detonantes o contribuyentes', tipo: 'multiple', requerido: true,
            opciones: ['Lluvias', 'Sismo', 'Agua de redes o aguas mal dispuestas', 'Excavación o corte al pie', 'Sobrecarga en la corona (relleno, construcción)',
              'Socavación por cauce', 'Deforestación', 'No determinado', 'Otro'],
            exclusivas: ['No determinado'], detalles: OTRO('detonantes_otro'),
            criticidad: 'A3 · indicios "corte o socavación al pie" y "sobrecarga"' },
          { id: 'forma_magnitud', etiqueta: 'Dimensiones', tipo: 'unica', requerido: true,
            opciones: ['Medidas aproximadas en campo', 'Estimación visual'],
            descripciones: {
              'Medidas aproximadas en campo': 'Con cinta, distanciómetro o a pasos. Valores aproximados: la geometría es irregular y la profundidad casi nunca se ve.',
              'Estimación visual': 'Cuando no hay acceso o hay peligro: se elige un rango de volumen.'
            },
            criticidad: 'A1 · magnitud' },
          { id: 'dim_longitud_m', etiqueta: 'Longitud aproximada L (corona a punta)', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO },
          { id: 'dim_ancho_m', etiqueta: 'Ancho aproximado W', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO },
          { id: 'dim_profundidad_m', etiqueta: 'Profundidad aproximada D', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO,
            ayuda: 'Inferida de la altura del escarpe o del material expuesto.' },
          { id: 'volumen_m3', etiqueta: 'Volumen aproximado V ≈ π/6 · L · W · D', tipo: 'calculado', unidad: 'm³', soloSi: MEDIDO,
            ayuda: 'Lo calcula el sistema (forma elipsoidal, Cruden y Varnes 1996). Es un orden de magnitud.', criticidad: 'A1 · magnitud (clase por volumen)' },
          { id: 'volumen_clase', etiqueta: 'Volumen estimado', tipo: 'unica', requerido: true, soloSi: { campo: 'forma_magnitud', valor: 'Estimación visual' },
            opciones: ['Menor de 10 m³', '10 a 100 m³', '100 a 1.000 m³', 'Mayor de 1.000 m³'],
            descripciones: {
              'Menor de 10 m³': 'Hasta una volqueta sencilla (unos 7 m³). Ej.: tapa un andén o una escalera.',
              '10 a 100 m³': 'De 2 a 15 volquetas. Ej.: tapa un carril o el patio de una vivienda.',
              '100 a 1.000 m³': 'De 15 a 150 volquetas. Ej.: alcanza varias viviendas o cierra una vía.',
              'Mayor de 1.000 m³': 'Más de 150 volquetas. Ej.: afecta una manzana o una ladera completa.'
            },
            criticidad: 'A1 · magnitud' }
        ]
      },

      // ------------------------------------------------------------------ 5
      {
        id: 's5', numero: '5', titulo: 'ELEMENTOS EXPUESTOS Y AFECTACIÓN', soloSi: MOV,
        ayuda: 'Zona de alcance: sobre la masa; en la corona hasta una distancia igual a la altura del talud; en el pie hasta dos veces esa altura.',
        campos: [
          { id: 'expuestos', etiqueta: 'Elementos dentro de la zona de alcance', tipo: 'multiple', requerido: true,
            opciones: ['Ninguno', 'Viviendas habitadas', 'Edificaciones esenciales o de concentración de público', 'Vía principal o única vía de acceso',
              'Vía secundaria', 'Vía o escalera peatonal', 'Redes de servicios públicos', 'Viviendas deshabitadas o lotes', 'Cauce (posible represamiento)', 'Cultivos', 'Otro'],
            exclusivas: ['Ninguno'], detalles: OTRO('expuestos_otro'),
            descripciones: { 'Edificaciones esenciales o de concentración de público': 'Escuelas, centros de salud, organismos de socorro, templos, comercio.' },
            criticidad: 'Exposición (nivel 0 a 4)' },
          { id: 'viviendas_n', etiqueta: 'Viviendas habitadas expuestas', tipo: 'numero', unidad: 'No.', requerido: true,
            ayuda: 'Escriba 0 si no hay.', criticidad: 'Exposición (3 o más = nivel 4)' },
          { id: 'distancia_minima_m', etiqueta: 'Distancia aproximada del elemento más cercano al borde del movimiento', tipo: 'numero', unidad: 'm', requerido: true,
            soloSi: { campo: 'expuestos', distintoDe: 'Ninguno' } },
          { id: 'afectacion', etiqueta: 'Afectación actual', tipo: 'unica', requerido: true,
            opciones: ['Ninguna', 'Leve', 'Moderada', 'Severa', 'Colapso'],
            descripciones: {
              'Leve': 'Fisuras finas (menos de 1 mm); no compromete el uso.',
              'Moderada': 'Fisuras de 1 a 5 mm o daño en redes; uso con restricciones.',
              'Severa': 'Grietas de más de 5 mm, deformaciones o desplomes; inhabitable o intransitable.',
              'Colapso': 'Pérdida total o parcial del elemento.'
            } },
          { id: 'viviendas_evacuadas', etiqueta: 'Viviendas evacuadas', tipo: 'numero', unidad: 'No.', ayuda: 'Opcional.' }
        ]
      },

      // ------------------------------------------------------------------ 6
      {
        id: 's6', numero: '6', titulo: 'VALORACIÓN DE AMENAZA Y EXPOSICIÓN', soloSi: MOV,
        ayuda: 'La calcula el sistema con las secciones 2 a 5. El evaluador solo marca las banderas rojas.',
        campos: [
          { id: 'valoracion', etiqueta: 'Calificación', tipo: 'calculado', criticidad: 'A1 + A2 + A3 + A4 = amenaza; exposición 0 a 4' },
          { id: 'banderas', etiqueta: 'Banderas rojas (cualquiera lleva la prioridad sugerida a CRÍTICA)', tipo: 'multiple', requerido: true,
            opciones: ['Ninguna', BANDERA_VIVIENDA, 'Masa o bloque en condición de falla inminente sobre viviendas, personas o vía en uso',
              'Obstrucción de un cauce (riesgo de represamiento y avenida torrencial)'],
            exclusivas: ['Ninguna'], criticidad: 'Bandera roja → CRÍTICA' }
        ]
      },

      // ------------------------------------------------------------------ 7
      {
        id: 's7', numero: '7', titulo: 'PRIORIDAD', soloSi: MOV,
        campos: [
          { id: 'prioridad', etiqueta: 'Prioridad', tipo: 'prioridad', requerido: true, destacado: true,
            opciones: ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'],
            descripciones: {
              'BAJA': 'Sin evidencia significativa de actividad o sin exposición relevante. Seguimiento rutinario.',
              'MEDIA': 'Inestabilidad con exposición moderada o actividad baja. Seguimiento y mitigación programada.',
              'ALTA': 'Movimiento activo o con probabilidad de avance que compromete elementos expuestos. Atención a corto plazo.',
              'CRÍTICA': 'Amenaza inminente sobre elementos expuestos. Medidas de protección inmediatas (72 horas o menos).'
            },
            justificacion: {
              motivos: ['Información de la comunidad', 'Obra existente que reduce la amenaza', 'Evidencia técnica no contemplada en la calificación',
                'Lluvias recientes o pronóstico de lluvias', 'Vulnerabilidad social de la población expuesta', 'Otra'],
              minimo: 30
            } }
        ]
      },

      // ------------------------------------------------------------------ 8
      {
        id: 's8', numero: '8', titulo: 'RECOMENDACIONES', soloSi: MOV,
        campos: [
          { id: 'acciones', etiqueta: 'Acciones recomendadas', tipo: 'multiple', requerido: true,
            opciones: ['Monitoreo y seguimiento', 'Testigos de grietas o instrumentación', 'Manejo de aguas', 'Reparación de redes de servicio', 'Retiro de sobrecarga o material suelto',
              'Revegetalización o bioingeniería', 'Restricción de acceso y señalización', 'Evacuación preventiva', 'Evacuación total', 'Estudio geotécnico',
              'Remisión a otra entidad', 'Otro'],
            detalles: {
              'Remisión a otra entidad': { id: 'remision_entidad', etiqueta: '¿A qué entidad?', tipo: 'texto', requerido: true },
              'Otro': { id: 'acciones_otro', etiqueta: '¿Cuál otra acción?', tipo: 'texto', requerido: true }
            } },
          { id: 'concepto_campo', etiqueta: 'Concepto técnico', tipo: 'textarea', requerido: true,
            ayuda: 'Breve: tipo de movimiento, causa probable, condición actual y razón de las recomendaciones.' }
        ]
      },

      // ------------------------------------------------------------------ 9
      {
        id: 's9', numero: '9', titulo: 'REGISTRO Y SOPORTE',
        campos: [
          { id: 'fotos', etiqueta: 'Registro fotográfico', tipo: 'fotos', requerido: true, maxArchivos: 8,
            ayuda: 'Mínimo una. Recomendadas: panorámica, corona, pie, evidencias y elementos expuestos.' },
          { id: 'observaciones_adicionales', etiqueta: 'Observaciones', tipo: 'textarea' },
          { id: 'responsables', etiqueta: 'Responsables de la evaluación', tipo: 'responsables', requerido: true, ayuda: 'Nombre, tarjeta profesional y entidad (hasta 3).' }
        ]
      }
    ]
  };

  // ---------------------------------------------------------------- CRITICIDAD
  const NIVELES = ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
  const MATRIZ = { // nivel de amenaza → prioridad según exposición 0..4
    'Baja': ['BAJA', 'BAJA', 'BAJA', 'MEDIA', 'MEDIA'],
    'Media': ['BAJA', 'BAJA', 'MEDIA', 'MEDIA', 'ALTA'],
    'Alta': ['MEDIA', 'MEDIA', 'ALTA', 'ALTA', 'ALTA'],
    'Muy alta': ['MEDIA', 'ALTA', 'ALTA', 'CRÍTICA', 'CRÍTICA']
  };
  const ACTIVIDAD = { 'Activo': 4, 'Reactivado': 4, 'Suspendido': 3, 'Latente': 2, 'Inactivo (estabilizado, abandonado o relicto)': 1 };
  const VEL_MECANISMO = { 'Caída': 4, 'Volcamiento': 4, 'Flujo': 4, 'Deslizamiento traslacional': 3, 'Movimiento complejo': 3, 'No determinado': 3,
    'Deslizamiento rotacional': 2, 'Reptación': 1 };
  const EXPOSICION = { 'Viviendas habitadas': 3, 'Edificaciones esenciales o de concentración de público': 4, 'Vía principal o única vía de acceso': 3,
    'Vía secundaria': 2, 'Redes de servicios públicos': 2, 'Viviendas deshabitadas o lotes': 2, 'Vía o escalera peatonal': 1, 'Cauce (posible represamiento)': 1,
    'Cultivos': 1, 'Otro': 1 };
  const VOLUMENES = ['Menor de 10 m³', '10 a 100 m³', '100 a 1.000 m³', 'Mayor de 1.000 m³'];
  const clase = (v, cortes) => 1 + cortes.filter((c) => v >= c).length;
  const lista = (x) => Array.isArray(x) ? x : (x ? [x] : []);
  const tiene = (x, ...ops) => lista(x).some((v) => ops.includes(v));
  const num = (x) => { const v = parseFloat(x); return v > 0 ? v : null; };

  /** r: respuestas {idCampo: valor}. Devuelve cada factor con su porqué, la sugerencia y las advertencias de coherencia. */
  function calcularCriticidad(r) {
    const out = { factores: {}, indicios: [], advertencias: [] };
    if (r.hay_movimiento === 'No') return Object.assign(out, { sugerida: 'SIN PRIORIDAD' });
    // A1 magnitud: la mayor entre la clase de volumen y la de altura
    const h = num(r.altura_talud_m);
    let a1 = 0;
    const porque = [];
    if (r.forma_magnitud === 'Medidas aproximadas en campo') {
      const L = num(r.dim_longitud_m), W = num(r.dim_ancho_m), D = num(r.dim_profundidad_m);
      out.volumen = L && W && D ? Math.PI / 6 * L * W * D : null;
      if (out.volumen) { a1 = clase(out.volumen, [10, 100, 1000]); porque.push('volumen ≈ ' + Math.round(out.volumen) + ' m³ → ' + a1); }
    } else if (r.volumen_clase) {
      a1 = 1 + VOLUMENES.indexOf(r.volumen_clase); porque.push('volumen ' + r.volumen_clase + ' → ' + a1);
    }
    if (h) { const ch = clase(h, [3, 6, 15]); porque.push('altura ' + h + ' m → ' + ch); a1 = Math.max(a1, ch); }
    out.factores.A1 = { pts: a1, porque: porque.join(' · ') + (porque.length > 1 ? ' (la mayor)' : '') };
    // A2 actividad
    const a2 = ACTIVIDAD[r.estado_actividad] || 0;
    out.factores.A2 = { pts: a2, porque: r.estado_actividad || '' };
    // A3 indicios de reactivación o avance (salen de las respuestas, no se preguntan aparte)
    const ind = [
      ['Grietas de tensión en la corona', tiene(r.evidencias, 'Grietas de tensión en la corona')],
      ['Retrogresión hacia viviendas o vías', tiene(r.evidencias, 'Retrogresión: el escarpe avanza hacia viviendas o vías')],
      ['Agua en el talud', tiene(r.agua, 'Saturado', 'Surgencias o filtraciones', 'Encharcamientos en la corona')],
      ['Aguas sin manejo', tiene(r.agua, 'Escorrentía concentrada sin manejo', 'Fuga de redes de acueducto o alcantarillado')],
      ['Corte o socavación al pie', tiene(r.detonantes, 'Excavación o corte al pie', 'Socavación por cauce')],
      ['Sobrecarga en la corona', tiene(r.detonantes, 'Sobrecarga en la corona (relleno, construcción)')],
      ['Bloques sueltos o árboles inclinados', tiene(r.evidencias, 'Desprendimiento o caída de bloques', 'Inclinación de árboles, postes o cercas')],
      ['Inclinación alta sin cobertura', r.pendiente === 'Alta' && r.cobertura === 'Suelo desnudo'],
      ['Obras con daño o falladas', r.obras === 'Existen con daño o falladas']
    ];
    out.indicios = ind.filter((x) => x[1]).map((x) => x[0]);
    const k = out.indicios.length;
    const a3 = k === 0 ? 1 : k === 1 ? 2 : k <= 3 ? 3 : 4;
    out.factores.A3 = { pts: a3, porque: k + ' indicio(s)' };
    // A4 velocidad esperada según el tipo de movimiento
    const a4 = VEL_MECANISMO[r.mecanismo] || 0;
    out.factores.A4 = { pts: a4, porque: r.mecanismo || '' };
    out.puntos = a1 + a2 + a3 + a4;
    out.amenaza = out.puntos <= 8 ? 'Baja' : out.puntos <= 11 ? 'Media' : out.puntos <= 13 ? 'Alta' : 'Muy alta';
    // Exposición: el nivel más alto; 3 o más viviendas habitadas = 4
    let e = 0, pe = 'ninguno';
    lista(r.expuestos).forEach((x) => { if ((EXPOSICION[x] || 0) > e) { e = EXPOSICION[x]; pe = x; } });
    if (tiene(r.expuestos, 'Viviendas habitadas') && (num(r.viviendas_n) || 0) >= 3 && e < 4) { e = 4; pe = r.viviendas_n + ' viviendas habitadas'; }
    // Ajuste R1 (18/11): un daño ya ocurrido (afectación severa o colapso) sube la exposición un nivel
    if (e > 0 && e < 4 && tiene(r.afectacion, 'Severa', 'Colapso')) { e += 1; pe += ' + afectación ' + r.afectacion.toLowerCase(); }
    out.exposicion = e; out.porqueExposicion = pe;
    // Banderas rojas
    out.banderas = lista(r.banderas).filter((b) => b !== 'Ninguna');
    const completo = a1 && a2 && a4 && lista(r.expuestos).length;
    out.sugerida = out.banderas.length ? 'CRÍTICA' : completo ? MATRIZ[out.amenaza][e] : null;
    // Coherencia (no bloquea; se muestra al evaluador)
    if (r.antiguedad_evidencias === 'Frescas' && a2 && a2 <= 2) out.advertencias.push('Evidencias frescas con un estado de actividad inactivo o latente.');
    if (r.antiguedad_evidencias === 'Antiguas' && a2 === 4) out.advertencias.push('Estado activo con evidencias antiguas.');
    if (tiene(r.expuestos, 'Viviendas habitadas') && r.viviendas_n !== undefined && r.viviendas_n !== '' && +r.viviendas_n === 0) out.advertencias.push('Marcó viviendas habitadas expuestas pero escribió 0 viviendas.');
    if (tiene(r.banderas, BANDERA_VIVIENDA) && !tiene(r.afectacion, 'Severa', 'Colapso')) out.advertencias.push('Bandera de vivienda con daño severo, pero la afectación no es severa ni colapso.');
    // Ajustes R2 a R4 (18/11)
    if (num(r.distancia_minima_m) && h && num(r.distancia_minima_m) > 2 * h) out.advertencias.push('El elemento más cercano está a más de dos veces la altura del talud: revise si de verdad está dentro de la zona de alcance.');
    if (tiene(r.banderas, BANDERA_VIVIENDA) && !tiene(r.expuestos, 'Viviendas habitadas')) out.advertencias.push('Bandera de vivienda con daño, pero no marcó viviendas habitadas expuestas.');
    if (a2 === 1 && k >= 3) out.advertencias.push('Movimiento inactivo con ' + k + ' indicios de reactivación: revise si es latente.');
    if (lista(r.expuestos).includes('Ninguno') && tiene(r.afectacion, 'Severa', 'Colapso')) out.advertencias.push('Afectación severa sin elementos expuestos marcados.');
    return out;
  }

  const api = { FICHA2, NIVELES, MATRIZ, calcularCriticidad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(raiz, api);
})(typeof window !== 'undefined' ? window : this);
