/* FlowDeck data layer — window.FD.data
 * Plain browser JS, no dependencies. Provides an aisstream.io websocket client,
 * vessel store (merged PositionReport + ShipStaticData by MMSI), ship-type and
 * laden/ballast classification, flag-from-MMSI, choke-point membership, and a
 * synthetic demo feed. See README.md for the public API.
 */
(function () {
  'use strict';
  window.FD = window.FD || {};

  // ---------------------------------------------------------------- constants
  var WS_URL = 'wss://stream.aisstream.io/v0/stream';
  var WORLD_BBOX = [[-90, -180], [90, 180]];
  var PRUNE_MS = 30 * 60 * 1000;      // drop vessels unseen for 30 min
  var TICK_MS = 2000;                 // "tick" cadence
  var VESSEL_EVT_MS = 150;            // min gap between "vessel" events per MMSI
  var BACKOFF_MIN = 1000, BACKOFF_MAX = 30000;

  // MMSI Maritime Identification Digits (first 3 digits) -> ISO country. Major flag states.
  var MID = {
    636: 'LR', 351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA', 355: 'PA', 356: 'PA', 357: 'PA', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA',
    538: 'MH', 215: 'MT', 229: 'MT', 248: 'MT', 249: 'MT', 256: 'MT', 477: 'HK', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG',
    237: 'GR', 239: 'GR', 240: 'GR', 241: 'GR', 308: 'BS', 309: 'BS', 311: 'BS', 209: 'CY', 210: 'CY', 212: 'CY',
    257: 'NO', 258: 'NO', 259: 'NO', 232: 'GB', 233: 'GB', 234: 'GB', 235: 'GB', 303: 'US', 338: 'US', 366: 'US', 367: 'US', 368: 'US', 369: 'US',
    412: 'CN', 413: 'CN', 414: 'CN', 431: 'JP', 432: 'JP', 440: 'KR', 441: 'KR', 419: 'IN', 273: 'RU', 422: 'IR',
    403: 'SA', 470: 'AE', 471: 'AE', 271: 'TR', 247: 'IT', 219: 'DK', 220: 'DK', 244: 'NL', 245: 'NL', 246: 'NL',
    211: 'DE', 218: 'DE', 226: 'FR', 227: 'FR', 228: 'FR', 710: 'BR', 345: 'MX', 574: 'VN', 525: 'ID', 533: 'MY',
    567: 'TH', 548: 'PH', 416: 'TW'
  };

  // Choke points: hand-drawn polygons [lat, lon] bounding the real water bodies.
  var CHOKE_DEFS = [
    { id: 'hormuz', name: 'Strait of Hormuz', polygon: [[27.2, 55.4], [27.0, 56.8], [26.4, 57.2], [25.6, 57.3], [25.2, 56.9], [25.6, 56.3], [26.1, 55.7], [26.5, 55.2]] },
    { id: 'malacca', name: 'Strait of Malacca', polygon: [[6.2, 97.0], [6.0, 99.8], [3.9, 101.2], [2.0, 103.0], [1.0, 104.3], [0.8, 103.5], [1.9, 101.7], [3.6, 100.2], [5.0, 98.2], [5.7, 96.9]] },
    { id: 'suez', name: 'Suez Canal & Gulf of Suez', polygon: [[31.6, 32.1], [31.4, 32.6], [30.0, 32.7], [29.0, 32.9], [27.6, 34.2], [27.3, 33.8], [28.6, 32.8], [29.8, 32.2], [30.6, 32.1]] },
    { id: 'babelmandeb', name: 'Bab-el-Mandeb', polygon: [[14.2, 42.1], [13.9, 43.2], [12.9, 43.5], [12.2, 43.9], [11.8, 43.3], [12.4, 42.6], [13.2, 42.0], [13.8, 41.7]] },
    { id: 'bosphorus', name: 'Bosphorus', polygon: [[41.35, 28.95], [41.30, 29.25], [41.05, 29.20], [40.90, 29.10], [40.85, 28.85], [41.05, 28.90], [41.20, 28.95]] },
    { id: 'panama', name: 'Panama Canal', polygon: [[9.55, -80.05], [9.50, -79.65], [9.15, -79.55], [8.85, -79.35], [8.75, -79.60], [8.95, -79.95], [9.25, -80.10]] },
    { id: 'goodhope', name: 'Cape of Good Hope', polygon: [[-33.6, 16.6], [-33.9, 19.2], [-34.6, 21.0], [-35.9, 20.5], [-36.2, 18.5], [-35.5, 16.8], [-34.5, 16.3]] },
    { id: 'danish', name: 'Danish Straits', polygon: [[58.1, 10.3], [57.8, 11.9], [56.4, 12.9], [55.4, 13.0], [54.8, 12.0], [55.3, 10.4], [56.5, 10.2], [57.4, 10.0]] },
    { id: 'gibraltar', name: 'Strait of Gibraltar', polygon: [[36.2, -6.2], [36.3, -5.3], [36.1, -5.0], [35.7, -5.1], [35.75, -5.9], [35.85, -6.2], [36.0, -6.35]] }
  ];

  // ------------------------------------------------------------------- state
  var vessels = new Map();            // mmsi -> vessel
  var listeners = { status: [], vessel: [], tick: [] };
  var lastVesselEmit = new Map();     // mmsi -> ts of last "vessel" event
  var ws = null, wsOpts = null, wantLive = false, backoff = BACKOFF_MIN, reconnectTimer = null;
  var tickTimer = null, demoTimer = null, demoActive = false;
  var demoState = new Map();          // mmsi -> {lane, seg, fwd} (demo only)
  var statusState = { state: 'closed', msg: 'idle' };

  // ----------------------------------------------------------------- helpers
  function emit(evt, payload) {
    var fns = listeners[evt] || [];
    for (var i = 0; i < fns.length; i++) { try { fns[i](payload); } catch (e) { console.error('FD.data listener error', e); } }
  }
  function setStatus(state, msg) { statusState = { state: state, msg: msg || '' }; emit('status', statusState); }

  /** AIS ship type code -> label. */
  function typeLabel(code, name) {
    var n = (name || '').toUpperCase();
    if (/\b(LNG|LPG|GAS)\b/.test(n) || code === 84 || code === 85) return 'LNG/Gas';
    if (code >= 80 && code <= 89) return 'Tanker';
    if (code >= 70 && code <= 79) return 'Cargo';
    return 'Other';
  }

  /** Laden heuristic per PLAN.md. Returns true | false | null. */
  function inferLaden(v) {
    if (v.draught == null || v.draught <= 0) return null;
    if (v.maxDraught && v.maxDraught > 0) return v.draught >= 0.75 * v.maxDraught;
    if (v.typeLabel === 'Tanker' || v.typeLabel === 'LNG/Gas') {
      if (v.draught >= 12.0) return true;
      if (v.draught < 9.0) return false;
      return null;
    }
    if (v.draught >= 10.0) return true;
    if (v.draught < 6.5) return false;
    return null;
  }

  function flagFromMMSI(mmsi) { return MID[Math.floor(mmsi / 1000000)] || null; }

  /** Ray-casting point-in-polygon. polygon = [[lat,lon],...]. */
  function pointInPolygon(lat, lon, polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var yi = polygon[i][0], xi = polygon[i][1], yj = polygon[j][0], xj = polygon[j][1];
      var intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function chokeFor(lat, lon) {
    for (var i = 0; i < chokePoints.length; i++) {
      if (pointInPolygon(lat, lon, chokePoints[i].polygon)) return chokePoints[i].name;
    }
    return null;
  }

  var chokePoints = CHOKE_DEFS.map(function (c) {
    var lat = 0, lon = 0;
    c.polygon.forEach(function (p) { lat += p[0]; lon += p[1]; });
    return { id: c.id, name: c.name, polygon: c.polygon, center: [lat / c.polygon.length, lon / c.polygon.length], count: 0, tankerCount: 0 };
  });

  /** Recompute per-choke-point counts from the vessel store. */
  function recountChokes() {
    var byName = {};
    chokePoints.forEach(function (c) { c.count = 0; c.tankerCount = 0; byName[c.name] = c; });
    vessels.forEach(function (v) {
      if (!v.chokePoint) return;
      var c = byName[v.chokePoint]; if (!c) return;
      c.count++;
      if (v.typeLabel === 'Tanker' || v.typeLabel === 'LNG/Gas') c.tankerCount++;
    });
  }

  function computeStats() {
    var s = { count: vessels.size, tankers: 0, laden: 0, ballast: 0, chokePoints: [] };
    vessels.forEach(function (v) {
      if (v.typeLabel === 'Tanker' || v.typeLabel === 'LNG/Gas') {
        s.tankers++;
        if (v.laden === true) s.laden++; else if (v.laden === false) s.ballast++;
      }
    });
    s.chokePoints = chokePoints.map(function (c) { return { id: c.id, name: c.name, count: c.count, tankerCount: c.tankerCount }; });
    return s;
  }

  function prune(now) {
    vessels.forEach(function (v, k) { if (now - v.lastSeen > PRUNE_MS) vessels.delete(k); });
  }

  function tick() {
    var now = Date.now();
    prune(now);
    recountChokes();
    emit('tick', computeStats());
  }
  function startTick() { if (!tickTimer) tickTimer = setInterval(tick, TICK_MS); }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  /** Create-or-update a vessel and (throttled) emit "vessel". */
  function upsert(mmsi, patch, now) {
    var v = vessels.get(mmsi);
    if (!v) {
      v = { mmsi: mmsi, name: null, imo: null, lat: null, lon: null, cog: null, sog: null, heading: null,
            shipType: null, typeLabel: 'Other', draught: null, maxDraught: null, laden: null,
            destination: null, eta: null, lastSeen: now, flag: flagFromMMSI(mmsi), chokePoint: null };
      vessels.set(mmsi, v);
    }
    for (var k in patch) if (patch[k] !== undefined) v[k] = patch[k];
    v.lastSeen = now;
    v.typeLabel = typeLabel(v.shipType, v.name);
    v.laden = inferLaden(v);
    if (v.lat != null && v.lon != null) v.chokePoint = chokeFor(v.lat, v.lon);
    var last = lastVesselEmit.get(mmsi) || 0;
    if (now - last >= VESSEL_EVT_MS) { lastVesselEmit.set(mmsi, now); emit('vessel', v); }
    return v;
  }

  // -------------------------------------------------------- aisstream parsing
  function parseAis(raw) {
    var msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.MetaData) return;
    var meta = msg.MetaData, mmsi = Number(meta.MMSI);
    if (!mmsi) return;
    var now = Date.now();
    var patch = {};
    var metaName = (meta.ShipName || '').trim();
    if (metaName) patch.name = metaName;
    if (msg.MessageType === 'PositionReport' && msg.Message && msg.Message.PositionReport) {
      var p = msg.Message.PositionReport;
      patch.lat = p.Latitude != null ? p.Latitude : meta.latitude;
      patch.lon = p.Longitude != null ? p.Longitude : meta.longitude;
      if (typeof p.Cog === 'number' && p.Cog < 360) patch.cog = p.Cog;
      if (typeof p.Sog === 'number' && p.Sog < 102.3) patch.sog = p.Sog;
      if (typeof p.TrueHeading === 'number' && p.TrueHeading < 360) patch.heading = p.TrueHeading;
    } else if (msg.MessageType === 'ShipStaticData' && msg.Message && msg.Message.ShipStaticData) {
      var s = msg.Message.ShipStaticData;
      if (s.Name) patch.name = String(s.Name).trim();
      if (s.ImoNumber) patch.imo = s.ImoNumber;
      if (typeof s.Type === 'number') patch.shipType = s.Type;
      if (typeof s.MaximumStaticDraught === 'number' && s.MaximumStaticDraught > 0) patch.draught = s.MaximumStaticDraught;
      if (s.Destination) patch.destination = String(s.Destination).trim();
      if (s.Eta && s.Eta.Month) {
        patch.eta = pad(s.Eta.Month) + '-' + pad(s.Eta.Day) + ' ' + pad(s.Eta.Hour) + ':' + pad(s.Eta.Minute);
      }
      if (meta.latitude != null && vessels.get(mmsi) == null) { patch.lat = meta.latitude; patch.lon = meta.longitude; }
    } else {
      return;
    }
    if (wsOpts && wsOpts.types && wsOpts.types.length) {
      var v0 = vessels.get(mmsi), lbl = typeLabel(patch.shipType != null ? patch.shipType : (v0 ? v0.shipType : null), patch.name || (v0 && v0.name));
      var want = wsOpts.types.map(function (t) { return String(t).toLowerCase(); });
      var known = patch.shipType != null || (v0 && v0.shipType != null);
      var ok = !known || // unknown-type vessels pass until static data says otherwise
               (want.indexOf('tanker') >= 0 && lbl === 'Tanker') || (want.indexOf('gas') >= 0 && lbl === 'LNG/Gas') ||
               (want.indexOf('cargo') >= 0 && lbl === 'Cargo') || (want.indexOf('other') >= 0 && lbl === 'Other');
      if (!ok) { vessels.delete(mmsi); return; }
    }
    upsert(mmsi, patch, now);
  }
  function pad(n) { return (n < 10 ? '0' : '') + (n | 0); }

  // -------------------------------------------------------------- websocket
  function openSocket() {
    if (!wantLive) return;
    setStatus('connecting', 'connecting to aisstream.io');
    try { ws = new WebSocket(WS_URL); } catch (e) { setStatus('error', 'WebSocket unavailable: ' + e.message); scheduleReconnect(); return; }
    ws.onopen = function () {
      var sub = { APIKey: wsOpts.apiKey, BoundingBoxes: [wsOpts.bbox || WORLD_BBOX], FilterMessageTypes: ['PositionReport', 'ShipStaticData'] };
      ws.send(JSON.stringify(sub));
      backoff = BACKOFF_MIN;
      setStatus('live', 'subscribed');
    };
    ws.onmessage = function (ev) {
      if (typeof ev.data === 'string') parseAis(ev.data);
      else if (ev.data && ev.data.text) ev.data.text().then(parseAis);
    };
    ws.onerror = function () { setStatus('error', 'websocket error'); };
    ws.onclose = function (ev) {
      ws = null;
      if (wantLive) { setStatus('error', 'closed (' + (ev && ev.code) + '), reconnecting'); scheduleReconnect(); }
      else setStatus('closed', 'disconnected');
    };
  }
  function scheduleReconnect() {
    if (reconnectTimer || !wantLive) return;
    reconnectTimer = setTimeout(function () { reconnectTimer = null; openSocket(); }, backoff);
    backoff = Math.min(BACKOFF_MAX, backoff * 2);
  }

  // -------------------------------------------------------------------- demo
  var NAME_A = ['NORDIC', 'PACIFIC', 'ATLANTIC', 'GULF', 'OCEAN', 'STAR', 'EAGLE', 'FRONT', 'MARAN', 'DELTA', 'MINERVA', 'OLYMPIC', 'SEAWAYS', 'DHT', 'NEW', 'CRUDE', 'ENERGY', 'ASTRO', 'ALMI', 'SONANGOL'];
  var NAME_B = ['FREEDOM', 'PRIDE', 'GLORY', 'SPIRIT', 'VOYAGER', 'TITAN', 'HARMONY', 'HORIZON', 'PIONEER', 'PHOENIX', 'LEADER', 'TRIDENT', 'JEWEL', 'FALCON', 'ARIES', 'ORION', 'ZENITH', 'CENTURY', 'LIBERTY', 'FORTUNE'];
  // Lanes: list of waypoints [lat,lon]; vessels placed along segments. dest = plausible destinations.
  var LANES = [
    { pts: [[28.6, 49.6], [27.2, 51.3], [26.6, 53.5], [26.4, 56.3], [26.5, 56.6], [25.8, 57.0], [24.9, 58.2], [22.5, 61.0], [19.0, 65.0]], n: 80, tanker: 0.8, dest: ['FUJAIRAH', 'RAS TANURA', 'SIKKA', 'NINGBO', 'ULSAN', 'YOSU', 'CHIBA'] },
    { pts: [[19.0, 65.0], [12.0, 70.0], [7.5, 78.0], [6.3, 84.0], [6.0, 94.0], [5.5, 98.5], [3.3, 100.7], [1.9, 102.6], [1.25, 103.7], [1.2, 104.3]], n: 70, tanker: 0.65, dest: ['SINGAPORE', 'PENGERANG', 'TANJUNG PELEPAS', 'MAP TA PHUT', 'NINGBO'] },
    { pts: [[1.2, 104.3], [3.0, 106.0], [8.0, 110.0], [14.0, 112.5], [20.0, 115.5], [22.5, 118.0], [29.0, 123.0], [33.0, 127.0]], n: 40, tanker: 0.55, dest: ['NINGBO', 'QINGDAO', 'ULSAN', 'KAOHSIUNG', 'DALIAN', 'CHIBA'] },
    { pts: [[29.7, -94.9], [28.6, -94.0], [27.3, -92.5], [25.5, -90.0], [24.3, -86.0], [23.5, -82.0]], n: 35, tanker: 0.6, dest: ['CORPUS CHRISTI', 'HOUSTON', 'ROTTERDAM', 'NINGBO', 'ST CROIX'] },
    { pts: [[51.95, 3.8], [52.5, 3.0], [54.5, 2.5], [57.0, 1.5], [59.0, 2.0], [60.5, 3.5]], n: 35, tanker: 0.5, dest: ['ROTTERDAM', 'MONGSTAD', 'SULLOM VOE', 'TEESPORT', 'ANTWERP'] },
    { pts: [[44.7, 37.6], [44.0, 36.0], [42.5, 32.0], [41.6, 29.5], [41.1, 29.05], [40.9, 28.9], [40.5, 27.5]], n: 28, tanker: 0.55, dest: ['NOVOROSSIYSK', 'CEYHAN', 'TUAPSE', 'AUGUSTA', 'TRIESTE'] },
    { pts: [[6.0, 3.5], [4.5, 5.5], [2.0, 6.5], [-2.0, 7.5], [-6.0, 10.0], [-8.0, 12.5]], n: 28, tanker: 0.7, dest: ['BONNY', 'ESCRAVOS', 'LAGOS', 'ROTTERDAM', 'SIKKA', 'NINGBO'] },
    { pts: [[10.4, -64.5], [11.5, -66.5], [12.2, -69.0], [14.5, -70.5], [17.5, -68.0], [18.0, -65.0]], n: 22, tanker: 0.6, dest: ['ST EUSTATIUS', 'HOUSTON', 'CURACAO', 'FREEPORT BS'] },
    { pts: [[12.6, 43.4], [13.6, 42.1], [16.0, 40.5], [20.0, 38.5], [24.0, 36.0], [27.5, 34.0], [29.5, 32.5], [31.2, 32.4]], n: 28, tanker: 0.6, dest: ['SUEZ', 'SIDI KERIR', 'ROTTERDAM', 'YANBU', 'AUGUSTA'] },
    { pts: [[-34.8, 17.0], [-35.2, 19.0], [-35.0, 21.5], [-33.0, 28.0], [-28.0, 33.0]], n: 15, tanker: 0.7, dest: ['DURBAN', 'NINGBO', 'SIKKA', 'ROTTERDAM'] },
    { pts: [[9.4, -79.9], [9.2, -79.75], [9.0, -79.55], [8.6, -79.4]], n: 12, tanker: 0.5, dest: ['BALBOA', 'CRISTOBAL', 'LOS ANGELES', 'HOUSTON'] },
    { pts: [[35.95, -6.1], [35.95, -5.6], [36.0, -5.1], [36.5, -2.0], [37.5, 1.0]], n: 12, tanker: 0.55, dest: ['ALGECIRAS', 'HUELVA', 'CARTAGENA', 'FOS'] },
    { pts: [[57.6, 10.8], [56.9, 11.9], [56.1, 12.6], [55.5, 12.7], [55.0, 12.9], [54.6, 13.5]], n: 12, tanker: 0.5, dest: ['PRIMORSK', 'GOTHENBURG', 'ROTTERDAM', 'GDANSK'] }
  ];
  var FLAG_MIDS = [636, 538, 351, 215, 477, 563, 241, 311, 210, 257, 235, 367, 412, 431, 440, 419, 273, 422, 403, 470, 271, 247, 219, 244, 211, 226];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function bearing(a, b) {
    var dLon = (b[1] - a[1]) * Math.PI / 180, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    var y = Math.sin(dLon) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  function buildDemo() {
    vessels.clear(); lastVesselEmit.clear(); demoState.clear();
    var now = Date.now(), seq = 0;
    LANES.forEach(function (lane) {
      var segs = lane.pts.length - 1;
      for (var i = 0; i < lane.n; i++) {
        var si = Math.floor(Math.random() * segs), t = Math.random();
        var a = lane.pts[si], b = lane.pts[si + 1];
        var lat = a[0] + (b[0] - a[0]) * t + rnd(-0.12, 0.12), lon = a[1] + (b[1] - a[1]) * t + rnd(-0.12, 0.12);
        var fwd = Math.random() < 0.5, cog = fwd ? bearing(a, b) : bearing(b, a);
        var isTanker = Math.random() < lane.tanker, isGas = isTanker && Math.random() < 0.15;
        var shipType = isTanker ? (isGas ? 84 : 80 + Math.floor(Math.random() * 4)) : (Math.random() < 0.8 ? 70 + Math.floor(Math.random() * 5) : 30 + Math.floor(Math.random() * 10));
        var name = pick(NAME_A) + ' ' + pick(NAME_B);
        if (isGas) name = name + (Math.random() < 0.5 ? ' LNG' : ' GAS');
        var maxD = isTanker ? rnd(14, 22) : rnd(8, 14), laden = Math.random() < (fwd ? 0.55 : 0.5);
        var draught = laden ? maxD * rnd(0.8, 0.98) : maxD * rnd(0.4, 0.6);
        var mmsi = pick(FLAG_MIDS) * 1000000 + 100000 + (seq++ * 7919) % 900000;
        var sog = Math.random() < 0.08 ? rnd(0, 0.5) : rnd(8, 15);
        var v = upsert(mmsi, {
          name: name, imo: 9000000 + Math.floor(rnd(100000, 999999)), lat: lat, lon: lon, cog: Math.round(cog * 10) / 10,
          sog: Math.round(sog * 10) / 10, heading: Math.round(cog + rnd(-3, 3) + 360) % 360, shipType: shipType,
          draught: Math.round(draught * 10) / 10, maxDraught: Math.round(maxD * 10) / 10, destination: pick(lane.dest),
          eta: pad(1 + Math.floor(Math.random() * 12)) + '-' + pad(1 + Math.floor(Math.random() * 28)) + ' ' + pad(Math.floor(Math.random() * 24)) + ':00'
        }, now);
        demoState.set(v.mmsi, { lane: lane, seg: si, fwd: fwd });
      }
    });
  }

  /** Advance demo vessels along COG; nudge course toward next waypoint; bounce at lane ends. */
  function demoStep() {
    var now = Date.now(), dtH = TICK_MS / 3600000 * 60; // 60x time compression so motion is visible
    vessels.forEach(function (v) {
      var d = demoState.get(v.mmsi); if (!d || v.sog == null) return;
      var distNm = v.sog * dtH, dLat = distNm / 60;
      var rad = v.cog * Math.PI / 180;
      var lat = v.lat + dLat * Math.cos(rad), lon = v.lon + dLat * Math.sin(rad) / Math.max(0.2, Math.cos(v.lat * Math.PI / 180));
      var pts = d.lane.pts, target = d.fwd ? pts[d.seg + 1] : pts[d.seg];
      var dT = Math.abs(lat - target[0]) + Math.abs(lon - target[1]);
      if (dT < 0.25) {
        d.seg += d.fwd ? 1 : -1;
        if (d.seg >= pts.length - 1 || d.seg < 0) { d.fwd = !d.fwd; d.seg = Math.max(0, Math.min(pts.length - 2, d.seg)); v.draught = v.laden ? v.maxDraught * 0.5 : v.maxDraught * 0.9; }
        target = d.fwd ? pts[d.seg + 1] : pts[d.seg];
      }
      var want = bearing([lat, lon], target), diff = ((want - v.cog + 540) % 360) - 180;
      v.cog = Math.round(((v.cog + Math.max(-15, Math.min(15, diff)) + 360) % 360) * 10) / 10;
      v.heading = Math.round(v.cog);
      v.sog = Math.round(Math.max(0, Math.min(16, v.sog + rnd(-0.3, 0.3))) * 10) / 10;
      upsert(v.mmsi, { lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000, cog: v.cog, sog: v.sog, heading: v.heading, draught: Math.round(v.draught * 10) / 10 }, now);
    });
  }

  function stopDemo() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } demoActive = false; demoState.clear(); }

  // -------------------------------------------------------------- public API
  var api = {
    /** Open the aisstream.io websocket. opts: { apiKey, bbox?: [[latS,lonW],[latN,lonE]], types?: ["tanker","gas","cargo","other"] } */
    connect: function (opts) {
      if (!opts || !opts.apiKey) { setStatus('error', 'apiKey required'); return; }
      api.disconnect();
      stopDemo(); vessels.clear(); lastVesselEmit.clear();
      wsOpts = { apiKey: opts.apiKey, bbox: opts.bbox || WORLD_BBOX, types: opts.types || null };
      wantLive = true; backoff = BACKOFF_MIN;
      startTick(); openSocket();
    },
    /** Close the socket (no reconnect) and stop demo animation. Vessel store is kept. */
    disconnect: function () {
      wantLive = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch (e) {} ws = null; }
      stopDemo(); stopTick();
      setStatus('closed', 'disconnected');
    },
    /** Subscribe: "status" ({state,msg}), "vessel" (vessel), "tick" (stats). Returns unsubscribe fn. */
    on: function (evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
      return function () { var i = listeners[evt].indexOf(fn); if (i >= 0) listeners[evt].splice(i, 1); };
    },
    /** Remove a listener. */
    off: function (evt, fn) { var i = (listeners[evt] || []).indexOf(fn); if (i >= 0) listeners[evt].splice(i, 1); },
    /** Live Map<mmsi, vessel>. Treat as read-only. */
    vessels: function () { return vessels; },
    /** [{id,name,polygon,center,count,tankerCount}] — counts refreshed every tick. */
    chokePoints: chokePoints,
    /** Current stats: {count, tankers, laden, ballast, chokePoints:[{id,name,count,tankerCount}]} */
    stats: function () { recountChokes(); return computeStats(); },
    /** Current status {state,msg}. */
    status: function () { return statusState; },
    /** Seed ~400 synthetic vessels on real lanes and animate them every tick. Emits the same events as live. */
    loadDemo: function () {
      api.disconnect();
      buildDemo();
      demoActive = true;
      startTick();
      demoTimer = setInterval(demoStep, TICK_MS);
      setStatus('live', 'demo data');
      tick();
    },
    /** True while demo animation is running. */
    isDemo: function () { return demoActive; },
    /** Manually advance one tick (prune, recount, emit "tick"); in demo mode also moves vessels. Useful for tests. */
    step: function () { if (demoActive) demoStep(); tick(); },
    /** Exposed helpers for testing / reuse. */
    util: { pointInPolygon: pointInPolygon, chokeFor: chokeFor, typeLabel: typeLabel, inferLaden: inferLaden, flagFromMMSI: flagFromMMSI, parseAis: parseAis }
  };
  window.FD.data = api;
})();
