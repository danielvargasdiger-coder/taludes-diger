/**
 * Tablero de eficiencia — lee los datos de la app de taludes (Apps Script,
 * accion ?eficiencia=1) y pinta mapa, tarjetas y graficas.
 *
 * El servidor ya hace el cruce y solo manda:
 *   edr:     [lat, lon, barrio, estado]   estado 0 = sin visitar, 1 = visitada, 2 = visitada con movimiento en masa
 *   visitas: [lat, lon, barrio, entidad, movimiento(0/1), enLista(0/1)]
 * Toda visita realizada cuenta como solicitud atendida (decision DIGER, 19/09):
 * que no se encuentre su fila en la lista no quiere decir que no sea de ahi.
 * Por eso el avance es visitas / solicitudes iniciales; enLista no se usa.
 * Coordenadas redondeadas a la cuadra. Sin nombres ni direcciones.
 */
(function () {
  'use strict';

  const URL_DATOS = window.EFIC_URL_PRUEBA || (CONFIG.API_URL + '?eficiencia=1');
  const MINUTOS_REFRESCO = 10;
  const CLAVE_LOCAL = 'eficiencia-ultimo';
  const $ = (s) => document.querySelector(s);
  const color = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (n) => n.toLocaleString('es-CO');
  const pct = (a, b) => (b ? (Math.round((a * 1000) / b) / 10).toLocaleString('es-CO') : '0') + ' %';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ mapa
  const mapa = L.map('mapa', { zoomSnap: 0.25, scrollWheelZoom: false, minZoom: 10, maxZoom: 17 }).setView([4.81, -75.7], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© colaboradores de OpenStreetMap'
  }).addTo(mapa);
  mapa.on('click', () => mapa.scrollWheelZoom.enable());
  let capa = null, paso = 1, datos = null, encuadrado = false;

  const PUNTO = (lat, lon, radio, relleno, opacidad, texto) =>
    L.circleMarker([lat, lon], { radius: radio, color: '#fff', weight: 1.5, fillColor: relleno, fillOpacity: opacidad }).bindTooltip(texto);

  function pintarPaso() {
    if (!datos) return;
    if (capa) capa.remove();
    capa = L.layerGroup().addTo(mapa);
    const { edr, visitas } = datos;
    const cLista = color('--c-lista'), cVis = color('--c-vis'), cMm = color('--c-mm'), cNo = color('--c-no');
    const enMapaE = edr.filter((e) => e[0] != null), enMapaV = visitas.filter((v) => v[0] != null);
    let ley = '', nota = '';

    if (paso === 1) {
      enMapaE.forEach((e) => PUNTO(e[0], e[1], 5.5, cLista, 0.85, `<b>${esc(e[2] || 'Sin barrio')}</b><br>Solicitud inicial`).addTo(capa));
      ley = `<span><i style="background:${cLista}"></i>Solicitud inicial <b>${fmt(edr.length)}</b></span>`;
      nota = `${fmt(enMapaE.length)} de ${fmt(edr.length)} solicitudes tienen ubicación. Las demás no traen coordenada en el EDR.`;
    }
    if (paso === 2) {
      enMapaE.filter((e) => e[3] === 0).forEach((e) => L.circleMarker([e[0], e[1]], { radius: 3.5, stroke: false, fillColor: cLista, fillOpacity: 0.35 }).addTo(capa));
      enMapaV.forEach((v) => PUNTO(v[0], v[1], 6.5, cVis, 1, `<b>${esc(v[2] || 'Sin barrio')}</b><br>Visitada · ${esc(v[3])}`).addTo(capa));
      ley = `<span><i style="background:${cVis}"></i>Solicitud visitada <b>${fmt(visitas.length)}</b></span>` +
            `<span><i style="background:${cLista};opacity:.45"></i>Solicitud inicial</span>`;
      nota = `${fmt(visitas.length)} de ${fmt(edr.length)} solicitudes visitadas (${pct(visitas.length, edr.length)}).`;
    }
    if (paso === 3) {
      enMapaV.filter((v) => !v[4]).forEach((v) => PUNTO(v[0], v[1], 5, cNo, 0.9, `<b>${esc(v[2] || 'Sin barrio')}</b><br>${esc(v[3])} · sin movimiento en masa`).addTo(capa));
      enMapaV.filter((v) => v[4]).forEach((v) => PUNTO(v[0], v[1], 7.5, cMm, 1, `<b>${esc(v[2] || 'Sin barrio')}</b><br>${esc(v[3])} · <b>movimiento en masa</b>`).addTo(capa));
      const mm = visitas.filter((v) => v[4]).length;
      ley = `<span><i style="background:${cMm}"></i>Movimiento en masa <b>${fmt(mm)}</b></span>` +
            `<span><i style="background:${cNo}"></i>Sin movimiento en masa <b>${fmt(visitas.length - mm)}</b></span>`;
      nota = `${pct(mm, visitas.length)} de las solicitudes visitadas son movimiento en masa.`;
    }
    $('#leyenda').innerHTML = ley;
    $('#nota-mapa').textContent = nota;
    [1, 2, 3].forEach((k) => $('#paso-' + k).setAttribute('aria-selected', String(k === paso)));

    if (!encuadrado) {
      // Encuadre en el grueso de los puntos: unos pocos rurales no alejan el mapa.
      const todos = [...enMapaE, ...enMapaV];
      if (todos.length) {
        const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
        const la = todos.map((p) => p[0]), lo = todos.map((p) => p[1]);
        mapa.fitBounds([[q(la, 0.04), q(lo, 0.04)], [q(la, 0.96), q(lo, 0.96)]], { padding: [12, 12] });
        encuadrado = true;
      }
    }
  }
  [1, 2, 3].forEach((k) => { $('#paso-' + k).onclick = () => { paso = k; pintarPaso(); }; });

  // ------------------------------------------------------------------ gráficas
  function fila(cont, etiqueta, segs, max, textoPct, nota) {
    const f = document.createElement('div');
    f.className = 'fila';
    const riel = segs.filter((s) => s.v > 0).map((s) =>
      `<div class="seg${s.claro ? ' claro' : ''}" style="width:${(s.v / max) * 100}%;background:var(${s.c})" title="${esc(s.t)}: ${fmt(s.v)}">${s.v / max > 0.07 ? fmt(s.v) : ''}</div>`).join('');
    f.innerHTML = `<div class="et">${etiqueta}</div><div class="riel">${riel}</div><div class="pct">${textoPct}</div>` +
      (nota ? `<div class="fila-nota">${nota}</div>` : '');
    cont.appendChild(f);
  }

  function dona(mm, total) {
    const r = 46, C = 2 * Math.PI * r, parte = total ? mm / total : 0;
    $('#dona').innerHTML =
      `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${color('--c-no')}" stroke-width="18"/>` +
      `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${color('--c-mm')}" stroke-width="18" stroke-dasharray="${C * parte} ${C}" transform="rotate(-90 60 60)"/>` +
      `<text x="60" y="60" text-anchor="middle" font-size="19" font-weight="800" fill="${color('--texto')}">${pct(mm, total)}</text>` +
      `<text x="60" y="76" text-anchor="middle" font-size="8.5" fill="${color('--texto-suave')}">efectivas</text>`;
    $('#dona-ley').innerHTML =
      `<li><i class="c-mm"></i><span><b>${fmt(mm)}</b> con movimiento en masa</span><small>${pct(mm, total)} de las visitadas</small></li>` +
      `<li><i class="c-no"></i><span><b>${fmt(total - mm)}</b> sin movimiento en masa</span><small>${pct(total - mm, total)} de las visitadas</small></li>` +
      `<li><i class="c-vis"></i><span><b>${fmt(total)}</b> solicitudes visitadas</span></li>`;
  }

  function pintarTodo() {
    const { edr, visitas } = datos;
    const tot = edr.length;
    const V = visitas.length, mmV = visitas.filter((v) => v[4]).length;
    const pend = Math.max(0, tot - V);

    $('#k-sol').textContent = fmt(tot);
    $('#k-vis').textContent = fmt(V);
    $('#k-vis-p').textContent = pct(V, tot);
    $('#k-mm').textContent = fmt(mmV);
    $('#k-mm-p').textContent = pct(mmV, V);
    $('#k-pen').textContent = fmt(pend);
    $('#k-pen-p').textContent = pct(pend, tot);

    dona(mmV, V);

    const gA = $('#g-avance'); gA.innerHTML = '';
    fila(gA, '<b>Solicitudes iniciales</b>', [{ v: tot, c: '--c-lista', t: 'Solicitudes iniciales' }], tot, '100 %');
    fila(gA, '<b>Visitadas</b>', [{ v: V, c: '--c-vis', t: 'Visitadas' }], tot, pct(V, tot));
    fila(gA, '<b>Movimiento en masa</b>', [{ v: mmV, c: '--c-mm', t: 'Con movimiento en masa' }], tot, pct(mmV, tot),
      `${pct(mmV, V)} de las solicitudes visitadas son movimiento en masa`);
    fila(gA, '<b>Pendientes</b>', [{ v: pend, c: '--c-lista', t: 'Pendientes por visitar' }], tot, pct(pend, tot));

    const gE = $('#g-entidad'); gE.innerHTML = '';
    const ents = ['DIGER', 'CARDER', 'Infraestructura'];
    const maxE = Math.max(1, ...ents.map((e) => visitas.filter((v) => v[3] === e).length));
    ents.forEach((e) => {
      const g = visitas.filter((v) => v[3] === e), m = g.filter((v) => v[4]).length;
      fila(gE, `<b>${e}</b> (${fmt(g.length)})`, [{ v: m, c: '--c-mm', t: 'Movimiento en masa' }, { v: g.length - m, c: '--c-no', t: 'Sin movimiento en masa', claro: true }],
        maxE, pct(m, g.length));
    });

    pintarPaso();
  }

  // ------------------------------------------------------------------ datos
  function estado(texto, error) {
    const el = $('#estado');
    el.textContent = texto;
    el.classList.toggle('error', !!error);
  }

  function usar(d, desdeCopia) {
    datos = d;
    pintarTodo();
    estado((desdeCopia ? 'Sin conexión · datos del ' : 'Actualizado ') + d.generado);
  }

  async function cargar() {
    try {
      const res = await fetch(URL_DATOS, { cache: 'no-store' });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'El servidor no devolvió datos.');
      usar(d, false);
      try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(d)); } catch (e) { /* sin almacenamiento */ }
    } catch (err) {
      let copia = null;
      try { copia = JSON.parse(localStorage.getItem(CLAVE_LOCAL)); } catch (e) { /* nada guardado */ }
      if (copia && !datos) usar(copia, true);
      else if (!datos) estado('No se pudieron cargar los datos: ' + err.message, true);
      else estado('Sin conexión · datos del ' + datos.generado);
    }
  }

  cargar();
  setInterval(cargar, MINUTOS_REFRESCO * 60 * 1000);
})();
