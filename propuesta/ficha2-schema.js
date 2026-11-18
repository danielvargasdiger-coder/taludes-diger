/**
 * PROPUESTA — FICHA DE EVALUACIÓN PRELIMINAR DE TALUDES Y LADERAS, VERSIÓN 2.0 (DIGER Pereira)
 * ---------------------------------------------------------------------------------------------
 * BORRADOR EN REVISIÓN (18/11/2026). No lo usa la app todavía; la demo está en app/propuesta/.
 * Evaluación RÁPIDA y preliminar, guiada por RUTAS: lo primero es "¿Qué encontró?" y cada respuesta lleva a sus
 * propias preguntas (movimiento en masa / inestabilidad sin movimiento / sin inestabilidad). Nunca se pregunta por
 * algo que no ocurrió ni se obliga a adivinar.
 * Misma forma que app/ficha-schema.js (secciones → campos) para poder llevarlo luego a la app.
 * Tipos: unica · multiple · numero · texto · textarea · fecha_hora · municipio · gps · fotos · responsables ·
 *   ruta (tarjetas grandes del inicio) · calculado (lo llena el sistema) · prioridad (sugerida + final + justificación).
 * Propiedades: requerido, opciones, descripciones{op: texto}, dibujos{op: clave de pictograma}, detalles{op: {id, etiqueta}},
 *   exclusivas[], unidad, ayuda, soloSi (objeto o lista: todas se cumplen), criticidad.
 * Al final: calcularCriticidad(r) y explicar(k, r). Misma regla que herramientas/prueba_criticidad.py (ruta movimiento).
 */
