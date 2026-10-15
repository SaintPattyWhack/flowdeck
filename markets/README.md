# FlowDeck — `markets/` module (Agent C)

Prices grid + 30-day sparklines, energy/shipping news, and a persisted watchlist.
Plain browser JS, no dependencies, attaches to `window.FD.markets`.

Files: `markets.js` (~390 lines), `markets.css`, `test.html`.

## Public API

```js
FD.markets.mount(containerEl)        // renders PRICES / NEWS / WATCHLIST, starts 60s auto-refresh
FD.markets.unmount()                 // stops timer, clears container
FD.markets.refresh({force?})         // refetch prices (+ news if >4.5 min old, or force:true)
FD.markets.watchlist.add("VLO")      // -> bool; persisted in localStorage "fd.watchlist"
FD.markets.watchlist.remove("VLO")
FD.markets.watchlist.list()          // -> ["VLO", ...]
FD.markets.setKeys({ eia: "..." })   // merges into localStorage "fd.keys"; empty value deletes; triggers refresh
FD.markets.getKeys()                 // -> { eia? }
FD.markets.quote("WTI")              // -> {price, chg, pct, hist[], src, hint?} | null
FD.markets.symbols                   // default symbol table
FD.markets.state                     // {quotes, news, stamps, errors, keys}
```

Default symbols: BRENT (BZ=F), WTI (CL=F), NG (NG=F), FRO, STNG, TNK, DHT, INSW, NAT, XOM, CVX, SHEL, BP.
Watchlist tickers are any Yahoo-style symbol (equities, `XX=F` futures, `^GSPC` indices).

Every `localStorage` access is wrapped in try/catch; the module works without storage.
Nothing throws out of fetch paths — a failing source shows "source unavailable" in the section stamp.

## Data sources — what actually works from a browser (verified 2026-10-15)

| Source | Status | CORS (`access-control-allow-origin`) | Verdict |
|---|---|---|---|
| Stooq `q/l` CSV and `q/d/l` | TCP reset from sandbox (host blocked) | unknown — Stooq is known to send no ACAO | Last-resort fallback via proxy only |
| Yahoo `v7/finance/spark` (batched, 13 symbols) | 200 | **none** | Primary, **through CORS proxy** |
| Yahoo `v8/finance/chart/{sym}` | 200 (intermittent 429 when hammered) | **none** | Per-symbol fallback, through proxy |
| Yahoo `v7/finance/quote` | 401 (needs crumb/cookie) | — | Not usable |
| EIA v2 `petroleum/pri/spt` | 403 without key, 200 with key | `*` | Direct, used for Brent/WTI history when `fd.keys.eia` is set |
| rss2json | 200 | `*` | Primary for news (OilPrice, gCaptain, EIA Today in Energy). **Rate-limits concurrent calls (429)** → fetched sequentially, max every ~4.5 min |
| Finnhub `/quote?token=demo` | 401 | `*` | CORS fine but needs a real free key — not wired |
| Alpha Vantage / Twelve Data `demo` | 200 / 401 | `*` | Same: key required, not wired |
| allorigins.win `/raw?url=` | 200 | echoes request Origin | **Works, but slow (10–20 s) and sometimes 408/520/522.** Does NOT work from `file://` (Origin "null") |
| codetabs.com `/v1/proxy/?quest=` | 503/522 from sandbox | `*` | Secondary proxy, kept in chain |
| corsproxy.io | 403 | `*` | Keyless use discontinued |

### Fallback chains

**Prices:** Yahoo spark (batched, 1 request) → Yahoo chart (per symbol) → Stooq CSV.
Each goes through the proxy chain allorigins → codetabs. EIA (direct, keyed) overrides
Brent/WTI with daily spot when available; the futures quote is kept at `quote.futures`.

**News:** rss2json × 3 feeds, sequential; any feed that fails is skipped; all failing →
"source unavailable" (previous headlines kept and marked stale).

**Cache:** last good quotes/news stored in `localStorage "fd.markets.cache"` and painted
immediately on mount, so the panel is never blank while the slow proxy warms up.

### Timeouts
Direct calls 8 s; proxied calls 25 s (AbortController). 60 s auto-refresh is skipped while
`document.hidden`, and overlapping refreshes are coalesced (one queued re-run).

## Styling
`markets.css` defines `:root` tokens (`--fd-bg`, `--fd-panel`, `--fd-accent: #f5a623`,
`--fd-up`, `--fd-dn`, `--fd-mono`, …). Shell may override the tokens. All classes are
prefixed `fd-`. Grid collapses to 4 columns under 420 px; no horizontal overflow at 390 px.

## Testing
```
cd markets && python3 -m http.server 8787
# open http://127.0.0.1:8787/test.html   (must be http(s), not file://)
```
Expect: PRICES fills within ~20–40 s (proxy latency), NEWS within ~5 s, no console errors
beyond transient 429/5xx resource warnings from proxies on retry. Headless Chromium run at
390 px width confirmed 13/13 quotes, 30 headlines, watchlist add/remove, zero page errors.

## Notes for the shell integrator
- Serve `index.html` over http(s). allorigins rejects `file://` origins.
- First paint of live prices can take 20 s+; the cache covers reloads.
- Yahoo via public CORS proxies is best-effort. For reliability, the cheapest upgrade is a
  free Finnhub key (CORS `*`, 60 req/min) — add `FD.markets.setKeys({finnhub})` and a
  `srcFinnhub` in the chain; the symbol table already has one entry per source.
- `setKeys` is the hook for the Settings modal's EIA field.
