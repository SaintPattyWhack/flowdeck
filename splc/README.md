# FD.splc — company supply-chain graph (Agent E)

Type a ticker, see its SUPPLIERS and CUSTOMERS with disclosed exposure percentages, drill in either direction, and push the entities with HQ coordinates onto the map.

Files: `splc.js` (module), `splc.css` (styles, `:root` tokens, amber `#f5a623` accent), `seed.js` (static dataset), `test.html` (standalone harness). No external libraries.

## Public API

```js
FD.splc.mount(containerEl, { onEntity(entity), onPlot(entities) })
FD.splc.lookup(tickerOrName)   // Promise<graph|null>; also re-renders
FD.splc.graph()                // current graph or null
FD.splc.search(q)              // [{ticker,name,src:"seed"|"edgar"}] autocomplete rows
FD.splc.setProxy(base) / FD.splc.getProxy()   // localStorage "fd.splcProxy"
FD.splc.seed                   // the raw seed dataset
```

`graph` shape (matches PLAN.md addendum):

```js
{ root: {cik, ticker, name, hq:{lat,lon,city}|null},
  suppliers: [rel], customers: [rel], peers: [entity], source: "seed"|"seed+edgar"|"edgar" }
rel = { cik, ticker, name, role:"supplier"|"customer", exposurePct:null|number, basis,
        evidence:[{source:"Clorox 10-K FY2026", snippet:"<=20 words", url}], hq:{lat,lon,city}|null, inSeed, note? }
```

`exposurePct` semantics: for a **supplier** row it is the supplier's sales to the root as a share of the *supplier's* revenue (that is what 10-K "major customer" disclosures give you). For a **customer** row it is the root's sales to that customer as a share of the *root's* revenue. The column headers say this.

`onPlot(entities)` receives `[{cik,ticker,name,role:"root"|"supplier"|"customer",hq:{lat,lon,city},exposurePct}]`, only entities with an HQ. Shell wires this to `FD.map`.

## EDGAR reachability from a browser (verified 2026-10-15 with curl)

| Endpoint | Descriptive UA | Browser-style UA | `access-control-allow-origin` |
|---|---|---|---|
| `https://www.sec.gov/files/company_tickers.json` | 200 | **403** (Akamai) | absent |
| `https://data.sec.gov/submissions/CIK##########.json` | 200 | 200 | `*` (GET only; OPTIONS preflight → 403) |
| `https://efts.sec.gov/LATEST/search-index?q=…` | 200 | 200 | absent |
| `https://www.sec.gov/Archives/edgar/data/…/*.htm` | 200 | **403** | absent |

Browsers cannot set `User-Agent`, and `fetch` with custom headers triggers a preflight that `data.sec.gov` rejects. Net effect:

- **Only `data.sec.gov/submissions` is usable directly from a page** (simple GET, no custom headers) — the module uses it to resolve a non-seed ticker's legal name and HQ city.
- The ticker index, full-text search and filing documents **need a tiny proxy** that forwards the request with a descriptive `User-Agent` (e.g. `FlowDeck research patrickmoon7@gmail.com`) and adds CORS headers. Set it with the PROXY button or `localStorage.setItem("fd.splcProxy","https://your-proxy.example/sec")`; the module calls `<base>?url=<encoded SEC url>`. SEC rate limit is 10 req/s; efts returned 429/500 under modest bursts, so the proxy should throttle.
- **Default path is the seed dataset.** With a proxy, lookups add EDGAR full-text hits (other filers' 10-Ks that mention the root near "accounted for … net sales") as unverified supplier rows marked `live:true`, and the autocomplete also searches the full ticker index.

## Seed dataset

`seed.js` → `FD.splcSeed = { meta, entities, rels, peers }`. Generated offline from the latest 10-K of ~60 filers (pulled via `data.sec.gov/submissions` → primary document, grepped for "accounted for"/"represented … % of … net sales") plus Apple's published Supplier List (FY2023). Every `rel` carries the filing name, a ≤20-word snippet and the EDGAR URL. `pct` is `null` where the filing names the relationship but gives no percentage (e.g. Apple Supplier List entries, NVIDIA's foundry/memory suppliers, Tesla's cell suppliers). J&J's wholesaler rows are flagged with a `note` because J&J discloses percentages without naming the wholesalers.

Coverage: 94 entities, 103 relationships, 25 roots. Relationship counts per root (suppliers / customers):

WMT 19/0 · AAPL 13/0 · TSLA 2/0 · XOM 2/0 · NVDA 7/1 · COST 2/0 · TGT 2/0 · AMZN 6/2 · F 5/0 · GM 4/0 · BA 4/0 · CAT 1/0 · DE 1/0 · KO 1/3 · PEP 1/1 · PG 0/1 · NKE 0/1 · HD 6/0 · LOW 6/0 · MSFT 1/1 · META 1/0 · GOOGL 0/1 · CVX 1/0 · PFE 0/3 · JNJ 0/3

Thin roots (CAT, DE, TSLA, XOM, CVX, META, GOOGL, COST, TGT) reflect what 10-Ks actually disclose: big retailers and oil majors are rarely a 10%+ customer of a public filer, and few filers name their suppliers. Drill-through helps — e.g. from AAPL into QRVO/SWKS/CRUS, from WMT into any CPG name, or from PFE into MCK/COR/CAH.

## Testing

Open `splc/test.html` (optionally `?t=AAPL`). It mounts the module, auto-looks-up WMT, and logs `onEntity`/`onPlot` calls at the bottom. Expected: no console errors; root card, inline-SVG graph (suppliers left, customers right, edge width ∝ exposure), two columns with exposure bars; clicking a row re-roots; clicking the % cell expands evidence; PLOT logs the HQ list. At phone width the columns stack.

`node --check splc.js seed.js` passes.
