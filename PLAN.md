# FLOWDECK — Commodity Flow Terminal (v1 spec)

Goal: a modern, single-page, client-only web app inspired by the Bloomberg Terminal's
BMAP/MAP function (live vessel map for oil/LNG flows) plus a terminal-style dashboard
(prices, news, watchlist). Must run as static files — no server. Final deliverable is
ONE self-contained `index.html` (inline CSS/JS; external libs only from cdnjs/jsdelivr/unpkg).

Branding: original name "FlowDeck". NO Bloomberg name, logo, colors-as-trade-dress, or UI
copying. Aesthetic: dark terminal, amber/orange accents (#f5a623), monospace data, dense.

## Directory layout (each agent owns ONE folder)
- `data/`     — vessel + choke-point data layer (Agent A)
- `map/`      — map panel UI (Agent B)
- `markets/`  — prices, news, watchlist panel (Agent C)
- `shell/`    — app shell, command bar, layout, theme, integration (Agent D, runs last)

Each module exports plain ES-module-free globals on `window.FD` (no bundler):
`window.FD = window.FD || {}; FD.data = {...}` etc. Write each module as a single `.js`
file plus a `.css` file if needed, and a `README.md` describing the public API + how to test.

## Shared contracts

### Vessel object (produced by data layer)
```js
{
  mmsi: 123456789, name: "SOME TANKER", imo: 9876543,
  lat: 25.1, lon: 56.3, cog: 180.5, sog: 11.2, heading: 181,
  shipType: 80..89 (AIS code) | number, typeLabel: "Tanker"|"Cargo"|"LNG/Gas"|"Other",
  draught: 14.2, maxDraught: null|number, laden: true|false|null,   // laden inferred
  destination: "FUJAIRAH", eta: "10-18 06:00",
  lastSeen: 1760000000000 (ms epoch), flag: "LR" (if derivable from MID), 
  chokePoint: "Hormuz"|null
}
```

### FD.data API (Agent A)
```js
FD.data.connect({ apiKey, bbox?: [[latS,lonW],[latN,lonE]] , types?: ["tanker","gas"] })
FD.data.disconnect()
FD.data.on(event, fn)   // events: "status" ({state:"connecting"|"live"|"error"|"closed", msg})
                        //         "vessel" (vessel)   fired per update, throttled
                        //         "tick"  ({count, tankers, laden, ballast, chokePoints})  every 2s
FD.data.vessels()       // Map<mmsi, vessel>
FD.data.chokePoints     // [{id, name, polygon:[[lat,lon],...], center:[lat,lon], count, tankerCount}]
FD.data.stats()         // same payload as "tick"
FD.data.loadDemo()      // seeds ~400 synthetic but realistic vessels (for use without key)
```
Rules: AIS ship type 80–89 = Tanker; 70–79 = Cargo; gas carriers flagged if name/type hints
(LNG, LPG, GAS). Laden heuristic: draught >= 0.75 * maxDraught when known; otherwise
draught >= 12.0 for tankers = laden, < 9.0 = ballast, between = null. Prune vessels not
seen for 30 min. Choke-point membership via point-in-polygon on each update.
aisstream.io: wss://stream.aisstream.io/v0/stream, first message
`{APIKey, BoundingBoxes:[[[lat,lon],[lat,lon]]], FilterMessageTypes:["PositionReport","ShipStaticData"]}`.
Merge static data (name, type, draught, destination) with position reports by MMSI.

### FD.map API (Agent B)
```js
FD.map.mount(containerEl, { onSelect(vessel) })
FD.map.setVessels(Map|Array)        // full refresh, must handle 5k markers smoothly (use canvas renderer / L.circleMarker)
FD.map.upsertVessel(vessel)
FD.map.setChokePoints(list)         // draw polygons + count badges
FD.map.setFilter({types:[...], laden:"all"|"laden"|"ballast", minSog})
FD.map.flyTo(presetId)              // presets: world, gulf, hormuz, malacca, suez, usgulf, northsea, blacksea
FD.map.focusVessel(mmsi)
```
Leaflet from cdnjs; tiles: CARTO dark_all (https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png,
attribution required). Marker color: tanker-laden amber, tanker-ballast dim amber outline,
cargo blue-grey, gas teal, other grey. Hover tooltip: name/type/sog/dest. Click => onSelect.

### FD.markets API (Agent C)
```js
FD.markets.mount(containerEl)       // renders prices grid + sparklines + news list + watchlist
FD.markets.refresh()
FD.markets.watchlist.add(symbol) / remove / list()   // localStorage, try/catch guarded
```
Price sources (free, CORS-friendly; verify each actually works from a browser; fall back gracefully):
- Stooq CSV: https://stooq.com/q/l/?s=cl.f,br.f,ng.f&f=sd2t2ohlcv&h&e=csv  (test CORS; if blocked, try https://stooq.com/q/d/l/?s=cl.f&i=d)
- Yahoo chart JSON via https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=1mo&interval=1d (likely CORS-blocked — test)
- EIA open data (needs free key; daily spot RBRTE, RWTC): https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=KEY&frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=60
Symbols to show: Brent, WTI, Henry Hub NG, Dubai/Oman proxy if available, plus tanker-exposed
equities (FRO, STNG, TNK, DHT, INSW, NAT) and energy majors (XOM, CVX, SHEL, BP).
News: RSS via rss2json (https://api.rss2json.com/v1/api.json?rss_url=...) for feeds like
EIA, OilPrice.com, gCaptain, Reuters energy; fall back to a static "no feed" state. Never
reproduce more than headline + source + link. If a source is CORS-blocked, show "source unavailable".
Allow user-supplied EIA key via settings stored in localStorage.

### FD.shell (Agent D — integration, runs after A/B/C finish)
- Layout: top command bar (input, accepts commands MAP, TANK, GAS, NEWS, WL, PX, HELP, GO <preset>),
  status strip (AIS state, vessel count, tankers, laden/ballast, UTC clock), main area with
  panels: map (default, large), markets side panel, vessel detail drawer, choke-point table.
- Settings modal: aisstream API key (localStorage), EIA key, demo mode toggle.
- First run without key: auto `FD.data.loadDemo()` and show banner "Demo data — add a free aisstream.io key for live AIS".
- Keyboard: `/` focuses command bar, Esc closes drawers.
- Mobile: panels stack; map min-height 55vh.
- Produce final `dist/index.html` with ALL module code inlined (concatenate data.js, map.js, markets.js, shell.js + css), CDN libs only.
- Add ":root" color tokens, dark-mode default, explicit body background.

## Quality bar
- No console errors on load. Works with no key (demo). Works on phone width.
- Each agent: test your module standalone with a tiny `test.html` in your folder.

## ADDENDUM (Oct 15) — SPLC module: company supply-chain graph (Agent E)
Inspired by the Terminal's SPLC <GO>: type any public ticker, get its suppliers and customers,
drill in either direction, and push the entities onto the map.

### FD.splc API
```js
FD.splc.mount(containerEl, { onEntity(entity), onPlot(entities) })
FD.splc.lookup(tickerOrName)     // resolves via SEC company tickers JSON, fetches relationships
FD.splc.graph()                  // {root:{cik,ticker,name}, suppliers:[rel], customers:[rel], peers:[...]}
// rel = {cik, ticker, name, role:"supplier"|"customer", exposurePct:null|number,
//        evidence:[{source:"10-K FY2025", snippet:"<=20 words", url}], hq:{lat,lon,city}|null}
```
Data sources (all free, verify CORS from browser; use https://efts.sec.gov/LATEST/search-index?q=... full-text
search and https://www.sec.gov/cgi-bin/browse-edgar / https://data.sec.gov/submissions/CIK##########.json;
SEC requires a descriptive User-Agent header — note that browsers cannot set it, so test whether EDGAR
endpoints respond to plain browser fetches; if CORS-blocked, document that this module needs a tiny
proxy or a prebuilt JSON cache and ship a static seed dataset for ~25 large caps (WMT, AAPL, TSLA, XOM,
NVDA, COST, TGT, AMZN, F, GM, BA, CAT, DE, KO, PEP, PG, NKE, HD, LOW, MSFT, META, GOOGL, CVX, PFE, JNJ)
generated offline from 10-K "major customer"/"significant supplier" disclosures.)
UI: search box, root card, two columns (SUPPLIERS / CUSTOMERS) with exposure bars where known,
click to re-root, "PLOT" button to send entities with hq coords to the map. Node-link mini graph in inline SVG.