(function (raiz) {
  const OTRO = (id, etq) => ({ 'Otro': { id: id, etiqueta: etq || '¿Cuál?', tipo: 'texto', requerido: true } });
  const R_MOV = 'Movimiento en masa', R_INE = 'Inestabilidad sin movimiento', R_NO = 'Sin inestabilidad del terreno';
  const RUTA = 'hay_movimiento';
  const EN_TERRENO = { campo: RUTA, valores: [R_MOV, R_INE] };
  const SI_MOV = { campo: RUTA, valor: R_MOV };
  const SI_INE = { campo: RUTA, valor: R_INE };
  const SI_NO = { campo: RUTA, valor: R_NO };
  const MEDIDO = [SI_MOV, { campo: 'forma_magnitud', valor: 'Medidas aproximadas en campo' }];
  const BANDERA_VIVIENDA = 'Vivienda habitada con daño estructural severo o grietas que avanzan';

  const FICHA2 = {
    version: '2.0 (borrador)',
    entidad: 'DIGER PEREIRA',
    titulo: 'FORMATO DE EVALUACIÓN PRELIMINAR DE INESTABILIDAD DE TALUDES Y LADERAS',
    rutas: { movimiento: R_MOV, inestabilidad: R_INE, ninguna: R_NO },
    alcance:
      'Evaluación preliminar mediante inspección visual. Las dimensiones son aproximadas. No sustituye un estudio geotécnico. ' +
      'La prioridad sugerida resulta de la calificación de amenaza y exposición; la prioridad final es criterio del evaluador.',
    referencias: [
      'Varnes (1978); Cruden y Varnes (1996). Landslide types and processes. TRB Special Report 247.',
      'WP/WLI (1993). A suggested method for describing the activity of a landslide. Bulletin IAEG 47.',
      'Servicio Geológico Colombiano (2017). Clasificación de movimientos en masa y su distribución en terrenos geológicos de Colombia.'
    ],

    secciones: [
      // ------------------------------------------------------------------ 1
      { id: 's1', numero: '1', titulo: 'IDENTIFICACIÓN', corto: 'Sitio',
        campos: [
          { id: 'codigo_evaluacion', etiqueta: 'Código de evaluación', tipo: 'texto', soloLectura: true },
          { id: 'fecha_hora_visita', etiqueta: 'Fecha y hora de la visita', tipo: 'fecha_hora', requerido: true },
          { id: 'municipio', etiqueta: 'Municipio', tipo: 'municipio', requerido: true,
            opciones: ['Apía', 'Balboa', 'Belén de Umbría', 'Dosquebradas', 'Guática', 'La Celia', 'La Virginia', 'Marsella', 'Mistrató', 'Pereira', 'Pueblo Rico', 'Quinchía', 'Santa Rosa de Cabal', 'Santuario'] },
          { id: 'barrio_vereda', etiqueta: 'Barrio / vereda', tipo: 'texto', requerido: true },
          { id: 'direccion_referencia', etiqueta: 'Dirección o referencia', tipo: 'texto', requerido: true },
          { id: 'coordenadas', etiqueta: 'Ubicación (GPS)', tipo: 'gps', requerido: true },
          { id: 'evaluadores', etiqueta: 'Evaluador(es)', tipo: 'texto', requerido: true }
        ] },

      // ------------------------------------------------------------------ 2
      { id: 's2', numero: '2', titulo: '¿QUÉ SE ENCONTRÓ?', corto: 'Hallazgo',
        campos: [
          { id: RUTA, etiqueta: '¿Qué encontró en el sitio?', tipo: 'ruta', requerido: true,
            opciones: [R_MOV, R_INE, R_NO],
            dibujos: { [R_MOV]: 'ruta-mov', [R_INE]: 'ruta-ine', [R_NO]: 'ruta-no' },
            descripciones: {
              [R_MOV]: 'El terreno ya se movió: hay material desplazado (deslizamiento, caída, flujo).',
              [R_INE]: 'Aún no se desplaza material, pero hay señales: grietas, hundimientos, abombamientos, muros o árboles que se inclinan.',
              [R_NO]: 'El problema es de otro tipo (estructural, aguas, árbol…). Se registra y se remite.'
            } },
          { id: 'hallazgo_sin_movimiento', etiqueta: '¿Qué tipo de problema es?', tipo: 'unica', requerido: true, soloSi: SI_NO,
            opciones: ['Daño estructural de la edificación', 'Drenaje o alcantarillado', 'Erosión superficial', 'Socavación de cauce', 'Árbol en riesgo', 'Otro'],
            detalles: OTRO('hallazgo_otro') },
          { id: 'remitir_a', etiqueta: '¿A qué entidad se remite?', tipo: 'unica', requerido: true, soloSi: SI_NO,
            opciones: ['Secretaría de Infraestructura', 'Empresa de servicios públicos', 'CARDER', 'Control urbano (Planeación)', 'No requiere remisión', 'Otra'],
            detalles: { 'Otra': { id: 'remitir_otra', etiqueta: '¿Cuál entidad?', tipo: 'texto', requerido: true } } }
        ] },

      // ------------------------------------------------------------------ 3
      { id: 's3', numero: '3', titulo: 'EL TALUD', corto: 'Talud', soloSi: EN_TERRENO,
        campos: [
          { id: 'tipo_talud', etiqueta: 'Tipo de talud', tipo: 'unica', requerido: true,
            opciones: ['Ladera natural', 'Corte', 'Relleno (lleno)', 'Corte y relleno'] },
          { id: 'material', etiqueta: 'Material', tipo: 'multiple', requerido: true,
            opciones: ['Roca', 'Suelo residual', 'Cenizas volcánicas', 'Flujo de lodo (Fm. Pereira)', 'Coluvión', 'Aluvial', 'Lleno antrópico', 'Otro'],
            detalles: OTRO('material_otro', '¿Cuál material?') },
          { id: 'altura_talud_m', etiqueta: 'Altura aproximada', tipo: 'numero', unidad: 'm', requerido: true, criticidad: 'A1' },
          { id: 'pendiente', etiqueta: 'Inclinación', tipo: 'unica', requerido: true, dibujos: { 'Baja': 'pend-baja', 'Media': 'pend-media', 'Alta': 'pend-alta' },
            opciones: ['Baja', 'Media', 'Alta'],
            descripciones: { 'Baja': 'Se camina sin dificultad (< 15°)', 'Media': 'Se sube con las manos (15°–45°)', 'Alta': 'No se sube caminando (> 45°)' } },
          { id: 'cobertura', etiqueta: 'Cobertura', tipo: 'unica', requerido: true,
            opciones: ['Árboles o arbustos', 'Pasto o cultivo', 'Suelo desnudo', 'Concreto o pavimento'] },
          { id: 'agua', etiqueta: 'Agua', tipo: 'multiple', requerido: true,
            opciones: ['Seco', 'Húmedo', 'Saturado', 'Surgencias o filtraciones', 'Encharcamientos arriba', 'Escorrentía sin manejo', 'Fuga de tubería', 'Quebrada al pie'],
            exclusivas: ['Seco'], ayuda: 'Marque todo lo que vea.' },
          { id: 'obras', etiqueta: 'Obras (muros, gaviones, cunetas, drenes)', tipo: 'unica', requerido: true,
            opciones: ['No hay', 'Hay y funcionan', 'Hay pero dañadas'] }
        ] },

      // ------------------------------------------------------------------ 4 (ruta movimiento)
      { id: 's4m', numero: '4', titulo: 'EL MOVIMIENTO', corto: 'Movimiento', soloSi: SI_MOV,
        campos: [
          { id: 'mecanismo', etiqueta: '¿Cómo se movió?', tipo: 'unica', requerido: true, criticidad: 'A4',
            opciones: ['Caída', 'Volcamiento', 'Deslizamiento rotacional', 'Deslizamiento traslacional', 'Flujo', 'Reptación', 'Complejo', 'No determinado'],
            dibujos: { 'Caída': 'caida', 'Volcamiento': 'volcamiento', 'Deslizamiento rotacional': 'rotacional', 'Deslizamiento traslacional': 'traslacional',
              'Flujo': 'flujo', 'Reptación': 'reptacion', 'Complejo': 'complejo', 'No determinado': 'nd' },
            descripciones: {
              'Caída': 'Bloques que caen o ruedan', 'Volcamiento': 'Bloques que se voltean hacia adelante', 'Deslizamiento rotacional': 'Falla curva; la masa se hunde y gira',
              'Deslizamiento traslacional': 'Falla plana y poco profunda', 'Flujo': 'Lodo o detritos que corren', 'Reptación': 'Movimiento muy lento; árboles y postes torcidos',
              'Complejo': 'Varios tipos a la vez', 'No determinado': 'No se distingue'
            } },
          { id: 'estado_actividad', etiqueta: '¿Se sigue moviendo?', tipo: 'unica', requerido: true, criticidad: 'A2',
            opciones: ['Activo', 'Reactivado', 'Suspendido', 'Latente', 'Inactivo'],
            descripciones: {
              'Activo': 'Se mueve ahora: grietas abiertas y limpias, material fresco',
              'Reactivado': 'Volvió a moverse después de estar quieto',
              'Suspendido': 'Se movió en el último año; hoy está quieto',
              'Latente': 'Quieto, pero las causas siguen y puede volver a moverse',
              'Inactivo': 'Estabilizado, con vegetación o con obras que funcionan'
            } },
          { id: 'forma_magnitud', etiqueta: 'Tamaño', tipo: 'unica', requerido: true, criticidad: 'A1',
            opciones: ['Medidas aproximadas en campo', 'Estimación visual'],
            descripciones: { 'Medidas aproximadas en campo': 'Cinta, distanciómetro o pasos', 'Estimación visual': 'Si no hay acceso o hay peligro' } },
          { id: 'dim_longitud_m', etiqueta: 'Largo aproximado (corona a punta)', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO },
          { id: 'dim_ancho_m', etiqueta: 'Ancho aproximado', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO },
          { id: 'dim_profundidad_m', etiqueta: 'Profundidad aproximada', tipo: 'numero', unidad: 'm', requerido: true, soloSi: MEDIDO,
            ayuda: 'Inferida de la altura del escarpe o del material expuesto.' },
          { id: 'volumen_m3', etiqueta: 'Volumen aproximado', tipo: 'calculado', soloSi: MEDIDO },
          { id: 'volumen_clase', etiqueta: 'Volumen estimado', tipo: 'unica', requerido: true, soloSi: [SI_MOV, { campo: 'forma_magnitud', valor: 'Estimación visual' }],
            opciones: ['Menor de 10 m³', '10 a 100 m³', '100 a 1.000 m³', 'Mayor de 1.000 m³'],
            descripciones: { 'Menor de 10 m³': 'Hasta 1 volqueta: tapa un andén', '10 a 100 m³': '2 a 15 volquetas: tapa un carril o un patio',
              '100 a 1.000 m³': '15 a 150 volquetas: alcanza varias casas o cierra una vía', 'Mayor de 1.000 m³': 'Más de 150 volquetas: una manzana o una ladera' } }
        ] },

      // ------------------------------------------------------------------ 4 (ruta inestabilidad)
      { id: 's4i', numero: '4', titulo: 'LAS SEÑALES DE INESTABILIDAD', corto: 'Señales', soloSi: SI_INE,
        ayuda: 'No se ha desplazado material: se registra lo que se ve.',
        campos: [
          { id: 'senales', etiqueta: '¿Qué señales hay?', tipo: 'multiple', requerido: true,
            opciones: ['Grietas en el terreno', 'Grietas o fisuras en viviendas', 'Grietas en vías o andenes', 'Hundimiento o asentamiento', 'Abombamiento al pie',
              'Muro de contención agrietado o desplomado', 'Árboles, postes o cercas inclinados', 'Puertas o ventanas que se traban', 'Humedades o surgencias nuevas', 'Otra'],
            detalles: { 'Otra': { id: 'senales_otra', etiqueta: '¿Cuál señal?', tipo: 'texto', requerido: true } }, criticidad: 'A3' },
          { id: 'grieta_abertura', etiqueta: 'La grieta más abierta', tipo: 'unica', requerido: true,
            opciones: ['Fisura (menos de 1 cm)', 'Abierta (1 a 5 cm)', 'Muy abierta o con escalón (más de 5 cm)', 'No hay grietas'],
            criticidad: 'A3' },
          { id: 'extension', etiqueta: '¿Hasta dónde llegan las señales?', tipo: 'unica', requerido: true, criticidad: 'A1',
            opciones: ['Un punto (menos de 5 m)', 'Un lote o una vivienda', 'Varias viviendas o un tramo de vía', 'Una manzana o una ladera'] },
          { id: 'evolucion', etiqueta: '¿Están creciendo?', tipo: 'unica', requerido: true, criticidad: 'A2',
            opciones: ['Sí, crecen', 'Se ven recientes', 'Son antiguas, sin cambios', 'No se sabe'],
            descripciones: { 'Sí, crecen': 'Lo muestran testigos o lo reporta la comunidad', 'Se ven recientes': 'Bordes frescos, sin vegetación',
              'Son antiguas, sin cambios': 'Bordes redondeados o con vegetación', 'No se sabe': 'Sin información' } }
        ] },

      // ------------------------------------------------------------------ 5
      { id: 's5', numero: '5', titulo: 'EVIDENCIAS Y CAUSAS', corto: 'Causas', soloSi: EN_TERRENO,
        campos: [
          { id: 'evidencias', etiqueta: '¿Qué evidencias ve?', tipo: 'multiple', requerido: true, soloSi: SI_MOV, criticidad: 'A3',
            opciones: ['Grietas arriba (corona)', 'Grietas en la masa', 'Escarpe', 'El escarpe avanza hacia casas o vías', 'Material acumulado al pie',
              'Hundimiento', 'Árboles o postes inclinados', 'Bloques sueltos', 'Daños en casas, vías o redes', 'Erosión (surcos, cárcavas)', 'La comunidad reporta movimiento reciente', 'Otra'],
            detalles: { 'Otra': { id: 'evidencias_otra', etiqueta: '¿Cuál evidencia?', tipo: 'texto', requerido: true } } },
          { id: 'antiguedad_evidencias', etiqueta: '¿Cómo se ven?', tipo: 'unica', requerido: true, soloSi: SI_MOV,
            opciones: ['Frescas', 'Recientes', 'Antiguas'],
            descripciones: { 'Frescas': 'Bordes nítidos, raíces expuestas (< 1 mes)', 'Recientes': 'Bordes suavizados (< 1 año)', 'Antiguas': 'Con vegetación' } },
          { id: 'detonantes', etiqueta: '¿Qué lo causa o lo empeora?', tipo: 'multiple', requerido: true, criticidad: 'A3',
            opciones: ['Lluvias', 'Sismo', 'Agua de tuberías o mal dispuesta', 'Corte o excavación al pie', 'Relleno o construcción arriba', 'Quebrada que socava', 'Deforestación', 'No se identifica', 'Otro'],
            exclusivas: ['No se identifica'], detalles: OTRO('detonantes_otro') }
        ] },

      // ------------------------------------------------------------------ 6
      { id: 's6', numero: '6', titulo: '¿QUÉ ESTÁ EXPUESTO?', corto: 'Expuestos', soloSi: EN_TERRENO,
        ayuda: 'Lo que está encima, en la corona (hasta una altura del talud) o al pie (hasta dos alturas).',
        campos: [
          { id: 'expuestos', etiqueta: 'Elementos expuestos', tipo: 'multiple', requerido: true, criticidad: 'Exposición',
            opciones: ['Ninguno', 'Viviendas habitadas', 'Escuela, centro de salud o similar', 'Vía principal o única vía', 'Vía secundaria', 'Vía o escalera peatonal',
              'Redes de servicios', 'Casas deshabitadas o lotes', 'Quebrada (posible represamiento)', 'Cultivos', 'Otro'],
            exclusivas: ['Ninguno'], detalles: OTRO('expuestos_otro') },
          { id: 'viviendas_n', etiqueta: 'Viviendas habitadas', tipo: 'numero', unidad: 'No.', requerido: true, ayuda: '0 si no hay.' },
          { id: 'distancia_minima_m', etiqueta: 'Distancia a lo más cercano', tipo: 'numero', unidad: 'm', requerido: true, soloSi: { campo: 'expuestos', distintoDe: 'Ninguno' } },
          { id: 'afectacion', etiqueta: 'Daño actual', tipo: 'unica', requerido: true,
            opciones: ['Ninguno', 'Leve', 'Moderado', 'Severo', 'Colapso'],
            descripciones: { 'Leve': 'Fisuras < 1 mm', 'Moderado': 'Fisuras de 1 a 5 mm o redes dañadas', 'Severo': 'Grietas > 5 mm, desplomes; inhabitable', 'Colapso': 'Pérdida total o parcial' } },
          { id: 'viviendas_evacuadas', etiqueta: 'Viviendas evacuadas', tipo: 'numero', unidad: 'No.', ayuda: 'Opcional.' }
        ] },

      // ------------------------------------------------------------------ 7
      { id: 's7', numero: '7', titulo: 'PRIORIDAD', corto: 'Prioridad', soloSi: EN_TERRENO,
        campos: [
          { id: 'banderas', etiqueta: '¿Hay alguna de estas condiciones?', tipo: 'multiple', requerido: true,
            ayuda: 'Cualquiera lleva la prioridad sugerida a CRÍTICA.',
            opciones: ['Ninguna', BANDERA_VIVIENDA, 'Masa o bloque a punto de caer sobre casas, personas o una vía en uso', 'Quebrada obstruida (riesgo de represamiento)'],
            exclusivas: ['Ninguna'] },
          { id: 'valoracion', etiqueta: 'Calificación del sistema', tipo: 'calculado' },
          { id: 'prioridad', etiqueta: 'Prioridad final', tipo: 'prioridad', requerido: true,
            opciones: ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'],
            descripciones: { 'BAJA': 'Seguimiento rutinario', 'MEDIA': 'Seguimiento y mitigación programada', 'ALTA': 'Atención a corto plazo', 'CRÍTICA': 'Medidas inmediatas (72 horas o menos)' },
            justificacion: { motivos: ['Información de la comunidad', 'Obra que reduce la amenaza', 'Evidencia no contemplada', 'Lluvias recientes o pronosticadas', 'Población vulnerable', 'Otra'], minimo: 30 } }
        ] },

      // ------------------------------------------------------------------ 8
      { id: 's8', numero: '8', titulo: 'RECOMENDACIONES Y REGISTRO', corto: 'Cierre',
        campos: [
          { id: 'acciones', etiqueta: 'Acciones recomendadas', tipo: 'multiple', requerido: true, soloSi: EN_TERRENO,
            opciones: ['Monitoreo', 'Testigos de grietas', 'Manejo de aguas', 'Reparar redes', 'Retirar sobrecarga o material suelto', 'Revegetalización',
              'Restringir acceso y señalizar', 'Evacuación preventiva', 'Evacuación total', 'Estudio geotécnico', 'Remitir a otra entidad', 'Otro'],
            detalles: { 'Remitir a otra entidad': { id: 'remision_entidad', etiqueta: '¿A qué entidad?', tipo: 'texto', requerido: true }, 'Otro': { id: 'acciones_otro', etiqueta: '¿Cuál?', tipo: 'texto', requerido: true } } },
          { id: 'concepto_campo', etiqueta: 'Concepto técnico', tipo: 'textarea', requerido: true, ayuda: 'Breve: qué pasa, por qué y qué se recomienda.' },
          { id: 'fotos', etiqueta: 'Fotos', tipo: 'fotos', requerido: true, ayuda: 'Mínimo una: panorámica, señales y lo expuesto.' },
          { id: 'observaciones_adicionales', etiqueta: 'Observaciones', tipo: 'textarea' },
          { id: 'responsables', etiqueta: 'Responsables', tipo: 'responsables', requerido: true }
        ] }
    ]
  };

  // ---------------------------------------------------------------- CRITICIDAD
  const NIVELES = ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
  const MATRIZ = {
    'Baja': ['BAJA', 'BAJA', 'BAJA', 'MEDIA', 'MEDIA'],
    'Media': ['BAJA', 'BAJA', 'MEDIA', 'MEDIA', 'ALTA'],
    'Alta': ['MEDIA', 'MEDIA', 'ALTA', 'ALTA', 'ALTA'],
    'Muy alta': ['MEDIA', 'ALTA', 'ALTA', 'CRÍTICA', 'CRÍTICA']
  };
  const ACTIVIDAD = { 'Activo': 4, 'Reactivado': 4, 'Suspendido': 3, 'Latente': 2, 'Inactivo': 1 };
  const EVOLUCION = { 'Sí, crecen': 3, 'Se ven recientes': 2, 'No se sabe': 2, 'Son antiguas, sin cambios': 1 };   // tope 3: aún no hay masa desplazada
  const EXTENSION = { 'Un punto (menos de 5 m)': 1, 'Un lote o una vivienda': 2, 'Varias viviendas o un tramo de vía': 3, 'Una manzana o una ladera': 4 };
  const VEL = { 'Caída': 4, 'Volcamiento': 4, 'Flujo': 4, 'Deslizamiento traslacional': 3, 'Complejo': 3, 'No determinado': 3, 'Deslizamiento rotacional': 2, 'Reptación': 1 };
  const EXPOSICION = { 'Viviendas habitadas': 3, 'Escuela, centro de salud o similar': 4, 'Vía principal o única vía': 3, 'Vía secundaria': 2, 'Redes de servicios': 2,
    'Casas deshabitadas o lotes': 2, 'Vía o escalera peatonal': 1, 'Quebrada (posible represamiento)': 1, 'Cultivos': 1, 'Otro': 1 };
  const VOLUMENES = ['Menor de 10 m³', '10 a 100 m³', '100 a 1.000 m³', 'Mayor de 1.000 m³'];
  const clase = (v, cortes) => 1 + cortes.filter((c) => v >= c).length;
  const lista = (x) => Array.isArray(x) ? x : (x ? [x] : []);
  const tiene = (x, ...ops) => lista(x).some((v) => ops.includes(v));
  const num = (x) => { const v = parseFloat(x); return v > 0 ? v : null; };

  function calcularCriticidad(r) {
    const out = { factores: {}, indicios: [], advertencias: [] };
    if (!r[RUTA]) return out;
    if (r[RUTA] === R_NO) return Object.assign(out, { sugerida: 'SIN PRIORIDAD' });
    const ine = r[RUTA] === R_INE;
    const h = num(r.altura_talud_m);
    // A1 magnitud
    let a1 = 0; const porque = [];
    if (ine) {
      if (EXTENSION[r.extension]) { a1 = EXTENSION[r.extension]; porque.push('señales en ' + r.extension.toLowerCase()); }
    } else if (r.forma_magnitud === 'Medidas aproximadas en campo') {
      const L = num(r.dim_longitud_m), W = num(r.dim_ancho_m), D = num(r.dim_profundidad_m);
      out.volumen = L && W && D ? Math.PI / 6 * L * W * D : null;
      if (out.volumen) { a1 = clase(out.volumen, [10, 100, 1000]); porque.push('≈ ' + Math.round(out.volumen).toLocaleString('es-CO') + ' m³'); }
    } else if (r.volumen_clase) { a1 = 1 + VOLUMENES.indexOf(r.volumen_clase); porque.push(r.volumen_clase); }
    if (h) { const ch = clase(h, [3, 6, 15]); porque.push('talud de ' + h + ' m'); a1 = Math.max(a1, ch); }
    out.factores.A1 = { pts: a1, porque: porque.join(' · ') };
    // A2 actividad
    const a2 = ine ? (EVOLUCION[r.evolucion] || 0) : (ACTIVIDAD[r.estado_actividad] || 0);
    out.factores.A2 = { pts: a2, porque: ine ? (r.evolucion || '') : (r.estado_actividad || '') };
    // A3 indicios (salen de las respuestas)
    const ind = ine ? [
      ['grietas en el terreno', tiene(r.senales, 'Grietas en el terreno')],
      ['grietas muy abiertas o con escalón', r.grieta_abertura === 'Muy abierta o con escalón (más de 5 cm)'],
      ['abombamiento al pie', tiene(r.senales, 'Abombamiento al pie')],
      ['muro de contención agrietado o desplomado', tiene(r.senales, 'Muro de contención agrietado o desplomado') || r.obras === 'Hay pero dañadas'],
      ['árboles o postes inclinados', tiene(r.senales, 'Árboles, postes o cercas inclinados')]
    ] : [
      ['grietas en la corona', tiene(r.evidencias, 'Grietas arriba (corona)')],
      ['escarpe que avanza hacia casas o vías', tiene(r.evidencias, 'El escarpe avanza hacia casas o vías')],
      ['bloques sueltos o árboles inclinados', tiene(r.evidencias, 'Bloques sueltos', 'Árboles o postes inclinados')],
      ['obras dañadas', r.obras === 'Hay pero dañadas']
    ];
    ind.push(['agua en el talud', tiene(r.agua, 'Saturado', 'Surgencias o filtraciones', 'Encharcamientos arriba')]);
    ind.push(['aguas sin manejo', tiene(r.agua, 'Escorrentía sin manejo', 'Fuga de tubería') || tiene(r.detonantes, 'Agua de tuberías o mal dispuesta')]);
    ind.push(['corte o socavación al pie', tiene(r.detonantes, 'Corte o excavación al pie', 'Quebrada que socava')]);
    ind.push(['sobrecarga arriba', tiene(r.detonantes, 'Relleno o construcción arriba')]);
    ind.push(['inclinación alta sin cobertura', r.pendiente === 'Alta' && r.cobertura === 'Suelo desnudo']);
    out.indicios = ind.filter((x) => x[1]).map((x) => x[0]);
    const k = out.indicios.length;
    const a3 = k === 0 ? 1 : k === 1 ? 2 : k <= 3 ? 3 : 4;
    out.factores.A3 = { pts: a3, porque: k + (k === 1 ? ' señal' : ' señales') };
    // A4 velocidad esperada
    const a4 = ine ? 3 : (VEL[r.mecanismo] || 0);
    out.factores.A4 = { pts: a4, porque: ine ? 'sin movimiento definido (valor medio)' : (r.mecanismo || '') };
    out.puntos = a1 + a2 + a3 + a4;
    out.amenaza = out.puntos <= 8 ? 'Baja' : out.puntos <= 11 ? 'Media' : out.puntos <= 13 ? 'Alta' : 'Muy alta';
    // Exposición
    let e = 0, pe = 'nada expuesto';
    lista(r.expuestos).forEach((x) => { if ((EXPOSICION[x] || 0) > e) { e = EXPOSICION[x]; pe = x.toLowerCase(); } });
    if (tiene(r.expuestos, 'Viviendas habitadas') && (num(r.viviendas_n) || 0) >= 3 && e < 4) e = 4;
    if (tiene(r.expuestos, 'Viviendas habitadas') && num(r.viviendas_n)) pe = r.viviendas_n + (+r.viviendas_n === 1 ? ' vivienda habitada' : ' viviendas habitadas');
    if (e > 0 && e < 4 && tiene(r.afectacion, 'Severo', 'Colapso')) { e += 1; pe += ' con daño ' + r.afectacion.toLowerCase(); }
    if (num(r.distancia_minima_m) && e > 0) pe += ' a ' + r.distancia_minima_m + ' m';
    out.exposicion = e; out.porqueExposicion = pe;
    // Banderas y sugerencia
    out.banderas = lista(r.banderas).filter((b) => b !== 'Ninguna');
    const completo = a1 && a2 && a4 && lista(r.expuestos).length;
    out.sugerida = out.banderas.length ? 'CRÍTICA' : completo ? MATRIZ[out.amenaza][e] : null;
    // Coherencia (no bloquea)
    if (!ine && r.antiguedad_evidencias === 'Frescas' && a2 && a2 <= 2) out.advertencias.push('Evidencias frescas con un movimiento quieto: ¿está activo?');
    if (!ine && r.antiguedad_evidencias === 'Antiguas' && a2 === 4) out.advertencias.push('Movimiento activo con evidencias antiguas.');
    if (!ine && a2 === 1 && k >= 3) out.advertencias.push('Movimiento inactivo con ' + k + ' señales de reactivación: ¿es latente?');
    if (ine && r.grieta_abertura === 'No hay grietas' && tiene(r.senales, 'Grietas en el terreno', 'Grietas o fisuras en viviendas', 'Grietas en vías o andenes')) out.advertencias.push('Marcó grietas en las señales pero "No hay grietas" en la abertura.');
    if (tiene(r.expuestos, 'Viviendas habitadas') && r.viviendas_n !== undefined && r.viviendas_n !== '' && +r.viviendas_n === 0) out.advertencias.push('Marcó viviendas habitadas pero escribió 0.');
    if (num(r.distancia_minima_m) && h && num(r.distancia_minima_m) > 2 * h) out.advertencias.push('Lo expuesto está a más de dos alturas del talud: ¿está dentro de la zona de alcance?');
    if (tiene(r.banderas, BANDERA_VIVIENDA) && !tiene(r.expuestos, 'Viviendas habitadas')) out.advertencias.push('Bandera de vivienda sin viviendas habitadas expuestas.');
    if (tiene(r.banderas, BANDERA_VIVIENDA) && !tiene(r.afectacion, 'Severo', 'Colapso')) out.advertencias.push('Bandera de vivienda con daño severo, pero el daño marcado no es severo.');
    return out;
  }

  /** La prioridad sugerida explicada en palabras, para el evaluador y para el documento. */
  function explicar(k, r) {
    if (!k.sugerida) return '';
    if (k.sugerida === 'SIN PRIORIDAD') return 'No hay inestabilidad del terreno: el caso se remite.';
    if (k.banderas.length) return 'Sale CRÍTICA por una condición de alerta: ' + k.banderas[0].toLowerCase() + '.';
    const p = [];
    const ine = r[RUTA] === R_INE;
    const EVO = { 'Sí, crecen': 'señales de inestabilidad que están creciendo', 'Se ven recientes': 'señales de inestabilidad recientes',
      'Son antiguas, sin cambios': 'señales de inestabilidad antiguas, sin cambios', 'No se sabe': 'señales de inestabilidad de evolución desconocida' };
    p.push(ine ? (EVO[r.evolucion] || 'señales de inestabilidad') :'movimiento ' + (r.estado_actividad || '').toLowerCase() + (r.mecanismo ? ' (' + r.mecanismo.toLowerCase() + ')' : ''));
    if (k.indicios.length) p.push(k.indicios.length + (k.indicios.length === 1 ? ' señal de reactivación: ' : ' señales de reactivación: ') + k.indicios.join(', '));
    else p.push('sin señales de reactivación');
    p.push(k.exposicion ? k.porqueExposicion : 'nada expuesto');
    return 'Sale ' + k.sugerida + ' porque hay ' + p.join('; ') + '.';
  }

  const api = { FICHA2, NIVELES, MATRIZ, calcularCriticidad, explicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(raiz, api);
})(typeof window !== 'undefined' ? window : this);
