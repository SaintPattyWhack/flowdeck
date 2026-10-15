# FlowDeck `map/` module — `FD.map`

Leaflet 1.9.4 map panel: canvas-rendered vessel markers (5k+ smooth), choke-point
polygons with count badges, hover tooltips, click-to-select, preset views, filter,
legend + preset strip overlays. No dependency on `FD.data`; the shell feeds it.

Files: `map.js`, `map.css`, `test.html` (standalone demo with ~500 fake vessels).

## Load order

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="map.css">            <!-- or inline -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="map.js"></script>                    <!-- or inline; needs window.L -->
```

## Container requirements (shell integrator)

- The container element **must have an explicit height** (e.g. `height: 55vh` on phones,
  `flex: 1; min-height: 0` in a flex column on desktop). `map.css` gives `.fd-map`
  `position: relative; width: 100%; height: 100%; min-height: 240px`.
- `mount()` adds class `fd-map` to the container and injects the preset strip (top-left)
  and legend (bottom-right) *inside* it. Leaflet's zoom control is pushed down below
  the strip (`.leaflet-top.leaflet-left { top: 40px }`, 76px on phones).
- Size changes: a `ResizeObserver` on the container plus `window` resize/orientation
  listeners call `invalidateSize()` automatically. If you show the map after it was
  `display:none`, call `FD.map.invalidateSize()` once.
- All colours are `:root` tokens in `map.css` (`--fd-v-tanker-laden`, `--fd-v-tanker-ballast`,
  `--fd-v-cargo`, `--fd-v-gas`, `--fd-v-other`, `--fd-v-select`, `--fd-choke`, plus
  `--fd-map-bg/panel/border/text/muted/accent/font`). `map.js` reads the vessel colours
  with `getComputedStyle` at `mount()` time, so override them *before* mounting.

## Basemap note (important)

`basemaps.cartocdn.com` (CARTO dark_all) now **watermarks tiles "API KEY REQUIRED"**
unless `?key=` is supplied (free key, 5M tiles/mo non-commercial: carto.com/basemaps/apikey).
Therefore:

- default (no key): Esri **World Dark Gray Canvas** (keyless, attributed) is used;
- `mount(el, { cartoKey })` or `FD.map.setBasemap('carto', key)` switches to CARTO dark_all;
  on the first tile error it falls back to Esri automatically.

Suggest the shell exposes a "CARTO basemap key" field in Settings next to the AIS key.

## API

```js
FD.map.mount(containerEl, {
  onSelect(vessel|null),        // click marker => vessel; map click / removal => null
  basemap: 'esri'|'carto',      // optional, default esri (carto if cartoKey given)
  cartoKey: '...'               // optional
})
FD.map.destroy()

FD.map.setVessels(Map|Array)    // full refresh: upserts present, REMOVES absent markers
FD.map.upsertVessel(vessel)     // create / move / restyle one marker in place
FD.map.removeVessel(mmsi)

FD.map.setChokePoints([{ id, name, polygon:[[lat,lon],...], center?, count, tankerCount }])
                                // amber polygons @25% fill + badge "Name · N tankers"
                                // (uses tankerCount, falls back to count)

FD.map.setFilter({ types: ['tanker','gas','cargo','other'] | null,   // null/[] = all
                   laden: 'all'|'laden'|'ballast',
                   minSog: 0 })  // partial objects OK; hides markers without rebuilding
FD.map.getFilter()

FD.map.flyTo(presetId)          // 'world','gulf','hormuz','malacca','suez','usgulf',
                                // 'northsea','blacksea','westafrica','caribbean'; false if unknown
FD.map.presets                  // [{id,label}] for the shell's GO <preset> command
FD.map.focusVessel(mmsi)        // flies to the marker (zoom >= 8), un-hides it if filtered, selects
FD.map.select(mmsi|null)        // select + pan without zooming
FD.map.stats()                  // { total, shown, selected }
FD.map.invalidateSize()
FD.map.setBasemap('carto'|'esri', cartoKey?)
FD.map.getMap()                 // underlying L.Map
```

Vessel categorisation uses `typeLabel` first ("Tanker" / "Cargo" / "LNG/Gas" / "Other"),
then AIS `shipType` (80–89 tanker, 70–79 cargo). Tanker colour by `laden`: `true` = solid
amber, `false` = amber outline / 12% fill, `null` = amber 45% fill.

Rendering: one shared `L.canvas()` for vessels + selection ring, a second canvas on a
lower pane for choke polygons (so they never intercept hover). At zoom >= 8 a single
multi-polyline draws 1-px heading ticks for visible moving vessels; the selected vessel
always gets a white ring + 16-px COG tick.

## Testing

Open `map/test.html` over http (any static server; `file://` also works since there are
no fetches besides CDN + tiles). Buttons: 500 / 5000 vessels, live upsert stream, filter
controls, `focusVessel(random)`, `flyTo('hormuz')`. The page exposes `window.__test`.

Verified headless (Chromium 1280×800 and 390×844): no console errors, hover tooltip
and click-select on canvas markers work, `setVessels(5000)` ≈ 55–80 ms, filter/upsert/
remove counts correct, all 10 presets fly, choke badges render.
