/* FlowDeck — markets module (Agent C)
 * Attaches window.FD.markets = { mount, unmount, refresh, watchlist, setKeys, getKeys, symbols, state }
 * Pure browser JS, no deps. Client-only; all sources are public + CORS-reachable (see README.md).
 */
(function () {
  'use strict';
  window.FD = window.FD || {};

  // ---------------------------------------------------------------- config
  var REFRESH_MS = 60000;             // prices
  var NEWS_MIN_MS = 270000;           // feeds refetched at most every ~4.5 min (rss2json rate-limits)
  var FETCH_TIMEOUT_MS = 8000;        // direct calls
  var PROXY_TIMEOUT_MS = 25000;       // CORS passthroughs are slow (10-20s observed)
  var LS_WATCH = 'fd.watchlist';
  var LS_KEYS = 'fd.keys';
  var LS_CACHE = 'fd.markets.cache';   // last good quotes/news, painted instantly on load
  // CORS passthrough proxies (Yahoo/Stooq send no ACAO header). allorigins echoes the Origin header,
  // so it works from any http(s) origin but NOT from file:// — serve test.html over http.
  var PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); }
  ];

  // Symbol table: canonical id -> per-source tickers
  var SYMBOLS = [
    { id: 'BRENT', label: 'Brent', kind: 'cmdty', yahoo: 'BZ=F', stooq: 'br.f', eia: 'RBRTE', unit: '$/bbl' },
    { id: 'WTI',   label: 'WTI',   kind: 'cmdty', yahoo: 'CL=F', stooq: 'cl.f', eia: 'RWTC',  unit: '$/bbl' },
    { id: 'NG',    label: 'Henry Hub', kind: 'cmdty', yahoo: 'NG=F', stooq: 'ng.f', unit: '$/MMBtu' },
    { id: 'FRO',  label: 'Frontline',      kind: 'tanker', yahoo: 'FRO',  stooq: 'fro.us' },
    { id: 'STNG', label: 'Scorpio Tankers', kind: 'tanker', yahoo: 'STNG', stooq: 'stng.us' },
    { id: 'TNK',  label: 'Teekay Tankers', kind: 'tanker', yahoo: 'TNK',  stooq: 'tnk.us' },
    { id: 'DHT',  label: 'DHT Holdings',   kind: 'tanker', yahoo: 'DHT',  stooq: 'dht.us' },
    { id: 'INSW', label: 'Intl Seaways',   kind: 'tanker', yahoo: 'INSW', stooq: 'insw.us' },
    { id: 'NAT',  label: 'Nordic American', kind: 'tanker', yahoo: 'NAT', stooq: 'nat.us' },
    { id: 'XOM',  label: 'ExxonMobil', kind: 'major', yahoo: 'XOM',  stooq: 'xom.us' },
    { id: 'CVX',  label: 'Chevron',    kind: 'major', yahoo: 'CVX',  stooq: 'cvx.us' },
    { id: 'SHEL', label: 'Shell',      kind: 'major', yahoo: 'SHEL', stooq: 'shel.us' },
    { id: 'BP',   label: 'BP',         kind: 'major', yahoo: 'BP',   stooq: 'bp.us' }
  ];
  var FEEDS = [
    { name: 'OilPrice', url: 'https://oilprice.com/rss/main' },
    { name: 'gCaptain', url: 'https://gcaptain.com/feed/' },
    { name: 'EIA', url: 'https://www.eia.gov/rss/todayinenergy.xml' }
  ];

  // ---------------------------------------------------------------- state
  var state = {
    quotes: {},          // id -> {price, chg, pct, hist:[], src, t}
    news: [],            // [{title, link, source, date}]
    stamps: { prices: null, news: null, watch: null },
    errors: { prices: null, news: null },
    keys: {}
  };
  var root = null, els = {}, timer = null, inflight = null, pending = false;

  // ---------------------------------------------------------------- utils
  function safeGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function utcStamp(d) { return (d || new Date()).toISOString().slice(11, 19) + ' UTC'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, hint) {
    if (n == null || isNaN(n)) return '—';
    var d = hint != null ? hint : (Math.abs(n) < 10 ? 3 : 2);
    return Number(n).toFixed(d);
  }
  function signed(n, d, suffix) { if (n == null || isNaN(n)) return '—'; return (n > 0 ? '+' : '') + Number(n).toFixed(d) + (suffix || ''); }
  function relTime(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd';
  }
  function findSym(id) {
    id = String(id || '').toUpperCase();
    for (var i = 0; i < SYMBOLS.length; i++) if (SYMBOLS[i].id === id || SYMBOLS[i].yahoo === id) return SYMBOLS[i];
    return null;
  }
  function symFor(id) { // unknown tickers become ad-hoc equities on Yahoo
    return findSym(id) || { id: id.toUpperCase(), label: id.toUpperCase(), kind: 'custom', yahoo: id.toUpperCase(), stooq: id.toLowerCase() + '.us' };
  }

  function fetchT(url, opts, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || FETCH_TIMEOUT_MS);
    opts = opts || {}; if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }, function (e) { clearTimeout(t); throw e; });
  }
  // Try each proxy in order until one returns 2xx; resolves with the Response.
  function fetchProxied(url) {
    var i = 0;
    function next(err) {
      if (i >= PROXIES.length) return Promise.reject(err || new Error('proxies failed'));
      return fetchT(PROXIES[i++](url), null, PROXY_TIMEOUT_MS).catch(next);
    }
    return next();
  }

  // ---------------------------------------------------------------- price sources
  // Each source returns Promise<{ [id]: {price, chg, pct, hist, src} }> covering some subset.
  function srcYahooSpark(syms) {
    var tick = syms.map(function (s) { return s.yahoo; }).join(',');
    var url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=' + encodeURIComponent(tick) + '&range=1mo&interval=1d';
    return fetchProxied(url).then(function (r) { return r.json(); }).then(function (j) {
      var out = {}, res = (j && j.spark && j.spark.result) || [];
      res.forEach(function (row) {
        var resp = row.response && row.response[0]; if (!resp || !resp.meta) return;
        var s = syms.filter(function (x) { return x.yahoo === row.symbol; })[0]; if (!s) return;
        var m = resp.meta, closes = ((resp.indicators || {}).quote || [{}])[0].close || [];
        var hist = closes.filter(function (v) { return v != null; });
        var price = m.regularMarketPrice != null ? m.regularMarketPrice : hist[hist.length - 1];
        var pct = m.regularMarketChangePercent;
        var chg = (pct != null && price != null) ? price * pct / (100 + pct) : m.fulldayChange;
        if (pct == null && hist.length > 1) { chg = price - hist[hist.length - 2]; pct = chg / hist[hist.length - 2] * 100; }
        out[s.id] = { price: price, chg: chg, pct: pct, hist: hist, src: 'Yahoo', hint: m.priceHint };
      });
      if (!Object.keys(out).length) throw new Error('empty');
      return out;
    });
  }
  function srcYahooChart(syms) { // per-symbol fallback, same proxy
    return Promise.all(syms.map(function (s) {
      var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s.yahoo) + '?range=1mo&interval=1d';
      return fetchProxied(url).then(function (r) { return r.json(); }).then(function (j) {
        var res = j && j.chart && j.chart.result && j.chart.result[0]; if (!res) return null;
        var m = res.meta || {}, closes = ((res.indicators || {}).quote || [{}])[0].close || [];
        var hist = closes.filter(function (v) { return v != null; });
        var price = m.regularMarketPrice != null ? m.regularMarketPrice : hist[hist.length - 1];
        var pct = m.regularMarketChangePercent, chg = (pct != null && price != null) ? price * pct / (100 + pct) : m.fulldayChange;
        if (pct == null && hist.length > 1) { chg = price - hist[hist.length - 2]; pct = chg / hist[hist.length - 2] * 100; }
        return [s.id, { price: price, chg: chg, pct: pct, hist: hist, src: 'Yahoo', hint: m.priceHint }];
      }).catch(function () { return null; });
    })).then(function (rows) {
      var out = {}; rows.forEach(function (r) { if (r) out[r[0]] = r[1]; });
      if (!Object.keys(out).length) throw new Error('empty'); return out;
    });
  }
  function srcStooq(syms) { // last resort (unverified from sandbox; stooq blocks many hosts)
    var tick = syms.map(function (s) { return s.stooq; }).join(',');
    var url = 'https://stooq.com/q/l/?s=' + tick + '&f=sd2t2ohlcv&h&e=csv';
    return fetchProxied(url).then(function (r) { return r.text(); }).then(function (csv) {
      var out = {}, lines = csv.trim().split(/\r?\n/).slice(1);
      lines.forEach(function (ln) {
        var c = ln.split(','); if (c.length < 7) return;
        var s = syms.filter(function (x) { return x.stooq.toLowerCase() === c[0].toLowerCase(); })[0];
        var open = parseFloat(c[3]), close = parseFloat(c[6]);
        if (!s || isNaN(close)) return;
        out[s.id] = { price: close, chg: close - open, pct: (close - open) / open * 100, hist: [], src: 'Stooq' };
      });
      if (!Object.keys(out).length) throw new Error('empty'); return out;
    });
  }
  function srcEIA(syms) { // daily spot history for Brent/WTI when a key is present
    var key = state.keys.eia; var eias = syms.filter(function (s) { return s.eia; });
    if (!key || !eias.length) return Promise.resolve({});
    return Promise.all(eias.map(function (s) {
      var url = 'https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=' + encodeURIComponent(key) +
        '&frequency=daily&data[0]=value&facets[series][]=' + s.eia + '&sort[0][column]=period&sort[0][direction]=desc&length=30';
      return fetchT(url).then(function (r) { return r.json(); }).then(function (j) {
        var rows = (j && j.response && j.response.data) || []; if (!rows.length) return null;
        var hist = rows.map(function (d) { return parseFloat(d.value); }).filter(function (v) { return !isNaN(v); }).reverse();
        var last = hist[hist.length - 1], prev = hist[hist.length - 2];
        return [s.id, { price: last, chg: prev != null ? last - prev : null, pct: prev ? (last - prev) / prev * 100 : null, hist: hist, src: 'EIA spot', date: rows[0].period }];
      }).catch(function () { return null; });
    })).then(function (rows) { var out = {}; rows.forEach(function (r) { if (r) out[r[0]] = r[1]; }); return out; });
  }

  function fetchPrices(syms) {
    var chain = [srcYahooSpark, srcYahooChart, srcStooq];
    var i = 0;
    function next() {
      if (i >= chain.length) return Promise.reject(new Error('all sources failed'));
      var fn = chain[i++];
      return fn(syms).then(function (out) {
        var missing = syms.filter(function (s) { return !out[s.id]; });
        if (missing.length && i < chain.length) {
          return chain[i](missing).then(function (more) { Object.keys(more).forEach(function (k) { out[k] = more[k]; }); return out; }, function () { return out; });
        }
        return out;
      }, function () { return next(); });
    }
    return Promise.all([next(), srcEIA(syms)]).then(function (res) {
      var out = res[0], eia = res[1];
      Object.keys(eia).forEach(function (id) { // EIA overrides commodity spot when available
        var q = out[id]; out[id] = eia[id];
        if (q) out[id].futures = q; // keep futures quote for tooltip
      });
      return out;
    });
  }

  // ---------------------------------------------------------------- news
  function fetchFeed(f) {
    var url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(f.url);
    return fetchT(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.status !== 'ok') return [];
      return (j.items || []).map(function (it) {
        var t = Date.parse((it.pubDate || '').replace(' ', 'T') + (/(Z|[+-]\d\d:?\d\d)$/.test(it.pubDate || '') ? '' : 'Z'));
        return { title: it.title || '', link: it.link || '#', source: f.name, date: isNaN(t) ? Date.now() : t };
      });
    }).catch(function () { return []; });
  }
  function fetchNews() { // sequential: rss2json 429s on concurrent calls from one IP
    var lists = [];
    return FEEDS.reduce(function (p, f) {
      return p.then(function () { return fetchFeed(f); }).then(function (l) { lists.push(l); });
    }, Promise.resolve()).then(function () {
      var all = [].concat.apply([], lists);
      if (!all.length) throw new Error('no feeds');
      all.sort(function (a, b) { return b.date - a.date; });
      return all.slice(0, 40);
    });
  }

  // ---------------------------------------------------------------- watchlist
  var watchlist = {
    list: function () { var v = safeGet(LS_WATCH); return Array.isArray(v) ? v : []; },
    add: function (sym) {
      sym = String(sym || '').trim().toUpperCase().replace(/[^A-Z0-9.=\-^]/g, '');
      if (!sym) return false;
      var l = watchlist.list(); if (l.indexOf(sym) >= 0) return false;
      l.push(sym); safeSet(LS_WATCH, l); renderWatch(); refresh(); return true;
    },
    remove: function (sym) {
      var l = watchlist.list().filter(function (s) { return s !== String(sym).toUpperCase(); });
      safeSet(LS_WATCH, l); renderWatch(); return true;
    },
    clear: function () { safeSet(LS_WATCH, []); renderWatch(); }
  };

  // ---------------------------------------------------------------- cache
  function saveCache() { safeSet(LS_CACHE, { quotes: state.quotes, news: state.news, stamps: state.stamps }); }
  function loadCache() {
    var c = safeGet(LS_CACHE); if (!c || !c.quotes) return;
    state.quotes = c.quotes || {}; state.news = c.news || []; state.stamps = c.stamps || state.stamps; state.stale = true;
  }

  // ---------------------------------------------------------------- keys
  function loadKeys() { state.keys = safeGet(LS_KEYS) || {}; return state.keys; }
  function setKeys(k) {
    var cur = loadKeys();
    Object.keys(k || {}).forEach(function (n) { if (k[n]) cur[n] = String(k[n]).trim(); else delete cur[n]; });
    safeSet(LS_KEYS, cur); state.keys = cur;
    if (root) refresh();
    return cur;
  }

  // ---------------------------------------------------------------- render
  function sparkline(hist, up) {
    if (!hist || hist.length < 2) return '<svg class="fd-spark fd-spark-empty" viewBox="0 0 80 22" aria-hidden="true"><line x1="0" y1="11" x2="80" y2="11"/></svg>';
    var w = 80, h = 22, p = 2, min = Math.min.apply(null, hist), max = Math.max.apply(null, hist), rng = (max - min) || 1;
    var pts = hist.map(function (v, i) {
      var x = p + i * (w - 2 * p) / (hist.length - 1), y = h - p - (v - min) / rng * (h - 2 * p);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var cls = up === false ? 'dn' : (up ? 'up' : 'flat');
    return '<svg class="fd-spark ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '"/><circle r="1.8" cx="' + pts[pts.length - 1].split(',')[0] + '" cy="' + pts[pts.length - 1].split(',')[1] + '"/></svg>';
  }
  function priceRow(sym, q, opts) {
    opts = opts || {};
    var d = q ? (q.pct != null ? q.pct : q.chg) : null;
    var up = d != null ? (d > 0 ? true : d < 0 ? false : null) : null;
    var cls = up === true ? 'up' : up === false ? 'dn' : 'flat';
    var dec = q && q.hint != null ? Math.min(q.hint, 4) : undefined;
    var title = sym.label + (sym.unit ? ' · ' + sym.unit : '') + (q && q.src ? ' · ' + q.src : '') + (q && q.date ? ' ' + q.date : '');
    return '<div class="fd-row ' + cls + (q ? '' : ' na') + '" data-sym="' + esc(sym.id) + '" title="' + esc(title) + '">' +
      '<div class="fd-c-sym"><span class="fd-tick">' + esc(sym.id) + '</span><span class="fd-name">' + esc(sym.label) + '</span></div>' +
      '<div class="fd-c-num fd-last">' + (q ? fmt(q.price, dec) : '—') + '</div>' +
      '<div class="fd-c-num fd-chg">' + (q ? signed(q.chg, dec != null ? dec : 2) : '—') + '</div>' +
      '<div class="fd-c-num fd-pct">' + (q ? signed(q.pct, 2, '%') : '—') + '</div>' +
      '<div class="fd-c-spark">' + sparkline(q && q.hist, up) + '</div>' +
      (opts.removable ? '<button class="fd-rm" data-rm="' + esc(sym.id) + '" title="Remove" aria-label="Remove ' + esc(sym.id) + '">×</button>' : '') +
      '</div>';
  }
  function header(extra) {
    return '<div class="fd-row fd-head"><div class="fd-c-sym">SYMBOL</div><div class="fd-c-num">LAST</div><div class="fd-c-num">CHG</div><div class="fd-c-num">CHG%</div><div class="fd-c-spark">30D</div>' + (extra ? '<div class="fd-rm-ph"></div>' : '') + '</div>';
  }
  function stamp(section) {
    var s = state.stamps[section]; return s ? 'updated ' + utcStamp(new Date(s)) : 'waiting…';
  }
  function status(el, msg, kind) { if (!el) return; el.textContent = msg; el.className = 'fd-status' + (kind ? ' ' + kind : ''); }

  function renderPrices() {
    if (!els.prices) return;
    var html = header(false), groups = { cmdty: 'CRUDE & GAS', tanker: 'TANKERS', major: 'MAJORS' }, seen = {};
    SYMBOLS.forEach(function (s) {
      if (!seen[s.kind]) { seen[s.kind] = 1; html += '<div class="fd-group">' + groups[s.kind] + '</div>'; }
      html += priceRow(s, state.quotes[s.id]);
    });
    els.prices.innerHTML = html;
    status(els.pricesStatus, state.errors.prices ? 'source unavailable — ' + state.errors.prices : stamp('prices') + (state.stale && inflight ? ' · refreshing' : ''), state.errors.prices ? 'err' : '');
  }
  function renderNews() {
    if (!els.news) return;
    if (state.errors.news) { els.news.innerHTML = '<div class="fd-empty">source unavailable — ' + esc(state.errors.news) + '</div>'; }
    else if (!state.news.length) { els.news.innerHTML = '<div class="fd-empty">loading feeds…</div>'; }
    else {
      els.news.innerHTML = state.news.map(function (n) {
        return '<a class="fd-news-item" href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="fd-news-title">' + esc(n.title) + '</span>' +
          '<span class="fd-news-meta"><span class="fd-news-src">' + esc(n.source) + '</span><span class="fd-news-time">' + relTime(n.date) + '</span></span></a>';
      }).join('');
    }
    status(els.newsStatus, state.errors.news ? 'source unavailable' : stamp('news') + (state.stale ? ' (stale)' : ''), state.errors.news ? 'err' : '');
  }
  function renderWatch() {
    if (!els.watch) return;
    var l = watchlist.list();
    if (!l.length) { els.watch.innerHTML = '<div class="fd-empty">no symbols — add a ticker above (e.g. VLO, TRMD, GLNG)</div>'; }
    else {
      els.watch.innerHTML = header(true) + l.map(function (id) { return priceRow(symFor(id), state.quotes[id.toUpperCase()], { removable: true }); }).join('');
    }
    status(els.watchStatus, l.length ? stamp('prices') : '');
  }
  function renderAll() { renderPrices(); renderNews(); renderWatch(); }

  // ---------------------------------------------------------------- refresh
  function refresh(opts) {
    opts = opts || {};
    if (!root) return Promise.resolve();
    if (inflight) { pending = true; return inflight; }
    var syms = SYMBOLS.slice();
    watchlist.list().forEach(function (id) { if (!findSym(id)) syms.push(symFor(id)); });
    var pP = fetchPrices(syms).then(function (out) {
      Object.keys(out).forEach(function (k) { state.quotes[k] = out[k]; });
      state.stamps.prices = Date.now(); state.errors.prices = null; saveCache();
      var miss = syms.filter(function (s) { return !out[s.id]; });
      if (miss.length === syms.length) state.errors.prices = 'no quotes returned';
    }, function (e) { state.errors.prices = (e && e.message) || 'fetch failed'; })
      .then(function () { renderPrices(); renderWatch(); });
    var newsDue = opts.force || !state.stamps.news || (Date.now() - state.stamps.news) > NEWS_MIN_MS;
    var nP = (newsDue ? fetchNews() : Promise.resolve(state.news)).then(function (items) { state.news = items; if (newsDue) { state.stamps.news = Date.now(); saveCache(); } state.errors.news = null; state.stale = false; },
      function (e) { if (!state.news.length) state.errors.news = (e && e.message) || 'fetch failed'; else state.stale = true; }).then(renderNews);
    inflight = Promise.all([pP, nP]).then(function () { inflight = null; if (pending) { pending = false; refresh(); } });
    return inflight;
  }

  // ---------------------------------------------------------------- mount
  function mount(containerEl) {
    if (!containerEl) throw new Error('FD.markets.mount: container required');
    unmount();
    root = containerEl; loadKeys(); loadCache();
    root.classList.add('fd-markets');
    root.innerHTML =
      '<section class="fd-sec" data-sec="prices"><div class="fd-sec-head"><h3>PRICES</h3><span class="fd-status" data-st="prices">waiting…</span><button class="fd-btn fd-refresh" title="Refresh">↻</button></div><div class="fd-grid" data-grid="prices"></div></section>' +
      '<section class="fd-sec" data-sec="news"><div class="fd-sec-head"><h3>NEWS</h3><span class="fd-status" data-st="news">waiting…</span></div><div class="fd-news" data-grid="news"></div></section>' +
      '<section class="fd-sec" data-sec="watch"><div class="fd-sec-head"><h3>WATCHLIST</h3><span class="fd-status" data-st="watch"></span></div>' +
      '<form class="fd-watch-form" autocomplete="off"><input class="fd-input" name="sym" placeholder="ticker (e.g. VLO)" maxlength="12" spellcheck="false" aria-label="Add symbol"><button class="fd-btn fd-add" type="submit">ADD</button></form>' +
      '<div class="fd-grid" data-grid="watch"></div></section>';
    els = {
      prices: root.querySelector('[data-grid="prices"]'), pricesStatus: root.querySelector('[data-st="prices"]'),
      news: root.querySelector('[data-grid="news"]'), newsStatus: root.querySelector('[data-st="news"]'),
      watch: root.querySelector('[data-grid="watch"]'), watchStatus: root.querySelector('[data-st="watch"]'),
      form: root.querySelector('.fd-watch-form')
    };
    root.addEventListener('click', onClick);
    els.form.addEventListener('submit', onSubmit);
    renderAll();
    refresh();
    timer = setInterval(function () { if (document.hidden) return; refresh(); }, REFRESH_MS);
    return api;
  }
  function onClick(e) {
    var rm = e.target.closest && e.target.closest('[data-rm]');
    if (rm) { e.preventDefault(); watchlist.remove(rm.getAttribute('data-rm')); return; }
    if (e.target.closest && e.target.closest('.fd-refresh')) { e.preventDefault(); refresh({ force: true }); }
  }
  function onSubmit(e) {
    e.preventDefault(); var inp = els.form.querySelector('input'); watchlist.add(inp.value); inp.value = ''; inp.focus();
  }
  function unmount() {
    if (timer) { clearInterval(timer); timer = null; }
    if (root) { root.removeEventListener('click', onClick); root.classList.remove('fd-markets'); root.innerHTML = ''; }
    root = null; els = {};
  }

  var api = {
    mount: mount, unmount: unmount, refresh: refresh, watchlist: watchlist,
    setKeys: setKeys, getKeys: loadKeys, symbols: SYMBOLS, state: state,
    quote: function (id) { return state.quotes[String(id).toUpperCase()] || null; }
  };
  window.FD.markets = api;
})();
