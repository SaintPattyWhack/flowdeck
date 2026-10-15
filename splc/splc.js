/* FlowDeck — SPLC module (Agent E): company supply-chain graph.
 * Public API on window.FD.splc:
 *   mount(containerEl, { onEntity(entity), onPlot(entities) })
 *   lookup(tickerOrName) -> Promise<graph>
 *   graph() -> {root:{cik,ticker,name,hq}, suppliers:[rel], customers:[rel], peers:[entity]}
 *   setProxy(base) / getProxy()   // localStorage "fd.splcProxy"
 * Data: FD.splcSeed (seed.js) is the default path. Live EDGAR lookups run only when a
 * CORS proxy base is configured (see README for why), except data.sec.gov submissions,
 * which browsers can reach directly.
 */
(function () {
  window.FD = window.FD || {};
  var SEED = FD.splcSeed || { entities: {}, rels: [], peers: {}, meta: { label: "no seed loaded" } };
  var LS_PROXY = "fd.splcProxy";
  var UA_NOTE = "FlowDeck research patrickmoon7@gmail.com";
  var SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";
  var SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK";
  var SEC_EFTS = "https://efts.sec.gov/LATEST/search-index";

  var state = {
    el: null, opts: {}, root: null, graph: null, status: "",
    liveTickers: null,      // [{ticker,name,cik}] when company_tickers.json was reachable
    cache: {},              // ticker -> graph
    acIndex: -1
  };

  /* ---------------- settings ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function getProxy() { return (lsGet(LS_PROXY) || "").trim(); }
  function setProxy(base) { lsSet(LS_PROXY, base && base.trim() ? base.trim() : null); }
  function viaProxy(url) {
    var p = getProxy();
    if (!p) return null;
    return p + (p.indexOf("?") >= 0 ? "&" : "?") + "url=" + encodeURIComponent(url);
  }

  /* ---------------- helpers ---------------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function esc(s) { return String(s == null ? "" : s); }
  function padCik(cik) { var s = String(cik); while (s.length < 10) s = "0" + s; return s; }
  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }

  /* ---------------- resolution ---------------- */
  function seedEntity(tk) { return SEED.entities[tk] || null; }
  function seedTickerFor(nameOrTicker) {
    var q = esc(nameOrTicker).trim().toUpperCase();
    if (!q) return null;
    if (SEED.entities[q]) return q;
    var hit = null;
    Object.keys(SEED.entities).forEach(function (tk) {
      var n = SEED.entities[tk].name.toUpperCase();
      if (!hit && (n === q || n.indexOf(q) === 0)) hit = tk;
    });
    return hit;
  }
  function searchIndex(q) {
    q = esc(q).trim().toUpperCase();
    if (!q) return [];
    var out = [], seen = {};
    var push = function (tk, name, src) { if (!seen[tk]) { seen[tk] = 1; out.push({ ticker: tk, name: name, src: src }); } };
    Object.keys(SEED.entities).forEach(function (tk) {
      var e = SEED.entities[tk];
      if (tk.indexOf(q) === 0) push(tk, e.name, "seed");
    });
    Object.keys(SEED.entities).forEach(function (tk) {
      var e = SEED.entities[tk];
      if (e.name.toUpperCase().indexOf(q) >= 0) push(tk, e.name, "seed");
    });
    if (state.liveTickers) {
      for (var i = 0; i < state.liveTickers.length && out.length < 12; i++) {
        var t = state.liveTickers[i];
        if (t.ticker.indexOf(q) === 0 || (q.length >= 3 && t.name.toUpperCase().indexOf(q) >= 0)) push(t.ticker, t.name, "edgar");
      }
    }
    return out.slice(0, 12);
  }
  function loadLiveTickers() {
    // www.sec.gov blocks browser UAs (403, no CORS); only try through a proxy.
    var url = viaProxy(SEC_TICKERS);
    if (!url || state.liveTickers) return Promise.resolve(state.liveTickers);
    return fetchJson(url, 15000).then(function (j) {
      var arr = Object.keys(j).map(function (k) { return { ticker: j[k].ticker, name: j[k].title, cik: j[k].cik_str }; });
      state.liveTickers = arr;
      setStatus("edgar ticker index loaded (" + arr.length + ")");
      return arr;
    }).catch(function (e) { setStatus("ticker index unavailable via proxy: " + e.message, true); return null; });
  }

  /* ---------------- graph building ---------------- */
  function relToNode(rel, counterpartTk, role) {
    var e = seedEntity(counterpartTk) || { cik: null, ticker: counterpartTk, name: counterpartTk, hq: null };
    return {
      cik: e.cik, ticker: e.ticker, name: e.name, role: role,
      exposurePct: rel.pct == null ? null : rel.pct,
      basis: rel.basis || "",
      evidence: [{ source: rel.evidence.source, snippet: rel.evidence.snippet, url: rel.evidence.url }],
      note: rel.note || null,
      hq: e.hq || null,
      inSeed: !!SEED.entities[counterpartTk]
    };
  }
  function buildSeedGraph(tk) {
    var root = seedEntity(tk);
    if (!root) return null;
    var suppliers = [], customers = [];
    SEED.rels.forEach(function (rel) {
      if (rel.to === tk) suppliers.push(relToNode(rel, rel.from, "supplier"));
      if (rel.from === tk) customers.push(relToNode(rel, rel.to, "customer"));
    });
    var byPct = function (a, b) { return (b.exposurePct || 0) - (a.exposurePct || 0) || a.ticker.localeCompare(b.ticker); };
    suppliers.sort(byPct); customers.sort(byPct);
    var peers = (SEED.peers[tk] || []).map(function (p) { return seedEntity(p); }).filter(Boolean);
    return { root: { cik: root.cik, ticker: root.ticker, name: root.name, hq: root.hq }, suppliers: suppliers, customers: customers, peers: peers, source: "seed" };
  }
  // Live: EDGAR full-text search for other filers' 10-Ks naming the root as a customer.
  function liveAugment(graph) {
    var p = getProxy();
    if (!p || !graph) return Promise.resolve(graph);
    var name = graph.root.name.replace(/[,.]?\s*(Inc|Corp|Co|Company|plc|Ltd)\.?$/i, "").trim();
    var q = '"' + name + '" "accounted for" "net sales"';
    var url = viaProxy(SEC_EFTS + "?q=" + encodeURIComponent(q) + "&forms=10-K&dateRange=custom&startdt=" + yearsAgo(2) + "&enddt=" + today());
    setStatus("querying EDGAR full-text search via proxy…");
    return fetchJson(url, 20000).then(function (j) {
      var hits = (j.hits && j.hits.hits) || [];
      var have = {}; graph.suppliers.forEach(function (s) { have[s.cik] = 1; });
      have[graph.root.cik] = 1;
      hits.forEach(function (hit) {
        var s = hit._source || {};
        var cik = parseInt((s.ciks || [])[0], 10);
        if (!cik || have[cik]) return;
        have[cik] = 1;
        var dn = (s.display_names || [""])[0];
        var m = /^(.*?)\s+\(([A-Z.\-]+)(?:,.*?)?\)\s+\(CIK/.exec(dn);
        var acc = (s.adsh || "").replace(/-/g, "");
        var doc = (hit._id || "").split(":")[1] || "";
        graph.suppliers.push({
          cik: cik, ticker: m ? m[2] : "", name: m ? m[1] : dn.split("  (")[0], role: "supplier",
          exposurePct: null, basis: "10-K names " + graph.root.ticker + " near \"accounted for\" (unverified)",
          evidence: [{ source: s.form + " " + s.file_date, snippet: "Full-text search hit; open filing to confirm percentage.", url: "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + acc + "/" + doc }],
          hq: null, inSeed: false, live: true
        });
      });
      graph.source = "seed+edgar";
      setStatus("seed + " + hits.length + " EDGAR full-text hits");
      return graph;
    }).catch(function (e) { setStatus("EDGAR search failed: " + e.message, true); return graph; });
  }
  function liveRoot(ticker) {
    // Non-seed ticker: resolve via ticker index (needs proxy) then data.sec.gov (direct OK).
    var t = (state.liveTickers || []).filter(function (x) { return x.ticker === ticker; })[0];
    if (!t) return Promise.reject(new Error(ticker + " not in seed; add a proxy to resolve via EDGAR"));
    var url = SEC_SUBMISSIONS + padCik(t.cik) + ".json";
    return fetchJson(url, 10000).then(function (sub) {
      var a = (sub.addresses && sub.addresses.business) || {};
      return { root: { cik: t.cik, ticker: ticker, name: sub.name || t.name, hq: null, city: [a.city, a.stateOrCountry].filter(Boolean).join(", ") },
               suppliers: [], customers: [], peers: [], source: "edgar" };
    });
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function yearsAgo(n) { var d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); }

  function lookup(q) {
    var tk = seedTickerFor(q) || esc(q).trim().toUpperCase();
    if (state.cache[tk]) { state.root = tk; state.graph = state.cache[tk]; render(); return Promise.resolve(state.graph); }
    setStatus("loading " + tk + "…");
    var g = buildSeedGraph(tk);
    var p = g ? liveAugment(g) : loadLiveTickers().then(function () { return liveRoot(tk); }).then(liveAugment);
    return p.then(function (graph) {
      state.root = tk; state.graph = graph; state.cache[tk] = graph;
      if (graph.source === "seed") setStatus(SEED.meta.label + " · " + graph.suppliers.length + " suppliers / " + graph.customers.length + " customers");
      render();
      return graph;
    }).catch(function (e) { setStatus(e.message, true); return null; });
  }

  /* ---------------- rendering ---------------- */
  function setStatus(msg, isErr) {
    state.status = msg;
    var el = state.el && state.el.querySelector(".fd-splc-status");
    if (el) { el.textContent = msg; el.className = "fd-splc-status" + (isErr ? " err" : ""); }
  }
  function plottable(graph) {
    var out = [], seen = {};
    var add = function (n, role) { if (n && n.hq && !seen[n.ticker]) { seen[n.ticker] = 1; out.push({ cik: n.cik, ticker: n.ticker, name: n.name, role: role, hq: n.hq, exposurePct: n.exposurePct == null ? null : n.exposurePct }); } };
    add(graph.root, "root"); graph.suppliers.forEach(function (s) { add(s, "supplier"); }); graph.customers.forEach(function (c) { add(c, "customer"); });
    return out;
  }
  function rowEl(n, colRole) {
    var pct = n.exposurePct;
    var row = h("div", { class: "fd-splc-row" + (n.live ? " live" : ""), onclick: function (ev) {
      if (ev.target.closest && ev.target.closest("a")) return;
      if (ev.target.classList.contains("fd-splc-evtoggle")) { row.classList.toggle("open"); return; }
      if (state.opts.onEntity) try { state.opts.onEntity(n); } catch (e) {}
      if (n.inSeed || (state.liveTickers && n.ticker)) lookup(n.ticker); else row.classList.toggle("open");
    } }, [
      h("span", { class: "tk" + (n.inSeed ? "" : " nolink"), text: n.ticker || "—" }),
      h("span", { class: "nm", title: n.name }, [n.name, h("div", { class: "basis", text: n.basis })]),
      h("span", { class: "pct" + (pct == null ? " na" : ""), text: pct == null ? "n/a" : pct.toFixed(pct % 1 ? 1 : 0) + "%" }),
      h("div", { class: "fd-splc-bar-wrap" }, [h("div", { class: "fd-splc-bar-fill", style: "width:" + Math.min(100, pct || 0) + "%" })]),
      h("div", { class: "fd-splc-ev" }, [
        h("q", { text: n.evidence[0].snippet }), " — ",
        h("a", { href: n.evidence[0].url, target: "_blank", rel: "noopener", text: n.evidence[0].source }),
        n.note ? h("div", { text: "note: " + n.note }) : null,
        n.hq ? h("div", { text: "HQ " + n.hq.city }) : null
      ])
    ]);
    row.querySelector(".pct").classList.add("fd-splc-evtoggle");
    row.querySelector(".pct").title = "show evidence";
    return row;
  }
  function colEl(title, role, list) {
    var col = h("div", { class: "fd-splc-col " + (role === "supplier" ? "sup" : "cus") }, [
      h("h3", {}, [title, h("span", { class: "cnt", text: list.length + (role === "supplier" ? " · % = supplier's sales to root" : " · % = root's sales to customer") })])
    ]);
    if (!list.length) col.appendChild(h("div", { class: "fd-splc-empty", text: "none in " + SEED.meta.label + (getProxy() ? "" : " — add a proxy for live EDGAR search") }));
    list.forEach(function (n) { col.appendChild(rowEl(n, role)); });
    return col;
  }
  function miniGraph(graph) {
    var W = 640, PAD = 70, rowH = 22;
    var sup = graph.suppliers.slice(0, 14), cus = graph.customers.slice(0, 14);
    var rows = Math.max(sup.length, cus.length, 1);
    var H = Math.max(120, rows * rowH + 40);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "supply chain graph for " + graph.root.ticker });
    var cx = W / 2, cy = H / 2, lx = PAD, rx = W - PAD;
    var place = function (list, x, cls) {
      var start = cy - ((list.length - 1) * rowH) / 2;
      list.forEach(function (n, i) {
        var y = start + i * rowH;
        var c1 = cls === "sup" ? x + 60 : x - 60, c2 = cls === "sup" ? cx - 60 : cx + 60;
        var e = svgEl("path", { class: "edge " + cls, d: "M" + x + "," + y + " C" + c1 + "," + y + " " + c2 + "," + cy + " " + cx + "," + cy });
        if (n.exposurePct != null) e.setAttribute("stroke-width", String(1 + Math.min(4, n.exposurePct / 15)));
        svg.appendChild(e);
      });
      list.forEach(function (n, i) {
        var y = start + i * rowH;
        var g = svgEl("g", { class: "node " + cls, transform: "translate(" + x + "," + y + ")" });
        g.appendChild(svgEl("circle", { r: 4 }));
        var t = svgEl("text", { x: cls === "sup" ? -8 : 8, y: 3, "text-anchor": cls === "sup" ? "end" : "start" });
        t.textContent = (n.ticker || n.name.slice(0, 10)) + (n.exposurePct != null ? " " + n.exposurePct + "%" : "");
        g.appendChild(t);
        g.appendChild(svgEl("title", {})).textContent = n.name;
        g.addEventListener("click", function () { if (n.inSeed) lookup(n.ticker); });
        svg.appendChild(g);
      });
    };
    place(sup, lx, "sup"); place(cus, rx, "cus");
    var root = svgEl("g", { class: "node root", transform: "translate(" + cx + "," + cy + ")" });
    root.appendChild(svgEl("circle", { r: 22 }));
    var rt = svgEl("text", { "text-anchor": "middle", y: 4 }); rt.textContent = graph.root.ticker; root.appendChild(rt);
    svg.appendChild(root);
    var l1 = svgEl("text", { class: "lbl", x: lx, y: 12, "text-anchor": "start" }); l1.textContent = "SUPPLIERS"; svg.appendChild(l1);
    var l2 = svgEl("text", { class: "lbl", x: rx, y: 12, "text-anchor": "end" }); l2.textContent = "CUSTOMERS"; svg.appendChild(l2);
    if (graph.suppliers.length > sup.length || graph.customers.length > cus.length) {
      var more = svgEl("text", { class: "lbl", x: cx, y: H - 6, "text-anchor": "middle" }); more.textContent = "showing top 14 per side"; svg.appendChild(more);
    }
    return h("div", { class: "fd-splc-graph" }, [svg]);
  }
  function render() {
    var el = state.el; if (!el) return;
    var body = el.querySelector(".fd-splc-body"); body.innerHTML = "";
    var g = state.graph;
    if (!g) { body.appendChild(h("div", { class: "fd-splc-empty", text: "Type a ticker (e.g. WMT, AAPL, NVDA) to load its supply chain." })); return; }
    var plot = plottable(g);
    var rootCard = h("div", { class: "fd-splc-root" }, [
      h("span", { class: "tk", text: g.root.ticker }),
      h("span", { class: "nm", text: g.root.name }),
      h("div", { class: "meta" }, [
        h("span", {}, ["CIK ", h("b", { text: g.root.cik == null ? "—" : padCik(g.root.cik) })]),
        h("span", {}, ["HQ ", h("b", { text: g.root.hq ? g.root.hq.city : (g.root.city || "—") })]),
        h("span", {}, ["SRC ", h("b", { text: g.source })])
      ]),
      h("div", { class: "actions" }, [
        h("button", { class: "fd-splc-primary", text: "PLOT " + plot.length, disabled: plot.length ? null : "disabled", onclick: function () { if (state.opts.onPlot) try { state.opts.onPlot(plot); } catch (e) {} } }),
        h("a", { href: g.root.cik ? "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + padCik(g.root.cik) + "&type=10-K" : "#", target: "_blank", rel: "noopener" }, [h("button", { text: "EDGAR" })])
      ]),
      g.peers && g.peers.length ? h("div", { class: "fd-splc-peers" }, ["PEERS "].concat(g.peers.map(function (p) { return h("a", { text: p.ticker, onclick: function () { lookup(p.ticker); } }); }))) : null
    ]);
    body.appendChild(rootCard);
    body.appendChild(miniGraph(g));
    body.appendChild(h("div", { class: "fd-splc-cols" }, [colEl("SUPPLIERS", "supplier", g.suppliers), colEl("CUSTOMERS", "customer", g.customers)]));
    body.appendChild(h("div", { class: "fd-splc-foot", text: SEED.meta.label + " · generated " + SEED.meta.generated + " · " + SEED.rels.length + " relationships / " + Object.keys(SEED.entities).length + " entities · click a row to re-root, click % for evidence" }));
    var inp = el.querySelector("input"); if (inp && document.activeElement !== inp) inp.value = g.root.ticker;
  }

  /* ---------------- autocomplete ---------------- */
  function bindSearch(el) {
    var inp = el.querySelector("input"), ac = el.querySelector(".fd-splc-ac");
    var items = [];
    var close = function () { ac.classList.remove("open"); state.acIndex = -1; };
    var open = function () {
      items = searchIndex(inp.value); ac.innerHTML = "";
      if (!items.length) return close();
      items.forEach(function (it, i) {
        ac.appendChild(h("div", { class: "fd-splc-ac-item" + (i === state.acIndex ? " active" : ""), onmousedown: function (ev) { ev.preventDefault(); inp.value = it.ticker; close(); lookup(it.ticker); } }, [
          h("span", { class: "t", text: it.ticker }), h("span", { class: "n", text: it.name }), h("span", { class: "s", text: it.src })
        ]));
      });
      ac.classList.add("open");
    };
    inp.addEventListener("input", function () { state.acIndex = -1; open(); });
    inp.addEventListener("focus", open);
    inp.addEventListener("blur", function () { setTimeout(close, 120); });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault(); if (!items.length) return;
        state.acIndex = (state.acIndex + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; open();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        var pick = state.acIndex >= 0 && items[state.acIndex] ? items[state.acIndex].ticker : inp.value;
        close(); if (pick.trim()) lookup(pick);
      } else if (ev.key === "Escape") { close(); inp.blur(); }
    });
  }

  /* ---------------- mount ---------------- */
  function mount(containerEl, opts) {
    state.el = containerEl; state.opts = opts || {};
    containerEl.classList.add("fd-splc");
    containerEl.innerHTML = "";
    var bar = h("div", { class: "fd-splc-bar" }, [
      h("span", { class: "fd-splc-tag", text: "SPLC" }),
      h("div", { class: "fd-splc-search" }, [
        h("input", { type: "text", placeholder: "ticker or company name…", autocomplete: "off", spellcheck: "false", "aria-label": "SPLC search" }),
        h("div", { class: "fd-splc-ac" })
      ]),
      h("button", { text: "GO", onclick: function () { var v = containerEl.querySelector("input").value; if (v.trim()) lookup(v); } }),
      h("button", { text: getProxy() ? "PROXY ✓" : "PROXY", title: "Set a CORS proxy base for live EDGAR lookups (stored in localStorage fd.splcProxy)", onclick: function () {
        var v = window.prompt("CORS proxy base URL for EDGAR (blank to clear). Proxy must forward ?url=… with User-Agent \"" + UA_NOTE + "\".", getProxy());
        if (v === null) return; setProxy(v); state.liveTickers = null; state.cache = {};
        this.textContent = getProxy() ? "PROXY ✓" : "PROXY"; setStatus(getProxy() ? "proxy set: " + getProxy() : "proxy cleared — seed dataset only");
        loadLiveTickers();
      } }),
      h("div", { class: "fd-splc-status", text: SEED.meta.label + " · " + Object.keys(SEED.entities).length + " entities" })
    ]);
    containerEl.appendChild(bar);
    containerEl.appendChild(h("div", { class: "fd-splc-body" }));
    bindSearch(containerEl);
    render();
    if (getProxy()) loadLiveTickers();
    return FD.splc;
  }

  FD.splc = {
    mount: mount, lookup: lookup,
    graph: function () { return state.graph; },
    setProxy: setProxy, getProxy: getProxy,
    search: searchIndex,
    seed: SEED
  };
})();
