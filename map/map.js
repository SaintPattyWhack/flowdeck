/* FlowDeck — map module (FD.map)
 * Leaflet 1.9.x, CARTO dark tiles, canvas-rendered vessel markers.
 * Public API (see README.md):
 *   FD.map.mount(containerEl, { onSelect })
 *   FD.map.setVessels(Map|Array)   FD.map.upsertVessel(v)   FD.map.removeVessel(mmsi)
 *   FD.map.setChokePoints(list)    FD.map.setFilter({types, laden, minSog})
 *   FD.map.flyTo(presetId)         FD.map.focusVessel(mmsi)   FD.map.select(mmsi|null)
 *   FD.map.presets                 FD.map.getMap()            FD.map.destroy()
 *   FD.map.setBasemap('carto'|'esri', cartoKey?)  mount opts: { onSelect, basemap, cartoKey }
 */
(function () {
  'use strict';
  window.FD = window.FD || {};

  // ---------------------------------------------------------------- presets
  var PRESETS = [
    { id: 'world',      label: 'WORLD',   bounds: null },
    { id: 'gulf',       label: 'GULF',    bounds: [[23.0, 47.0], [30.5, 57.5]] },
    { id: 'hormuz',     label: 'HORMUZ',  bounds: [[24.3, 54.5], [27.6, 58.2]] },
    { id: 'malacca',    label: 'MALACCA', bounds: [[-1.5, 97.5], [7.0, 105.5]] },
    { id: 'suez',       label: 'SUEZ',    bounds: [[26.5, 30.0], [32.5, 35.5]] },
    { id: 'usgulf',     label: 'US GULF', bounds: [[24.0, -98.5], [31.0, -81.5]] },
    { id: 'northsea',   label: 'N.SEA',   bounds: [[50.0, -4.5], [62.5, 9.5]] },
    { id: 'blacksea',   label: 'BLACK',   bounds: [[40.0, 27.0], [47.5, 42.0]] },
    { id: 'westafrica', label: 'W.AFR',   bounds: [[-7.0, -3.0], [8.5, 12.5]] },
    { id: 'caribbean',  label: 'CARIB',   bounds: [[8.0, -90.0], [23.5, -58.0]] }
  ];
  var WORLD_CENTER = [22, 20], WORLD_ZOOM = 2;

  // ---------------------------------------------------------------- state
  var map = null, container = null, opts = {};
  var renderer = null, chokeRenderer = null, vesselLayer = null, chokeLayer = null, fxLayer = null;
  var markers = new Map();        // mmsi -> L.CircleMarker (marker._fdv = vessel)
  var filter = { types: null, laden: 'all', minSog: 0 };
  var selectedMmsi = null, ring = null, selTick = null, zoomTicks = null;
  var ui = { presets: null, legend: null, count: null };
  var colors = null, activePreset = 'world';
  var resizeTimer = null, ro = null, onWinResize = null;
  var shownCount = 0, baseLayer = null, baseFellBack = false;

  // ---------------------------------------------------------------- helpers
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(container || document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function loadColors() {
    colors = {
      tankerLaden:   cssVar('--fd-v-tanker-laden', '#f5a623'),
      tankerBallast: cssVar('--fd-v-tanker-ballast', '#f5a623'),
      cargo:         cssVar('--fd-v-cargo', '#6b7a8f'),
      gas:           cssVar('--fd-v-gas', '#2dd4bf'),
      other:         cssVar('--fd-v-other', '#555555'),
      select:        cssVar('--fd-v-select', '#ffffff'),
      choke:         cssVar('--fd-choke', '#f5a623')
    };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function category(v) {
    var t = (v.typeLabel || '').toLowerCase();
    if (t.indexOf('gas') >= 0 || t.indexOf('lng') >= 0 || t.indexOf('lpg') >= 0) return 'gas';
    if (t.indexOf('tanker') >= 0) return 'tanker';
    if (t.indexOf('cargo') >= 0) return 'cargo';
    var st = +v.shipType;
    if (st >= 80 && st <= 89) return 'tanker';
    if (st >= 70 && st <= 79) return 'cargo';
    return 'other';
  }
  function styleFor(v) {
    var cat = category(v);
    switch (cat) {
      case 'tanker':
        if (v.laden === true)  return { radius: 3.5, color: colors.tankerLaden, weight: 1, opacity: 1, fillColor: colors.tankerLaden, fillOpacity: 0.95 };
        if (v.laden === false) return { radius: 3.5, color: colors.tankerBallast, weight: 1, opacity: 0.85, fillColor: colors.tankerBallast, fillOpacity: 0.12 };
        return { radius: 3.5, color: colors.tankerLaden, weight: 1, opacity: 0.9, fillColor: colors.tankerLaden, fillOpacity: 0.45 };
      case 'cargo': return { radius: 3, color: colors.cargo, weight: 1, opacity: 0.9, fillColor: colors.cargo, fillOpacity: 0.8 };
      case 'gas':   return { radius: 3.5, color: colors.gas, weight: 1, opacity: 1, fillColor: colors.gas, fillOpacity: 0.9 };
      default:      return { radius: 3, color: colors.other, weight: 1, opacity: 0.9, fillColor: colors.other, fillOpacity: 0.7 };
    }
  }
  function matches(v) {
    if (filter.types && filter.types.length && filter.types.indexOf(category(v)) < 0) return false;
    if (filter.laden === 'laden'   && v.laden !== true)  return false;
    if (filter.laden === 'ballast' && v.laden !== false) return false;
    if (filter.minSog > 0 && !((+v.sog || 0) >= filter.minSog)) return false;
    return true;
  }
  function tooltipHtml(v) {
    var ladenTxt = v.laden === true ? '<span class="l">LADEN</span>' : v.laden === false ? '<span class="b">BALLAST</span>' : '';
    var sog = v.sog == null ? '—' : (+v.sog).toFixed(1) + ' kn';
    return '<div class="n">' + esc(v.name || ('MMSI ' + v.mmsi)) + '</div>' +
      '<div><span class="m">' + esc(v.typeLabel || category(v)) + '</span>' + (ladenTxt ? ' · ' + ladenTxt : '') + ' · ' + sog + '</div>' +
      '<div class="m">→ ' + esc(v.destination || 'n/a') + (v.chokePoint ? ' · ' + esc(v.chokePoint) : '') + '</div>';
  }
  function validPos(v) {
    return v && isFinite(+v.lat) && isFinite(+v.lon) && Math.abs(+v.lat) <= 90 && Math.abs(+v.lon) <= 180;
  }
  // end point of a short line of `px` pixels from latlng in bearing `deg` (0 = north)
  function tickEnd(latlng, deg, px) {
    var p = map.latLngToLayerPoint(latlng);
    var r = (deg || 0) * Math.PI / 180;
    return map.layerPointToLatLng(L.point(p.x + Math.sin(r) * px, p.y - Math.cos(r) * px));
  }

  // ---------------------------------------------------------------- markers
  function createMarker(v) {
    var m = L.circleMarker([+v.lat, +v.lon], L.extend({ renderer: renderer, interactive: true, bubblingMouseEvents: false }, styleFor(v)));
    m._fdv = v;
    m.bindTooltip(function () { return tooltipHtml(m._fdv); }, { className: 'fd-tip', direction: 'top', offset: [0, -6], opacity: 1 });
    m.on('click', function (e) { if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent); select(m._fdv.mmsi, false); });
    return m;
  }
  function applyVisibility(m) {
    var show = matches(m._fdv);
    var on = vesselLayer.hasLayer(m);
    if (show && !on) vesselLayer.addLayer(m);
    else if (!show && on) vesselLayer.removeLayer(m);
    return show;
  }
  function updateMarker(m, v) {
    var old = m._fdv;
    m._fdv = v;
    var lat = +v.lat, lon = +v.lon;
    if (old.lat !== lat || old.lon !== lon) m.setLatLng([lat, lon]);
    if (old.laden !== v.laden || old.typeLabel !== v.typeLabel || old.shipType !== v.shipType) m.setStyle(styleFor(v));
    return applyVisibility(m);
  }
  function upsertVessel(v) {
    if (!map || !validPos(v) || v.mmsi == null) return;
    var key = String(v.mmsi);
    var m = markers.get(key);
    var wasShown, nowShown;
    if (m) {
      wasShown = vesselLayer.hasLayer(m);
      nowShown = updateMarker(m, v);
    } else {
      m = createMarker(v);
      markers.set(key, m);
      wasShown = false;
      nowShown = applyVisibility(m);
    }
    shownCount += (nowShown ? 1 : 0) - (wasShown ? 1 : 0);
    if (selectedMmsi === key) drawSelection();
    scheduleCount();
  }
  function removeVessel(mmsi) {
    var key = String(mmsi), m = markers.get(key);
    if (!m) return;
    if (vesselLayer.hasLayer(m)) { vesselLayer.removeLayer(m); shownCount--; }
    markers.delete(key);
    if (selectedMmsi === key) select(null);
    scheduleCount();
  }
  function setVessels(src) {
    if (!map) return;
    var list = src instanceof Map ? Array.from(src.values()) : Array.isArray(src) ? src : (src && typeof src.values === 'function' ? Array.from(src.values()) : []);
    var seen = new Set();
    shownCount = 0;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!validPos(v) || v.mmsi == null) continue;
      var key = String(v.mmsi);
      seen.add(key);
      var m = markers.get(key);
      if (m) { if (updateMarker(m, v)) shownCount++; }
      else { m = createMarker(v); markers.set(key, m); if (applyVisibility(m)) shownCount++; }
    }
    markers.forEach(function (m, key) {
      if (!seen.has(key)) { vesselLayer.removeLayer(m); markers.delete(key); }
    });
    if (selectedMmsi && !markers.has(selectedMmsi)) select(null);
    else if (selectedMmsi) drawSelection();
    refreshZoomTicks();
    updateCount();
  }
  function setFilter(f) {
    f = f || {};
    if ('types' in f) {
      var t = f.types;
      filter.types = (t && t.length) ? t.map(function (x) { return String(x).toLowerCase(); }) : null;
    }
    if ('laden' in f) filter.laden = f.laden || 'all';
    if ('minSog' in f) filter.minSog = +f.minSog || 0;
    if (!map) return;
    shownCount = 0;
    markers.forEach(function (m) { if (applyVisibility(m)) shownCount++; });
    if (selectedMmsi) { var sm = markers.get(selectedMmsi); if (sm && !vesselLayer.hasLayer(sm)) select(null); }
    refreshZoomTicks();
    updateCount();
  }

  // ---------------------------------------------------------------- selection
  function select(mmsi, pan) {
    var key = mmsi == null ? null : String(mmsi);
    var m = key ? markers.get(key) : null;
    selectedMmsi = m ? key : null;
    drawSelection();
    if (m && pan) map.panTo(m.getLatLng());
    if (typeof opts.onSelect === 'function') {
      try { opts.onSelect(m ? m._fdv : null); } catch (e) { console.error('[FD.map] onSelect threw', e); }
    }
  }
  function drawSelection() {
    if (!map) return;
    var m = selectedMmsi ? markers.get(selectedMmsi) : null;
    if (!m) {
      if (ring) { fxLayer.removeLayer(ring); ring = null; }
      if (selTick) { fxLayer.removeLayer(selTick); selTick = null; }
      return;
    }
    var ll = m.getLatLng(), v = m._fdv;
    if (!ring) {
      ring = L.circleMarker(ll, { renderer: renderer, radius: 9, color: colors.select, weight: 1.5, opacity: 0.95, fill: false, interactive: false }).addTo(fxLayer);
    } else ring.setLatLng(ll);
    var cog = v.cog != null ? +v.cog : (v.heading != null ? +v.heading : null);
    if (cog != null && isFinite(cog)) {
      var pts = [ll, tickEnd(ll, cog, 16)];
      if (!selTick) selTick = L.polyline(pts, { renderer: renderer, color: colors.select, weight: 1, opacity: 0.9, interactive: false }).addTo(fxLayer);
      else selTick.setLatLngs(pts);
    } else if (selTick) { fxLayer.removeLayer(selTick); selTick = null; }
  }
  // heading ticks for all visible vessels when zoomed in (single multi-polyline, cheap)
  function refreshZoomTicks() {
    if (!map) return;
    if (map.getZoom() < 8) {
      if (zoomTicks) { fxLayer.removeLayer(zoomTicks); zoomTicks = null; }
      return;
    }
    var b = map.getBounds().pad(0.1), segs = [];
    markers.forEach(function (m) {
      if (!vesselLayer.hasLayer(m)) return;
      var ll = m.getLatLng();
      if (!b.contains(ll)) return;
      var v = m._fdv, cog = v.cog != null ? +v.cog : (v.heading != null ? +v.heading : NaN);
      if (!isFinite(cog) || !((+v.sog || 0) > 0.5)) return;
      segs.push([ll, tickEnd(ll, cog, 9)]);
      if (segs.length > 4000) return;
    });
    if (!zoomTicks) zoomTicks = L.polyline(segs, { renderer: renderer, color: '#c9d1d9', weight: 1, opacity: 0.55, interactive: false }).addTo(fxLayer);
    else zoomTicks.setLatLngs(segs);
  }
  function focusVessel(mmsi) {
    var m = markers.get(String(mmsi));
    if (!m || !map) return false;
    if (!vesselLayer.hasLayer(m)) { // un-hide if filtered out so the user can see it
      vesselLayer.addLayer(m); shownCount++; updateCount();
    }
    setActivePreset(null);
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.9 });
    select(m._fdv.mmsi, false);
    return true;
  }

  // ---------------------------------------------------------------- choke points
  function setChokePoints(list) {
    if (!map) return;
    chokeLayer.clearLayers();
    (list || []).forEach(function (cp) {
      if (!cp || !cp.polygon || cp.polygon.length < 3) return;
      var poly = L.polygon(cp.polygon, { renderer: chokeRenderer, pane: 'fd-choke', color: colors.choke, weight: 1, opacity: 0.8, fillColor: colors.choke, fillOpacity: 0.25, interactive: false });
      chokeLayer.addLayer(poly);
      var center = cp.center || poly.getBounds().getCenter();
      var n = cp.tankerCount != null ? cp.tankerCount : (cp.count != null ? cp.count : 0);
      var icon = L.divIcon({ className: 'fd-choke-badge', iconSize: [0, 0], html: '<span>' + esc(cp.name || cp.id) + ' · <span class="cnt">' + n + '</span> tankers</span>' });
      chokeLayer.addLayer(L.marker(center, { icon: icon, interactive: false, keyboard: false, pane: 'fd-choke' }));
    });
  }

  // ---------------------------------------------------------------- basemap
  // CARTO dark_all is the intended look but basemaps.cartocdn.com now watermarks tiles
  // ("API KEY REQUIRED") unless ?key= is supplied (free tier: carto.com/basemaps/apikey).
  // Esri's Dark Gray Canvas needs no key and is used when no CARTO key is given.
  var BASEMAPS = {
    carto: function (key) {
      return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' + (key ? '?key=' + encodeURIComponent(key) : ''), {
        subdomains: 'abcd', maxZoom: 12, maxNativeZoom: 12, crossOrigin: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      });
    },
    esri: function () {
      return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 12, maxNativeZoom: 12,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
      });
    }
  };
  function setBasemap(id, key) {
    if (!map) return false;
    var make = BASEMAPS[id] || BASEMAPS.esri;
    if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
    baseLayer = make(key).addTo(map);
    baseLayer.on('tileerror', function () { // e.g. CARTO blocked -> fall back once
      if (id === 'carto' && !baseFellBack) { baseFellBack = true; setBasemap('esri'); }
    });
    return true;
  }

  // ---------------------------------------------------------------- navigation
  function flyTo(presetId) {
    if (!map) return false;
    var p = null;
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === presetId) p = PRESETS[i];
    if (!p) { console.warn('[FD.map] unknown preset', presetId); return false; }
    setActivePreset(p.id);
    if (!p.bounds) map.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 0.9 });
    else map.flyToBounds(p.bounds, { padding: [20, 20], maxZoom: 12, duration: 0.9 });
    return true;
  }
  function setActivePreset(id) {
    activePreset = id;
    if (!ui.presets) return;
    var btns = ui.presets.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.preset === id);
  }

  // ---------------------------------------------------------------- overlays
  function buildUI() {
    var strip = L.DomUtil.create('div', 'fd-map-ui fd-presets', container);
    PRESETS.forEach(function (p) {
      var b = L.DomUtil.create('button', '', strip);
      b.type = 'button'; b.textContent = p.label; b.dataset.preset = p.id; b.title = 'GO ' + p.id.toUpperCase();
      L.DomEvent.on(b, 'click', function (e) { L.DomEvent.stop(e); flyTo(p.id); });
    });
    L.DomEvent.disableClickPropagation(strip);
    L.DomEvent.disableScrollPropagation(strip);
    ui.presets = strip;

    var legend = L.DomUtil.create('div', 'fd-map-ui fd-legend', container);
    legend.innerHTML =
      '<span class="sw fill c-tl"></span><span class="lbl">TANKER LADEN</span>' +
      '<span class="sw c-tb"></span><span class="lbl">TANKER BALLAST</span>' +
      '<span class="sw fill c-cg"></span><span class="lbl">CARGO</span>' +
      '<span class="sw fill c-gs"></span><span class="lbl">LNG / LPG</span>' +
      '<span class="sw fill c-ot"></span><span class="lbl">OTHER</span>' +
      '<span class="sw poly c-ck"></span><span class="lbl">CHOKE POINT</span>' +
      '<span class="count"><b>0</b> shown / 0</span>';
    L.DomEvent.disableClickPropagation(legend);
    ui.legend = legend;
    ui.count = legend.querySelector('.count');
    setActivePreset('world');
  }
  var countTimer = null;
  function scheduleCount() { if (!countTimer) countTimer = setTimeout(function () { countTimer = null; updateCount(); }, 200); }
  function updateCount() {
    if (ui.count) ui.count.innerHTML = '<b>' + shownCount + '</b> shown / ' + markers.size;
  }

  // ---------------------------------------------------------------- mount / destroy
  function mount(el, options) {
    if (!el) throw new Error('[FD.map] mount: container element required');
    if (typeof L === 'undefined') throw new Error('[FD.map] Leaflet (L) not loaded');
    if (map) destroy();
    container = el; opts = options || {};
    L.DomUtil.addClass(container, 'fd-map');
    loadColors();

    map = L.map(container, {
      center: WORLD_CENTER, zoom: WORLD_ZOOM, minZoom: 2, maxZoom: 12,
      worldCopyJump: true, zoomControl: true, attributionControl: true,
      preferCanvas: true, zoomSnap: 0.5, wheelPxPerZoomLevel: 90,
      maxBounds: [[-85, -Infinity], [85, Infinity]], maxBoundsViscosity: 0.5
    });
    setBasemap(opts.basemap || (opts.cartoKey ? 'carto' : 'esri'), opts.cartoKey);

    // choke-point polygons live on a lower pane with their own canvas so they never sit
    // above the vessel canvas and steal pointer events
    map.createPane('fd-choke').style.zIndex = 350;
    chokeRenderer = L.canvas({ pane: 'fd-choke', padding: 0.5 });
    chokeRenderer.addTo(map);
    renderer = L.canvas({ padding: 0.5, tolerance: 4 });
    renderer.addTo(map);
    chokeLayer = L.layerGroup().addTo(map);
    vesselLayer = L.layerGroup().addTo(map);
    fxLayer = L.layerGroup().addTo(map);

    map.on('zoomend', function () { drawSelection(); refreshZoomTicks(); });
    map.on('moveend', refreshZoomTicks);
    map.on('movestart', function () { if (activePreset) setActivePreset(null); });
    map.on('click', function () { if (selectedMmsi) select(null); });

    buildUI();

    // keep Leaflet's size in sync with the container (phones rotating, panels resizing)
    onWinResize = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (map) map.invalidateSize({ pan: false }); }, 120);
    };
    window.addEventListener('resize', onWinResize);
    window.addEventListener('orientationchange', onWinResize);
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onWinResize); ro.observe(container); }
    setTimeout(function () { if (map) map.invalidateSize(); }, 0);
    return FDmap;
  }
  function destroy() {
    if (!map) return;
    window.removeEventListener('resize', onWinResize);
    window.removeEventListener('orientationchange', onWinResize);
    if (ro) { ro.disconnect(); ro = null; }
    map.remove(); map = null; baseLayer = null; baseFellBack = false;
    markers.clear(); shownCount = 0; selectedMmsi = null; ring = null; selTick = null; zoomTicks = null;
    if (ui.presets && ui.presets.parentNode) ui.presets.parentNode.removeChild(ui.presets);
    if (ui.legend && ui.legend.parentNode) ui.legend.parentNode.removeChild(ui.legend);
    ui = { presets: null, legend: null, count: null };
    if (container) L.DomUtil.removeClass(container, 'fd-map');
    container = null;
  }

  // ---------------------------------------------------------------- export
  var FDmap = {
    mount: mount,
    destroy: destroy,
    setVessels: setVessels,
    upsertVessel: upsertVessel,
    removeVessel: removeVessel,
    setChokePoints: setChokePoints,
    setFilter: setFilter,
    flyTo: flyTo,
    focusVessel: focusVessel,
    select: function (mmsi) { select(mmsi, true); },
    invalidateSize: function () { if (map) map.invalidateSize(); },
    setBasemap: setBasemap,                 // 'carto' (needs key) | 'esri'
    getMap: function () { return map; },
    getFilter: function () { return { types: filter.types ? filter.types.slice() : null, laden: filter.laden, minSog: filter.minSog }; },
    presets: PRESETS.map(function (p) { return { id: p.id, label: p.label }; }),
    stats: function () { return { total: markers.size, shown: shownCount, selected: selectedMmsi }; }
  };
  window.FD.map = FDmap;
})();
