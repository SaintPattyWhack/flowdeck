# FlowDeck `data/` module

`data.js` is dependency-free browser JS. Load it with a `<script>` tag; it attaches to `window.FD.data`.

## Public API

```js
FD.data.connect({ apiKey, bbox?: [[latS,lonW],[latN,lonE]], types?: ["tanker","gas","cargo","other"] })
  // opens wss://stream.aisstream.io/v0/stream, subscribes to PositionReport + ShipStaticData,
  // reconnects with exponential backoff (1s..30s). bbox defaults to the whole world.
  // types (optional) drops vessels whose static type is known and not in the list.
FD.data.disconnect()          // close socket (no reconnect), stop demo + tick. Vessel store kept.
FD.data.on(event, fn)         // returns an unsubscribe fn. Also FD.data.off(event, fn).
  // "status" -> {state:"connecting"|"live"|"error"|"closed", msg}
  // "vessel" -> vessel object (throttled to >= 150 ms per MMSI)
  // "tick"   -> {count, tankers, laden, ballast, chokePoints:[{id,name,count,tankerCount}]} every 2 s
FD.data.vessels()             // live Map<mmsi, vessel> (read-only by convention)
FD.data.chokePoints           // [{id, name, polygon:[[lat,lon],...], center:[lat,lon], count, tankerCount}]
FD.data.stats()               // same payload as "tick", computed now
FD.data.status()              // current {state, msg}
FD.data.loadDemo()            // ~420 synthetic vessels on real lanes, animated every tick; same events as live
FD.data.isDemo()              // true while demo animation runs
FD.data.step()                // advance one tick synchronously (tests)
FD.data.util                  // {pointInPolygon, chokeFor, typeLabel, inferLaden, flagFromMMSI, parseAis}
```

Vessel object shape is exactly the shared contract in `../PLAN.md` (mmsi, name, imo, lat, lon, cog, sog,
heading, shipType, typeLabel, draught, maxDraught, laden, destination, eta, lastSeen, flag, chokePoint).

## Rules implemented
- Type: AIS 80–89 = Tanker, 70–79 = Cargo; 84/85 or name containing LNG/LPG/GAS = "LNG/Gas"; else Other.
- Laden: `draught >= 0.75*maxDraught` when maxDraught known; else tankers `>=12.0` laden, `<9.0` ballast, between = null.
  Live AIS only gives one draught (MaximumStaticDraught) so `maxDraught` is null for live vessels and the fixed thresholds apply.
- Flag: MMSI first 3 digits (MID) -> ISO for ~35 major flag states, else null.
- Prune: vessels unseen for 30 min are removed on tick.
- Choke points: ray-casting point-in-polygon against 9 hand-drawn polygons (Hormuz, Malacca, Suez/Gulf of Suez,
  Bab-el-Mandeb, Bosphorus, Panama, Cape of Good Hope, Danish Straits, Gibraltar). `count`/`tankerCount` refreshed every tick.
- Tankers in stats include "LNG/Gas".

## Testing
- Browser: open `test.html`, click **Demo** (no key) or paste an aisstream.io key and **Connect**. Stats + first 10 vessels print every tick.
- Node (no browser): `node -e "global.window={};eval(require('fs').readFileSync('data/data.js','utf8'));const D=window.FD.data;D.loadDemo();D.step();console.log(D.stats());D.disconnect()"`
