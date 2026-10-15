/* FlowDeck shell — app chrome + integration of FD.data / FD.map / FD.markets / FD.splc.
 * Plain browser JS, no bundler. Attaches window.FD.shell = { run(cmd), openSettings(), help(), state }.
 */
(function () {
  'use strict';
  window.FD = window.FD || {};
  var FD = window.FD;

  var LS_KEYS = 'fd.keys';
  var PHONE_MQ = '(max-width: 768px)';

  // ---------------------------------------------------------------- storage
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function loadKeys() { return lsGet(LS_KEYS) || {}; }
  function saveKeys(patch) {
    var cur = loadKeys();
    Object.keys(patch).forEach(function (n) {
      var v = patch[n];
      if (v === '' || v === null || v === undefined || v === false) delete cur[n]; else cur[n] = v;
    });
    lsSet(LS_KEYS, cur);
    return cur;
  }

  // ---------------------------------------------------------------- dom helpers
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function utcClock(d) { return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z'; }
  function isPhone() { return window.matchMedia(PHONE_MQ).matches; }

  // ---------------------------------------------------------------- state
  var state = {
    aisState: 'closed', aisMsg: '', demo: false,
    stats: { count: 0, tankers: 0, laden: 0, ballast: 0, chokePoints: [] },
    lastTick: null, needFullRefresh: true, tab: 'markets', mounted: { markets: false, splc: false },
    selected: null, splcLayer: null
  };
  var els = {};

  // choke-point id -> map preset (where one exists)
  var CHOKE_PRESET = { hormuz: 'hormuz', malacca: 'malacca', suez: 'suez', bosphorus: 'blacksea', danish: 'northsea', gibraltar: null, babelmandeb: null, panama: 'caribbean', goodhope: null };

  // ---------------------------------------------------------------- build chrome
  function build() {
    var app = document.getElementById('fd-app') || document.body.appendChild(h('div', { id: 'fd-app' }));
    app.innerHTML = '';

    // top bar
    els.cmdInput = h('input', { type: 'text', placeholder: 'command — MAP, TANK, GAS, PX, NEWS, WL, SPLC WMT, GO HORMUZ, SET, HELP', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Command', id: 'fd-cmd' });
    els.cmdHint = h('span', { class: 'fd-cmd-hint', text: 'press / to focus' });
    var top = h('header', { class: 'fd-top' }, [
      h('div', { class: 'fd-wordmark', text: 'FLOWDECK', title: 'FlowDeck — commodity flow terminal' }),
      h('div', { class: 'fd-cmd' }, [h('span', { class: 'fd-cmd-prompt', text: '>' }), els.cmdInput, els.cmdHint]),
      h('div', { class: 'fd-top-btns' }, [
        h('button', { class: 'fd-ibtn', text: 'SET', title: 'Settings', onclick: openSettings }),
        h('button', { class: 'fd-ibtn', text: 'HELP', title: 'Commands', onclick: openHelp })
      ])
    ]);

    // status strip
    els.dot = h('span', { class: 'fd-dot', 'data-state': 'closed' });
    els.stAis = h('b', { text: 'OFFLINE' });
    els.stCount = h('b', { text: '0' });
    els.stTank = h('b', { text: '0' });
    els.stLaden = h('b', { text: '0' });
    els.stBallast = h('b', { text: '0' });
    els.stUpdated = h('b', { text: '—' });
    els.stClock = h('b', { class: 'acc', text: utcClock(new Date()) });
    var strip = h('div', { class: 'fd-status-strip', role: 'status' }, [
      h('span', { class: 'fd-st-item' }, [els.dot, 'AIS ', els.stAis]),
      h('span', { class: 'fd-st-item' }, ['VESSELS ', els.stCount]),
      h('span', { class: 'fd-st-item' }, ['TANKERS ', els.stTank]),
      h('span', { class: 'fd-st-item' }, ['LADEN ', els.stLaden, ' / BALLAST ', els.stBallast]),
      h('span', { class: 'fd-st-item' }, ['UPDATED ', els.stUpdated]),
      h('span', { class: 'fd-st-spacer' }),
      h('span', { class: 'fd-st-item' }, ['UTC ', els.stClock])
    ]);

    // banner
    els.banner = h('div', { class: 'fd-banner', hidden: 'hidden' }, [
      h('b', { text: 'DEMO' }),
      h('span', { html: 'Demo data — add a free <a data-act="set">aisstream.io key in SET</a> for live AIS' }),
      h('button', { class: 'x', title: 'Dismiss', text: '×', onclick: function () { els.banner.hidden = true; } })
    ]);
    els.banner.querySelector('[data-act="set"]').addEventListener('click', openSettings);

    // main: map + side panel
    els.map = h('div', { id: 'fd-map' });
    els.drawer = h('aside', { class: 'fd-drawer', 'aria-label': 'Vessel detail' });
    els.mapwrap = h('div', { class: 'fd-mapwrap' }, [els.map, els.drawer]);

    els.tabs = {};
    els.panes = {};
    var tabBar = h('div', { class: 'fd-tabs', role: 'tablist' });
    var panes = h('div', { class: 'fd-panes' });
    [['markets', 'MARKETS'], ['splc', 'SPLC'], ['choke', 'CHOKE']].forEach(function (t) {
      els.tabs[t[0]] = h('button', { class: 'fd-tab', role: 'tab', 'aria-selected': 'false', 'data-tab': t[0], text: t[1], onclick: function () { showTab(t[0]); } });
      tabBar.appendChild(els.tabs[t[0]]);
      els.panes[t[0]] = h('div', { class: 'fd-pane', id: 'fd-pane-' + t[0], role: 'tabpanel' });
      panes.appendChild(els.panes[t[0]]);
    });
    els.side = h('section', { class: 'fd-side' }, [tabBar, panes]);
    var main = h('div', { class: 'fd-main' }, [els.mapwrap, els.side]);

    // modals
    els.settingsBg = h('div', { class: 'fd-modal-bg', id: 'fd-settings' });
    els.helpBg = h('div', { class: 'fd-modal-bg', id: 'fd-help' });
    [els.settingsBg, els.helpBg].forEach(function (bg) { bg.addEventListener('click', function (e) { if (e.target === bg) closeModals(); }); });

    app.appendChild(top); app.appendChild(strip); app.appendChild(els.banner); app.appendChild(main);
    document.body.appendChild(els.settingsBg); document.body.appendChild(els.helpBg);

    // choke pane skeleton
    els.chokeBody = h('tbody');
    els.panes.choke.appendChild(h('table', { class: 'fd-choke-table' }, [
      h('thead', null, [h('tr', null, [h('th', { text: 'CHOKE POINT' }), h('th', { class: 'n', text: 'VESSELS' }), h('th', { class: 'n', text: 'TANKERS' })])]),
      els.chokeBody
    ]));
    els.panes.choke.appendChild(h('p', { class: 'fd-pane-note', text: 'Counts are vessels currently inside each hand-drawn polygon. Click a row to fly there.' }));

    // command input
    els.cmdInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run(els.cmdInput.value); els.cmdInput.value = ''; }
      else if (e.key === 'Escape') { els.cmdInput.blur(); }
    });
    els.cmdInput.addEventListener('input', function () { setHint('', ''); });
  }

  function setHint(text, cls) {
    els.cmdHint.textContent = text || 'press / to focus';
    els.cmdHint.className = 'fd-cmd-hint' + (cls ? ' ' + cls : '');
    if (cls) { clearTimeout(setHint.t); setHint.t = setTimeout(function () { setHint('', ''); }, 4000); }
  }

  // ---------------------------------------------------------------- tabs
  function showTab(id) {
    state.tab = id;
    Object.keys(els.tabs).forEach(function (k) {
      els.tabs[k].setAttribute('aria-selected', k === id ? 'true' : 'false');
      els.panes[k].classList.toggle('active', k === id);
    });
    if (id === 'markets' && !state.mounted.markets && FD.markets) {
      state.mounted.markets = true;
      try { FD.markets.mount(els.panes.markets); } catch (e) { console.error('[FD.shell] markets mount failed', e); }
    }
    if (id === 'splc' && !state.mounted.splc && FD.splc) {
      state.mounted.splc = true;
      try { FD.splc.mount(els.panes.splc, { onEntity: function () { showTab('splc'); }, onPlot: plotEntities }); } catch (e) { console.error('[FD.shell] splc mount failed', e); }
    }
    if (isPhone()) { try { els.side.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }
  function scrollToSection(sec) {
    showTab('markets');
    var s = els.panes.markets.querySelector('[data-sec="' + sec + '"]');
    if (s) { try { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }

  // ---------------------------------------------------------------- status strip
  function renderStatus() {
    var st = state.aisState, label;
    var dotState = st;
    if (st === 'live' && state.demo) { dotState = 'demo'; label = 'DEMO'; }
    else label = { live: 'LIVE', connecting: 'CONNECTING', error: 'ERROR', closed: 'OFFLINE' }[st] || st.toUpperCase();
    els.dot.setAttribute('data-state', dotState);
    els.stAis.textContent = label;
    els.stAis.title = state.aisMsg || '';
    var s = state.stats;
    els.stCount.textContent = s.count || 0;
    els.stTank.textContent = s.tankers || 0;
    els.stLaden.textContent = s.laden || 0;
    els.stBallast.textContent = s.ballast || 0;
    els.stUpdated.textContent = state.lastTick ? utcClock(new Date(state.lastTick)) : '—';
  }
  function renderChokeTable() {
    var rows = (FD.data && FD.data.chokePoints || []).slice().sort(function (a, b) { return (b.count - a.count) || (b.tankerCount - a.tankerCount); });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.count || 0); }, 0) || 1;
    els.chokeBody.innerHTML = rows.map(function (r) {
      return '<tr class="row" data-id="' + esc(r.id) + '"><td>' + esc(r.name) + '<div class="bar" style="width:' + Math.round((r.count || 0) / max * 100) + '%"></div></td>' +
        '<td class="n"><b>' + (r.count || 0) + '</b></td><td class="n">' + (r.tankerCount || 0) + '</td></tr>';
    }).join('');
  }
  function onChokeClick(e) {
    var tr = e.target.closest && e.target.closest('tr.row'); if (!tr) return;
    var id = tr.getAttribute('data-id'), preset = CHOKE_PRESET[id];
    var cp = (FD.data.chokePoints || []).filter(function (c) { return c.id === id; })[0];
    if (preset && FD.map.flyTo(preset)) { /* preset view */ }
    else if (cp && cp.center && FD.map.getMap()) { FD.map.getMap().flyTo(cp.center, 6, { duration: 0.8 }); }
    if (isPhone()) { try { els.mapwrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (er) {} }
  }

  // ---------------------------------------------------------------- data wiring
  function wireData() {
    if (!FD.data) return;
    FD.data.on('status', function (s) {
      state.aisState = s.state; state.aisMsg = s.msg || '';
      state.demo = !!(FD.data.isDemo && FD.data.isDemo());
      if (s.state === 'connecting') state.needFullRefresh = true;
      renderStatus();
    });
    FD.data.on('tick', function (t) {
      state.stats = t; state.lastTick = Date.now();
      state.demo = !!(FD.data.isDemo && FD.data.isDemo());
      if (state.needFullRefresh) { state.needFullRefresh = false; FD.map.setVessels(FD.data.vessels()); }
      FD.map.setChokePoints(FD.data.chokePoints);
      renderStatus(); renderChokeTable();
      if (state.selected) { var v = FD.data.vessels().get(state.selected.mmsi); if (v) renderDrawer(v); }
    });
    FD.data.on('vessel', function (v) { if (!state.needFullRefresh) FD.map.upsertVessel(v); });
  }
  function startDemo() {
    state.needFullRefresh = true;
    FD.data.loadDemo();
    els.banner.hidden = false;
  }
  function startLive(key) {
    state.needFullRefresh = true;
    els.banner.hidden = true;
    FD.map.setVessels([]);
    FD.data.disconnect();
    FD.data.connect({ apiKey: key });
  }
  function applyConnection() {
    var k = loadKeys();
    if (k.aisstream && !k.demo) startLive(k.aisstream); else startDemo();
  }

  // ---------------------------------------------------------------- vessel drawer
  function fmt(v, suffix, digits) { return (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) ? '—' : (typeof v === 'number' && digits != null ? v.toFixed(digits) : v) + (suffix || ''); }
  function ago(ts) {
    if (!ts) return '—';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago';
  }
  function renderDrawer(v) {
    state.selected = v;
    var ladenPill = v.laden === true ? '<span class="fd-pill laden">LADEN</span>' : v.laden === false ? '<span class="fd-pill ballast">BALLAST</span>' : '<span class="fd-pill">UNKNOWN</span>';
    els.drawer.innerHTML =
      '<div class="fd-drawer-head"><h2>' + esc(v.name || 'MMSI ' + v.mmsi) + '<span class="sub">' + esc(v.typeLabel || 'Vessel') + (v.flag ? ' · ' + esc(v.flag) : '') + (v.shipType != null ? ' · AIS ' + esc(v.shipType) : '') + '</span></h2>' +
      '<button class="x" title="Close (Esc)" aria-label="Close">×</button></div>' +
      '<dl class="fd-kv">' +
      '<dt>State</dt><dd>' + ladenPill + (v.chokePoint ? ' <span class="fd-pill choke">' + esc(v.chokePoint) + '</span>' : '') + '</dd>' +
      '<dt>SOG / COG</dt><dd>' + fmt(v.sog, ' kn', 1) + ' / ' + fmt(v.cog, '°', 0) + (v.heading != null ? ' (hdg ' + fmt(v.heading, '°', 0) + ')' : '') + '</dd>' +
      '<dt>Draught</dt><dd>' + fmt(v.draught, ' m', 1) + (v.maxDraught ? ' / max ' + fmt(v.maxDraught, ' m', 1) : '') + '</dd>' +
      '<dt>Destination</dt><dd>' + esc(fmt(v.destination)) + '</dd>' +
      '<dt>ETA</dt><dd>' + esc(fmt(v.eta)) + '</dd>' +
      '<dt>Position</dt><dd>' + fmt(v.lat, '', 3) + ', ' + fmt(v.lon, '', 3) + '</dd>' +
      '<dt>Last seen</dt><dd>' + ago(v.lastSeen) + '</dd>' +
      '<dt>MMSI / IMO</dt><dd>' + esc(v.mmsi) + ' / ' + esc(fmt(v.imo)) + '</dd>' +
      '</dl>';
    els.drawer.querySelector('.x').addEventListener('click', closeDrawer);
    els.drawer.classList.add('open');
  }
  function closeDrawer() {
    state.selected = null;
    els.drawer.classList.remove('open');
    if (FD.map && FD.map.select) { try { FD.map.select(null); } catch (e) {} }
  }

  // ---------------------------------------------------------------- SPLC plotting
  function plotEntities(entities) {
    var map = FD.map.getMap(); if (!map || !window.L) return;
    if (!state.splcLayer) state.splcLayer = L.layerGroup().addTo(map);
    state.splcLayer.clearLayers();
    var pts = [];
    (entities || []).forEach(function (e) {
      if (!e.hq || typeof e.hq.lat !== 'number') return;
      var role = e.role || 'entity';
      var icon = L.divIcon({ className: 'fd-splc-marker ' + role, iconSize: role === 'root' ? [16, 16] : [12, 12] });
      var m = L.marker([e.hq.lat, e.hq.lon], { icon: icon, zIndexOffset: 1000 });
      m.bindTooltip('<div class="fd-splc-tip"><b>' + esc(e.ticker || e.name) + '</b> ' + esc(e.name) + '<br>' + esc(role.toUpperCase()) +
        (e.exposurePct != null ? ' · ' + e.exposurePct + '%' : '') + ' · ' + esc(e.hq.city || '') + '</div>', { className: 'fd-splc-tt', direction: 'top', offset: [0, -8] });
      m.on('click', function () { if (FD.splc && e.ticker) { showTab('splc'); FD.splc.lookup(e.ticker); } });
      state.splcLayer.addLayer(m); pts.push([e.hq.lat, e.hq.lon]);
    });
    if (pts.length) { try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 6 }); } catch (e) {} }
    if (isPhone()) { try { els.mapwrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    setHint('plotted ' + pts.length + ' HQ', 'ok');
  }
  function clearPlot() { if (state.splcLayer) state.splcLayer.clearLayers(); }

  // ---------------------------------------------------------------- commands
  var COMMANDS = [
    ['MAP', 'Show map, clear vessel filter'],
    ['TANK', 'Map, tankers only'],
    ['GAS', 'Map, LNG/LPG carriers only'],
    ['PX', 'Prices panel'],
    ['NEWS', 'News panel'],
    ['WL', 'Watchlist panel'],
    ['SPLC <TICKER>', 'Supply-chain graph for a ticker (e.g. SPLC WMT)'],
    ['GO <PRESET>', 'Fly map to a preset: ' + (FD.map && FD.map.presets ? FD.map.presets.map(function (p) { return p.id; }).join(', ') : 'world, gulf, hormuz, …')],
    ['CHOKE', 'Choke-point table'],
    ['CLEAR', 'Remove SPLC markers from the map'],
    ['SET', 'Settings (API keys, demo mode)'],
    ['HELP', 'This list']
  ];
  function showMap() {
    if (isPhone()) { try { els.mapwrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    FD.map.invalidateSize();
  }
  function run(raw) {
    var line = String(raw || '').trim(); if (!line) return false;
    var parts = line.split(/\s+/), cmd = parts[0].toUpperCase(), arg = parts.slice(1).join(' ');
    closeModals();
    switch (cmd) {
      case 'MAP': FD.map.setFilter({ types: null, laden: 'all', minSog: 0 }); showMap(); setHint('map · all vessels', 'ok'); return true;
      case 'TANK': case 'TANKER': case 'TANKERS': FD.map.setFilter({ types: ['tanker'], laden: 'all' }); showMap(); setHint('map · tankers', 'ok'); return true;
      case 'GAS': case 'LNG': FD.map.setFilter({ types: ['gas'], laden: 'all' }); showMap(); setHint('map · gas carriers', 'ok'); return true;
      case 'LADEN': FD.map.setFilter({ types: ['tanker'], laden: 'laden' }); showMap(); setHint('map · laden tankers', 'ok'); return true;
      case 'BALLAST': FD.map.setFilter({ types: ['tanker'], laden: 'ballast' }); showMap(); setHint('map · ballast tankers', 'ok'); return true;
      case 'PX': case 'PRICES': scrollToSection('prices'); return true;
      case 'NEWS': scrollToSection('news'); return true;
      case 'WL': case 'WATCH': case 'WATCHLIST': scrollToSection('watch'); return true;
      case 'CHOKE': showTab('choke'); return true;
      case 'CLEAR': clearPlot(); setHint('cleared', 'ok'); return true;
      case 'SPLC':
        showTab('splc');
        if (arg && FD.splc) { FD.splc.lookup(arg); setHint('SPLC ' + arg.toUpperCase(), 'ok'); }
        else { var inp = els.panes.splc.querySelector('input'); if (inp) inp.focus(); }
        return true;
      case 'GO':
        if (!arg) { setHint('GO <preset>: ' + FD.map.presets.map(function (p) { return p.id; }).join(' '), 'err'); return false; }
        var pid = arg.toLowerCase().replace(/[^a-z]/g, '');
        var ok = FD.map.flyTo(pid);
        if (!ok) { var alias = { black: 'blacksea', north: 'northsea', us: 'usgulf', africa: 'westafrica', carib: 'caribbean' }[pid]; if (alias) ok = FD.map.flyTo(alias); }
        if (ok) { showMap(); setHint('→ ' + pid, 'ok'); }
        else setHint('unknown preset "' + pid + '"', 'err');
        return ok;
      case 'SET': case 'SETTINGS': openSettings(); return true;
      case 'HELP': case '?': openHelp(); return true;
      case 'DEMO': saveKeys({ demo: true }); applyConnection(); return true;
      case 'LIVE': saveKeys({ demo: false }); applyConnection(); return true;
      default:
        setHint('unknown "' + cmd + '" — try HELP', 'err');
        return false;
    }
  }

  // ---------------------------------------------------------------- modals
  function closeModals() { els.settingsBg.classList.remove('open'); els.helpBg.classList.remove('open'); }
  function openHelp() {
    els.helpBg.innerHTML = '';
    var list = h('ul', { class: 'fd-help-list' }, COMMANDS.map(function (c) { return h('li', null, [h('code', { text: c[0] }), h('span', { text: c[1] })]); }));
    els.helpBg.appendChild(h('div', { class: 'fd-modal', role: 'dialog', 'aria-label': 'Commands' }, [
      h('h2', null, ['COMMANDS', h('button', { class: 'x', text: '×', 'aria-label': 'Close', onclick: closeModals })]),
      h('p', { class: 'lead', text: 'Type a command in the bar and press Enter. Commands are case-insensitive.' }),
      list,
      h('p', { class: 'fd-help-keys', html: '<kbd>/</kbd> focus command bar &nbsp; <kbd>Esc</kbd> close drawer / modal &nbsp; Click a vessel for details, hover for a tooltip.' })
    ]));
    els.helpBg.classList.add('open');
  }
  function field(label, name, value, opts) {
    opts = opts || {};
    var span = h('span', null, [label]);
    if (opts.link) span.appendChild(h('a', { href: opts.link, target: '_blank', rel: 'noopener', text: opts.linkText || 'get a free key' }));
    else if (opts.note) span.appendChild(h('em', { text: opts.note }));
    return h('label', { class: 'fd-field' }, [span, h('input', { type: opts.type || 'text', name: name, value: value || '', placeholder: opts.placeholder || '', autocomplete: 'off', spellcheck: 'false' })]);
  }
  function openSettings() {
    var k = loadKeys();
    var splcProxy = (FD.splc && FD.splc.getProxy && FD.splc.getProxy()) || k.splcProxy || '';
    els.settingsBg.innerHTML = '';
    var form = h('form', { class: 'fd-modal', role: 'dialog', 'aria-label': 'Settings' }, [
      h('h2', null, ['SETTINGS', h('button', { class: 'x', type: 'button', text: '×', 'aria-label': 'Close', onclick: closeModals })]),
      h('p', { class: 'lead', text: 'Keys are stored only in this browser (localStorage "fd.keys"). All are optional; without an AIS key the app runs on demo data.' }),
      field('aisstream.io API key (live AIS)', 'aisstream', k.aisstream, { link: 'https://aisstream.io/', placeholder: 'free key — live vessel positions' }),
      field('EIA API key (Brent/WTI spot)', 'eia', k.eia, { link: 'https://www.eia.gov/opendata/register.php', placeholder: 'optional' }),
      field('CARTO basemap key', 'carto', k.carto, { link: 'https://carto.com/basemaps/apikey', placeholder: 'optional — default basemap is keyless' }),
      field('SPLC proxy base URL (EDGAR)', 'splcProxy', splcProxy, { note: 'optional — seed data works without it', placeholder: 'https://your-proxy.example/sec', type: 'url' }),
      field('Finnhub key', 'finnhub', k.finnhub, { note: 'reserved — not wired yet', placeholder: 'stored only' }),
      h('label', { class: 'fd-check' }, [h('input', { type: 'checkbox', name: 'demo' }), 'Demo mode (synthetic vessels even when an AIS key is set)']),
      h('div', { class: 'fd-modal-actions' }, [
        h('button', { class: 'fd-btn-ghost', type: 'button', text: 'CANCEL', onclick: closeModals }),
        h('button', { class: 'fd-btn-primary', type: 'submit', text: 'SAVE' })
      ])
    ]);
    form.querySelector('[name="demo"]').checked = !!k.demo;
    form.addEventListener('submit', function (e) { e.preventDefault(); saveSettings(form); });
    els.settingsBg.appendChild(form);
    els.settingsBg.classList.add('open');
    setTimeout(function () { var i = form.querySelector('[name="aisstream"]'); if (i) i.focus(); }, 0);
  }
  function saveSettings(form) {
    var prev = loadKeys();
    var v = function (n) { var i = form.querySelector('[name="' + n + '"]'); return i ? i.value.trim() : ''; };
    var next = { aisstream: v('aisstream'), eia: v('eia'), carto: v('carto'), splcProxy: v('splcProxy'), finnhub: v('finnhub'), demo: form.querySelector('[name="demo"]').checked };
    saveKeys(next);
    // hand module-owned keys to their modules (markets merges into the same "fd.keys")
    if (FD.markets && FD.markets.setKeys) { try { FD.markets.setKeys({ eia: next.eia }); } catch (e) {} }
    if (FD.splc && FD.splc.setProxy && (next.splcProxy || '') !== (prev.splcProxy || '')) { try { FD.splc.setProxy(next.splcProxy); } catch (e) {} }
    if ((next.carto || '') !== (prev.carto || '')) { try { FD.map.setBasemap(next.carto ? 'carto' : 'esri', next.carto || undefined); } catch (e) {} }
    var connChanged = (next.aisstream || '') !== (prev.aisstream || '') || !!next.demo !== !!prev.demo;
    closeModals();
    if (connChanged) applyConnection();
    setHint('settings saved', 'ok');
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); els.cmdInput.focus(); els.cmdInput.select(); return; }
    if (e.key === 'Escape') {
      if (els.settingsBg.classList.contains('open') || els.helpBg.classList.contains('open')) { closeModals(); return; }
      if (els.drawer.classList.contains('open')) { closeDrawer(); return; }
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    build();
    document.title = 'FlowDeck';
    var keys = loadKeys();
    // map
    try {
      FD.map.mount(els.map, {
        onSelect: function (v) { if (v) renderDrawer(v); else closeDrawer(); },
        basemap: keys.carto ? 'carto' : 'esri', cartoKey: keys.carto || undefined
      });
    } catch (e) { console.error('[FD.shell] map mount failed', e); }
    // choke pane click
    els.chokeBody.addEventListener('click', onChokeClick);
    // side panel default tab
    showTab('markets');
    // SPLC proxy from keys (mirrors to module storage)
    if (keys.splcProxy && FD.splc && FD.splc.setProxy && !FD.splc.getProxy()) { try { FD.splc.setProxy(keys.splcProxy); } catch (e) {} }
    // data
    wireData();
    renderChokeTable();
    applyConnection();
    // clock
    setInterval(function () { els.stClock.textContent = utcClock(new Date()); }, 1000);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () { if (FD.map && FD.map.invalidateSize) FD.map.invalidateSize(); });
    renderStatus();
  }

  FD.shell = { run: run, openSettings: openSettings, help: openHelp, showTab: showTab, plot: plotEntities, state: state, keys: loadKeys, saveKeys: saveKeys };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
