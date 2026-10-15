/* FlowDeck SPLC — static seed dataset (Agent E)
 * Seed dataset, sourced from public filings. Generated offline 2026-10-15 from
 * SEC EDGAR 10-K "major customer" / supplier disclosures and Apple's published
 * Supplier List (FY2023). Every relationship below cites the filing it came from.
 *
 * Shape:
 *   entities[TICKER] = { cik, ticker, name, hq:{city, lat, lon} }   (cik null for non-SEC filers)
 *   rels[] = { from, to, pct, basis, evidence:{source, snippet, url}, note? }
 *            from = supplier (sells to), to = customer (buys from)
 *            pct  = percentage disclosed in the cited filing, or null; `basis` says what it measures
 *   peers[TICKER] = [tickers]
 */
window.FD = window.FD || {};
FD.splcSeed = (function () {
  var E = {
    // ---- roots ----
    WMT:  { cik: 104169,  ticker: "WMT",  name: "Walmart Inc.",                      hq: { city: "Bentonville, AR",     lat: 36.37,  lon: -94.21 } },
    AAPL: { cik: 320193,  ticker: "AAPL", name: "Apple Inc.",                        hq: { city: "Cupertino, CA",       lat: 37.32,  lon: -122.03 } },
    TSLA: { cik: 1318605, ticker: "TSLA", name: "Tesla, Inc.",                       hq: { city: "Austin, TX",          lat: 30.27,  lon: -97.74 } },
    XOM:  { cik: 2115436, ticker: "XOM",  name: "ExxonMobil",                        hq: { city: "Spring, TX",          lat: 30.08,  lon: -95.42 } },
    NVDA: { cik: 1045810, ticker: "NVDA", name: "NVIDIA Corp.",                      hq: { city: "Santa Clara, CA",     lat: 37.35,  lon: -121.95 } },
    COST: { cik: 909832,  ticker: "COST", name: "Costco Wholesale Corp.",            hq: { city: "Issaquah, WA",        lat: 47.53,  lon: -122.03 } },
    TGT:  { cik: 27419,   ticker: "TGT",  name: "Target Corp.",                      hq: { city: "Minneapolis, MN",     lat: 44.98,  lon: -93.27 } },
    AMZN: { cik: 1018724, ticker: "AMZN", name: "Amazon.com, Inc.",                  hq: { city: "Seattle, WA",         lat: 47.61,  lon: -122.33 } },
    F:    { cik: 37996,   ticker: "F",    name: "Ford Motor Co.",                    hq: { city: "Dearborn, MI",        lat: 42.32,  lon: -83.18 } },
    GM:   { cik: 1467858, ticker: "GM",   name: "General Motors Co.",                hq: { city: "Detroit, MI",         lat: 42.33,  lon: -83.05 } },
    BA:   { cik: 12927,   ticker: "BA",   name: "The Boeing Co.",                    hq: { city: "Arlington, VA",       lat: 38.88,  lon: -77.10 } },
    CAT:  { cik: 18230,   ticker: "CAT",  name: "Caterpillar Inc.",                  hq: { city: "Irving, TX",          lat: 32.81,  lon: -96.95 } },
    DE:   { cik: 315189,  ticker: "DE",   name: "Deere & Co.",                       hq: { city: "Moline, IL",          lat: 41.51,  lon: -90.52 } },
    KO:   { cik: 21344,   ticker: "KO",   name: "The Coca-Cola Co.",                 hq: { city: "Atlanta, GA",         lat: 33.75,  lon: -84.39 } },
    PEP:  { cik: 77476,   ticker: "PEP",  name: "PepsiCo, Inc.",                     hq: { city: "Purchase, NY",        lat: 41.04,  lon: -73.71 } },
    PG:   { cik: 80424,   ticker: "PG",   name: "Procter & Gamble Co.",              hq: { city: "Cincinnati, OH",      lat: 39.10,  lon: -84.51 } },
    NKE:  { cik: 320187,  ticker: "NKE",  name: "NIKE, Inc.",                        hq: { city: "Beaverton, OR",       lat: 45.49,  lon: -122.80 } },
    HD:   { cik: 354950,  ticker: "HD",   name: "The Home Depot, Inc.",              hq: { city: "Atlanta, GA",         lat: 33.75,  lon: -84.39 } },
    LOW:  { cik: 60667,   ticker: "LOW",  name: "Lowe's Companies, Inc.",            hq: { city: "Mooresville, NC",     lat: 35.58,  lon: -80.81 } },
    MSFT: { cik: 789019,  ticker: "MSFT", name: "Microsoft Corp.",                   hq: { city: "Redmond, WA",         lat: 47.67,  lon: -122.12 } },
    META: { cik: 1326801, ticker: "META", name: "Meta Platforms, Inc.",              hq: { city: "Menlo Park, CA",      lat: 37.45,  lon: -122.18 } },
    GOOGL:{ cik: 1652044, ticker: "GOOGL",name: "Alphabet Inc.",                     hq: { city: "Mountain View, CA",   lat: 37.39,  lon: -122.08 } },
    CVX:  { cik: 93410,   ticker: "CVX",  name: "Chevron Corp.",                     hq: { city: "Houston, TX",         lat: 29.76,  lon: -95.37 } },
    PFE:  { cik: 78003,   ticker: "PFE",  name: "Pfizer Inc.",                       hq: { city: "New York, NY",        lat: 40.71,  lon: -74.01 } },
    JNJ:  { cik: 200406,  ticker: "JNJ",  name: "Johnson & Johnson",                 hq: { city: "New Brunswick, NJ",   lat: 40.49,  lon: -74.45 } },
    // ---- consumer staples / CPG ----
    CLX:  { cik: 21076,   ticker: "CLX",  name: "The Clorox Co.",                    hq: { city: "Oakland, CA",         lat: 37.80,  lon: -122.27 } },
    CHD:  { cik: 313927,  ticker: "CHD",  name: "Church & Dwight Co.",               hq: { city: "Ewing, NJ",           lat: 40.27,  lon: -74.80 } },
    KMB:  { cik: 55785,   ticker: "KMB",  name: "Kimberly-Clark Corp.",              hq: { city: "Irving, TX",          lat: 32.81,  lon: -96.95 } },
    GIS:  { cik: 40704,   ticker: "GIS",  name: "General Mills, Inc.",               hq: { city: "Minneapolis, MN",     lat: 44.98,  lon: -93.27 } },
    KHC:  { cik: 1637459, ticker: "KHC",  name: "The Kraft Heinz Co.",               hq: { city: "Pittsburgh, PA",      lat: 40.44,  lon: -80.00 } },
    TSN:  { cik: 100493,  ticker: "TSN",  name: "Tyson Foods, Inc.",                 hq: { city: "Springdale, AR",      lat: 36.19,  lon: -94.13 } },
    CL:   { cik: 21665,   ticker: "CL",   name: "Colgate-Palmolive Co.",             hq: { city: "New York, NY",        lat: 40.71,  lon: -74.01 } },
    CPB:  { cik: 16732,   ticker: "CPB",  name: "The Campbell's Co.",                hq: { city: "Camden, NJ",          lat: 39.93,  lon: -75.12 } },
    CAG:  { cik: 23217,   ticker: "CAG",  name: "Conagra Brands, Inc.",              hq: { city: "Chicago, IL",         lat: 41.88,  lon: -87.63 } },
    SJM:  { cik: 91419,   ticker: "SJM",  name: "The J.M. Smucker Co.",              hq: { city: "Orrville, OH",        lat: 40.84,  lon: -81.76 } },
    HRL:  { cik: 48465,   ticker: "HRL",  name: "Hormel Foods Corp.",                hq: { city: "Austin, MN",          lat: 43.67,  lon: -92.97 } },
    MAT:  { cik: 63276,   ticker: "MAT",  name: "Mattel, Inc.",                      hq: { city: "El Segundo, CA",      lat: 33.92,  lon: -118.42 } },
    HAS:  { cik: 46080,   ticker: "HAS",  name: "Hasbro, Inc.",                      hq: { city: "Pawtucket, RI",       lat: 41.88,  lon: -71.38 } },
    COKE: { cik: 317540,  ticker: "COKE", name: "Coca-Cola Consolidated, Inc.",      hq: { city: "Charlotte, NC",       lat: 35.23,  lon: -80.84 } },
    CENT: { cik: 887733,  ticker: "CENT", name: "Central Garden & Pet Co.",          hq: { city: "Walnut Creek, CA",    lat: 37.91,  lon: -122.06 } },
    ELF:  { cik: 1600033, ticker: "ELF",  name: "e.l.f. Beauty, Inc.",               hq: { city: "Oakland, CA",         lat: 37.80,  lon: -122.27 } },
    LCUT: { cik: 874396,  ticker: "LCUT", name: "Lifetime Brands, Inc.",             hq: { city: "Garden City, NY",     lat: 40.73,  lon: -73.63 } },
    MNST: { cik: 865752,  ticker: "MNST", name: "Monster Beverage Corp.",            hq: { city: "Corona, CA",          lat: 33.88,  lon: -117.57 } },
    CELH: { cik: 1341766, ticker: "CELH", name: "Celsius Holdings, Inc.",            hq: { city: "Boca Raton, FL",      lat: 26.37,  lon: -80.13 } },
    KOF:  { cik: 910631,  ticker: "KOF",  name: "Coca-Cola FEMSA",                   hq: { city: "Mexico City, MX",     lat: 19.43,  lon: -99.13 } },
    CCEP: { cik: 1650107, ticker: "CCEP", name: "Coca-Cola Europacific Partners",    hq: { city: "Uxbridge, UK",        lat: 51.55,  lon: -0.48 } },
    DKS:  { cik: 1089063, ticker: "DKS",  name: "DICK'S Sporting Goods, Inc.",       hq: { city: "Coraopolis, PA",      lat: 40.52,  lon: -80.17 } },
    // ---- tech / semis ----
    SWKS: { cik: 4127,    ticker: "SWKS", name: "Skyworks Solutions, Inc.",          hq: { city: "Irvine, CA",          lat: 33.68,  lon: -117.83 } },
    QRVO: { cik: 1604778, ticker: "QRVO", name: "Qorvo, Inc.",                       hq: { city: "Greensboro, NC",      lat: 36.07,  lon: -79.79 } },
    CRUS: { cik: 772406,  ticker: "CRUS", name: "Cirrus Logic, Inc.",                hq: { city: "Austin, TX",          lat: 30.27,  lon: -97.74 } },
    GLW:  { cik: 24741,   ticker: "GLW",  name: "Corning Inc.",                      hq: { city: "Corning, NY",         lat: 42.14,  lon: -77.05 } },
    JBL:  { cik: 898293,  ticker: "JBL",  name: "Jabil Inc.",                        hq: { city: "St. Petersburg, FL",  lat: 27.77,  lon: -82.64 } },
    TXN:  { cik: 97476,   ticker: "TXN",  name: "Texas Instruments Inc.",            hq: { city: "Dallas, TX",          lat: 32.78,  lon: -96.80 } },
    AVGO: { cik: 1730168, ticker: "AVGO", name: "Broadcom Inc.",                     hq: { city: "Palo Alto, CA",       lat: 37.44,  lon: -122.14 } },
    MU:   { cik: 723125,  ticker: "MU",   name: "Micron Technology, Inc.",           hq: { city: "Boise, ID",           lat: 43.62,  lon: -116.21 } },
    LITE: { cik: 1633978, ticker: "LITE", name: "Lumentum Holdings Inc.",            hq: { city: "San Jose, CA",        lat: 37.34,  lon: -121.89 } },
    MP:   { cik: 1801368, ticker: "MP",   name: "MP Materials Corp.",                hq: { city: "Las Vegas, NV",       lat: 36.17,  lon: -115.14 } },
    TSM:  { cik: 1046179, ticker: "TSM",  name: "Taiwan Semiconductor Mfg. Co.",     hq: { city: "Hsinchu, TW",         lat: 24.81,  lon: 120.97 } },
    HXSCL:{ cik: 2120882, ticker: "HXSCL",name: "SK hynix Inc.",                     hq: { city: "Icheon, KR",          lat: 37.27,  lon: 127.44 } },
    FN:   { cik: 1408710, ticker: "FN",   name: "Fabrinet",                          hq: { city: "Bangkok, TH",         lat: 13.75,  lon: 100.50 } },
    HNHPF:{ cik: null,    ticker: "HNHPF",name: "Hon Hai Precision (Foxconn)",       hq: { city: "New Taipei, TW",      lat: 25.07,  lon: 121.50 } },
    WICOF:{ cik: null,    ticker: "WICOF",name: "Wistron Corp.",                     hq: { city: "New Taipei, TW",      lat: 25.06,  lon: 121.57 } },
    SSNLF:{ cik: null,    ticker: "SSNLF",name: "Samsung Electronics",               hq: { city: "Suwon, KR",           lat: 37.26,  lon: 127.03 } },
    PCRFY:{ cik: null,    ticker: "PCRFY",name: "Panasonic Holdings",                hq: { city: "Kadoma, Osaka, JP",   lat: 34.73,  lon: 135.58 } },
    CATL: { cik: null,    ticker: "CATL", name: "Contemporary Amperex (CATL)",       hq: { city: "Ningde, CN",          lat: 26.67,  lon: 119.55 } },
    OPENAI:{cik: null,    ticker: "OPENAI",name:"OpenAI (private)",                  hq: { city: "San Francisco, CA",   lat: 37.77,  lon: -122.42 } },
    CRWV: { cik: 1769628, ticker: "CRWV", name: "CoreWeave, Inc.",                   hq: { city: "Livingston, NJ",      lat: 40.80,  lon: -74.31 } },
    SNAP: { cik: 1564408, ticker: "SNAP", name: "Snap Inc.",                         hq: { city: "Santa Monica, CA",    lat: 34.02,  lon: -118.49 } },
    PINS: { cik: 1506293, ticker: "PINS", name: "Pinterest, Inc.",                   hq: { city: "San Francisco, CA",   lat: 37.77,  lon: -122.42 } },
    RIVN: { cik: 1874178, ticker: "RIVN", name: "Rivian Automotive, Inc.",           hq: { city: "Irvine, CA",          lat: 33.68,  lon: -117.83 } },
    // ---- industrial / aero / auto ----
    HXL:  { cik: 717605,  ticker: "HXL",  name: "Hexcel Corp.",                      hq: { city: "Stamford, CT",        lat: 41.05,  lon: -73.54 } },
    DCO:  { cik: 30305,   ticker: "DCO",  name: "Ducommun Inc.",                     hq: { city: "Costa Mesa, CA",      lat: 33.64,  lon: -117.92 } },
    HWM:  { cik: 4281,    ticker: "HWM",  name: "Howmet Aerospace Inc.",             hq: { city: "Pittsburgh, PA",      lat: 40.44,  lon: -80.00 } },
    GE:   { cik: 40545,   ticker: "GE",   name: "GE Aerospace",                      hq: { city: "Evendale, OH",        lat: 39.26,  lon: -84.42 } },
    MAS:  { cik: 62996,   ticker: "MAS",  name: "Masco Corp.",                       hq: { city: "Livonia, MI",         lat: 42.37,  lon: -83.35 } },
    FBIN: { cik: 1519751, ticker: "FBIN", name: "Fortune Brands Innovations",        hq: { city: "Deerfield, IL",       lat: 42.17,  lon: -87.84 } },
    UFPI: { cik: 912767,  ticker: "UFPI", name: "UFP Industries, Inc.",              hq: { city: "Grand Rapids, MI",    lat: 42.96,  lon: -85.67 } },
    TREX: { cik: 1069878, ticker: "TREX", name: "Trex Co., Inc.",                    hq: { city: "Winchester, VA",      lat: 39.19,  lon: -78.16 } },
    SWK:  { cik: 93556,   ticker: "SWK",  name: "Stanley Black & Decker",            hq: { city: "New Britain, CT",     lat: 41.66,  lon: -72.78 } },
    WHR:  { cik: 106640,  ticker: "WHR",  name: "Whirlpool Corp.",                   hq: { city: "Benton Harbor, MI",   lat: 42.12,  lon: -86.45 } },
    LEA:  { cik: 842162,  ticker: "LEA",  name: "Lear Corp.",                        hq: { city: "Southfield, MI",      lat: 42.47,  lon: -83.22 } },
    BWA:  { cik: 908255,  ticker: "BWA",  name: "BorgWarner Inc.",                   hq: { city: "Auburn Hills, MI",    lat: 42.69,  lon: -83.23 } },
    GNTX: { cik: 355811,  ticker: "GNTX", name: "Gentex Corp.",                      hq: { city: "Zeeland, MI",         lat: 42.81,  lon: -86.02 } },
    VC:   { cik: 1111335, ticker: "VC",   name: "Visteon Corp.",                     hq: { city: "Van Buren Twp., MI",  lat: 42.22,  lon: -83.49 } },
    DAN:  { cik: 26780,   ticker: "DAN",  name: "Dana Inc.",                         hq: { city: "Maumee, OH",          lat: 41.56,  lon: -83.65 } },
    ADNT: { cik: 1670541, ticker: "ADNT", name: "Adient plc",                        hq: { city: "Dublin, IE",          lat: 53.35,  lon: -6.26 } },
    TWI:  { cik: 899751,  ticker: "TWI",  name: "Titan International, Inc.",         hq: { city: "West Chicago, IL",    lat: 41.88,  lon: -88.20 } },
    DCI:  { cik: 29644,   ticker: "DCI",  name: "Donaldson Co., Inc.",               hq: { city: "Bloomington, MN",     lat: 44.84,  lon: -93.30 } },
    // ---- energy services ----
    NE:   { cik: 1895262, ticker: "NE",   name: "Noble Corp. plc",                   hq: { city: "Houston, TX",         lat: 29.76,  lon: -95.37 } },
    PUMP: { cik: 1680247, ticker: "PUMP", name: "ProPetro Holding Corp.",            hq: { city: "Midland, TX",         lat: 32.00,  lon: -102.08 } },
    RIG:  { cik: 1451505, ticker: "RIG",  name: "Transocean Ltd.",                   hq: { city: "Steinhausen, CH",     lat: 47.19,  lon: 8.52 } },
    // ---- pharma distribution ----
    MCK:  { cik: 927653,  ticker: "MCK",  name: "McKesson Corp.",                    hq: { city: "Irving, TX",          lat: 32.81,  lon: -96.95 } },
    COR:  { cik: 1140859, ticker: "COR",  name: "Cencora, Inc.",                     hq: { city: "Conshohocken, PA",    lat: 40.08,  lon: -75.30 } },
    CAH:  { cik: 721371,  ticker: "CAH",  name: "Cardinal Health, Inc.",             hq: { city: "Dublin, OH",          lat: 40.10,  lon: -83.11 } }
  };

  // helper: from (supplier) -> to (customer)
  function r(from, to, pct, basis, source, snippet, url, note) {
    var o = { from: from, to: to, pct: pct, basis: basis, evidence: { source: source, snippet: snippet, url: url } };
    if (note) o.note = note;
    return o;
  }
  var A = "https://www.sec.gov/Archives/edgar/data/";
  var APPLE_LIST = "https://s203.q4cdn.com/367071867/files/doc_downloads/2024/04/Apple-Supplier-List.pdf";

  var R = [
    // ===== Walmart as customer =====
    r("PG",  "WMT", 16,   "share of P&G net sales",        "P&G 10-K FY2025",        "Sales to Walmart Inc. and its affiliates represent approximately 16% of our total sales in 2025.", A + "80424/000008042425000076/pg-20250630.htm"),
    r("PEP", "WMT", 14,   "share of PepsiCo net revenue",  "PepsiCo 10-K FY2025",    "Sales to Walmart and its affiliates, including Sam's, represented approximately 14% of consolidated net revenue.", A + "77476/000007747626000007/pep-20251227.htm"),
    r("KMB", "WMT", 16,   "share of K-C net sales",        "Kimberly-Clark 10-K FY2025", "Our largest customer, Walmart Inc., represented approximately 16% in 2025 and 2024 of net sales.", A + "55785/000162828026007567/kmb-20251231.htm"),
    r("CLX", "WMT", 26,   "share of Clorox net sales",     "Clorox 10-K FY2026",     "Net sales to largest customer, Walmart and affiliates, were 26% of consolidated net sales for fiscal 2026.", A + "21076/000002107626000034/clx-20260630.htm"),
    r("CHD", "WMT", 23,   "share of C&D net sales",        "Church & Dwight 10-K FY2025", "Net sales to our largest customer, Walmart, were approximately 23% of consolidated net sales.", A + "313927/000119312526048139/chd-20251231.htm"),
    r("GIS", "WMT", 22,   "share of General Mills net sales", "General Mills 10-K FY2026", "Walmart and its affiliates accounted for 22 percent of our consolidated net sales.", A + "40704/000162828026046466/gis-20260531.htm"),
    r("KHC", "WMT", 21,   "share of Kraft Heinz net sales", "Kraft Heinz 10-K FY2025", "Our largest customer, Walmart Inc., represented approximately 21% of our net sales in 2025.", A + "1637459/000163745926000009/khc-20251227.htm"),
    r("TSN", "WMT", 18.7, "share of Tyson sales",          "Tyson Foods 10-K FY2025", "Walmart Inc. accounted for approximately 18.7% of our fiscal 2025 consolidated sales.", A + "100493/000010049325000095/tsn-20250927.htm"),
    r("CL",  "WMT", 11,   "share of Colgate net sales",    "Colgate-Palmolive 10-K FY2025", "Sales to Walmart, Inc. and affiliates represented approximately 11% of our Net sales in 2025.", A + "21665/000002166526000006/cl-20251231.htm"),
    r("CPB", "WMT", 22,   "share of Campbell's net sales", "Campbell's 10-K FY2026", "Our largest customer, Walmart Inc. and affiliates, accounted for approximately 22% of consolidated net sales.", A + "16732/000001673226000026/cpb-20260802.htm"),
    r("CAG", "WMT", 29,   "share of Conagra net sales",    "Conagra 10-K FY2026",    "Our largest customer, Walmart and affiliates, accounted for approximately 29% of consolidated net sales.", A + "23217/000110465926083905/tmb-20260531x10k.htm"),
    r("SJM", "WMT", 34,   "share of Smucker net sales",    "J.M. Smucker 10-K FY2026", "Sales to Walmart Inc. and subsidiaries, including Sam's Club, amounted to 34 percent of net sales.", A + "91419/000009141926000050/sjm-20260430.htm"),
    r("HRL", "WMT", 15.6, "share of Hormel gross sales",   "Hormel 10-K FY2025",     "Sales to largest customer, Walmart, accounted for 15.6 percent of consolidated gross sales.", A + "48465/000004846525000059/hrl-20251026.htm"),
    r("COKE","WMT", 17,   "share of Coke Consolidated net sales", "Coca-Cola Consolidated 10-K FY2025", "Approximate percent of total net sales: Walmart Inc. 17%.", A + "317540/000162828026009057/coke-20251231.htm"),
    r("CENT","WMT", 17,   "share of Central net sales",    "Central Garden & Pet 10-K FY2025", "Walmart, our largest customer, accounted for approximately 17% of total net sales in fiscal 2025.", A + "887733/000088773325000041/cent-20250927.htm"),
    r("ELF", "WMT", 13,   "share of e.l.f. net sales",     "e.l.f. Beauty 10-K FY2026", "Largest customers Target, Walmart, Amazon and Sephora accounted for 18%, 13%, 11% and 10%.", A + "1600033/000160003326000020/elf-20260331.htm"),
    r("LCUT","WMT", 17,   "share of Lifetime net sales",   "Lifetime Brands 10-K FY2025", "Walmart accounted for 17% of consolidated net sales in 2025.", A + "874396/000087439626000008/lcut-20251231.htm"),
    r("MAT", "WMT", null, "Walmart $1.08B of 2025 net sales", "Mattel 10-K FY2025",  "Three largest customers (Walmart $1.08B, Target $0.63B, Amazon $0.52B) were 42% of net sales.", A + "63276/000162828026010716/mat-20251231.htm"),
    r("HAS", "WMT", 9,    "share of Hasbro net revenues",  "Hasbro 10-K FY2025",     "Amazon.com and Wal-Mart accounted for approximately 11% and 9%, respectively, of consolidated net revenues.", A + "46080/000004608026000011/has-20251228.htm"),
    // ===== Target / Amazon / Costco as customers =====
    r("ELF", "TGT", 18,   "share of e.l.f. net sales",     "e.l.f. Beauty 10-K FY2026", "Largest customers Target, Walmart, Amazon and Sephora accounted for 18%, 13%, 11% and 10%.", A + "1600033/000160003326000020/elf-20260331.htm"),
    r("MAT", "TGT", null, "Target $0.63B of 2025 net sales", "Mattel 10-K FY2025",   "Three largest customers (Walmart $1.08B, Target $0.63B, Amazon $0.52B) were 42% of net sales.", A + "63276/000162828026010716/mat-20251231.htm"),
    r("ELF", "AMZN", 11,  "share of e.l.f. net sales",     "e.l.f. Beauty 10-K FY2026", "Largest customers Target, Walmart, Amazon and Sephora accounted for 18%, 13%, 11% and 10%.", A + "1600033/000160003326000020/elf-20260331.htm"),
    r("HAS", "AMZN", 11,  "share of Hasbro net revenues",  "Hasbro 10-K FY2025",     "Amazon.com and Wal-Mart accounted for approximately 11% and 9%, respectively, of consolidated net revenues.", A + "46080/000004608026000011/has-20251228.htm"),
    r("LCUT","AMZN", 12,  "share of Lifetime net sales",   "Lifetime Brands 10-K FY2025", "Sales to Amazon accounted for 12% of consolidated net sales in 2025.", A + "874396/000087439626000008/lcut-20251231.htm"),
    r("MAT", "AMZN", null,"Amazon $0.52B of 2025 net sales", "Mattel 10-K FY2025",   "Three largest customers (Walmart $1.08B, Target $0.63B, Amazon $0.52B) were 42% of net sales.", A + "63276/000162828026010716/mat-20251231.htm"),
    r("RIVN","AMZN", null,"electric delivery vans to Amazon Logistics", "Rivian 10-K FY2025", "A significant portion of our automotive revenues has been from Amazon Logistics, Inc.", A + "1874178/000187417826000008/rivn-20251231.htm"),
    r("CENT","AMZN", null,"named among top retail customers", "Central Garden & Pet 10-K FY2025", "Together with Costco, Lowe's and Amazon these major retailers represented approximately 54% of net sales.", A + "887733/000088773325000041/cent-20250927.htm"),
    r("LCUT","COST", 11,  "share of Lifetime net sales",   "Lifetime Brands 10-K FY2025", "Sales to Costco accounted for 11% of consolidated net sales.", A + "874396/000087439626000008/lcut-20251231.htm"),
    r("CENT","COST", null,"named among top retail customers", "Central Garden & Pet 10-K FY2025", "Together with Costco, Lowe's and Amazon these major retailers represented approximately 54% of net sales.", A + "887733/000088773325000041/cent-20250927.htm"),
    // AWS / Google Cloud as suppliers to internet companies
    r("AMZN","SNAP", null,"AWS cloud infrastructure",       "Snap 10-K FY2025",       "We rely on Google Cloud and Amazon Web Services for the vast majority of our computing, storage, bandwidth.", A + "1564408/000156440826000013/snap-20251231.htm"),
    r("GOOGL","SNAP",null,"Google Cloud infrastructure",   "Snap 10-K FY2025",       "We rely on Google Cloud and Amazon Web Services for the vast majority of our computing, storage, bandwidth.", A + "1564408/000156440826000013/snap-20251231.htm"),
    r("AMZN","PINS", null,"AWS cloud infrastructure",       "Pinterest 10-K FY2025",  "Disruption of, degradation in or interference with our use of Amazon Web Services and our infrastructure.", A + "1506293/000150629326000021/pins-20251231.htm"),
    // ===== Apple suppliers =====
    r("SWKS","AAPL", 67,  "share of Skyworks net revenue", "Skyworks 10-K FY2025",   "Apple, through distributors and contract manufacturers, in aggregate accounted for 67% of net revenue in fiscal 2025.", A + "4127/000000412725000085/swks-20251003.htm"),
    r("QRVO","AAPL", 50,  "share of Qorvo revenue",        "Qorvo 10-K FY2026",      "Our largest end customer, Apple, accounted for 50% and 47% of total revenue in fiscal 2026 and 2025.", A + "1604778/000162828026032873/rfmd-20260328.htm"),
    r("CRUS","AAPL", 91,  "share of Cirrus net sales",     "Cirrus Logic 10-K FY2026", "One end customer, Apple Inc., represented approximately 91 percent of the Company's total net sales.", A + "772406/000077240626000018/crus-20260328.htm"),
    r("GLW", "AAPL", null,"cover glass / Ceramic Shield",  "Corning 10-K FY2025",    "We collaborated with Apple to deliver durable glass with infused color for iPhone 15; Ceramic Shield.", A + "24741/000002474126000124/glw-20251231.htm"),
    r("TSM", "AAPL", null,"foundry; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("HNHPF","AAPL",null,"final assembly; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("AVGO","AAPL", null,"RF/wireless components; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("TXN", "AAPL", null,"analog semis; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("MU",  "AAPL", null,"memory; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("JBL", "AAPL", null,"EMS; on Apple Supplier List",   "Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("LITE","AAPL", null,"optical components; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("SSNLF","AAPL",null,"displays/memory; on Apple Supplier List","Apple Supplier List FY2023", "Supplier list represents 98 percent of direct spend for materials, manufacturing, and assembly.", APPLE_LIST),
    r("MP",  "AAPL", null,"long-term rare-earth magnet agreement", "MP Materials 10-K FY2025", "Risks related to the Company's ability to meet obligations of its long-term agreement with Apple Inc.", A + "1801368/000180136826000008/mp-20251231.htm"),
    // ===== NVIDIA =====
    r("TSM", "NVDA", null,"wafer foundry",                 "NVIDIA 10-K FY2026",     "We utilize foundries, such as Taiwan Semiconductor Manufacturing Company Limited and Samsung, to produce our wafers.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("SSNLF","NVDA",null,"foundry and memory",            "NVIDIA 10-K FY2026",     "We utilize foundries, such as TSMC and Samsung Electronics; we purchase memory from SK Hynix, Micron, and Samsung.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("HXSCL","NVDA",null,"HBM memory",                    "NVIDIA 10-K FY2026",     "We purchase memory from SK Hynix Inc., Micron Technology, Inc., and Samsung.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("MU",  "NVDA", null,"HBM memory",                    "NVIDIA 10-K FY2026",     "We purchase memory from SK Hynix Inc., Micron Technology, Inc., and Samsung.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("HNHPF","NVDA",null,"assembly, test and packaging",  "NVIDIA 10-K FY2026",     "Contract manufacturers such as Hon Hai Precision, Wistron, and Fabrinet perform assembly, testing and packaging.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("WICOF","NVDA",null,"assembly, test and packaging",  "NVIDIA 10-K FY2026",     "Contract manufacturers such as Hon Hai Precision, Wistron, and Fabrinet perform assembly, testing and packaging.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("FN",  "NVDA", null,"assembly, test and packaging",  "NVIDIA 10-K FY2026",     "Contract manufacturers such as Hon Hai Precision, Wistron, and Fabrinet perform assembly, testing and packaging.", A + "1045810/000104581026000021/nvda-20260125.htm"),
    r("NVDA","CRWV", null,"all GPUs in fleet are NVIDIA",  "CoreWeave 10-K FY2025",  "As a result of obligations in our customer contracts, all of the GPUs used in our infrastructure today are NVIDIA GPUs.", A + "1769628/000176962826000104/crwv-20251231.htm"),
    // ===== Tesla =====
    r("PCRFY","TSLA",null,"lithium-ion battery cells",     "Tesla 10-K FY2025",      "Currently, we rely on suppliers such as Panasonic and Contemporary Amperex Technology Co. Limited (CATL) for these cells.", A + "1318605/000162828026003952/tsla-20251231.htm"),
    r("CATL","TSLA", null,"lithium-ion battery cells",     "Tesla 10-K FY2025",      "Currently, we rely on suppliers such as Panasonic and Contemporary Amperex Technology Co. Limited (CATL) for these cells.", A + "1318605/000162828026003952/tsla-20251231.htm"),
    // ===== Energy =====
    r("NE",  "XOM", 19.7, "share of Noble operating revenues", "Noble 10-K FY2025",  "Revenues from customers as percentage of consolidated operating revenues: Exxon Mobil Corporation 19.7%.", A + "1895262/000189526226000076/ne-20251231.htm"),
    r("PUMP","XOM", 24.9, "share of ProPetro revenue",     "ProPetro 10-K FY2025",   "Exxon Mobil Corporation, Occidental, EOG and Permian Resources accounted for 24.9%, 13.7%, 12.1%, and 11.2%.", A + "1680247/000168024726000028/pump-20251231.htm"),
    r("RIG", "CVX", null, "Chevron 11% of Transocean backlog", "Transocean 10-K FY2025", "Customers with most significant backlog were Petrobras, Equinor, BP, Shell, Chevron and Woodside: 20, 16, 16, 12, 11 percent.", A + "1451505/000145150526000018/rig-20251231x10k.htm"),
    // ===== Autos =====
    r("LEA", "GM",  22,   "share of Lear net sales",       "Lear 10-K FY2025",       "In 2025, General Motors accounted for 22% of our net sales. Ford accounted for 12%.", A + "842162/000084216226000011/lear-20251231.htm"),
    r("LEA", "F",   12,   "share of Lear net sales",       "Lear 10-K FY2025",       "In 2025, General Motors accounted for 22% of our net sales. Ford accounted for 12%.", A + "842162/000084216226000011/lear-20251231.htm"),
    r("BWA", "F",   12,   "share of BorgWarner net sales", "BorgWarner 10-K FY2025", "Worldwide sales in 2025 to Volkswagen and Ford constituted approximately 13% and 12% of consolidated net sales.", A + "908255/000090825526000011/bwa-20251231.htm"),
    r("VC",  "F",   26,   "share of Visteon net sales",    "Visteon 10-K FY2025",    "Percentage of total net sales 2025: Ford 26%, General Motors 12%, Volkswagen 10%.", A + "1111335/000111133526000006/vc-20251231.htm"),
    r("VC",  "GM",  12,   "share of Visteon net sales",    "Visteon 10-K FY2025",    "Percentage of total net sales 2025: Ford 26%, General Motors 12%, Volkswagen 10%.", A + "1111335/000111133526000006/vc-20251231.htm"),
    r("DAN", "F",   32,   "share of Dana sales",           "Dana 10-K FY2025",       "As a percentage of total sales from operations, our sales to Ford were approximately 32% in 2025.", A + "26780/000143774926006076/dan20251231_10k.htm"),
    r("ADNT","F",   11,   "share of Adient net sales",     "Adient 10-K FY2025",     "Ford Motor Company comprised 11% of consolidated net sales in fiscal 2025 across all segments.", A + "1670541/000167054125000152/adnt-20250930.htm"),
    r("GNTX","GM",  null, "GM is a 10%+ customer (pct not stated)", "Gentex 10-K FY2025", "Three automotive customers each account for 10% or more of net sales: Toyota, Volkswagen Group, and General Motors.", A + "355811/000035581126000010/gntx-20251231.htm"),
    r("MP",  "GM",  null, "long-term magnet supply agreement", "MP Materials 10-K FY2025", "Received the final $50.0 million prepayment for magnetic precursor products pursuant to long-term supply agreement with GM.", A + "1801368/000180136826000008/mp-20251231.htm"),
    // ===== Aerospace =====
    r("HXL", "BA",  13,   "share of Hexcel net sales",     "Hexcel 10-K FY2025",     "Approximately 13%, 15% and 15% of our 2025, 2024 and 2023 net sales were to Boeing and its subcontractors.", A + "717605/000119312526046377/hxl-20251231.htm"),
    r("DCO", "BA",  13.3, "share of Ducommun net revenues","Ducommun 10-K FY2025",   "Boeing and RTX were our largest customers, with Boeing generating 13% and RTX 18% of 2025 net revenues.", A + "30305/000162828026011952/dco-20251231.htm"),
    r("HWM", "BA",  null, "Boeing named as key customer",  "Howmet 10-K FY2025",     "Quality control issues at The Boeing Company ... negatively impacted; loss of a key customer could adversely affect Howmet.", A + "4281/000000428126000012/hwm-20251231.htm"),
    r("GE",  "BA",  null, "jet engines (sole source on some models)", "GE Aerospace 10-K FY2025", "CES customers consist primarily of airframers and airlines, including both Boeing and Airbus.", A + "40545/000004054526000008/ge-20251231.htm"),
    // ===== Industrials =====
    r("DCI", "CAT", null, "AFSI 50/50 filter JV",          "Donaldson 10-K FY2026",  "AFSI, established by the Company and Caterpillar in 1986, manufactures fluid filters used in Caterpillar's machinery worldwide.", A + "29644/000002964426000085/dci-20260731.htm"),
    r("TWI", "DE",  10,   "share of Titan net sales",      "Titan International 10-K FY2025", "Net sales to Deere & Company represented 10% and 11% of consolidated net sales for 2025 and 2024.", A + "899751/000089975126000007/twi-20251231.htm"),
    // ===== Beverages =====
    r("KO",  "KOF", null, "concentrate to largest bottler", "Coca-Cola 10-K FY2025", "Our five largest independent bottling partners based on unit case volume in 2025: Coca-Cola FEMSA, CCEP, ...", A + "21344/000162828026010047/ko-20251231.htm"),
    r("KO",  "CCEP",null, "concentrate to bottler",        "Coca-Cola 10-K FY2025",  "Our five largest independent bottling partners based on unit case volume in 2025: Coca-Cola FEMSA, CCEP, ...", A + "21344/000162828026010047/ko-20251231.htm"),
    r("KO",  "COKE",null, "concentrate to bottler (stake sold 2025)", "Coca-Cola 10-K FY2025", "Gain of $1,952 million related to the sale of our ownership interest in Coca-Cola Consolidated, an equity method investee.", A + "21344/000162828026010047/ko-20251231.htm"),
    r("MNST","KO",  3,    "share of Monster net sales",    "Monster Beverage 10-K FY2025", "The Coca-Cola Company, through wholly-owned subsidiaries, accounted for approximately 3% of net sales.", A + "865752/000110465926020831/mnst-20251231x10k.htm"),
    r("MNST","CCEP",15,   "share of Monster net sales",    "Monster Beverage 10-K FY2025", "Coca-Cola Europacific Partners accounted for approximately 15% of our net sales for 2025.", A + "865752/000110465926020831/mnst-20251231x10k.htm"),
    r("MNST","COKE",10,   "share of Monster net sales",    "Monster Beverage 10-K FY2025", "Coca-Cola Consolidated, Inc. accounted for approximately 10% of our net sales for 2025.", A + "865752/000110465926020831/mnst-20251231x10k.htm"),
    r("CELH","PEP", 43.2, "share of Celsius revenue",      "Celsius 10-K FY2025",    "In 2025, sales to Pepsi constituted 43.2% of our total revenue.", A + "1341766/000134176626000024/celh-20251231.htm"),
    // ===== Nike =====
    r("NKE", "DKS", 31,   "share of DICK'S merchandise purchases", "DICK'S Sporting Goods 10-K FY2025", "Nike, our largest vendor, representing approximately 31% of consolidated merchandise purchases within DICK'S and Foot Locker.", A + "1089063/000108906326000007/dks-20260131.htm"),
    // ===== Home improvement =====
    r("MAS", "HD",  38,   "share of Masco net sales",      "Masco 10-K FY2025",      "In 2025, our net sales to The Home Depot were $2.9 billion (approximately 38 percent of consolidated net sales).", A + "62996/000006299626000005/mas-20251231.htm"),
    r("FBIN","HD",  11,   "share of FBIN net sales",       "Fortune Brands 10-K FY2025", "Lowe's and The Home Depot each accounted for 11% of our net sales in 2025.", A + "1519751/000119312526063960/fbin-20251227.htm"),
    r("FBIN","LOW", 11,   "share of FBIN net sales",       "Fortune Brands 10-K FY2025", "Lowe's and The Home Depot each accounted for 11% of our net sales in 2025.", A + "1519751/000119312526063960/fbin-20251227.htm"),
    r("UFPI","HD",  17,   "share of UFP net sales",        "UFP Industries 10-K FY2025", "The Home Depot and Lowes accounted for approximately 17% and 11% of total net sales in fiscal 2025.", A + "912767/000110465926019567/ufpi-20251227x10k.htm"),
    r("UFPI","LOW", 11,   "share of UFP net sales",        "UFP Industries 10-K FY2025", "The Home Depot and Lowes accounted for approximately 17% and 11% of total net sales in fiscal 2025.", A + "912767/000110465926019567/ufpi-20251227x10k.htm"),
    r("SWK", "HD",  15,   "share of SBD net sales",        "Stanley Black & Decker 10-K FY2025", "The Home Depot accounted for approximately 15% of consolidated net sales in 2025, while Lowe's accounted for 12%.", A + "93556/000009355626000009/swk-20260103.htm"),
    r("SWK", "LOW", 12,   "share of SBD net sales",        "Stanley Black & Decker 10-K FY2025", "The Home Depot accounted for approximately 15% of consolidated net sales in 2025, while Lowe's accounted for 12%.", A + "93556/000009355626000009/swk-20260103.htm"),
    r("WHR", "LOW", 15,   "share of Whirlpool net sales",  "Whirlpool 10-K FY2025",  "Sales to Lowe's represented approximately 15%, 13%, and 13% of consolidated net sales in 2025, 2024 and 2023.", A + "106640/000010664026000009/whr-20251231.htm"),
    r("CENT","HD",  16,   "share of Central net sales",    "Central Garden & Pet 10-K FY2025", "Home Depot, our second largest customer, represented approximately 16% of total net sales in fiscal 2025.", A + "887733/000088773325000041/cent-20250927.htm"),
    r("CENT","LOW", null, "Lowe's Vendor Partner of the Year", "Central Garden & Pet 10-K FY2025", "Central was recognized as Lowe's Vendor Partner of the Year for the Lawn & Garden division.", A + "887733/000088773325000041/cent-20250927.htm"),
    r("TREX","HD",  null, "three customers = 73% of sales (not split)", "Trex 10-K FY2025", "Home Depot and Lowe's serve both contractor and DIY markets; three customers represented approximately 73% of net sales.", A + "1069878/000119312526068732/trex-20251231.htm"),
    r("TREX","LOW", null, "three customers = 73% of sales (not split)", "Trex 10-K FY2025", "Home Depot and Lowe's serve both contractor and DIY markets; three customers represented approximately 73% of net sales.", A + "1069878/000119312526068732/trex-20251231.htm"),
    // ===== Cloud / AI =====
    r("CRWV","MSFT", 67,  "share of CoreWeave revenue",    "CoreWeave 10-K FY2025",  "We recognized approximately 67% of our revenue from our top customer, Microsoft, for the year ended December 31, 2025.", A + "1769628/000176962826000104/crwv-20251231.htm"),
    r("CRWV","META", null,"up to $14.2B commitment through 2031", "CoreWeave 10-K FY2025", "Meta Platforms initially committed to pay us up to approximately $14.2 billion through December 2031.", A + "1769628/000176962826000104/crwv-20251231.htm"),
    r("CRWV","OPENAI",null,"up to $11.9B commitment through 2030", "CoreWeave 10-K FY2025", "OpenAI has committed to pay us up to approximately $11.9 billion through October 2030.", A + "1769628/000176962826000104/crwv-20251231.htm"),
    r("MSFT","OPENAI",null,"$24.1B FY2026 revenue from OpenAI arrangements", "Microsoft 10-K FY2026", "For fiscal year 2026, we recorded revenue from commercial arrangements with OpenAI of $24.1 billion.", A + "789019/000119312526323660/msft-20260630.htm"),
    // ===== Pharma distribution =====
    r("PFE", "MCK", 25,   "share of Pfizer total revenues", "Pfizer 10-K FY2025",    "Three largest U.S. wholesaler customers: McKesson 25%, Cencora 16%, Cardinal Health 13% of total revenues.", A + "78003/000007800326000026/pfe-20251231.htm"),
    r("PFE", "COR", 16,   "share of Pfizer total revenues", "Pfizer 10-K FY2025",    "Three largest U.S. wholesaler customers: McKesson 25%, Cencora 16%, Cardinal Health 13% of total revenues.", A + "78003/000007800326000026/pfe-20251231.htm"),
    r("PFE", "CAH", 13,   "share of Pfizer total revenues", "Pfizer 10-K FY2025",    "Three largest U.S. wholesaler customers: McKesson 25%, Cencora 16%, Cardinal Health 13% of total revenues.", A + "78003/000007800326000026/pfe-20251231.htm"),
    r("JNJ", "MCK", null, "wholesalers unnamed in filing (21.8/15.5/11.1%)", "J&J 10-K FY2025", "Three wholesalers distributing products for both segments represented approximately 21.8%, 15.5% and 11.1% of gross revenues.", A + "200406/000020040626000016/jnj-20251228.htm", "J&J does not name its wholesalers; identity per industry convention"),
    r("JNJ", "COR", null, "wholesalers unnamed in filing (21.8/15.5/11.1%)", "J&J 10-K FY2025", "Three wholesalers distributing products for both segments represented approximately 21.8%, 15.5% and 11.1% of gross revenues.", A + "200406/000020040626000016/jnj-20251228.htm", "J&J does not name its wholesalers; identity per industry convention"),
    r("JNJ", "CAH", null, "wholesalers unnamed in filing (21.8/15.5/11.1%)", "J&J 10-K FY2025", "Three wholesalers distributing products for both segments represented approximately 21.8%, 15.5% and 11.1% of gross revenues.", A + "200406/000020040626000016/jnj-20251228.htm", "J&J does not name its wholesalers; identity per industry convention")
  ];

  var P = {
    WMT: ["TGT", "COST", "AMZN"], TGT: ["WMT", "COST", "AMZN"], COST: ["WMT", "TGT"], AMZN: ["WMT", "MSFT", "GOOGL"],
    AAPL: ["MSFT", "GOOGL", "SSNLF"], NVDA: ["AVGO", "MU", "TSM"], TSLA: ["F", "GM", "RIVN"], F: ["GM", "TSLA"], GM: ["F", "TSLA"],
    XOM: ["CVX"], CVX: ["XOM"], BA: ["GE", "HWM"], CAT: ["DE"], DE: ["CAT"], KO: ["PEP", "MNST"], PEP: ["KO", "MNST"],
    PG: ["CL", "KMB", "CLX", "CHD"], NKE: ["DKS"], HD: ["LOW"], LOW: ["HD"], MSFT: ["GOOGL", "AMZN", "META"],
    META: ["GOOGL", "SNAP", "PINS"], GOOGL: ["META", "MSFT", "AAPL"], PFE: ["JNJ"], JNJ: ["PFE"]
  };

  return {
    meta: { label: "seed dataset, sourced from public filings", generated: "2026-10-15", filingsReviewed: 60 },
    entities: E,
    rels: R,
    peers: P
  };
})();
