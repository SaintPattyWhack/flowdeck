# FlowDeck

A client-only commodity-flow terminal in a single HTML file: a live AIS tanker map
with choke-point counts, a prices / news / watchlist panel, and a company supply-chain
graph (type a ticker, see its disclosed suppliers and customers, plot their HQs on the map).

Dark terminal look, amber accent, monospace data, dense. Original design — not affiliated
with any terminal vendor.

## Run it

```
./build.sh                       # writes dist/index.html (one self-contained file)
cd dist && python3 -m http.server 8080
# open http://localhost:8080/
```

`dist/index.html` can be dropped on any static host (GitHub Pages, Netlify, S3, a USB
stick). The only external assets are Leaflet 1.9.4 CSS/JS from cdnjs and the basemap tiles.

**Serve it over http(s), not `file://`.** The map, demo vessels and SPLC seed data work from
`file://`, but the markets panel fetches prices through public CORS proxies that reject the
`null` origin a `file://` page sends, so prices stay blank.

With no keys set the app boots in **demo mode**: ~420 synthetic vessels moving on real lanes,
seed supply-chain data for 25 large caps, and live news/prices as far as the free proxies allow.

## Keys (all optional, all free, all stored only in your browser)

Open `SET` (or type `SET` in the command bar). Keys are kept in `localStorage["fd.keys"]`.

| Key | What it unlocks | Where |
|---|---|---|
| aisstream.io API key | Live AIS positions worldwide (replaces demo vessels) | https://aisstream.io/ — sign in with GitHub, create a key |
| EIA API key | Daily Brent / WTI spot history (overrides futures proxy for those two) | https://www.eia.gov/opendata/register.php |
| CARTO basemap key | CARTO `dark_all` basemap instead of the keyless Esri dark canvas | https://carto.com/basemaps/apikey |
| SPLC proxy base URL | Live EDGAR full-text search + ticker index for any public company (see limitations) | You host it; see `splc/README.md` |
| Finnhub key | **Reserved** — stored but not wired yet | https://finnhub.io/ |

Saving an aisstream key disconnects demo mode and opens the websocket; clearing it (or
ticking "Demo mode") returns to demo data.

## Commands

Type in the top bar and press Enter. Case-insensitive. `/` focuses the bar, `Esc` closes
the vessel drawer / modals.

| Command | Action |
|---|---|
| `MAP` | Map with all vessels (clears filters) |
| `TANK` | Tankers only |
| `GAS` | LNG / LPG carriers only |
| `LADEN` / `BALLAST` | Laden or ballast tankers only |
| `GO <preset>` | Fly to `world gulf hormuz malacca suez usgulf northsea blacksea westafrica caribbean` |
| `PX` / `NEWS` / `WL` | Jump to prices, news or watchlist in the MARKETS tab |
| `SPLC <TICKER>` | Supply-chain graph for a ticker, e.g. `SPLC WMT` |
| `CHOKE` | Choke-point table (click a row to fly there) |
| `CLEAR` | Remove plotted SPLC HQ markers from the map |
| `DEMO` / `LIVE` | Force demo vessels / return to live AIS (needs key) |
| `SET` | Settings |
| `HELP` | Command list |

Click any vessel for the detail drawer (name, flag, type, laden state, SOG/COG, draught,
destination, ETA, choke point, last seen, MMSI/IMO). In SPLC, click a row to re-root,
click a percentage to see the filing evidence, `PLOT` to put HQs on the map (amber-outlined
squares; click one to re-root on that company).

## Module map

Each module is a plain browser script attaching to `window.FD.*`; no bundler, no framework.

| Folder | Global | Role |
|---|---|---|
| `data/` | `FD.data` | aisstream.io websocket client, vessel store, laden heuristic, choke-point point-in-polygon, demo generator |
| `map/` | `FD.map` | Leaflet map, canvas vessel markers, choke polygons + badges, presets, filters |
| `markets/` | `FD.markets` | Prices + sparklines (Yahoo via proxy, EIA direct), RSS news via rss2json, watchlist |
| `splc/` | `FD.splc` | Supply-chain graph UI, seed dataset (`seed.js`, 94 entities / 103 relationships from 10-Ks), optional EDGAR live lookups |
| `shell/` | `FD.shell` | App chrome: command bar, status strip, tabs, vessel drawer, settings, boot wiring |
| `build.sh` | — | Concatenates CSS + JS in dependency order into `dist/index.html` |

Each module folder has its own `README.md` (public API, data-source findings) and a
standalone `test.html`. `PLAN.md` is the original spec and shared contracts.

## Known limitations

- **Prices via public CORS proxies are slow and flaky.** Yahoo sends no CORS headers, so
  quotes go through allorigins.win (10–20 s, occasional 4xx/5xx). The last good quotes are
  cached and painted immediately on reload. A free Finnhub key would fix this; the settings
  field exists but the source is not wired yet.
- **EDGAR from a browser is limited.** Only `data.sec.gov/submissions` answers a plain
  browser fetch; the ticker index, full-text search and filing documents reject browser
  user-agents or lack CORS headers. Without a small proxy (that sets a descriptive
  `User-Agent` and adds CORS) SPLC runs on the seed dataset — 25 roots, drill-through into
  any of the 94 seed entities. Thin roots (CAT, DE, XOM, META…) reflect what 10-Ks
  actually disclose.
- **AIS coverage gaps.** aisstream.io is terrestrial-receiver AIS: dense near coasts and
  choke points, sparse or empty in open ocean. Live vessels arrive progressively over the
  first few minutes; `maxDraught` is unavailable live so laden/ballast uses fixed draught
  thresholds. Vessels unseen for 30 min are pruned.
- Choke-point polygons are hand-drawn approximations; counts are "vessels inside the
  polygon right now", not transits.
- CARTO basemap tiles are watermarked without a key, so the keyless default is Esri's
  dark canvas.
